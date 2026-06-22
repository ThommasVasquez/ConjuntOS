use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::enums::Rol;
use crate::error::{ApiError, ApiResult};

pub const SESSION_COOKIE: &str = "ec_session";
const SESSION_DAYS: i64 = 30;
/// WebSocket auth tickets are short-lived: they ride in the connect URL (which can
/// land in logs), so they must expire quickly. The client fetches a fresh one,
/// authenticated by the httpOnly cookie, right before each connection.
const WS_TICKET_SECONDS: i64 = 120;

/// JWT claims (specs/001-auth-tenancy/spec.md). Tenant comes from here — never
/// from client-supplied fields (Constitution Law 2).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: Uuid,
    pub conjunto_id: Uuid,
    pub rol: Rol,
    pub nombre: String,
    pub iat: i64,
    pub exp: i64,
    /// Token audience discriminator. `"ws"` for WebSocket tickets (WS-2); absent
    /// for session JWTs. Backward-compatible via Option + serde(default).
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub aud: Option<String>,
}

pub fn issue(
    user_id: Uuid,
    conjunto_id: Uuid,
    rol: Rol,
    nombre: &str,
    secret: &str,
) -> ApiResult<String> {
    issue_with_ttl(
        user_id,
        conjunto_id,
        rol,
        nombre,
        secret,
        Duration::days(SESSION_DAYS),
        None,
    )
}

/// Mints a short-lived token for authenticating a WebSocket upgrade.
pub fn issue_ws_ticket(
    user_id: Uuid,
    conjunto_id: Uuid,
    rol: Rol,
    nombre: &str,
    secret: &str,
) -> ApiResult<String> {
    issue_with_ttl(
        user_id,
        conjunto_id,
        rol,
        nombre,
        secret,
        Duration::seconds(WS_TICKET_SECONDS),
        Some("ws".to_string()),
    )
}

fn issue_with_ttl(
    user_id: Uuid,
    conjunto_id: Uuid,
    rol: Rol,
    nombre: &str,
    secret: &str,
    ttl: Duration,
    aud: Option<String>,
) -> ApiResult<String> {
    let now = Utc::now();
    let claims = Claims {
        sub: user_id,
        conjunto_id,
        rol,
        nombre: nombre.to_string(),
        iat: now.timestamp(),
        exp: (now + ttl).timestamp(),
        aud,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| ApiError::Internal(anyhow::anyhow!("jwt encoding failed: {e}")))
}

pub fn verify(token: &str, secret: &str) -> ApiResult<Claims> {
    let mut validation = Validation::default();
    // jsonwebtoken 9.x validates aud by default. We check it manually in
    // ws_handler (WS-2) so disable the built-in audience check.
    validation.validate_aud = false;
    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .map(|data| data.claims)
    .map_err(|_| ApiError::Unauthorized)
}

pub fn session_max_age_seconds() -> i64 {
    SESSION_DAYS * 24 * 60 * 60
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn issue_and_verify_round_trip() {
        let user = Uuid::new_v4();
        let conjunto = Uuid::new_v4();
        let token = issue(user, conjunto, Rol::Administrador, "Milo", "secret").unwrap();
        let claims = verify(&token, "secret").unwrap();
        assert_eq!(claims.sub, user);
        assert_eq!(claims.conjunto_id, conjunto);
        assert_eq!(claims.rol, Rol::Administrador);
    }

    #[test]
    fn wrong_secret_is_unauthorized() {
        let token = issue(
            Uuid::new_v4(),
            Uuid::new_v4(),
            Rol::Propietario,
            "x",
            "secret-a",
        )
        .unwrap();
        assert!(matches!(
            verify(&token, "secret-b"),
            Err(ApiError::Unauthorized)
        ));
    }

    #[test]
    fn garbage_token_is_unauthorized() {
        assert!(matches!(
            verify("not.a.jwt", "secret"),
            Err(ApiError::Unauthorized)
        ));
    }

    #[test]
    fn ws_ticket_has_aud_ws() {
        let user = Uuid::new_v4();
        let conjunto = Uuid::new_v4();
        let token = issue_ws_ticket(user, conjunto, Rol::Propietario, "Luna", "secret").unwrap();
        let claims = verify(&token, "secret").unwrap();
        assert_eq!(claims.sub, user);
        assert_eq!(claims.aud, Some("ws".to_string()));
    }

    #[test]
    fn session_token_has_no_aud() {
        let user = Uuid::new_v4();
        let conjunto = Uuid::new_v4();
        let token = issue(user, conjunto, Rol::Administrador, "Admin", "secret").unwrap();
        let claims = verify(&token, "secret").unwrap();
        assert_eq!(claims.aud, None);
    }
}
