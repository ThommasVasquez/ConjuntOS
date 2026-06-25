//! Admin dashboard counters + status config toggles. Flat module like
//! auth_routes.rs — endpoints + queries in one file.

use std::collections::HashMap;
use std::sync::{LazyLock, RwLock};

use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use bigdecimal::BigDecimal;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::auth::guard;
use crate::db::enums::Rol;
use crate::domains::pagos::repo;
use crate::error::ApiResult;
use crate::state::AppState;

// ── In-memory admin availability status ────────────────────────────────────

/// Per-admin availability state (defaults to all-active on restart).
#[derive(Debug, Clone, Serialize)]
struct AdminStatus {
    activo_llamadas: bool,
    activo_mensajes: bool,
}

impl Default for AdminStatus {
    fn default() -> Self {
        Self {
            activo_llamadas: true,
            activo_mensajes: true,
        }
    }
}

/// Shared mutable state, keyed by conjunto. Previously a single process-global
/// slot, which bled one tenant's availability status into every other tenant.
static STATUS: LazyLock<RwLock<HashMap<Uuid, AdminStatus>>> =
    LazyLock::new(|| RwLock::new(HashMap::new()));

fn read_status(conjunto_id: Uuid) -> AdminStatus {
    STATUS.read().unwrap().get(&conjunto_id).cloned().unwrap_or_default()
}

fn update_status(conjunto_id: Uuid, llamadas: Option<bool>, mensajes: Option<bool>) -> AdminStatus {
    let mut guard = STATUS.write().unwrap();
    let entry = guard.entry(conjunto_id).or_default();
    if let Some(v) = llamadas {
        entry.activo_llamadas = v;
    }
    if let Some(v) = mensajes {
        entry.activo_mensajes = v;
    }
    entry.clone()
}

// ── Router ──────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/admin/stats", get(admin_stats))
        .route("/admin/status-config", get(get_status).post(update_status_handler))
}

// ── DTOs ────────────────────────────────────────────────────────────────────

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdminStatsDto {
    /// Sum of PAGADO amounts with fecha_pago in the current UTC month,
    /// serialized as string (Law 6).
    #[schema(value_type = String)]
    pub recaudo_mes: BigDecimal,
    pub reservas_pendientes: i64,
}

#[derive(Debug, Clone, Serialize)]
struct StatusResponse {
    success: bool,
    #[serde(rename = "activoLlamadas")]
    activo_llamadas: bool,
    #[serde(rename = "activoMensajes")]
    activo_mensajes: bool,
}

impl From<AdminStatus> for StatusResponse {
    fn from(s: AdminStatus) -> Self {
        Self {
            success: true,
            activo_llamadas: s.activo_llamadas,
            activo_mensajes: s.activo_mensajes,
        }
    }
}

#[derive(Debug, Deserialize)]
struct StatusUpdate {
    #[serde(rename = "activoLlamadas")]
    activo_llamadas: Option<bool>,
    #[serde(rename = "activoMensajes")]
    activo_mensajes: Option<bool>,
}

// ── Handlers ────────────────────────────────────────────────────────────────

/// GET /api/v1/admin/stats — dashboard counters.
#[utoipa::path(
    get,
    path = "/api/v1/admin/stats",
    tag = "admin",
    responses(
        (status = 200, description = "Collection and pending-reservation counters", body = AdminStatsDto),
        (status = 403, description = "Requires admin role")
    )
)]
pub async fn admin_stats(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<AdminStatsDto>> {
    guard::require_admin(&user)?;
    let mut conn = state.pool.get().await?;
    let recaudo_mes = repo::recaudo_mes(&mut conn, user.conjunto_id).await?;
    let reservas_pendientes = repo::reservas_pendientes(&mut conn, user.conjunto_id).await?;
    Ok(Json(AdminStatsDto {
        recaudo_mes,
        reservas_pendientes,
    }))
}

/// GET /api/v1/admin/status-config — read admin availability toggles.
async fn get_status(State(_state): State<AppState>, user: AuthUser) -> ApiResult<Json<StatusResponse>> {
    guard::require(&user, &[Rol::Administrador, Rol::Concejo])?;
    Ok(Json(read_status(user.conjunto_id).into()))
}

/// POST /api/v1/admin/status-config — update admin availability toggles.
async fn update_status_handler(
    State(_state): State<AppState>,
    user: AuthUser,
    Json(payload): Json<StatusUpdate>,
) -> ApiResult<Json<StatusResponse>> {
    guard::require(&user, &[Rol::Administrador, Rol::Concejo])?;
    let status = update_status(user.conjunto_id, payload.activo_llamadas, payload.activo_mensajes);
    Ok(Json(status.into()))
}
