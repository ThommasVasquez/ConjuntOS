//! Shared integration-test harness: in-process router (build_router) driven via
//! tower::oneshot against a real Postgres (TEST_DATABASE_URL). No HTTP mocks.
//! New test files do `mod common;` and `use common::*;`.
#![allow(dead_code)]

use axum::body::Body;
use axum::http::{header, Method, Request, StatusCode};
use axum::Router;
use bigdecimal::BigDecimal;
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tokio::sync::OnceCell;
use tower::ServiceExt;
use uuid::Uuid;

use enconjunto_api::auth::password::hash_password;
use enconjunto_api::config::Config;
use enconjunto_api::db;
use enconjunto_api::db::enums::Rol;
use enconjunto_api::state::AppState;

/// Password used by every seeded account.
pub const TEST_PASSWORD: &str = "Secreta123!";

static MIGRATED: OnceCell<()> = OnceCell::const_new();

fn test_db_url() -> String {
    std::env::var("TEST_DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://enconjunto:enconjunto123@localhost:5432/enconjunto_test".to_string())
}

/// Build an AppState against the test DB (migrations run once), with the mock
/// payment gateway enabled.
pub async fn test_state() -> AppState {
    std::env::set_var("PAYMENTS_ALLOW_MOCK", "1");
    let url = test_db_url();
    MIGRATED
        .get_or_init(|| async {
            db::run_pending_migrations(&url)
                .await
                .expect("test migrations run");
        })
        .await;
    let pool = db::init_pool(&url, 5).expect("test pool");
    let config = Config {
        port: 0,
        database_url: url,
        migrations_database_url: None,
        db_pool_size: 5,
        jwt_secret: "integration-test-secret-not-used-in-prod".to_string(),
        allowed_origins: vec!["http://localhost:3000".to_string()],
        run_migrations: false,
        gemini_api_key: None,
        vapid_public_key: None,
        vapid_private_key: None,
        vapid_subject: None,
        s3_endpoint: None,
        s3_region: None,
        s3_bucket: None,
        s3_access_key: None,
        s3_secret_key: None,
        s3_public_url: None,
        cookie_cross_site: false,
        cookie_domain: None,
        tester_emails: Vec::new(),
        livekit_api_key: None,
        livekit_api_secret: None,
        livekit_url: None,
    };
    AppState::new(config, pool)
}

pub fn router(state: AppState) -> Router {
    enconjunto_api::build_router(state)
}

/// Drive one request through the in-process router. Returns (status, json body).
pub async fn request(
    app: &Router,
    method: Method,
    uri: &str,
    token: Option<&str>,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let mut builder = Request::builder().method(method).uri(uri);
    if let Some(token) = token {
        builder = builder.header(header::AUTHORIZATION, format!("Bearer {token}"));
    }
    let request = match body {
        Some(json_body) => builder
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(json_body.to_string()))
            .unwrap(),
        None => builder.body(Body::empty()).unwrap(),
    };
    let response = app.clone().oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let value = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap_or(Value::Null)
    };
    (status, value)
}

/// Seed a fresh conjunto; returns its id.
pub async fn seed_conjunto(state: &AppState) -> Uuid {
    use enconjunto_api::db::schema::conjuntos;
    let mut conn = state.pool.get().await.unwrap();
    let marker = Uuid::new_v4().simple().to_string();
    diesel::insert_into(conjuntos::table)
        .values((
            conjuntos::nombre.eq(format!("Conjunto {marker}")),
            conjuntos::subdominio.eq(format!("it-{marker}")),
            conjuntos::direccion.eq("Calle 1 # 2-3"),
            conjuntos::ciudad.eq("Bogotá"),
        ))
        .returning(conjuntos::id)
        .get_result(&mut conn)
        .await
        .unwrap()
}

/// Seed a user with a random email in a conjunto; returns (user_id, email).
pub async fn seed_user_in(state: &AppState, conjunto_id: Uuid, rol: Rol) -> (Uuid, String) {
    let marker = Uuid::new_v4().simple().to_string();
    let email = format!("{marker}@it.test.local");
    let id = seed_user_email(state, conjunto_id, &email, rol).await;
    (id, email)
}

/// Seed a user with an explicit email + role; returns the user id.
pub async fn seed_user_email(
    state: &AppState,
    conjunto_id: Uuid,
    email: &str,
    rol: Rol,
) -> Uuid {
    use enconjunto_api::db::schema::usuarios;
    let mut conn = state.pool.get().await.unwrap();
    let marker = Uuid::new_v4().simple().to_string();
    diesel::insert_into(usuarios::table)
        .values((
            usuarios::conjunto_id.eq(conjunto_id),
            usuarios::nombre.eq("Usuario IT"),
            usuarios::email.eq(email),
            usuarios::password_hash.eq(hash_password(TEST_PASSWORD).unwrap()),
            usuarios::rol.eq(rol),
            usuarios::numero_interno.eq(&marker[..8]),
        ))
        .returning(usuarios::id)
        .get_result(&mut conn)
        .await
        .unwrap()
}

/// Seed a unidad in a conjunto; returns its id.
pub async fn seed_unidad(state: &AppState, conjunto_id: Uuid) -> Uuid {
    use enconjunto_api::db::schema::unidades;
    let mut conn = state.pool.get().await.unwrap();
    diesel::insert_into(unidades::table)
        .values((
            unidades::conjunto_id.eq(conjunto_id),
            unidades::numero.eq(format!("U-{}", Uuid::new_v4().simple())),
            unidades::tipo.eq("APARTAMENTO"),
            unidades::coeficiente.eq(BigDecimal::from(0)),
        ))
        .returning(unidades::id)
        .get_result(&mut conn)
        .await
        .unwrap()
}

/// Log in and return the bearer token.
pub async fn login(app: &Router, email: &str) -> String {
    let (status, body) = request(
        app,
        Method::POST,
        "/api/v1/auth/login",
        None,
        Some(json!({ "email": email, "password": TEST_PASSWORD })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "login failed: {body}");
    body["token"].as_str().unwrap().to_string()
}
