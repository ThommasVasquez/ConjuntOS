use axum::extract::State;
use axum::Json;

use crate::auth::extract::AuthUser;
use crate::auth::guard;
use crate::domains::analytics::dto::DemografiaDto;
use crate::domains::analytics::repo;
use crate::error::ApiResult;
use crate::state::AppState;

/// GET /api/v1/admin/analytics/demografia
/// Devuelve datos demográficos agregados del conjunto: total unidades,
/// total usuarios, desglose por rol, por torre, nuevos este mes, activos 30d.
#[utoipa::path(
    get,
    path = "/api/v1/admin/analytics/demografia",
    tag = "admin",
    responses(
        (status = 200, description = "Demographic stats", body = DemografiaDto),
        (status = 403, description = "Requires admin role")
    )
)]
pub async fn demografia(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<DemografiaDto>> {
    guard::require_admin(&user)?;
    let mut conn = state.pool.get().await?;
    let stats = repo::demografia(&mut conn, user.conjunto_id).await?;
    Ok(Json(stats))
}
