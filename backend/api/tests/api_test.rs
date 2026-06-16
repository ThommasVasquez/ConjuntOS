//! Integration tests against a real Postgres (TEST_DATABASE_URL, default
//! postgresql://localhost/enconjunto_test). Embedded migrations run once.

use axum::body::Body;
use axum::http::{header, Method, Request, StatusCode};
use axum::Router;
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tokio::sync::OnceCell;
use tower::ServiceExt;
use uuid::Uuid;

use enconjunto_api::auth::password::hash_password;
use enconjunto_api::build_router;
use enconjunto_api::config::Config;
use enconjunto_api::db;
use enconjunto_api::db::enums::Rol;
use enconjunto_api::state::AppState;

static MIGRATED: OnceCell<()> = OnceCell::const_new();

fn test_db_url() -> String {
    std::env::var("TEST_DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://localhost/enconjunto_test".to_string())
}

async fn test_state() -> AppState {
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
        jwt_secret: "test-secret".to_string(),
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

async fn request(
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

/// Seeds a conjunto + user with the given role; returns (conjunto_id, email).
/// Password is always "Secreta123!".
async fn seed_user(state: &AppState, rol: Rol) -> (Uuid, String) {
    use enconjunto_api::db::schema::{conjuntos, usuarios};

    let mut conn = state.pool.get().await.unwrap();
    let marker = Uuid::new_v4().simple().to_string();
    let conjunto_id: Uuid = diesel::insert_into(conjuntos::table)
        .values((
            conjuntos::nombre.eq(format!("Conjunto {marker}")),
            conjuntos::subdominio.eq(format!("test-{marker}")),
            conjuntos::direccion.eq("Calle 1 # 2-3"),
            conjuntos::ciudad.eq("Bogotá"),
        ))
        .returning(conjuntos::id)
        .get_result(&mut conn)
        .await
        .unwrap();

    let email = format!("{marker}@test.local");
    diesel::insert_into(usuarios::table)
        .values((
            usuarios::conjunto_id.eq(conjunto_id),
            usuarios::nombre.eq("Usuario Prueba"),
            usuarios::email.eq(&email),
            usuarios::password_hash.eq(hash_password("Secreta123!").unwrap()),
            usuarios::rol.eq(rol),
            usuarios::numero_interno.eq(&marker[..8]),
        ))
        .execute(&mut conn)
        .await
        .unwrap();
    (conjunto_id, email)
}

async fn login(app: &Router, email: &str) -> String {
    let (status, body) = request(
        app,
        Method::POST,
        "/api/v1/auth/login",
        None,
        Some(json!({ "email": email, "password": "Secreta123!" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "login failed: {body}");
    body["token"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn login_success_sets_cookie_and_me_works() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let (_, email) = seed_user(&state, Rol::Propietario).await;

    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/login")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({ "email": email, "password": "Secreta123!" }).to_string(),
        ))
        .unwrap();
    let response = app.clone().oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let set_cookie = response
        .headers()
        .get(header::SET_COOKIE)
        .expect("session cookie set")
        .to_str()
        .unwrap();
    assert!(set_cookie.starts_with("ec_session="));
    assert!(set_cookie.contains("HttpOnly"));

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let body: Value = serde_json::from_slice(&body).unwrap();
    let token = body["token"].as_str().unwrap();
    assert_eq!(body["user"]["email"], email);
    assert_eq!(body["user"]["rol"], "PROPIETARIO");

    let (status, me) = request(&app, Method::GET, "/api/v1/auth/me", Some(token), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(me["email"], email);
}

#[tokio::test]
async fn login_wrong_password_is_401_problem_json() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let (_, email) = seed_user(&state, Rol::Arrendatario).await;

    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/auth/login",
        None,
        Some(json!({ "email": email, "password": "wrong" })),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body["status"], 401);
    assert_eq!(body["title"], "Unauthorized");
}

#[tokio::test]
async fn me_without_token_is_401() {
    let state = test_state().await;
    let app = build_router(state);
    let (status, _) = request(&app, Method::GET, "/api/v1/auth/me", None, None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn superadmin_routes_reject_admins() {
    let state = test_state().await;
    let app = build_router(state.clone());

    let (_, admin_email) = seed_user(&state, Rol::Administrador).await;
    let admin_token = login(&app, &admin_email).await;
    let (status, _) = request(
        &app,
        Method::GET,
        "/api/v1/superadmin/conjuntos",
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    let (_, super_email) = seed_user(&state, Rol::SuperAdmin).await;
    let super_token = login(&app, &super_email).await;
    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/superadmin/conjuntos",
        Some(&super_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body.as_array().is_some());
}

#[tokio::test]
async fn duplicate_subdominio_is_409() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let (_, super_email) = seed_user(&state, Rol::SuperAdmin).await;
    let token = login(&app, &super_email).await;

    let subdominio = format!("dup-{}", Uuid::new_v4().simple());
    let payload = json!({
        "nombre": "Conjunto Duplicado",
        "subdominio": subdominio,
        "direccion": "Cra 1",
        "ciudad": "Medellín"
    });
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/superadmin/conjuntos",
        Some(&token),
        Some(payload.clone()),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/superadmin/conjuntos",
        Some(&token),
        Some(payload),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body["status"], 409);
}

#[tokio::test]
async fn profile_update_bootstraps_unidad_and_rejects_huge_avatar() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let (_, email) = seed_user(&state, Rol::Propietario).await;
    let token = login(&app, &email).await;

    let (status, body) = request(
        &app,
        Method::PUT,
        "/api/v1/usuarios/me/profile",
        Some(&token),
        Some(json!({ "nombre": "Nuevo Nombre", "torre": "B", "apto": "502" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["nombre"], "Nuevo Nombre");
    assert_eq!(body["unidad"]["numero"], "502");
    assert_eq!(body["unidad"]["torre"], "B");

    let huge_avatar = "x".repeat(151 * 1024);
    let (status, _) = request(
        &app,
        Method::PUT,
        "/api/v1/usuarios/me/profile",
        Some(&token),
        Some(json!({ "avatar": huge_avatar })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn change_password_flow() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let (_, email) = seed_user(&state, Rol::Concejo).await;
    let token = login(&app, &email).await;

    let (status, _) = request(
        &app,
        Method::PUT,
        "/api/v1/auth/password",
        Some(&token),
        Some(json!({ "currentPassword": "nope", "newPassword": "OtraClave123" })),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    let (status, _) = request(
        &app,
        Method::PUT,
        "/api/v1/auth/password",
        Some(&token),
        Some(json!({ "currentPassword": "Secreta123!", "newPassword": "OtraClave123" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/auth/login",
        None,
        Some(json!({ "email": email, "password": "OtraClave123" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
}
