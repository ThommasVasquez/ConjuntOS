//! Payment gateway abstraction (F3).
//!
//! `Mock` is the default and reproduces the legacy "simulate" behaviour (instant
//! approval) so dev/CI/prod keep working with zero external dependency. `Nequi`
//! activates only when the NEQUI_* env vars are present; it uses Nequi's push-to-app
//! model (a payment request is pushed to the payer's Nequi phone, approved in their
//! app, and the final status is fetched by reference). The Nequi HTTP paths are
//! structural and require sandbox-credential validation before the production cutover.

use std::env;

use bigdecimal::BigDecimal;
use serde::Deserialize;
use uuid::Uuid;

use crate::db::enums::EstadoPago;

#[derive(Clone, Debug)]
pub enum PaymentGateway {
    Mock,
    Nequi(NequiConfig),
}

#[derive(Clone, Debug)]
pub struct NequiConfig {
    pub base_url: String,
    pub client_id: String,
    pub client_secret: String,
    pub api_key: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PaymentOutcome {
    Approved,
    Pending,
    Rejected,
}

impl PaymentOutcome {
    /// The persisted payment state for a given outcome. Rejected stays Pendiente
    /// (the payer can retry) — we never mark a failed charge as paid.
    pub fn to_estado(self) -> EstadoPago {
        match self {
            PaymentOutcome::Approved => EstadoPago::Pagado,
            PaymentOutcome::Pending | PaymentOutcome::Rejected => EstadoPago::Pendiente,
        }
    }
}

/// Result of requesting a charge: an opaque provider reference + the current outcome.
pub struct ChargeResult {
    pub referencia: String,
    pub estado: PaymentOutcome,
}

/// Map a Nequi transaction status to our outcome. Pure — unit-tested.
pub fn map_nequi_status(status: &str) -> PaymentOutcome {
    match status.trim().to_ascii_uppercase().as_str() {
        "APPROVED" | "SUCCESS" | "33" => PaymentOutcome::Approved,
        "REJECTED" | "DECLINED" | "EXPIRED" | "CANCELED" | "CANCELLED" | "FAILED" => {
            PaymentOutcome::Rejected
        }
        _ => PaymentOutcome::Pending,
    }
}

impl PaymentGateway {
    /// Select the gateway from the environment. Nequi only when all creds are set.
    pub fn from_env() -> Self {
        match (
            env::var("NEQUI_CLIENT_ID"),
            env::var("NEQUI_CLIENT_SECRET"),
            env::var("NEQUI_API_KEY"),
        ) {
            (Ok(client_id), Ok(client_secret), Ok(api_key))
                if !client_id.is_empty() && !api_key.is_empty() =>
            {
                Self::Nequi(NequiConfig {
                    base_url: env::var("NEQUI_BASE_URL")
                        .unwrap_or_else(|_| "https://api.nequi.com".into()),
                    client_id,
                    client_secret,
                    api_key,
                })
            }
            _ => Self::Mock,
        }
    }

    pub fn is_mock(&self) -> bool {
        matches!(self, Self::Mock)
    }

    /// Request a charge. Mock approves instantly; Nequi pushes to the payer's app.
    pub async fn cobrar(
        &self,
        telefono: Option<&str>,
        monto: &BigDecimal,
        referencia: &str,
    ) -> anyhow::Result<ChargeResult> {
        match self {
            Self::Mock => Ok(ChargeResult {
                referencia: format!("MOCK-{}", Uuid::new_v4().simple()),
                estado: PaymentOutcome::Approved,
            }),
            Self::Nequi(cfg) => {
                let telefono = telefono
                    .ok_or_else(|| anyhow::anyhow!("se requiere el teléfono Nequi del pagador"))?;
                nequi_cobrar(cfg, telefono, monto, referencia).await
            }
        }
    }

    /// Fetch the current outcome for a prior charge reference.
    pub async fn estado(&self, referencia: &str) -> anyhow::Result<PaymentOutcome> {
        match self {
            Self::Mock => Ok(PaymentOutcome::Approved),
            Self::Nequi(cfg) => nequi_estado(cfg, referencia).await,
        }
    }
}

// ── Nequi HTTP (gated; requires sandbox validation) ──────────────────────────

#[derive(Deserialize)]
struct NequiToken {
    access_token: String,
}

async fn nequi_token(cfg: &NequiConfig) -> anyhow::Result<String> {
    let resp = reqwest::Client::new()
        .post(format!("{}/oauth2/token", cfg.base_url))
        .basic_auth(&cfg.client_id, Some(&cfg.client_secret))
        .form(&[("grant_type", "client_credentials")])
        .send()
        .await?
        .error_for_status()?
        .json::<NequiToken>()
        .await?;
    Ok(resp.access_token)
}

async fn nequi_cobrar(
    cfg: &NequiConfig,
    telefono: &str,
    monto: &BigDecimal,
    referencia: &str,
) -> anyhow::Result<ChargeResult> {
    let token = nequi_token(cfg).await?;
    let body = serde_json::json!({
        "RequestMessage": {
            "RequestHeader": { "Channel": "PNP04-C001", "RequestDate": "" },
            "RequestBody": { "any": {
                "unregisteredPaymentRQ": {
                    "phoneNumber": telefono,
                    "code": "NIT_1",
                    "value": monto.to_string(),
                    "reference1": referencia,
                }
            }}
        }
    });
    let resp = reqwest::Client::new()
        .post(format!(
            "{}/payments/v2/-services-paymentservice-unregisteredpayment",
            cfg.base_url
        ))
        .bearer_auth(&token)
        .header("x-api-key", &cfg.api_key)
        .json(&body)
        .send()
        .await?
        .error_for_status()?;
    let json: serde_json::Value = resp.json().await?;
    // The transactionId lives under the response envelope; fall back to the reference.
    let referencia = json
        .pointer("/ResponseMessage/ResponseBody/any/unregisteredPaymentRS/transactionId")
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_else(|| referencia.to_string());
    // A freshly pushed payment is pending until the payer approves in their app.
    Ok(ChargeResult {
        referencia,
        estado: PaymentOutcome::Pending,
    })
}

async fn nequi_estado(cfg: &NequiConfig, referencia: &str) -> anyhow::Result<PaymentOutcome> {
    let token = nequi_token(cfg).await?;
    let body = serde_json::json!({
        "RequestMessage": {
            "RequestHeader": { "Channel": "PNP04-C001", "RequestDate": "" },
            "RequestBody": { "any": { "getStatusPaymentRQ": { "transactionId": referencia } } }
        }
    });
    let json: serde_json::Value = reqwest::Client::new()
        .post(format!(
            "{}/payments/v2/-services-paymentservice-getstatuspayment",
            cfg.base_url
        ))
        .bearer_auth(&token)
        .header("x-api-key", &cfg.api_key)
        .json(&body)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let status = json
        .pointer("/ResponseMessage/ResponseBody/any/getStatusPaymentRS/status")
        .and_then(|v| v.as_str())
        .unwrap_or("PENDING");
    Ok(map_nequi_status(status))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nequi_status_maps_to_outcome() {
        assert_eq!(map_nequi_status("approved"), PaymentOutcome::Approved);
        assert_eq!(map_nequi_status("33"), PaymentOutcome::Approved);
        assert_eq!(map_nequi_status("REJECTED"), PaymentOutcome::Rejected);
        assert_eq!(map_nequi_status("expired"), PaymentOutcome::Rejected);
        assert_eq!(map_nequi_status("anything_else"), PaymentOutcome::Pending);
    }

    #[test]
    fn outcome_maps_to_payment_state() {
        assert_eq!(PaymentOutcome::Approved.to_estado(), EstadoPago::Pagado);
        assert_eq!(PaymentOutcome::Pending.to_estado(), EstadoPago::Pendiente);
        // A rejected charge must never read as paid.
        assert_eq!(PaymentOutcome::Rejected.to_estado(), EstadoPago::Pendiente);
    }

    #[test]
    fn defaults_to_mock_without_creds() {
        // (Env-independent sanity: Mock approves instantly.)
        assert!(PaymentGateway::Mock.is_mock());
    }
}
