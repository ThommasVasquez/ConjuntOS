mod common;
use axum::http::{Method, StatusCode};
use common::*;
use enconjunto_api::db::enums::Rol;
use serde_json::json;

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Create a service request (PQRS) as a resident and return its id.
/// POST /api/v1/solicitudes requires { categoria, descripcion }.
async fn crear_solicitud(app: &axum::Router, token: &str) -> String {
    let (status, body) = request(
        app,
        Method::POST,
        "/api/v1/solicitudes",
        Some(token),
        Some(json!({
            "categoria": "PLOMERIA",
            "descripcion": "Fuga de agua en el baño",
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "crear solicitud: {body}");
    body["id"].as_str().expect("solicitud id").to_string()
}

// ── GET /api/v1/admin/solicitudes ────────────────────────────────────────────

#[tokio::test]
async fn admin_lista_solicitudes_happy_path() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_rid, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let (_aid, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let resident_token = login(&app, &resident_email).await;
    let admin_token = login(&app, &admin_email).await;

    let sid = crear_solicitud(&app, &resident_token).await;

    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/admin/solicitudes",
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body.is_array(), "expected array, got {body}");
    let contains = body
        .as_array()
        .unwrap()
        .iter()
        .any(|s| s["id"].as_str() == Some(sid.as_str()));
    assert!(contains, "admin list should contain created solicitud {sid}: {body}");
}

#[tokio::test]
async fn admin_lista_solicitudes_rejects_non_admin() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_uid, email) = seed_user_in(&state, conjunto, Rol::Vigilante).await;
    let token = login(&app, &email).await;

    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/admin/solicitudes",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "{body}");
}

#[tokio::test]
async fn admin_lista_solicitudes_isolated_per_conjunto() {
    let state = test_state().await;
    let app = router(state.clone());

    // Conjunto A: resident creates a solicitud.
    let conjunto_a = seed_conjunto(&state).await;
    let (_ra, resident_a_email) = seed_user_in(&state, conjunto_a, Rol::Propietario).await;
    let resident_a_token = login(&app, &resident_a_email).await;
    let sid_a = crear_solicitud(&app, &resident_a_token).await;

    // Conjunto B: admin must not see conjunto A's solicitud.
    let conjunto_b = seed_conjunto(&state).await;
    let (_ab, admin_b_email) = seed_user_in(&state, conjunto_b, Rol::Administrador).await;
    let admin_b_token = login(&app, &admin_b_email).await;

    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/admin/solicitudes",
        Some(&admin_b_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body.is_array(), "{body}");
    let leaks = body
        .as_array()
        .unwrap()
        .iter()
        .any(|s| s["id"].as_str() == Some(sid_a.as_str()));
    assert!(!leaks, "admin from conjunto B must not see conjunto A solicitud: {body}");
}

// ── GET /api/v1/admin/solicitudes/stats ──────────────────────────────────────

#[tokio::test]
async fn admin_stats_happy_path() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_rid, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let (_aid, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let resident_token = login(&app, &resident_email).await;
    let admin_token = login(&app, &admin_email).await;

    crear_solicitud(&app, &resident_token).await;

    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/admin/solicitudes/stats",
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    // TicketStats fields are plain snake_case i64/f64 counters.
    assert!(body["total"].is_number(), "expected numeric total: {body}");
    assert!(body["abiertos"].is_number(), "expected numeric abiertos: {body}");
}

#[tokio::test]
async fn admin_stats_rejects_non_admin() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_uid, email) = seed_user_in(&state, conjunto, Rol::Vigilante).await;
    let token = login(&app, &email).await;

    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/admin/solicitudes/stats",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "{body}");
}

// ── PUT /api/v1/admin/solicitudes/{id} ───────────────────────────────────────

#[tokio::test]
async fn admin_actualiza_solicitud_happy_path() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_rid, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let (_aid, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let resident_token = login(&app, &resident_email).await;
    let admin_token = login(&app, &admin_email).await;

    let sid = crear_solicitud(&app, &resident_token).await;

    // UpdateSolicitudRequest: all optional (estado, proveedorId, asignadoAId, prioridad).
    // Send a state change (also records a transition) plus a priority bump —
    // both are self-contained (no FK to seed).
    let (status, body) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/admin/solicitudes/{sid}"),
        Some(&admin_token),
        Some(json!({ "estado": "EN_PROGRESO", "prioridad": "ALTA" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["id"].as_str(), Some(sid.as_str()), "{body}");
    assert_eq!(body["estado"].as_str(), Some("EN_PROGRESO"), "{body}");
    assert_eq!(body["prioridad"].as_str(), Some("ALTA"), "{body}");
}

#[tokio::test]
async fn admin_actualiza_solicitud_rejects_non_admin() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_rid, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let resident_token = login(&app, &resident_email).await;
    let (_vid, vig_email) = seed_user_in(&state, conjunto, Rol::Vigilante).await;
    let vig_token = login(&app, &vig_email).await;

    let sid = crear_solicitud(&app, &resident_token).await;

    let (status, body) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/admin/solicitudes/{sid}"),
        Some(&vig_token),
        Some(json!({ "prioridad": "ALTA" })),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "{body}");
}

#[tokio::test]
async fn admin_actualiza_solicitud_cross_tenant_not_found() {
    let state = test_state().await;
    let app = router(state.clone());

    // Conjunto A: resident creates a solicitud.
    let conjunto_a = seed_conjunto(&state).await;
    let (_ra, resident_a_email) = seed_user_in(&state, conjunto_a, Rol::Propietario).await;
    let resident_a_token = login(&app, &resident_a_email).await;
    let sid_a = crear_solicitud(&app, &resident_a_token).await;

    // Conjunto B admin cannot update conjunto A's solicitud (scoped lookup → 404).
    let conjunto_b = seed_conjunto(&state).await;
    let (_ab, admin_b_email) = seed_user_in(&state, conjunto_b, Rol::Administrador).await;
    let admin_b_token = login(&app, &admin_b_email).await;

    let (status, body) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/admin/solicitudes/{sid_a}"),
        Some(&admin_b_token),
        Some(json!({ "prioridad": "ALTA" })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");
}

// ── GET/POST /api/v1/admin/solicitudes/{id}/comentarios ──────────────────────

#[tokio::test]
async fn admin_comentarios_post_and_list() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_rid, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let (_aid, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let resident_token = login(&app, &resident_email).await;
    let admin_token = login(&app, &admin_email).await;

    let sid = crear_solicitud(&app, &resident_token).await;

    // POST a comment (AgregarComentarioRequest { contenido }).
    let (status, body) = request(
        &app,
        Method::POST,
        &format!("/api/v1/admin/solicitudes/{sid}/comentarios"),
        Some(&admin_token),
        Some(json!({ "contenido": "Enviamos un técnico mañana" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    // Empty comment must be rejected (400).
    let (status, body) = request(
        &app,
        Method::POST,
        &format!("/api/v1/admin/solicitudes/{sid}/comentarios"),
        Some(&admin_token),
        Some(json!({ "contenido": "   " })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");

    // GET the comment list.
    let (status, body) = request(
        &app,
        Method::GET,
        &format!("/api/v1/admin/solicitudes/{sid}/comentarios"),
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body.is_array(), "expected array, got {body}");
    assert!(
        !body.as_array().unwrap().is_empty(),
        "comentarios should contain the one we posted: {body}"
    );
}

#[tokio::test]
async fn admin_comentarios_reject_non_admin() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_rid, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let resident_token = login(&app, &resident_email).await;
    let (_vid, vig_email) = seed_user_in(&state, conjunto, Rol::Vigilante).await;
    let vig_token = login(&app, &vig_email).await;

    let sid = crear_solicitud(&app, &resident_token).await;

    let (status, body) = request(
        &app,
        Method::GET,
        &format!("/api/v1/admin/solicitudes/{sid}/comentarios"),
        Some(&vig_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "{body}");

    let (status, body) = request(
        &app,
        Method::POST,
        &format!("/api/v1/admin/solicitudes/{sid}/comentarios"),
        Some(&vig_token),
        Some(json!({ "contenido": "no permitido" })),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "{body}");
}

// ── GET /api/v1/admin/solicitudes/{id}/historial ─────────────────────────────

#[tokio::test]
async fn admin_historial_happy_path() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_rid, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let (_aid, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let resident_token = login(&app, &resident_email).await;
    let admin_token = login(&app, &admin_email).await;

    let sid = crear_solicitud(&app, &resident_token).await;

    // A state change registers a transition in the historial.
    let (status, _body) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/admin/solicitudes/{sid}"),
        Some(&admin_token),
        Some(json!({ "estado": "ASIGNADA" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, body) = request(
        &app,
        Method::GET,
        &format!("/api/v1/admin/solicitudes/{sid}/historial"),
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body.is_array(), "expected array, got {body}");
    assert!(
        !body.as_array().unwrap().is_empty(),
        "historial should record the state transition: {body}"
    );
}

#[tokio::test]
async fn admin_historial_rejects_non_admin() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_rid, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let resident_token = login(&app, &resident_email).await;
    let (_vid, vig_email) = seed_user_in(&state, conjunto, Rol::Vigilante).await;
    let vig_token = login(&app, &vig_email).await;

    let sid = crear_solicitud(&app, &resident_token).await;

    let (status, body) = request(
        &app,
        Method::GET,
        &format!("/api/v1/admin/solicitudes/{sid}/historial"),
        Some(&vig_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "{body}");
}
