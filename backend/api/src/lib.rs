pub mod auth;
pub mod config;
pub mod db;
pub mod domains;
pub mod error;
pub mod openapi;
pub mod routes;
pub mod services;
pub mod state;

use std::time::Duration;

use axum::extract::DefaultBodyLimit;
use axum::http::{header, HeaderValue, Method, StatusCode};
use axum::routing::get;
use axum::Router;
use tower_http::catch_panic::CatchPanicLayer;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::TraceLayer;

use crate::state::AppState;

/// 12 MiB request cap — large enough for an image upload carried as base64
/// (the frontend caps images at 5 MB; base64 inflates ~33% → ~6.7 MB) plus
/// avatar/doc payloads from the legacy app. Images themselves are offloaded to
/// MinIO via /uploads/imagen, so persisted bodies stay small.
const MAX_BODY_BYTES: usize = 12 * 1024 * 1024;

/// Upper bound on any single request. Outbound calls (Gemini, S3, web-push,
/// LiveKit) and DB queries that hang would otherwise pin a worker task and its
/// pooled DB connection forever, cascading into pool exhaustion under load.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

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
        .merge(domains::uploads::router())
        .merge(domains::clasificados::router())
        .merge(domains::inmuebles::router())
        .merge(domains::admin_areas::router())
        .merge(domains::admin_finanzas::router())
        .merge(domains::admin_stats::router())
        .merge(domains::admin_usuarios::router())
        .merge(domains::servicios::router())
        .merge(domains::chat::router())
        .merge(domains::citofonia::router())
        .merge(domains::asamblea::router())
        .merge(domains::ai::router())
        .merge(domains::pases_temporales::router());

    Router::new()
        .route("/healthz", get(routes::healthz))
        .route("/api/v1/openapi.json", get(openapi::openapi_json))
        .route("/docs", get(openapi::docs_html))
        .route("/api/v1/ws", get(domains::ws::ws_handler))
        .nest("/api/v1", api_v1)
        .with_state(state)
        .layer(cors)
        .layer(RequestBodyLimitLayer::new(MAX_BODY_BYTES))
        // axum enforces its OWN 2 MiB DefaultBodyLimit on the Json/body
        // extractors, independent of tower_http's RequestBodyLimitLayer above.
        // Raise it to match so image uploads (base64) aren't rejected with 413.
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            REQUEST_TIMEOUT,
        ))
        .layer(TraceLayer::new_for_http())
        // Outermost: a panic in any handler becomes a 500 instead of dropping the
        // connection (and killing the worker task).
        .layer(CatchPanicLayer::new())
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
