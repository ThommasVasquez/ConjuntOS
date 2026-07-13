//! Integration tests for the "sos" domain (panic / emergency alerts).
//!
//! Covers every endpoint in `api/src/domains/sos.rs`:
//!   POST   /api/v1/sos              (resident raises)
//!   GET    /api/v1/sos              (security lists active)
//!   GET    /api/v1/sos/activa       (resident's own active)
//!   POST   /api/v1/sos/{id}/atender (security)
//!   POST   /api/v1/sos/{id}/resolver(security)
//!   POST   /api/v1/sos/{id}/cancelar(owner resident)
//!
//! Plus RBAC negatives (wrong role → 403), the one-active-alert conflict (409),
//! the state machine (invalid transition → 400), and tenant isolation.
//! Every test seeds its own conjunto/users; the suite runs in parallel.

mod common;
use axum::http::{Method, StatusCode};
use common::*;
use enconjunto_api::db::enums::Rol;
use serde_json::json;

// ---------------------------------------------------------------------------
// POST /sos + GET /sos/activa — resident happy path
// ---------------------------------------------------------------------------

#[tokio::test]
async fn resident_raises_sos_and_reads_own_active() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (uid, email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let token = login(&app, &email).await;

    // No active alert yet → null.
    let (status, body) = request(&app, Method::GET, "/api/v1/sos/activa", Some(&token), None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body.is_null(), "expected null before any SOS: {body}");

    // Raise one.
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/sos",
        Some(&token),
        Some(json!({ "tipo": "MEDICA", "nota": "Dolor de pecho", "ubicacion": "Torre 3" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["tipo"], "MEDICA");
    assert_eq!(body["estado"], "ABIERTA");
    assert_eq!(body["usuarioId"].as_str().unwrap(), uid.to_string());
    assert_eq!(body["nota"], "Dolor de pecho");
    assert_eq!(body["ubicacion"], "Torre 3");
    let sos_id = body["id"].as_str().unwrap().to_string();

    // Now /activa returns it.
    let (status, body) = request(&app, Method::GET, "/api/v1/sos/activa", Some(&token), None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["id"].as_str().unwrap(), sos_id);
    assert_eq!(body["estado"], "ABIERTA");
}

// ---------------------------------------------------------------------------
// POST /sos — RBAC: only residents may raise; second alert conflicts
// ---------------------------------------------------------------------------

#[tokio::test]
async fn only_residents_raise_and_one_active_alert_per_resident() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_, resident_email) = seed_user_in(&state, conjunto, Rol::Arrendatario).await;
    let (_, vigilante_email) = seed_user_in(&state, conjunto, Rol::Vigilante).await;
    let (_, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let resident_token = login(&app, &resident_email).await;
    let vigilante_token = login(&app, &vigilante_email).await;
    let admin_token = login(&app, &admin_email).await;

    // Security staff are NOT residents → 403.
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/sos",
        Some(&vigilante_token),
        Some(json!({ "tipo": "SEGURIDAD" })),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // Admin is not a resident either → 403.
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/sos",
        Some(&admin_token),
        Some(json!({ "tipo": "INCENDIO" })),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // Resident raises one successfully (minimal body — only tipo required).
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/sos",
        Some(&resident_token),
        Some(json!({ "tipo": "OTRO" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["estado"], "ABIERTA");

    // A second active alert from the same resident → 409.
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/sos",
        Some(&resident_token),
        Some(json!({ "tipo": "SEGURIDAD" })),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
}

// ---------------------------------------------------------------------------
// GET /sos — security lists active; residents are forbidden
// ---------------------------------------------------------------------------

#[tokio::test]
async fn security_lists_active_alerts_residents_forbidden() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let (_, guard_email) = seed_user_in(&state, conjunto, Rol::SupervisorVigilancia).await;
    let resident_token = login(&app, &resident_email).await;
    let guard_token = login(&app, &guard_email).await;

    // Resident cannot see the security console list → 403.
    let (status, _) = request(&app, Method::GET, "/api/v1/sos", Some(&resident_token), None).await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // Empty list before anything is raised.
    let (status, body) = request(&app, Method::GET, "/api/v1/sos", Some(&guard_token), None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body.as_array().unwrap().len(), 0);

    // Resident raises → security now sees exactly one active alert.
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/sos",
        Some(&resident_token),
        Some(json!({ "tipo": "SEGURIDAD", "nota": "Persona sospechosa" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, body) = request(&app, Method::GET, "/api/v1/sos", Some(&guard_token), None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let alerts = body.as_array().unwrap();
    assert_eq!(alerts.len(), 1, "{body}");
    assert_eq!(alerts[0]["tipo"], "SEGURIDAD");
    assert_eq!(alerts[0]["estado"], "ABIERTA");
}

// ---------------------------------------------------------------------------
// POST /sos/{id}/atender + /resolver — security state machine
// ---------------------------------------------------------------------------

#[tokio::test]
async fn security_attends_then_resolves_and_terminal_is_rejected() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let (_, guard_email) = seed_user_in(&state, conjunto, Rol::Vigilante).await;
    let resident_token = login(&app, &resident_email).await;
    let guard_token = login(&app, &guard_email).await;

    // Resident raises the alert we will work through the state machine.
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/sos",
        Some(&resident_token),
        Some(json!({ "tipo": "MEDICA" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let sos_id = body["id"].as_str().unwrap().to_string();

    // A resident cannot attend (security-only) → 403.
    let (status, _) = request(
        &app,
        Method::POST,
        &format!("/api/v1/sos/{sos_id}/atender"),
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // Security attends: ABIERTA → ATENDIDA.
    let (status, body) = request(
        &app,
        Method::POST,
        &format!("/api/v1/sos/{sos_id}/atender"),
        Some(&guard_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["estado"], "ATENDIDA");
    assert!(body["atendidaPorId"].is_string(), "{body}");

    // Re-attending an ATENDIDA alert is an invalid transition → 400.
    let (status, _) = request(
        &app,
        Method::POST,
        &format!("/api/v1/sos/{sos_id}/atender"),
        Some(&guard_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // Security resolves: ATENDIDA → RESUELTA.
    let (status, body) = request(
        &app,
        Method::POST,
        &format!("/api/v1/sos/{sos_id}/resolver"),
        Some(&guard_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["estado"], "RESUELTA");
    assert!(body["resueltaPorId"].is_string(), "{body}");

    // RESUELTA is terminal: resolving again → 400.
    let (status, _) = request(
        &app,
        Method::POST,
        &format!("/api/v1/sos/{sos_id}/resolver"),
        Some(&guard_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // Unknown id → 404.
    let (status, _) = request(
        &app,
        Method::POST,
        &format!("/api/v1/sos/{}/atender", uuid::Uuid::new_v4()),
        Some(&guard_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

// ---------------------------------------------------------------------------
// POST /sos/{id}/cancelar — owner resident only
// ---------------------------------------------------------------------------

#[tokio::test]
async fn owner_cancels_own_sos_others_forbidden() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_, owner_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let (_, other_email) = seed_user_in(&state, conjunto, Rol::Arrendatario).await;
    let (_, guard_email) = seed_user_in(&state, conjunto, Rol::Vigilante).await;
    let owner_token = login(&app, &owner_email).await;
    let other_token = login(&app, &other_email).await;
    let guard_token = login(&app, &guard_email).await;

    // Owner raises the alert.
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/sos",
        Some(&owner_token),
        Some(json!({ "tipo": "SEGURIDAD" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let sos_id = body["id"].as_str().unwrap().to_string();

    // Security staff are not residents → cancelar guard rejects them (403).
    let (status, _) = request(
        &app,
        Method::POST,
        &format!("/api/v1/sos/{sos_id}/cancelar"),
        Some(&guard_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // A different resident (not the owner) → 403.
    let (status, _) = request(
        &app,
        Method::POST,
        &format!("/api/v1/sos/{sos_id}/cancelar"),
        Some(&other_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // Owner cancels: ABIERTA → RESUELTA.
    let (status, body) = request(
        &app,
        Method::POST,
        &format!("/api/v1/sos/{sos_id}/cancelar"),
        Some(&owner_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["estado"], "RESUELTA");

    // After cancelling, the resident has no active alert again.
    let (status, body) =
        request(&app, Method::GET, "/api/v1/sos/activa", Some(&owner_token), None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body.is_null(), "activa should be null after cancel: {body}");
}

// ---------------------------------------------------------------------------
// Tenant isolation — conjunto B security never sees or works conjunto A alerts
// ---------------------------------------------------------------------------

#[tokio::test]
async fn tenant_isolation_across_conjuntos() {
    let state = test_state().await;
    let app = router(state.clone());

    // Conjunto A: a resident raises an alert.
    let conjunto_a = seed_conjunto(&state).await;
    let (_, resident_a_email) = seed_user_in(&state, conjunto_a, Rol::Propietario).await;
    let resident_a_token = login(&app, &resident_a_email).await;
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/sos",
        Some(&resident_a_token),
        Some(json!({ "tipo": "INCENDIO" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let sos_a = body["id"].as_str().unwrap().to_string();

    // Conjunto B: its security staff see an empty active list.
    let conjunto_b = seed_conjunto(&state).await;
    let (_, guard_b_email) = seed_user_in(&state, conjunto_b, Rol::Vigilante).await;
    let guard_b_token = login(&app, &guard_b_email).await;

    let (status, body) = request(&app, Method::GET, "/api/v1/sos", Some(&guard_b_token), None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(
        body.as_array().unwrap().len(),
        0,
        "conjunto B leaked conjunto A's alert: {body}"
    );

    // Conjunto B security cannot attend conjunto A's alert → 403 (cross-tenant).
    let (status, _) = request(
        &app,
        Method::POST,
        &format!("/api/v1/sos/{sos_a}/atender"),
        Some(&guard_b_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // A resident in conjunto B cannot cancel conjunto A's alert → 403.
    let (_, resident_b_email) = seed_user_in(&state, conjunto_b, Rol::Propietario).await;
    let resident_b_token = login(&app, &resident_b_email).await;
    let (status, _) = request(
        &app,
        Method::POST,
        &format!("/api/v1/sos/{sos_a}/cancelar"),
        Some(&resident_b_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}
