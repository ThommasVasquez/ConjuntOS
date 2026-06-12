//! M5a integration tests: comunicaciones (anuncios + directorio), solicitudes
//! (PQRS), tramites (with approval side-effects), clasificados, inmuebles —
//! including tenant-isolation and role-guard coverage (Law 2/3/7).
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
            conjuntos::subdominio.eq(format!("m5a-{marker}")),
            conjuntos::direccion.eq("Calle 1 # 2-3"),
            conjuntos::ciudad.eq("Bogotá"),
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
    let email = format!("{marker}@m5a.test.local");
    let user_id: Uuid = diesel::insert_into(usuarios::table)
        .values((
            usuarios::conjunto_id.eq(conjunto_id),
            usuarios::nombre.eq("Usuario M5a"),
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

/// Money travels as a string (Law 6); parse it for scale-insensitive asserts.
fn money(value: &Value) -> f64 {
    value
        .as_str()
        .unwrap_or_else(|| panic!("money must be a string, got {value}"))
        .parse()
        .unwrap()
}

fn unique_placa() -> String {
    format!(
        "M5{}",
        &Uuid::new_v4().simple().to_string()[..4].to_uppercase()
    )
}

// ---------------------------------------------------------------------------
// comunicaciones: anuncios
// ---------------------------------------------------------------------------

#[tokio::test]
async fn anuncios_publish_notifies_residents_and_orders_pinned_first() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let (_, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let admin_token = login(&app, &admin_email).await;
    let resident_token = login(&app, &resident_email).await;

    // Residents cannot publish.
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/anuncios",
        Some(&resident_token),
        Some(json!({ "titulo": "Hack", "contenido": "x", "tipo": "GENERAL" })),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/anuncios",
        Some(&admin_token),
        Some(json!({
            "titulo": "Corte de agua",
            "contenido": "Mantenimiento de tanques el sábado.",
            "tipo": "MANTENIMIENTO",
            "archivosUrl": ["https://files.example/circular.pdf"]
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["tipo"], "MANTENIMIENTO");
    assert_eq!(body["fijado"], false);
    assert_eq!(body["archivosUrl"][0], "https://files.example/circular.pdf");

    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/anuncios",
        Some(&admin_token),
        Some(json!({
            "titulo": "Asamblea ordinaria",
            "contenido": "Convocatoria oficial.",
            "tipo": "EVENTO",
            "fijado": true
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let fijado_id = body["id"].as_str().unwrap().to_string();

    // Pinned first even though it was published later.
    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/anuncios",
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let anuncios = body.as_array().unwrap();
    assert_eq!(anuncios.len(), 2);
    assert_eq!(anuncios[0]["id"].as_str().unwrap(), fijado_id);

    // Fan-out: the resident got one INFO notification per anuncio; the admin
    // (not a resident) got none.
    let (_, body) = request(
        &app,
        Method::GET,
        "/api/v1/notificaciones",
        Some(&resident_token),
        None,
    )
    .await;
    let notifs = body.as_array().unwrap();
    assert_eq!(notifs.len(), 2, "{body}");
    assert!(notifs.iter().all(
        |n| n["tipo"] == "INFO" && n["titulo"].as_str().unwrap().starts_with("Nuevo anuncio:")
    ));

    let (_, body) = request(
        &app,
        Method::GET,
        "/api/v1/notificaciones",
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(body.as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn anuncios_delete_scoped_to_conjunto() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_, admin_email) = seed_user_in(&state, conjunto, Rol::Concejo).await;
    let (_, resident_email) = seed_user_in(&state, conjunto, Rol::Arrendatario).await;
    let admin_token = login(&app, &admin_email).await;
    let resident_token = login(&app, &resident_email).await;

    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/anuncios",
        Some(&admin_token),
        Some(json!({ "titulo": "Aviso", "contenido": "Contenido.", "tipo": "GENERAL" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let anuncio_id = body["id"].as_str().unwrap().to_string();

    // Residents cannot delete.
    let (status, _) = request(
        &app,
        Method::DELETE,
        &format!("/api/v1/anuncios/{anuncio_id}"),
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // Unknown id → 404.
    let (status, _) = request(
        &app,
        Method::DELETE,
        &format!("/api/v1/anuncios/{}", Uuid::new_v4()),
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let (status, body) = request(
        &app,
        Method::DELETE,
        &format!("/api/v1/anuncios/{anuncio_id}"),
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["deleted"], 1);

    let (_, body) = request(
        &app,
        Method::GET,
        "/api/v1/anuncios",
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(body.as_array().unwrap().len(), 0);
}

// ---------------------------------------------------------------------------
// comunicaciones: directorio
// ---------------------------------------------------------------------------

#[tokio::test]
async fn directorio_role_gate_and_habeas_data_fields() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (resident_id, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let (inactivo_id, _) = seed_user_in(&state, conjunto, Rol::Arrendatario).await;
    let (_, vigilante_email) = seed_user_in(&state, conjunto, Rol::Vigilante).await;
    let resident_token = login(&app, &resident_email).await;
    let vigilante_token = login(&app, &vigilante_email).await;

    // Deactivate the second resident directly.
    {
        use enconjunto_api::db::schema::usuarios;
        let mut conn = state.pool.get().await.unwrap();
        diesel::update(usuarios::table.find(inactivo_id))
            .set(usuarios::activo.eq(false))
            .execute(&mut conn)
            .await
            .unwrap();
    }

    // Residents cannot read the directory.
    let (status, _) = request(
        &app,
        Method::GET,
        "/api/v1/directorio",
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/directorio",
        Some(&vigilante_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let entries = body.as_array().unwrap();
    // Only the active resident — not the inactive one, not the vigilante.
    assert_eq!(entries.len(), 1, "{body}");
    assert_eq!(entries[0]["id"].as_str().unwrap(), resident_id.to_string());
    assert!(entries[0]["nombre"].is_string());
    // Habeas Data: no email or avatar leaks.
    assert!(entries[0].get("email").is_none(), "{body}");
    assert!(entries[0].get("avatar").is_none(), "{body}");
}

// ---------------------------------------------------------------------------
// solicitudes (PQRS)
// ---------------------------------------------------------------------------

#[tokio::test]
async fn solicitudes_create_notifies_admins_and_visibility_by_role() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_, resident_email) = seed_user_in(&state, conjunto, Rol::Arrendatario).await;
    let (_, other_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let (_, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let resident_token = login(&app, &resident_email).await;
    let other_token = login(&app, &other_email).await;
    let admin_token = login(&app, &admin_email).await;

    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/solicitudes",
        Some(&resident_token),
        Some(json!({
            "categoria": "PLOMERIA",
            "descripcion": "Fuga de agua en el baño",
            "urgente": true,
            "imagenes": ["https://img.example/fuga.jpg"]
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["estado"], "ABIERTA");
    assert_eq!(body["tipo"], "MANTENIMIENTO", "default tipo");
    assert_eq!(body["urgente"], true);
    assert_eq!(body["imagenes"][0], "https://img.example/fuga.jpg");

    // Admin was notified in the same transaction.
    let (_, body) = request(
        &app,
        Method::GET,
        "/api/v1/notificaciones",
        Some(&admin_token),
        None,
    )
    .await;
    let notifs = body.as_array().unwrap();
    assert_eq!(notifs.len(), 1, "{body}");
    assert_eq!(notifs[0]["titulo"], "Nueva solicitud PQRS");

    // Requester sees their own; an unrelated resident sees nothing; admin all.
    let (_, body) = request(
        &app,
        Method::GET,
        "/api/v1/solicitudes",
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(body.as_array().unwrap().len(), 1);

    let (_, body) = request(
        &app,
        Method::GET,
        "/api/v1/solicitudes",
        Some(&other_token),
        None,
    )
    .await;
    assert_eq!(body.as_array().unwrap().len(), 0);

    let (_, body) = request(
        &app,
        Method::GET,
        "/api/v1/solicitudes",
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(body.as_array().unwrap().len(), 1);

    // Missing descripcion → 400.
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/solicitudes",
        Some(&resident_token),
        Some(json!({ "categoria": "OTRO", "descripcion": "  " })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

// ---------------------------------------------------------------------------
// tramites
// ---------------------------------------------------------------------------

#[tokio::test]
async fn tramite_vehiculo_aprobar_creates_vehiculo_and_notifies() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let (_, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let resident_token = login(&app, &resident_email).await;
    let admin_token = login(&app, &admin_email).await;

    let placa = unique_placa();
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/tramites",
        Some(&resident_token),
        Some(json!({
            "tipo": "VEHICULO",
            "payload": { "placa": placa.to_lowercase(), "marca": "Mazda", "tipo": "CARRO" },
            "documentos": [{ "nombre": "tarjeta.pdf", "mimeType": "application/pdf", "base64": "QUJD" }]
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["estado"], "PENDIENTE");
    assert_eq!(body["documentos"][0]["nombre"], "tarjeta.pdf");
    let tramite_id = body["id"].as_str().unwrap().to_string();

    // Admin notified about the new trámite.
    let (_, body) = request(
        &app,
        Method::GET,
        "/api/v1/notificaciones",
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(body.as_array().unwrap().len(), 1, "{body}");
    assert_eq!(body[0]["titulo"], "Nuevo trámite: VEHICULO");

    // Residents cannot resolve.
    let (status, _) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/tramites/{tramite_id}/resolver"),
        Some(&resident_token),
        Some(json!({ "decision": "APROBADO" })),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    let (status, body) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/tramites/{tramite_id}/resolver"),
        Some(&admin_token),
        Some(json!({ "decision": "APROBADO", "observacion": "Todo en orden" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["estado"], "APROBADO");
    assert_eq!(body["observacionAdmin"], "Todo en orden");
    assert!(body["fechaRespuesta"].is_string());

    // The vehicle now exists for the requester (placa normalized to upper).
    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/parqueadero/mio",
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let vehiculos = body["vehiculos"].as_array().unwrap();
    assert_eq!(vehiculos.len(), 1);
    assert_eq!(vehiculos[0]["placa"], placa);

    // Requester notified of the approval.
    let (_, body) = request(
        &app,
        Method::GET,
        "/api/v1/notificaciones",
        Some(&resident_token),
        None,
    )
    .await;
    let notifs = body.as_array().unwrap();
    assert_eq!(notifs.len(), 1, "{body}");
    assert_eq!(notifs[0]["tipo"], "APROBACION");
    assert_eq!(notifs[0]["titulo"], "Tu solicitud ha sido aprobada");

    // Resolving twice → 409.
    let (status, _) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/tramites/{tramite_id}/resolver"),
        Some(&admin_token),
        Some(json!({ "decision": "RECHAZADO" })),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
}

#[tokio::test]
async fn tramite_mascota_aprobar_creates_mascota() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (resident_id, resident_email) = seed_user_in(&state, conjunto, Rol::Arrendatario).await;
    let (_, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let resident_token = login(&app, &resident_email).await;
    let admin_token = login(&app, &admin_email).await;

    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/tramites",
        Some(&resident_token),
        Some(json!({
            "tipo": "MASCOTA",
            "payload": { "nombre": "Rocky", "tipo": "PERRO", "raza": "Beagle" }
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let tramite_id = body["id"].as_str().unwrap().to_string();

    let (status, body) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/tramites/{tramite_id}/resolver"),
        Some(&admin_token),
        Some(json!({ "decision": "APROBADO" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["estado"], "APROBADO");

    // The mascota row exists, tenant-scoped to the requester.
    {
        use enconjunto_api::db::schema::mascotas;
        let mut conn = state.pool.get().await.unwrap();
        let count: i64 = mascotas::table
            .filter(mascotas::conjunto_id.eq(conjunto))
            .filter(mascotas::usuario_id.eq(resident_id))
            .filter(mascotas::nombre.eq("Rocky"))
            .filter(mascotas::tipo.eq("PERRO"))
            .count()
            .get_result(&mut conn)
            .await
            .unwrap();
        assert_eq!(count, 1);
    }
}

#[tokio::test]
async fn tramite_rechazado_notifies_requester_without_side_effects() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (resident_id, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let (_, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let resident_token = login(&app, &resident_email).await;
    let admin_token = login(&app, &admin_email).await;

    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/tramites",
        Some(&resident_token),
        Some(json!({
            "tipo": "MASCOTA",
            "payload": { "nombre": "Misu", "tipo": "GATO" }
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let tramite_id = body["id"].as_str().unwrap().to_string();

    let (status, body) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/tramites/{tramite_id}/resolver"),
        Some(&admin_token),
        Some(json!({ "decision": "RECHAZADO", "observacion": "Falta el carné de vacunas" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["estado"], "RECHAZADO");

    // Requester told why; no mascota was created.
    let (_, body) = request(
        &app,
        Method::GET,
        "/api/v1/notificaciones",
        Some(&resident_token),
        None,
    )
    .await;
    let notifs = body.as_array().unwrap();
    assert_eq!(notifs.len(), 1, "{body}");
    assert_eq!(notifs[0]["titulo"], "Trámite rechazado");
    assert!(notifs[0]["mensaje"]
        .as_str()
        .unwrap()
        .contains("Falta el carné de vacunas"));

    {
        use enconjunto_api::db::schema::mascotas;
        let mut conn = state.pool.get().await.unwrap();
        let count: i64 = mascotas::table
            .filter(mascotas::usuario_id.eq(resident_id))
            .count()
            .get_result(&mut conn)
            .await
            .unwrap();
        assert_eq!(count, 0);
    }
}

#[tokio::test]
async fn tramite_aprobar_duplicate_placa_409_and_rolls_back() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let (_, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let resident_token = login(&app, &resident_email).await;
    let admin_token = login(&app, &admin_email).await;

    // The plate already exists.
    let placa = unique_placa();
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/vehiculos",
        Some(&resident_token),
        Some(json!({ "placa": placa, "tipo": "CARRO" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/tramites",
        Some(&resident_token),
        Some(json!({
            "tipo": "VEHICULO",
            "payload": { "placa": placa, "tipo": "MOTO" }
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let tramite_id = body["id"].as_str().unwrap().to_string();

    let (status, body) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/tramites/{tramite_id}/resolver"),
        Some(&admin_token),
        Some(json!({ "decision": "APROBADO" })),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT, "{body}");

    // Whole transaction rolled back: still PENDIENTE, no approval notification.
    let (_, body) = request(
        &app,
        Method::GET,
        "/api/v1/tramites",
        Some(&admin_token),
        None,
    )
    .await;
    let tramites = body.as_array().unwrap();
    assert_eq!(tramites.len(), 1);
    assert_eq!(tramites[0]["estado"], "PENDIENTE", "{body}");

    let (_, body) = request(
        &app,
        Method::GET,
        "/api/v1/notificaciones",
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(
        body.as_array().unwrap().len(),
        0,
        "rollback must remove the approval notification: {body}"
    );
}

#[tokio::test]
async fn tramite_aprobar_invalid_payload_is_422() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let (_, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let resident_token = login(&app, &resident_email).await;
    let admin_token = login(&app, &admin_email).await;

    // Missing placa/tipo.
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/tramites",
        Some(&resident_token),
        Some(json!({ "tipo": "VEHICULO", "payload": { "marca": "Mazda" } })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let incompleto = body["id"].as_str().unwrap().to_string();

    let (status, body) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/tramites/{incompleto}/resolver"),
        Some(&admin_token),
        Some(json!({ "decision": "APROBADO" })),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");

    // Unknown field in the payload is rejected too.
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/tramites",
        Some(&resident_token),
        Some(json!({
            "tipo": "MASCOTA",
            "payload": { "nombre": "Rex", "tipo": "PERRO", "veneno": true }
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let desconocido = body["id"].as_str().unwrap().to_string();

    let (status, body) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/tramites/{desconocido}/resolver"),
        Some(&admin_token),
        Some(json!({ "decision": "APROBADO" })),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");

    // Both remain PENDIENTE and can still be rejected.
    let (status, body) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/tramites/{incompleto}/resolver"),
        Some(&admin_token),
        Some(json!({ "decision": "RECHAZADO", "observacion": "Datos incompletos" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["estado"], "RECHAZADO");
}

// ---------------------------------------------------------------------------
// clasificados
// ---------------------------------------------------------------------------

#[tokio::test]
async fn clasificados_create_and_list_with_seller_contact() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_, seller_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let (_, buyer_email) = seed_user_in(&state, conjunto, Rol::Arrendatario).await;
    let seller_token = login(&app, &seller_email).await;
    let buyer_token = login(&app, &buyer_email).await;

    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/clasificados",
        Some(&seller_token),
        Some(json!({
            "nombre": "Empanadas de la 101",
            "categoria": "RESTAURANTE",
            "descripcion": "Empanadas los viernes",
            "precio": "3500.00",
            "whatsapp": "3112223344"
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(money(&body["precio"]), 3500.0);
    assert_eq!(body["activo"], true);

    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/clasificados",
        Some(&buyer_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let items = body.as_array().unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["nombre"], "Empanadas de la 101");
    assert!(items[0]["propietario"]["nombre"].is_string(), "{body}");
    assert_eq!(items[0]["whatsapp"], "3112223344");

    // Missing nombre → 400.
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/clasificados",
        Some(&seller_token),
        Some(json!({ "nombre": " ", "categoria": "OTRO" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

// ---------------------------------------------------------------------------
// inmuebles
// ---------------------------------------------------------------------------

#[tokio::test]
async fn inmuebles_create_filters_and_owner_visibility() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_, owner_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let (_, other_email) = seed_user_in(&state, conjunto, Rol::Arrendatario).await;
    let owner_token = login(&app, &owner_email).await;
    let other_token = login(&app, &other_email).await;

    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/inmuebles",
        Some(&owner_token),
        Some(json!({
            "titulo": "Apto 3 alcobas",
            "descripcion": "Remodelado, vista a zona verde",
            "precio": "420000000",
            "tipoNegocio": "VENTA",
            "tipoUnidad": "APARTAMENTO",
            "habitaciones": 3,
            "banos": 2,
            "area": "78.50",
            "imagenes": ["https://img.example/apto.jpg"],
            "caracteristicas": ["Balcón", "Parqueadero"]
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["estado"], "DISPONIBLE");
    assert_eq!(money(&body["precio"]), 420000000.0);
    assert_eq!(money(&body["area"]), 78.5);
    assert_eq!(body["caracteristicas"][1], "Parqueadero");
    let venta_id = body["id"].as_str().unwrap().to_string();

    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/inmuebles",
        Some(&owner_token),
        Some(json!({
            "titulo": "Estudio amoblado",
            "descripcion": "Servicios incluidos",
            "precio": "980000",
            "tipoNegocio": "ALQUILER",
            "tipoUnidad": "APARTAMENTO",
            "habitaciones": 1
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["banos"], 0, "banos defaults to 0");

    // Unfiltered: both listings.
    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/inmuebles",
        Some(&other_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body.as_array().unwrap().len(), 2);

    // Filters narrow correctly.
    let (_, body) = request(
        &app,
        Method::GET,
        "/api/v1/inmuebles?tipoNegocio=VENTA",
        Some(&other_token),
        None,
    )
    .await;
    let ventas = body.as_array().unwrap();
    assert_eq!(ventas.len(), 1);
    assert_eq!(ventas[0]["tipoNegocio"], "VENTA");

    let (_, body) = request(
        &app,
        Method::GET,
        "/api/v1/inmuebles?habitaciones=1",
        Some(&other_token),
        None,
    )
    .await;
    assert_eq!(body.as_array().unwrap().len(), 1);

    let (_, body) = request(
        &app,
        Method::GET,
        "/api/v1/inmuebles?tipoNegocio=ALQUILER&tipoUnidad=APARTAMENTO&habitaciones=3",
        Some(&other_token),
        None,
    )
    .await;
    assert_eq!(body.as_array().unwrap().len(), 0);

    // Non-DISPONIBLE listings stay visible to their owner only.
    {
        use enconjunto_api::db::schema::inmuebles;
        let mut conn = state.pool.get().await.unwrap();
        diesel::update(inmuebles::table.find(Uuid::parse_str(&venta_id).unwrap()))
            .set(inmuebles::estado.eq("VENDIDO"))
            .execute(&mut conn)
            .await
            .unwrap();
    }
    let (_, body) = request(
        &app,
        Method::GET,
        "/api/v1/inmuebles",
        Some(&other_token),
        None,
    )
    .await;
    assert_eq!(body.as_array().unwrap().len(), 1, "{body}");

    let (_, body) = request(
        &app,
        Method::GET,
        "/api/v1/inmuebles",
        Some(&owner_token),
        None,
    )
    .await;
    assert_eq!(body.as_array().unwrap().len(), 2, "owner sees own VENDIDO");
}

// ---------------------------------------------------------------------------
// tenant isolation (Law 2): user A never sees conjunto B's data
// ---------------------------------------------------------------------------

#[tokio::test]
async fn tenant_isolation_across_all_m5a_endpoints() {
    let state = test_state().await;
    let app = build_router(state.clone());

    // Conjunto B gets data of every kind.
    let conjunto_b = seed_conjunto(&state).await;
    let (_, admin_b_email) = seed_user_in(&state, conjunto_b, Rol::Administrador).await;
    let (_, resident_b_email) = seed_user_in(&state, conjunto_b, Rol::Propietario).await;
    let admin_b_token = login(&app, &admin_b_email).await;
    let resident_b_token = login(&app, &resident_b_email).await;

    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/anuncios",
        Some(&admin_b_token),
        Some(json!({ "titulo": "Aviso B", "contenido": "solo B", "tipo": "GENERAL" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let anuncio_b = body["id"].as_str().unwrap().to_string();

    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/solicitudes",
        Some(&resident_b_token),
        Some(json!({ "categoria": "PLOMERIA", "descripcion": "Fuga B" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/tramites",
        Some(&resident_b_token),
        Some(json!({ "tipo": "MASCOTA", "payload": { "nombre": "B", "tipo": "GATO" } })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let tramite_b = body["id"].as_str().unwrap().to_string();

    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/clasificados",
        Some(&resident_b_token),
        Some(json!({ "nombre": "Tienda B", "categoria": "TIENDA" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/inmuebles",
        Some(&resident_b_token),
        Some(json!({
            "titulo": "Apto B",
            "descripcion": "solo B",
            "precio": "1000000",
            "tipoNegocio": "ALQUILER",
            "tipoUnidad": "APARTAMENTO"
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // Conjunto A users see none of it.
    let conjunto_a = seed_conjunto(&state).await;
    let (_, resident_a_email) = seed_user_in(&state, conjunto_a, Rol::Propietario).await;
    let (_, admin_a_email) = seed_user_in(&state, conjunto_a, Rol::Administrador).await;
    let resident_a_token = login(&app, &resident_a_email).await;
    let admin_a_token = login(&app, &admin_a_email).await;

    let empty_array_checks: Vec<(&str, &str)> = vec![
        ("/api/v1/anuncios", &resident_a_token),
        ("/api/v1/solicitudes", &admin_a_token),
        ("/api/v1/tramites", &admin_a_token),
        ("/api/v1/clasificados", &resident_a_token),
        ("/api/v1/inmuebles", &resident_a_token),
    ];
    for (uri, token) in empty_array_checks {
        let (status, body) = request(&app, Method::GET, uri, Some(token), None).await;
        assert_eq!(status, StatusCode::OK, "{uri}: {body}");
        assert_eq!(
            body.as_array().map(Vec::len),
            Some(0),
            "{uri} leaked another tenant's data: {body}"
        );
    }

    // Directory of A lists only A's resident, never B's.
    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/directorio",
        Some(&admin_a_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body.as_array().unwrap().len(), 1);

    // Direct-id probes from A land on 404 (Law 2).
    let (status, _) = request(
        &app,
        Method::DELETE,
        &format!("/api/v1/anuncios/{anuncio_b}"),
        Some(&admin_a_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let (status, _) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/tramites/{tramite_b}/resolver"),
        Some(&admin_a_token),
        Some(json!({ "decision": "APROBADO" })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // B's data is intact and visible to B.
    let (_, body) = request(
        &app,
        Method::GET,
        "/api/v1/tramites",
        Some(&admin_b_token),
        None,
    )
    .await;
    let tramites = body.as_array().unwrap();
    assert_eq!(tramites.len(), 1);
    assert_eq!(tramites[0]["estado"], "PENDIENTE");
}
