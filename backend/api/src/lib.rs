pub mod auth;
pub mod config;
pub mod db;
pub mod domains;
pub mod error;
pub mod openapi;
pub mod routes;
pub mod services;
pub mod state;

use axum::http::{header, HeaderValue, Method};
use axum::routing::get;
use axum::Router;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::trace::TraceLayer;

use crate::state::AppState;

/// 2 MiB request cap — large enough for avatar/doc payloads carried over from the
/// legacy app, small enough to keep base64 trámite documents bounded (specs/009).
const MAX_BODY_BYTES: usize = 2 * 1024 * 1024;

pub fn build_router(state: AppState) -> Router {
    let cors = cors_layer(&state.config.allowed_origins);

    let api_v1 = Router::new()
        .merge(domains::auth_routes::router())
        .merge(domains::usuarios::handlers::router())
        .merge(domains::conjuntos::handlers::router())
        .merge(domains::notificaciones::router())
        .merge(domains::vigilancia::router())
        .merge(domains::parqueadero::router())
        .merge(domains::reservas::router())
        .merge(domains::pagos::router())
        .merge(domains::comunicaciones::router())
        .merge(domains::solicitudes::router())
        .merge(domains::tramites::router())
        .merge(domains::clasificados::router())
        .merge(domains::inmuebles::router())
        .merge(domains::admin_stats::router())
        .merge(domains::chat::router())
        .merge(domains::citofonia::router())
        .merge(domains::asamblea::router())
        .merge(domains::ai::router());

    Router::new()
        .route("/healthz", get(routes::healthz))
        .route("/api/v1/openapi.json", get(openapi::openapi_json))
        .route("/docs", get(openapi::docs_html))
        .route("/api/v1/ws", get(domains::ws::ws_handler))
        .nest("/api/v1", api_v1)
        .with_state(state)
        .layer(cors)
        .layer(RequestBodyLimitLayer::new(MAX_BODY_BYTES))
        .layer(TraceLayer::new_for_http())
}

fn cors_layer(allowed_origins: &[String]) -> CorsLayer {
    let origins: Vec<HeaderValue> = allowed_origins
        .iter()
        .filter_map(|origin| HeaderValue::from_str(origin).ok())
        .collect();

    CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins))
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
        .allow_credentials(true)
}
