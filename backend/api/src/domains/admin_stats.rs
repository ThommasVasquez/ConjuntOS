//! Admin dashboard counters (legacy /api/admin/stats). Flat module like
//! auth_routes.rs — single endpoint, no models of its own.

use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use bigdecimal::BigDecimal;
use serde::Serialize;
use utoipa::ToSchema;

use crate::auth::extract::AuthUser;
use crate::auth::guard;
use crate::domains::pagos::repo;
use crate::error::ApiResult;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/admin/stats", get(admin_stats))
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdminStatsDto {
    /// Sum of PAGADO amounts with fecha_pago in the current UTC month,
    /// serialized as string (Law 6).
    #[schema(value_type = String)]
    pub recaudo_mes: BigDecimal,
    pub reservas_pendientes: i64,
}

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
