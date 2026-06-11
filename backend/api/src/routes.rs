use axum::extract::State;
use axum::Json;
use serde::Serialize;

use crate::db;
use crate::state::AppState;

#[derive(Serialize, utoipa::ToSchema)]
pub struct Health {
    /// Process liveness — always "ok" if this responds.
    pub status: &'static str,
    /// Database reachability: "ok" | "error".
    pub db: &'static str,
}

#[utoipa::path(
    get,
    path = "/healthz",
    tag = "ops",
    responses((status = 200, description = "Service health", body = Health))
)]
pub async fn healthz(State(state): State<AppState>) -> Json<Health> {
    let db = match db::ping(&state.pool).await {
        Ok(()) => "ok",
        Err(err) => {
            tracing::warn!(error = ?err, "healthz database ping failed");
            "error"
        }
    };
    Json(Health { status: "ok", db })
}
