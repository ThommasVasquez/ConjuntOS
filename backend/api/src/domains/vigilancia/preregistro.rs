//! QR visitor pre-registration + gate scan (F2).
//!
//! A resident pre-registers a visit; the server mints an opaque single-use token,
//! encodes it into a QR (services::qr), and returns it. The gate scans the QR and
//! posts the token to `/visitas/scan`, which validates (not expired, not already
//! used), stamps the entry time, and broadcasts to vigilancia.

use axum::extract::State;
use axum::Json;
use base64::Engine;
use chrono::{DateTime, Duration, Utc};
use diesel::prelude::*;
use diesel::OptionalExtension;
use diesel_async::RunQueryDsl;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::auth::guard;
use crate::db::enums::{Rol, TipoVehiculoVisita, TipoVisita};
use crate::db::schema::visitas;
use crate::domains::vigilancia::dto::VisitaDto;
use crate::domains::vigilancia::models::Visita;
use crate::error::{ApiError, ApiResult};
use crate::services::qr;
use crate::services::ws_hub::WsEvent;
use crate::state::AppState;

/// Gate staff + administration may scan.
const ROLES_SCAN: &[Rol] = &[
    Rol::Vigilante,
    Rol::SupervisorVigilancia,
    Rol::Administrador,
];

/// Token validity is clamped to a sane window (1 hour … 7 days).
const HORAS_DEFECTO: i64 = 24;
const HORAS_MIN: i64 = 1;
const HORAS_MAX: i64 = 168;

// ── Scan validation (pure) ───────────────────────────────────────────────────

#[derive(Debug, PartialEq, Eq)]
pub enum ScanRechazo {
    Expirado,
    YaUsado,
}

/// A scan is valid only if the token has not been used yet and has not expired.
/// "Used" takes precedence so a replayed code reads as used, not expired.
pub fn validar_scan(
    token_expira: Option<DateTime<Utc>>,
    ingreso_at: Option<DateTime<Utc>>,
    ahora: DateTime<Utc>,
) -> Result<(), ScanRechazo> {
    if ingreso_at.is_some() {
        return Err(ScanRechazo::YaUsado);
    }
    if let Some(exp) = token_expira {
        if exp < ahora {
            return Err(ScanRechazo::Expirado);
        }
    }
    Ok(())
}

// ── DTOs ─────────────────────────────────────────────────────────────────────

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PreregistroRequest {
    pub nombre: String,
    pub tipo: TipoVisita,
    pub vehiculo_tipo: Option<TipoVehiculoVisita>,
    pub placa: Option<String>,
    pub observacion: Option<String>,
    /// Hours the QR stays valid (default 24, clamped 1..168).
    pub horas_validez: Option<i64>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PreregistroResponse {
    pub visita: VisitaDto,
    pub token: String,
    /// QR image as a base64 PNG (`data:image/png;base64,<this>` on the client).
    pub qr_png_base64: String,
    pub expira: DateTime<Utc>,
}

#[derive(Deserialize, ToSchema)]
pub struct ScanRequest {
    pub token: String,
}

// ── Handlers ─────────────────────────────────────────────────────────────────

/// Resident pre-registers a visitor and gets a shareable QR.
pub async fn preregistrar(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<PreregistroRequest>,
) -> ApiResult<Json<PreregistroResponse>> {
    if req.nombre.trim().is_empty() {
        return Err(ApiError::BadRequest("el nombre es obligatorio".into()));
    }
    let horas = req
        .horas_validez
        .unwrap_or(HORAS_DEFECTO)
        .clamp(HORAS_MIN, HORAS_MAX);
    let expira = Utc::now() + Duration::hours(horas);
    let token = format!("VIS-{}", Uuid::new_v4().simple());

    let mut conn = state.pool.get().await?;
    let visita: Visita = diesel::insert_into(visitas::table)
        .values((
            visitas::conjunto_id.eq(user.conjunto_id),
            visitas::usuario_id.eq(user.id),
            visitas::nombre.eq(req.nombre.trim()),
            visitas::tipo.eq(req.tipo),
            visitas::vehiculo_tipo.eq(req.vehiculo_tipo),
            visitas::placa.eq(req.placa.as_deref()),
            visitas::fecha.eq(Utc::now()),
            visitas::tiene_parqueadero.eq(false),
            visitas::observacion.eq(req.observacion.as_deref()),
            visitas::token.eq(&token),
            visitas::token_expira.eq(expira),
        ))
        .returning(Visita::as_returning())
        .get_result(&mut conn)
        .await?;

    let png = qr::make_qr_png(&token)?;
    let qr_png_base64 = base64::engine::general_purpose::STANDARD.encode(&png);

    Ok(Json(PreregistroResponse {
        visita: VisitaDto::from(visita),
        token,
        qr_png_base64,
        expira,
    }))
}

/// Gate scans a visitor QR → validate the token and record entry.
pub async fn escanear(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<ScanRequest>,
) -> ApiResult<Json<VisitaDto>> {
    guard::require(&user, ROLES_SCAN)?;
    let mut conn = state.pool.get().await?;

    let visita: Visita = visitas::table
        .filter(visitas::token.eq(&req.token))
        .filter(visitas::conjunto_id.eq(user.conjunto_id))
        .select(Visita::as_select())
        .first(&mut conn)
        .await
        .optional()?
        .ok_or_else(|| ApiError::NotFound("código de visita no válido".into()))?;

    match validar_scan(visita.token_expira, visita.ingreso_at, Utc::now()) {
        Err(ScanRechazo::Expirado) => {
            return Err(ApiError::BadRequest("el código de visita expiró".into()))
        }
        Err(ScanRechazo::YaUsado) => {
            return Err(ApiError::Conflict(
                "este código de visita ya fue usado".into(),
            ))
        }
        Ok(()) => {}
    }

    let updated: Visita = diesel::update(visitas::table.find(visita.id))
        .set(visitas::ingreso_at.eq(Utc::now()))
        .returning(Visita::as_returning())
        .get_result(&mut conn)
        .await?;

    let dto = VisitaDto::from(updated);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "visita".into(),
                action: "ingreso".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ts(secs: i64) -> DateTime<Utc> {
        DateTime::from_timestamp(secs, 0).unwrap()
    }

    #[test]
    fn fresh_unexpired_token_passes() {
        assert!(validar_scan(Some(ts(1000)), None, ts(500)).is_ok());
    }

    #[test]
    fn expired_token_is_rejected() {
        assert_eq!(
            validar_scan(Some(ts(500)), None, ts(1000)),
            Err(ScanRechazo::Expirado)
        );
    }

    #[test]
    fn already_used_token_is_rejected_even_if_unexpired() {
        assert_eq!(
            validar_scan(Some(ts(2000)), Some(ts(900)), ts(1000)),
            Err(ScanRechazo::YaUsado)
        );
    }
}
