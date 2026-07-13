//! Integration tests for the "encuestas" (resident surveys/polls) domain.
//!
//! Endpoints covered:
//!   - GET  /api/v1/encuestas               (any authenticated tenant user; newest first)
//!   - POST /api/v1/encuestas               (admin/concejo create; CrearEncuestaRequest)
//!   - POST /api/v1/encuestas/{id}/votar    (resident votes once; VotarRequest)
//!   - POST /api/v1/encuestas/{id}/cerrar   (admin/concejo close)
//!
//! Covers happy paths, RBAC negatives (403), tenant isolation (404 / empty list),
//! and business rules (one vote per resident → 409, voting a closed poll → 400).

mod common;
use axum::http::{Method, StatusCode};
use common::*;
use enconjunto_api::db::enums::Rol;
use serde_json::json;

// ---------------------------------------------------------------------------
// POST /api/v1/encuestas — create (admin) + RBAC negative + validation
// ---------------------------------------------------------------------------

#[tokio::test]
async fn crear_encuesta_admin_happy_path_and_resident_forbidden() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_admin_id, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let (_res_id, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let admin_token = login(&app, &admin_email).await;
    let resident_token = login(&app, &resident_email).await;

    // Residents cannot create polls → 403.
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/encuestas",
        Some(&resident_token),
        Some(json!({
            "titulo": "Intento de residente",
            "opciones": ["Sí", "No"]
        })),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // Admin creates a valid poll.
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/encuestas",
        Some(&admin_token),
        Some(json!({
            "titulo": "¿Cambiamos el horario de la piscina?",
            "descripcion": "Consulta a la comunidad",
            "opciones": ["Sí", "No", "Me es indiferente"],
            "multiple": false,
            "anonima": false
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["titulo"], "¿Cambiamos el horario de la piscina?");
    assert_eq!(body["cerrada"], false);
    assert_eq!(body["yaVote"], false);
    assert_eq!(body["total"], 0);
    // Options are normalized to ids o1..oN with the provided texts.
    let opciones = body["opciones"].as_array().unwrap();
    assert_eq!(opciones.len(), 3, "{body}");
    assert_eq!(opciones[0]["id"], "o1");
    assert_eq!(opciones[0]["texto"], "Sí");
    // Results start at zero for every option.
    assert!(body["resultados"].is_array(), "{body}");
    assert_eq!(body["resultados"].as_array().unwrap().len(), 3);
}

#[tokio::test]
async fn crear_encuesta_requires_at_least_two_options() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_id, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let admin_token = login(&app, &admin_email).await;

    // Only one usable option → 400.
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/encuestas",
        Some(&admin_token),
        Some(json!({ "titulo": "Incompleta", "opciones": ["Sí", "  "] })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // Empty title → 400.
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/encuestas",
        Some(&admin_token),
        Some(json!({ "titulo": "   ", "opciones": ["Sí", "No"] })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

// ---------------------------------------------------------------------------
// GET /api/v1/encuestas — list (any tenant user) + tenant isolation
// ---------------------------------------------------------------------------

#[tokio::test]
async fn listar_encuestas_visible_to_residents_and_tenant_isolated() {
    let state = test_state().await;
    let app = router(state.clone());

    // Conjunto A: admin creates a poll; a resident of A must see it.
    let conjunto_a = seed_conjunto(&state).await;
    let (_id, admin_a_email) = seed_user_in(&state, conjunto_a, Rol::Administrador).await;
    let (_id, resident_a_email) = seed_user_in(&state, conjunto_a, Rol::Propietario).await;
    let admin_a_token = login(&app, &admin_a_email).await;
    let resident_a_token = login(&app, &resident_a_email).await;

    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/encuestas",
        Some(&admin_a_token),
        Some(json!({ "titulo": "Encuesta A", "opciones": ["A", "B"] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/encuestas",
        Some(&resident_a_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let list_a = body.as_array().unwrap();
    assert_eq!(list_a.len(), 1, "{body}");
    assert_eq!(list_a[0]["titulo"], "Encuesta A");

    // Conjunto B: a fresh tenant sees none of A's polls (Law 2).
    let conjunto_b = seed_conjunto(&state).await;
    let (_id, resident_b_email) = seed_user_in(&state, conjunto_b, Rol::Propietario).await;
    let resident_b_token = login(&app, &resident_b_email).await;

    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/encuestas",
        Some(&resident_b_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(
        body.as_array().map(Vec::len),
        Some(0),
        "tenant B leaked tenant A's polls: {body}"
    );
}

// ---------------------------------------------------------------------------
// POST /api/v1/encuestas/{id}/votar — vote once, tally, guards
// ---------------------------------------------------------------------------

#[tokio::test]
async fn votar_records_vote_updates_tally_and_blocks_double_vote() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_id, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let (_id, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let admin_token = login(&app, &admin_email).await;
    let resident_token = login(&app, &resident_email).await;

    // Admin creates the poll and we reuse the returned id.
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/encuestas",
        Some(&admin_token),
        Some(json!({ "titulo": "¿Aprobar presupuesto?", "opciones": ["Sí", "No"] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let poll_id = body["id"].as_str().unwrap().to_string();

    // Resident votes for option o1.
    let (status, body) = request(
        &app,
        Method::POST,
        &format!("/api/v1/encuestas/{poll_id}/votar"),
        Some(&resident_token),
        Some(json!({ "opciones": ["o1"] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["yaVote"], true, "{body}");
    assert_eq!(body["total"], 1, "{body}");
    // The o1 tally must now be 1.
    let resultados = body["resultados"].as_array().unwrap();
    let o1 = resultados
        .iter()
        .find(|r| r["opcionId"] == "o1")
        .expect("o1 result present");
    assert_eq!(o1["votos"], 1, "{body}");

    // Voting again → 409 (one vote per resident).
    let (status, _) = request(
        &app,
        Method::POST,
        &format!("/api/v1/encuestas/{poll_id}/votar"),
        Some(&resident_token),
        Some(json!({ "opciones": ["o2"] })),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
}

#[tokio::test]
async fn votar_invalid_option_and_unknown_poll_and_cross_tenant() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_id, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let (_id, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let admin_token = login(&app, &admin_email).await;
    let resident_token = login(&app, &resident_email).await;

    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/encuestas",
        Some(&admin_token),
        Some(json!({ "titulo": "Encuesta simple", "opciones": ["Sí", "No"] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let poll_id = body["id"].as_str().unwrap().to_string();

    // Unknown option id → 400 (no valid selection).
    let (status, _) = request(
        &app,
        Method::POST,
        &format!("/api/v1/encuestas/{poll_id}/votar"),
        Some(&resident_token),
        Some(json!({ "opciones": ["o99"] })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // Non-multiple poll: selecting more than one valid option → 400.
    let (status, _) = request(
        &app,
        Method::POST,
        &format!("/api/v1/encuestas/{poll_id}/votar"),
        Some(&resident_token),
        Some(json!({ "opciones": ["o1", "o2"] })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // Nonexistent poll id → 404.
    let (status, _) = request(
        &app,
        Method::POST,
        &format!("/api/v1/encuestas/{}/votar", uuid_v4()),
        Some(&resident_token),
        Some(json!({ "opciones": ["o1"] })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // A user from another conjunto cannot vote on this poll → 404 (Law 2).
    let conjunto_b = seed_conjunto(&state).await;
    let (_id, resident_b_email) = seed_user_in(&state, conjunto_b, Rol::Propietario).await;
    let resident_b_token = login(&app, &resident_b_email).await;
    let (status, _) = request(
        &app,
        Method::POST,
        &format!("/api/v1/encuestas/{poll_id}/votar"),
        Some(&resident_b_token),
        Some(json!({ "opciones": ["o1"] })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

// ---------------------------------------------------------------------------
// POST /api/v1/encuestas/{id}/cerrar — close (admin) + RBAC + effects
// ---------------------------------------------------------------------------

#[tokio::test]
async fn cerrar_encuesta_admin_closes_resident_forbidden_and_voting_blocked() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_id, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let (_id, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let admin_token = login(&app, &admin_email).await;
    let resident_token = login(&app, &resident_email).await;

    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/encuestas",
        Some(&admin_token),
        Some(json!({ "titulo": "¿Cerrar esto?", "opciones": ["Sí", "No"] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let poll_id = body["id"].as_str().unwrap().to_string();

    // Residents cannot close a poll → 403.
    let (status, _) = request(
        &app,
        Method::POST,
        &format!("/api/v1/encuestas/{poll_id}/cerrar"),
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // Unknown id → 404.
    let (status, _) = request(
        &app,
        Method::POST,
        &format!("/api/v1/encuestas/{}/cerrar", uuid_v4()),
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // Admin closes the poll.
    let (status, body) = request(
        &app,
        Method::POST,
        &format!("/api/v1/encuestas/{poll_id}/cerrar"),
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["cerrada"], true, "{body}");

    // Voting on a closed poll → 400.
    let (status, _) = request(
        &app,
        Method::POST,
        &format!("/api/v1/encuestas/{poll_id}/votar"),
        Some(&resident_token),
        Some(json!({ "opciones": ["o1"] })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

/// Local helper: a fresh random UUID as a string, for negative-path ids.
/// (The shared harness re-exports `uuid::Uuid` transitively; we format one here
/// without needing an extra import in this file.)
fn uuid_v4() -> String {
    // `common` pulls in the `uuid` crate; construct via its public API.
    uuid::Uuid::new_v4().to_string()
}
