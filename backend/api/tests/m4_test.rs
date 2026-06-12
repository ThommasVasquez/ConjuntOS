//! M4 integration tests: notificaciones, vigilancia, parqueadero, reservas,
//! pagos, admin stats — including tenant-isolation coverage (Law 2/7).
//! Runs against TEST_DATABASE_URL (default postgresql://localhost/enconjunto_test).

use axum::body::Body;
use axum::http::{header, Method, Request, StatusCode};
use axum::Router;
use bigdecimal::BigDecimal;
use chrono::{Duration, Utc};
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
            conjuntos::subdominio.eq(format!("m4-{marker}")),
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
    let email = format!("{marker}@m4.test.local");
    let user_id: Uuid = diesel::insert_into(usuarios::table)
        .values((
            usuarios::conjunto_id.eq(conjunto_id),
            usuarios::nombre.eq("Usuario M4"),
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

/// Money travels as a string (Law 6); parse it for scale-insensitive asserts
/// ("155000" vs "155000.00").
fn money(value: &Value) -> f64 {
    value
        .as_str()
        .unwrap_or_else(|| panic!("money must be a string, got {value}"))
        .parse()
        .unwrap()
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

async fn seed_celda(state: &AppState, conjunto_id: Uuid, numero: &str) -> Uuid {
    use enconjunto_api::db::schema::parqueaderos;

    let mut conn = state.pool.get().await.unwrap();
    diesel::insert_into(parqueaderos::table)
        .values((
            parqueaderos::conjunto_id.eq(conjunto_id),
            parqueaderos::numero.eq(numero),
            parqueaderos::tipo.eq("RESIDENTE"),
            parqueaderos::estado.eq("DISPONIBLE"),
        ))
        .returning(parqueaderos::id)
        .get_result(&mut conn)
        .await
        .unwrap()
}

async fn seed_area(state: &AppState, conjunto_id: Uuid, requiere_deposito: bool) -> Uuid {
    use enconjunto_api::db::schema::areas_comunes;

    let mut conn = state.pool.get().await.unwrap();
    diesel::insert_into(areas_comunes::table)
        .values((
            areas_comunes::conjunto_id.eq(conjunto_id),
            areas_comunes::nombre.eq(format!("Área {}", Uuid::new_v4().simple())),
            areas_comunes::capacidad_max.eq(10),
            areas_comunes::requiere_deposito.eq(requiere_deposito),
            areas_comunes::hora_apertura.eq("08:00"),
            areas_comunes::hora_cierre.eq("20:00"),
            areas_comunes::dias_disponibles.eq("0,1,2,3,4,5,6"),
            areas_comunes::duracion_slot.eq(60),
        ))
        .returning(areas_comunes::id)
        .get_result(&mut conn)
        .await
        .unwrap()
}

/// Seeds a unidad, links the user to it, and creates one PENDIENTE pago and
/// one recibo. Returns (unidad_id, pago_id).
async fn seed_unidad_con_pago(state: &AppState, conjunto_id: Uuid, user_id: Uuid) -> (Uuid, Uuid) {
    use enconjunto_api::db::schema::{pagos, recibos_publicos, unidades, usuarios};

    let mut conn = state.pool.get().await.unwrap();
    let unidad_id: Uuid = diesel::insert_into(unidades::table)
        .values((
            unidades::conjunto_id.eq(conjunto_id),
            unidades::numero.eq(format!("U-{}", Uuid::new_v4().simple())),
            unidades::tipo.eq("APARTAMENTO"),
            unidades::coeficiente.eq(BigDecimal::from(0)),
        ))
        .returning(unidades::id)
        .get_result(&mut conn)
        .await
        .unwrap();
    diesel::update(usuarios::table.find(user_id))
        .set(usuarios::unidad_id.eq(unidad_id))
        .execute(&mut conn)
        .await
        .unwrap();
    let pago_id: Uuid = diesel::insert_into(pagos::table)
        .values((
            pagos::conjunto_id.eq(conjunto_id),
            pagos::unidad_id.eq(unidad_id),
            pagos::usuario_id.eq(user_id),
            pagos::concepto.eq("Cuota de Administración"),
            pagos::monto.eq(BigDecimal::from(155000)),
            pagos::estado.eq("PENDIENTE"),
            pagos::fecha_vencimiento.eq(Utc::now() + Duration::days(15)),
        ))
        .returning(pagos::id)
        .get_result(&mut conn)
        .await
        .unwrap();
    diesel::insert_into(recibos_publicos::table)
        .values((
            recibos_publicos::conjunto_id.eq(conjunto_id),
            recibos_publicos::unidad_id.eq(unidad_id),
            recibos_publicos::servicio.eq("Energía"),
            recibos_publicos::empresa.eq("Enel"),
            recibos_publicos::periodo.eq("2026-06"),
            recibos_publicos::monto.eq(BigDecimal::from(82450)),
            recibos_publicos::vencimiento.eq(Utc::now() + Duration::days(10)),
        ))
        .execute(&mut conn)
        .await
        .unwrap();
    (unidad_id, pago_id)
}

// ---------------------------------------------------------------------------
// notificaciones
// ---------------------------------------------------------------------------

#[tokio::test]
async fn paquete_creates_notificacion_and_mark_read_flow() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (resident_id, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let (_, vigilante_email) = seed_user_in(&state, conjunto, Rol::Vigilante).await;
    let resident_token = login(&app, &resident_email).await;
    let vigilante_token = login(&app, &vigilante_email).await;

    // No notifications yet.
    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/notificaciones",
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body.as_array().unwrap().len(), 0);

    // Gate registers a package → notification for the resident.
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/vigilancia/paquetes",
        Some(&vigilante_token),
        Some(json!({
            "usuarioId": resident_id,
            "descripcion": "Caja mediana",
            "remitente": "Servientrega"
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/notificaciones",
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let notifs = body.as_array().unwrap();
    assert_eq!(notifs.len(), 1);
    assert_eq!(notifs[0]["tipo"], "PAQUETE");
    assert_eq!(notifs[0]["leida"], false);

    // Mark all read (no body).
    let (status, body) = request(
        &app,
        Method::PUT,
        "/api/v1/notificaciones/leidas",
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["updated"], 1);

    let (_, body) = request(
        &app,
        Method::GET,
        "/api/v1/notificaciones",
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(body.as_array().unwrap()[0]["leida"], true);
}

#[tokio::test]
async fn mark_specific_notificaciones_by_id() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (resident_id, resident_email) = seed_user_in(&state, conjunto, Rol::Arrendatario).await;
    let (_, vigilante_email) = seed_user_in(&state, conjunto, Rol::Vigilante).await;
    let resident_token = login(&app, &resident_email).await;
    let vigilante_token = login(&app, &vigilante_email).await;

    for i in 0..2 {
        let (status, _) = request(
            &app,
            Method::POST,
            "/api/v1/vigilancia/paquetes",
            Some(&vigilante_token),
            Some(json!({
                "usuarioId": resident_id,
                "descripcion": format!("Paquete {i}"),
                "remitente": "DHL"
            })),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
    }

    let (_, body) = request(
        &app,
        Method::GET,
        "/api/v1/notificaciones",
        Some(&resident_token),
        None,
    )
    .await;
    let first_id = body.as_array().unwrap()[0]["id"]
        .as_str()
        .unwrap()
        .to_string();

    let (status, body) = request(
        &app,
        Method::PUT,
        "/api/v1/notificaciones/leidas",
        Some(&resident_token),
        Some(json!({ "ids": [first_id] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["updated"], 1);

    let (_, body) = request(
        &app,
        Method::GET,
        "/api/v1/notificaciones",
        Some(&resident_token),
        None,
    )
    .await;
    let leidas: Vec<bool> = body
        .as_array()
        .unwrap()
        .iter()
        .map(|n| n["leida"].as_bool().unwrap())
        .collect();
    assert_eq!(leidas.iter().filter(|l| **l).count(), 1);
}

#[tokio::test]
async fn push_subscription_upsert_and_delete() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_, email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let token = login(&app, &email).await;

    let endpoint = format!("https://push.example/{}", Uuid::new_v4().simple());
    let payload = json!({
        "endpoint": endpoint,
        "keys": { "p256dh": "key-a", "auth": "auth-a" }
    });
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/usuarios/me/push-subscriptions",
        Some(&token),
        Some(payload),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let first_id = body["id"].as_str().unwrap().to_string();

    // Re-subscribing the same endpoint upserts instead of 409.
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/usuarios/me/push-subscriptions",
        Some(&token),
        Some(json!({
            "endpoint": endpoint,
            "keys": { "p256dh": "key-b", "auth": "auth-b" }
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["id"].as_str().unwrap(), first_id);

    let (status, body) = request(
        &app,
        Method::DELETE,
        "/api/v1/usuarios/me/push-subscriptions",
        Some(&token),
        Some(json!({ "endpoint": endpoint })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["deleted"], 1);
}

// ---------------------------------------------------------------------------
// vigilancia
// ---------------------------------------------------------------------------

#[tokio::test]
async fn vigilancia_routes_reject_residents() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_, email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let token = login(&app, &email).await;

    for (method, uri) in [
        (Method::GET, "/api/v1/vigilancia/visitas"),
        (Method::GET, "/api/v1/vigilancia/paquetes"),
        (Method::GET, "/api/v1/vigilancia/stats"),
    ] {
        let (status, _) = request(&app, method, uri, Some(&token), None).await;
        assert_eq!(status, StatusCode::FORBIDDEN, "{uri} should be staff-only");
    }
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/vigilancia/paquetes",
        Some(&token),
        Some(json!({ "usuarioId": Uuid::new_v4(), "descripcion": "x", "remitente": "y" })),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn visitas_flow_gate_and_resident() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (resident_id, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let (_, vigilante_email) = seed_user_in(&state, conjunto, Rol::Vigilante).await;
    let resident_token = login(&app, &resident_email).await;
    let vigilante_token = login(&app, &vigilante_email).await;

    // Gate registers a vehicular visit for the resident.
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/vigilancia/visitas",
        Some(&vigilante_token),
        Some(json!({
            "usuarioId": resident_id,
            "nombre": "Juan Visitante",
            "tipo": "VEHICULAR",
            "vehiculoTipo": "CARRO",
            "placa": "ABC123",
            "tieneParqueadero": true
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["tipo"], "VEHICULAR");

    // Resident schedules their own pedestrian visit (defaults: fecha now).
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/visitas",
        Some(&resident_token),
        Some(json!({ "nombre": "Abuela", "tipo": "PEATONAL" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    // Today's gate list shows both, with resident info attached.
    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/vigilancia/visitas",
        Some(&vigilante_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let visitas = body.as_array().unwrap();
    assert_eq!(visitas.len(), 2);
    assert!(visitas.iter().all(|v| v["residente"]["nombre"].is_string()));

    // Cross-tenant recipient is rejected.
    let other_conjunto = seed_conjunto(&state).await;
    let (other_user, _) = seed_user_in(&state, other_conjunto, Rol::Propietario).await;
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/vigilancia/visitas",
        Some(&vigilante_token),
        Some(json!({ "usuarioId": other_user, "nombre": "Intruso", "tipo": "PEATONAL" })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // Own communications aggregate includes the resident's visit.
    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/comunicaciones",
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let propias = body["visitas"].as_array().unwrap();
    assert_eq!(propias.len(), 2); // gate-registered (destined to them) + own scheduled
}

#[tokio::test]
async fn paquete_entregar_flow_and_stats() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (resident_id, resident_email) = seed_user_in(&state, conjunto, Rol::Arrendatario).await;
    let (_, supervisor_email) = seed_user_in(&state, conjunto, Rol::SupervisorVigilancia).await;
    let resident_token = login(&app, &resident_email).await;
    let supervisor_token = login(&app, &supervisor_email).await;

    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/vigilancia/paquetes",
        Some(&supervisor_token),
        Some(json!({
            "usuarioId": resident_id,
            "descripcion": "Sobre certificado",
            "remitente": "4-72"
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["estado"], "EN_PORTERIA");
    let paquete_id = body["id"].as_str().unwrap().to_string();

    // Resident sees it in /paquetes/mios.
    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/paquetes/mios",
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body.as_array().unwrap().len(), 1);

    // Stats count it (1 resident, 1 pending package, 0 visits).
    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/vigilancia/stats",
        Some(&supervisor_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["visitasHoy"], 0);
    assert_eq!(body["paquetesPendientes"], 1);
    assert_eq!(body["totalResidentes"], 1);

    // Deliver it.
    let (status, body) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/vigilancia/paquetes/{paquete_id}/entregar"),
        Some(&supervisor_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["estado"], "ENTREGADO");
    assert!(body["entregadoEn"].is_string());

    // Gone from the resident's pending list.
    let (_, body) = request(
        &app,
        Method::GET,
        "/api/v1/paquetes/mios",
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(body.as_array().unwrap().len(), 0);

    // Unknown package → 404 problem+json.
    let (status, _) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/vigilancia/paquetes/{}/entregar", Uuid::new_v4()),
        Some(&supervisor_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

// ---------------------------------------------------------------------------
// parqueadero
// ---------------------------------------------------------------------------

#[tokio::test]
async fn vehiculo_duplicate_placa_is_409() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_, email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let token = login(&app, &email).await;

    let placa = format!(
        "M4{}",
        &Uuid::new_v4().simple().to_string()[..4].to_uppercase()
    );
    let payload = json!({ "placa": placa, "marca": "Mazda", "tipo": "CARRO" });
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/vehiculos",
        Some(&token),
        Some(payload.clone()),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["placa"], placa.to_uppercase());

    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/vehiculos",
        Some(&token),
        Some(payload),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT, "{body}");
    assert_eq!(body["status"], 409);

    // Vehicle shows up in /parqueadero/mio.
    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/parqueadero/mio",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["vehiculos"].as_array().unwrap().len(), 1);
    assert_eq!(body["celdas"].as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn celda_update_writes_audit_and_stats_reflect() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_, encargado_email) = seed_user_in(&state, conjunto, Rol::EncargadoParqueadero).await;
    let (_, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let encargado_token = login(&app, &encargado_email).await;
    let resident_token = login(&app, &resident_email).await;
    let celda_id = seed_celda(&state, conjunto, "P-101").await;

    // Residents cannot manage the map.
    let (status, _) = request(
        &app,
        Method::GET,
        "/api/v1/parqueadero/mapa",
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/parqueadero/mapa",
        Some(&encargado_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body.as_array().unwrap().len(), 1);

    let (status, body) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/parqueadero/celdas/{celda_id}"),
        Some(&encargado_token),
        Some(json!({ "estado": "OCUPADO" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["estado"], "OCUPADO");

    // Audit row written in the same transaction.
    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/parqueadero/registros",
        Some(&encargado_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let registros = body.as_array().unwrap();
    assert_eq!(registros.len(), 1);
    assert_eq!(registros[0]["tipo"], "VERIFICACION");
    assert_eq!(
        registros[0]["observacion"],
        "cambio estado DISPONIBLE->OCUPADO"
    );
    assert_eq!(registros[0]["celdaNumero"], "P-101");

    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/parqueadero/stats",
        Some(&encargado_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["total"], 1);
    assert_eq!(body["ocupados"], 1);
    assert_eq!(body["libres"], 0);
    assert_eq!(body["porcentajeOcupacion"], 100);

    // Unknown celda → 404 (and no audit row).
    let (status, _) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/parqueadero/celdas/{}", Uuid::new_v4()),
        Some(&encargado_token),
        Some(json!({ "estado": "RESERVADO" })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn vigilante_sees_only_own_registros() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_, encargado_email) = seed_user_in(&state, conjunto, Rol::EncargadoParqueadero).await;
    let (_, vigilante_email) = seed_user_in(&state, conjunto, Rol::Vigilante).await;
    let encargado_token = login(&app, &encargado_email).await;
    let vigilante_token = login(&app, &vigilante_email).await;
    let celda_id = seed_celda(&state, conjunto, "P-201").await;

    // The encargado generates an audit row; the vigilante has none.
    let (status, _) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/parqueadero/celdas/{celda_id}"),
        Some(&encargado_token),
        Some(json!({ "estado": "OCUPADO" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/parqueadero/registros",
        Some(&vigilante_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(
        body.as_array().unwrap().len(),
        0,
        "vigilante must see only own rows"
    );

    let (_, body) = request(
        &app,
        Method::GET,
        "/api/v1/parqueadero/registros",
        Some(&encargado_token),
        None,
    )
    .await;
    assert_eq!(body.as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn rondas_flow() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_, vigilante_email) = seed_user_in(&state, conjunto, Rol::Vigilante).await;
    let (_, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let vigilante_token = login(&app, &vigilante_email).await;
    let resident_token = login(&app, &resident_email).await;

    // No round yet today.
    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/parqueadero/rondas",
        Some(&vigilante_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(body.is_null());

    // Residents cannot record rounds.
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/parqueadero/rondas",
        Some(&resident_token),
        Some(json!({ "hallazgos": [], "completada": true })),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/parqueadero/rondas",
        Some(&vigilante_token),
        Some(json!({
            "hallazgos": [{ "descripcion": "Vehículo mal parqueado", "celda": "P-101" }],
            "completada": true
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["completada"], true);
    assert_eq!(body["hallazgos"][0]["celda"], "P-101");

    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/parqueadero/rondas",
        Some(&vigilante_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body["hallazgos"][0]["descripcion"],
        "Vehículo mal parqueado"
    );
}

// ---------------------------------------------------------------------------
// reservas
// ---------------------------------------------------------------------------

#[tokio::test]
async fn reserva_flow_overlap_409_and_deposit_state() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_, email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let token = login(&app, &email).await;
    let area_libre = seed_area(&state, conjunto, false).await;
    let area_deposito = seed_area(&state, conjunto, true).await;

    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/areas-comunes",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body.as_array().unwrap().len(), 2);

    let inicio = Utc::now() + Duration::days(1);
    let fin = inicio + Duration::hours(2);
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/reservas",
        Some(&token),
        Some(json!({
            "areaId": area_libre,
            "fechaInicio": inicio.to_rfc3339(),
            "fechaFin": fin.to_rfc3339(),
            "notas": "cumpleaños"
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(
        body["estado"], "CONFIRMADA",
        "no-deposit area confirms immediately"
    );

    // Overlapping booking is rejected.
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/reservas",
        Some(&token),
        Some(json!({
            "areaId": area_libre,
            "fechaInicio": (inicio + Duration::hours(1)).to_rfc3339(),
            "fechaFin": (fin + Duration::hours(1)).to_rfc3339()
        })),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT, "{body}");

    // Deposit-requiring area starts PENDIENTE.
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/reservas",
        Some(&token),
        Some(json!({
            "areaId": area_deposito,
            "fechaInicio": inicio.to_rfc3339(),
            "fechaFin": fin.to_rfc3339()
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["estado"], "PENDIENTE");

    // Own upcoming list with area info.
    let (status, body) = request(&app, Method::GET, "/api/v1/reservas", Some(&token), None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let reservas = body.as_array().unwrap();
    assert_eq!(reservas.len(), 2);
    assert!(reservas.iter().all(|r| r["areaNombre"].is_string()));

    // Occupied slots that day.
    let fecha = inicio.date_naive();
    let (status, body) = request(
        &app,
        Method::GET,
        &format!("/api/v1/areas-comunes/{area_libre}/slots?fecha={fecha}"),
        Some(&token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body.as_array().unwrap().len(), 1);

    // Invalid range.
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/reservas",
        Some(&token),
        Some(json!({
            "areaId": area_libre,
            "fechaInicio": fin.to_rfc3339(),
            "fechaFin": inicio.to_rfc3339()
        })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

// ---------------------------------------------------------------------------
// pagos + admin stats
// ---------------------------------------------------------------------------

#[tokio::test]
async fn pagos_flow_and_admin_stats() {
    let state = test_state().await;
    let app = build_router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (user_id, email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let (_, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let token = login(&app, &email).await;
    let admin_token = login(&app, &admin_email).await;

    // Without a unit: empty lists, not an error (Law 4: real response, no mocks).
    let (status, body) = request(&app, Method::GET, "/api/v1/pagos", Some(&token), None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["pagos"].as_array().unwrap().len(), 0);
    assert_eq!(body["recibos"].as_array().unwrap().len(), 0);

    let (_, pago_id) = seed_unidad_con_pago(&state, conjunto, user_id).await;

    let (status, body) = request(&app, Method::GET, "/api/v1/pagos", Some(&token), None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["pagos"].as_array().unwrap().len(), 1);
    assert_eq!(money(&body["pagos"][0]["monto"]), 155000.0);
    assert_eq!(body["recibos"].as_array().unwrap().len(), 1);

    // Another user cannot pay someone else's pago.
    let (_, other_email) = seed_user_in(&state, conjunto, Rol::Arrendatario).await;
    let other_token = login(&app, &other_email).await;
    let (status, _) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/pagos/{pago_id}/pagar"),
        Some(&other_token),
        Some(json!({ "metodo": "PSE" })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // Owner pays (simulated).
    let (status, body) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/pagos/{pago_id}/pagar"),
        Some(&token),
        Some(json!({ "metodo": "PSE" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["estado"], "PAGADO");
    assert_eq!(body["metodo"], "PSE");
    assert!(body["fechaPago"].is_string());

    // Admin stats pick up this month's collection; residents are rejected.
    let (status, _) = request(&app, Method::GET, "/api/v1/admin/stats", Some(&token), None).await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/admin/stats",
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(money(&body["recaudoMes"]), 155000.0);
    assert_eq!(body["reservasPendientes"], 0);
}

// ---------------------------------------------------------------------------
// tenant isolation (Law 2): user A never sees conjunto B's data
// ---------------------------------------------------------------------------

#[tokio::test]
async fn tenant_isolation_across_all_m4_list_endpoints() {
    let state = test_state().await;
    let app = build_router(state.clone());

    // Conjunto B gets data of every kind.
    let conjunto_b = seed_conjunto(&state).await;
    let (resident_b, resident_b_email) = seed_user_in(&state, conjunto_b, Rol::Propietario).await;
    let (_, vigilante_b_email) = seed_user_in(&state, conjunto_b, Rol::Vigilante).await;
    let resident_b_token = login(&app, &resident_b_email).await;
    let vigilante_b_token = login(&app, &vigilante_b_email).await;

    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/vigilancia/visitas",
        Some(&vigilante_b_token),
        Some(json!({ "usuarioId": resident_b, "nombre": "Visita B", "tipo": "PEATONAL" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/vigilancia/paquetes",
        Some(&vigilante_b_token),
        Some(json!({ "usuarioId": resident_b, "descripcion": "Caja B", "remitente": "B" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    seed_celda(&state, conjunto_b, "B-1").await;
    let area_b = seed_area(&state, conjunto_b, false).await;
    let inicio = Utc::now() + Duration::days(2);
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/reservas",
        Some(&resident_b_token),
        Some(json!({
            "areaId": area_b,
            "fechaInicio": inicio.to_rfc3339(),
            "fechaFin": (inicio + Duration::hours(1)).to_rfc3339()
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    seed_unidad_con_pago(&state, conjunto_b, resident_b).await;
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/vehiculos",
        Some(&resident_b_token),
        Some(json!({
            "placa": format!("B{}", &Uuid::new_v4().simple().to_string()[..5]),
            "tipo": "MOTO"
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // Conjunto A staff/resident see none of it.
    let conjunto_a = seed_conjunto(&state).await;
    let (_, resident_a_email) = seed_user_in(&state, conjunto_a, Rol::Propietario).await;
    let (_, staff_a_email) = seed_user_in(&state, conjunto_a, Rol::SupervisorVigilancia).await;
    let (_, encargado_a_email) = seed_user_in(&state, conjunto_a, Rol::EncargadoParqueadero).await;
    let (_, admin_a_email) = seed_user_in(&state, conjunto_a, Rol::Administrador).await;
    let resident_a_token = login(&app, &resident_a_email).await;
    let staff_a_token = login(&app, &staff_a_email).await;
    let encargado_a_token = login(&app, &encargado_a_email).await;
    let admin_a_token = login(&app, &admin_a_email).await;

    let empty_array_checks: Vec<(&str, &str)> = vec![
        ("/api/v1/vigilancia/visitas", &staff_a_token),
        ("/api/v1/vigilancia/paquetes", &staff_a_token),
        ("/api/v1/parqueadero/mapa", &encargado_a_token),
        ("/api/v1/parqueadero/registros", &encargado_a_token),
        ("/api/v1/areas-comunes", &resident_a_token),
        ("/api/v1/notificaciones", &resident_a_token),
        ("/api/v1/paquetes/mios", &resident_a_token),
        ("/api/v1/reservas", &resident_a_token),
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

    // Composite responses.
    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/vigilancia/stats",
        Some(&staff_a_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["visitasHoy"], 0);
    assert_eq!(body["paquetesPendientes"], 0);

    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/parqueadero/stats",
        Some(&encargado_a_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["total"], 0);

    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/comunicaciones",
        Some(&resident_a_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["visitas"].as_array().unwrap().len(), 0);
    assert_eq!(body["paquetes"].as_array().unwrap().len(), 0);

    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/parqueadero/mio",
        Some(&resident_a_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["vehiculos"].as_array().unwrap().len(), 0);

    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/pagos",
        Some(&resident_a_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["pagos"].as_array().unwrap().len(), 0);

    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/admin/stats",
        Some(&admin_a_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(money(&body["recaudoMes"]), 0.0);
    assert_eq!(body["reservasPendientes"], 0);

    // Conjunto B's area is invisible to A even by direct id.
    let fecha = (Utc::now() + Duration::days(2)).date_naive();
    let (status, _) = request(
        &app,
        Method::GET,
        &format!("/api/v1/areas-comunes/{area_b}/slots?fecha={fecha}"),
        Some(&resident_a_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // And A cannot book B's area.
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/reservas",
        Some(&resident_a_token),
        Some(json!({
            "areaId": area_b,
            "fechaInicio": (inicio + Duration::days(1)).to_rfc3339(),
            "fechaFin": (inicio + Duration::days(1) + Duration::hours(1)).to_rfc3339()
        })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}
