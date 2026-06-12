//! M5b integration tests: chat (resident + admin) and citofonia (call-push).
//! Runs against TEST_DATABASE_URL (default postgresql://localhost/enconjunto_test).

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

/// Seeds a fresh conjunto; returns its id.
async fn seed_conjunto(state: &AppState) -> Uuid {
    use enconjunto_api::db::schema::conjuntos;

    let mut conn = state.pool.get().await.unwrap();
    let marker = Uuid::new_v4().simple().to_string();
    diesel::insert_into(conjuntos::table)
        .values((
            conjuntos::nombre.eq(format!("Conjunto {marker}")),
            conjuntos::subdominio.eq(format!("m5b-{marker}")),
            conjuntos::direccion.eq("Calle 1 # 2-3"),
            conjuntos::ciudad.eq("Bogota"),
        ))
        .returning(conjuntos::id)
        .get_result(&mut conn)
        .await
        .unwrap()
}

/// Seeds a user inside an existing conjunto; returns (user_id, email).
/// Password is always "Secreta123!".
async fn seed_user_in(state: &AppState, conjunto_id: Uuid, rol: Rol) -> (Uuid, String) {
    use enconjunto_api::db::schema::usuarios;

    let mut conn = state.pool.get().await.unwrap();
    let marker = Uuid::new_v4().simple().to_string();
    let email = format!("{marker}@m5b.test.local");
    let user_id: Uuid = diesel::insert_into(usuarios::table)
        .values((
            usuarios::conjunto_id.eq(conjunto_id),
            usuarios::nombre.eq("Usuario M5b"),
            usuarios::email.eq(&email),
            usuarios::password_hash.eq(hash_password("Secreta123!").unwrap()),
            usuarios::rol.eq(rol),
        ))
        .returning(usuarios::id)
        .get_result(&mut conn)
        .await
        .unwrap();
    (user_id, email)
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

// ---------------------------------------------------------------------------
// chat: resident
// ---------------------------------------------------------------------------

#[tokio::test]
async fn resident_chat_send_and_list() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let resident_token = login(&app, &resident_email).await;

    // Send a message.
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/chat",
        Some(&resident_token),
        Some(json!({ "mensaje": "Hola, necesito ayuda" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["mensaje"], "Hola, necesito ayuda");
    assert_eq!(body["esDeAdmin"], false);
    assert_eq!(body["leido"], false);
    assert!(body["id"].is_string());
    assert!(body["createdAt"].is_string());

    // List messages: the one we just sent should appear.
    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/chat",
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let messages = body.as_array().unwrap();
    assert_eq!(messages.len(), 1);
    assert_eq!(messages[0]["mensaje"], "Hola, necesito ayuda");

    // Empty message is rejected.
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/chat",
        Some(&resident_token),
        Some(json!({ "mensaje": "   " })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

// ---------------------------------------------------------------------------
// chat: admin
// ---------------------------------------------------------------------------

#[tokio::test]
async fn admin_chat_list_conversations() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let (_, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let resident_token = login(&app, &resident_email).await;
    let admin_token = login(&app, &admin_email).await;

    // Resident sends a message.
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/chat",
        Some(&resident_token),
        Some(json!({ "mensaje": "Buenas tardes" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // Admin lists conversations.
    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/admin/chat",
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let conversations = body.as_array().unwrap();
    assert_eq!(conversations.len(), 1);
    assert_eq!(conversations[0]["ultimoMensaje"], "Buenas tardes");
    assert_eq!(conversations[0]["noLeidos"], 1);
    assert!(conversations[0]["residente"]["nombre"].is_string());
}

#[tokio::test]
async fn admin_chat_read_thread_marks_read() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (resident_id, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let (_, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let resident_token = login(&app, &resident_email).await;
    let admin_token = login(&app, &admin_email).await;

    // Resident sends two messages.
    for msg in ["Hola", "Urgente"] {
        let (status, _) = request(
            &app,
            Method::POST,
            "/api/v1/chat",
            Some(&resident_token),
            Some(json!({ "mensaje": msg })),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
    }

    // Before reading: 2 unread.
    let (_, body) = request(
        &app,
        Method::GET,
        "/api/v1/admin/chat",
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(body[0]["noLeidos"], 2);

    // Admin opens the thread -- marks messages as read.
    let (status, body) = request(
        &app,
        Method::GET,
        &format!("/api/v1/admin/chat/{resident_id}"),
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let mensajes = body["mensajes"].as_array().unwrap();
    assert_eq!(mensajes.len(), 2);
    assert!(body["residentInfo"]["profile"]["nombre"].is_string());

    // After reading: 0 unread.
    let (_, body) = request(
        &app,
        Method::GET,
        "/api/v1/admin/chat",
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(body[0]["noLeidos"], 0);
}

#[tokio::test]
async fn admin_chat_reply() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (resident_id, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let (_, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let resident_token = login(&app, &resident_email).await;
    let admin_token = login(&app, &admin_email).await;

    // Resident sends.
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/chat",
        Some(&resident_token),
        Some(json!({ "mensaje": "Pregunta" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // Admin replies.
    let (status, body) = request(
        &app,
        Method::POST,
        &format!("/api/v1/admin/chat/{resident_id}"),
        Some(&admin_token),
        Some(json!({ "mensaje": "Respuesta de admin" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["esDeAdmin"], true);
    assert_eq!(body["mensaje"], "Respuesta de admin");

    // Resident sees both messages.
    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/chat",
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let messages = body.as_array().unwrap();
    assert_eq!(messages.len(), 2);
    assert_eq!(messages[0]["esDeAdmin"], false);
    assert_eq!(messages[1]["esDeAdmin"], true);
    assert_eq!(messages[1]["mensaje"], "Respuesta de admin");

    // Admin replying to nonexistent resident -> 404.
    let (status, _) = request(
        &app,
        Method::POST,
        &format!("/api/v1/admin/chat/{}", Uuid::new_v4()),
        Some(&admin_token),
        Some(json!({ "mensaje": "Nadie" })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

// ---------------------------------------------------------------------------
// chat: tenant isolation
// ---------------------------------------------------------------------------

#[tokio::test]
async fn chat_tenant_isolation() {
    let state = test_state().await;
    let app = build_router(state.clone());

    // Conjunto B: resident sends a message.
    let conjunto_b = seed_conjunto(&state).await;
    let (_, resident_b_email) = seed_user_in(&state, conjunto_b, Rol::Propietario).await;
    let resident_b_token = login(&app, &resident_b_email).await;

    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/chat",
        Some(&resident_b_token),
        Some(json!({ "mensaje": "Soy de B" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // Conjunto A: resident sees nothing; admin sees no conversations.
    let conjunto_a = seed_conjunto(&state).await;
    let (_, resident_a_email) = seed_user_in(&state, conjunto_a, Rol::Propietario).await;
    let (_, admin_a_email) = seed_user_in(&state, conjunto_a, Rol::Administrador).await;
    let resident_a_token = login(&app, &resident_a_email).await;
    let admin_a_token = login(&app, &admin_a_email).await;

    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/chat",
        Some(&resident_a_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body.as_array().unwrap().len(), 0);

    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/admin/chat",
        Some(&admin_a_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body.as_array().unwrap().len(), 0);
}

// ---------------------------------------------------------------------------
// chat: role guard
// ---------------------------------------------------------------------------

#[tokio::test]
async fn admin_chat_requires_admin_role() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (resident_id, resident_email) = seed_user_in(&state, conjunto, Rol::Arrendatario).await;
    let resident_token = login(&app, &resident_email).await;

    // GET /admin/chat -> 403.
    let (status, _) = request(
        &app,
        Method::GET,
        "/api/v1/admin/chat",
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // GET /admin/chat/{id} -> 403.
    let (status, _) = request(
        &app,
        Method::GET,
        &format!("/api/v1/admin/chat/{resident_id}"),
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // POST /admin/chat/{id} -> 403.
    let (status, _) = request(
        &app,
        Method::POST,
        &format!("/api/v1/admin/chat/{resident_id}"),
        Some(&resident_token),
        Some(json!({ "mensaje": "hack" })),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

// ---------------------------------------------------------------------------
// citofonia: call-push
// ---------------------------------------------------------------------------

#[tokio::test]
async fn citofonia_call_push_user_target() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (target_id, _) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let (_, caller_email) = seed_user_in(&state, conjunto, Rol::Vigilante).await;
    let caller_token = login(&app, &caller_email).await;

    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/citofonia/call-push",
        Some(&caller_token),
        Some(json!({
            "targetPeerId": format!("user-{target_id}"),
            "callerName": "Porteria",
            "callerPeerId": format!("user-{}", Uuid::new_v4())
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    // No push subscriptions in test -> sent=0, but the endpoint resolves.
    assert!(body["sent"].is_number(), "sent field present: {body}");
    assert_eq!(body["sent"], 0);
}

#[tokio::test]
async fn citofonia_call_push_role_target() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_, _) = seed_user_in(&state, conjunto, Rol::Vigilante).await;
    let (_, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let resident_token = login(&app, &resident_email).await;

    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/citofonia/call-push",
        Some(&resident_token),
        Some(json!({
            "targetPeerId": format!("{conjunto}-VIGILANTE"),
            "callerName": "Apto 101",
            "callerPeerId": format!("user-{}", Uuid::new_v4())
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    // Resolves to the vigilante user(s); sent=0 because no push subs.
    assert_eq!(body["sent"], 0);
}

#[tokio::test]
async fn citofonia_call_push_invalid_peer() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_, caller_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let caller_token = login(&app, &caller_email).await;

    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/citofonia/call-push",
        Some(&caller_token),
        Some(json!({
            "targetPeerId": "garbage-not-a-peer",
            "callerName": "Test",
            "callerPeerId": "also-garbage"
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["sent"], 0, "invalid peer resolves to no targets");
}
