pub mod dto;
pub mod handlers;
pub mod repo;

use axum::routing::get;
use axum::Router;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/admin/analytics/demografia", get(handlers::demografia))
}
