//! Integration coverage for the "multas" domain (monetary fines, F5 / Ley 675).
//!
//! Endpoints under test:
//!   - GET    /api/v1/multas                (admin sees all; resident sees own)
//!   - POST   /api/v1/multas                (ADMINISTRADOR/CONCEJO issue a fine)
//!   - POST   /api/v1/multas/{id}/apelar    (the fined resident appeals)
//!   - POST   /api/v1/multas/{id}/anular    (admin voids)
//!
//! Covers happy paths, role guards (403), and tenant isolation (404 across
//! conjuntos). Every test seeds its own conjunto/users so they run in parallel.
//! Runs against TEST_DATABASE_URL (default postgresql://localhost/enconjunto_test).

mod common;
use axum::http::{Method, StatusCode};
use common::*;
use enconjunto_api::db::enums::Rol;
use serde_json::json;

use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use enconjunto_api::state::AppState;
use uuid::Uuid;

/// Issuing a fine creates a linked pago in the resident's cartera, which needs
/// a unit — so the target resident must have `unidad_id` assigned. Seeds a fresh
/// unidad and attaches it to `user_id`.
async fn give_unidad(state: &AppState, conjunto: Uuid, user_id: Uuid) {
    use enconjunto_api::db::schema::usuarios;
    let unidad = seed_unidad(state, conjunto).await;
    let mut conn = state.pool.get().await.unwrap();
    diesel::update(usuarios::table.find(user_id))
        .set(usuarios::unidad_id.eq(unidad))
        .execute(&mut conn)
        .await
        .unwrap();
}

/// Issue a fine as `admin_token` for `usuario_id`; returns (status, body).
async fn emitir(
    app: &axum::Router,
    admin_token: &str,
    usuario_id: Uuid,
) -> (StatusCode, serde_json::Value) {
    request(
        app,
        Method::POST,
        "/api/v1/multas",
        Some(admin_token),
        Some(json!({
            "usuarioId": usuario_id,
            "monto": "50000",
            "motivo": "Ruido excesivo después de las 10pm",
            "fechaLimite": "2026-12-31"
        })),
    )
    .await
}

// ---------------------------------------------------------------------------
// POST /multas + GET /multas
// ---------------------------------------------------------------------------

#[tokio::test]
async fn emitir_multa_and_list_by_role() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_admin_id, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let (resident_id, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let (_other_id, other_email) = seed_user_in(&state, conjunto, Rol::Arrendatario).await;
    give_unidad(&state, conjunto, resident_id).await;
    let admin_token = login(&app, &admin_email).await;
    let resident_token = login(&app, &resident_email).await;
    let other_token = login(&app, &other_email).await;

    // RBAC: a resident cannot issue fines.
    let (status, _) = emitir(&app, &resident_token, resident_id).await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // Happy path: admin issues a fine for the resident.
    let (status, body) = emitir(&app, &admin_token, resident_id).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body["id"].is_string(), "issued fine has an id: {body}");
    assert_eq!(body["usuarioId"].as_str().unwrap(), resident_id.to_string());
    assert_eq!(body["estado"], "IMPUESTA", "{body}");
    assert_eq!(body["motivo"], "Ruido excesivo después de las 10pm");

    // Validation: empty motivo → 400.
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/multas",
        Some(&admin_token),
        Some(json!({ "usuarioId": resident_id, "monto": "50000", "motivo": "   " })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // Validation: non-positive monto → 400.
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/multas",
        Some(&admin_token),
        Some(json!({ "usuarioId": resident_id, "monto": "0", "motivo": "Nada" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // Admin sees the fine in the full list.
    let (status, body) = request(&app, Method::GET, "/api/v1/multas", Some(&admin_token), None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let all = body.as_array().unwrap();
    assert_eq!(all.len(), 1, "admin sees the one issued fine: {body}");

    // The fined resident sees their own fine.
    let (status, body) =
        request(&app, Method::GET, "/api/v1/multas", Some(&resident_token), None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let mine = body.as_array().unwrap();
    assert_eq!(mine.len(), 1, "resident sees own fine: {body}");
    assert_eq!(mine[0]["usuarioId"].as_str().unwrap(), resident_id.to_string());

    // An unrelated resident sees nothing.
    let (status, body) =
        request(&app, Method::GET, "/api/v1/multas", Some(&other_token), None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body.as_array().unwrap().len(), 0, "other resident sees no fines: {body}");
}

// ---------------------------------------------------------------------------
// POST /multas/{id}/apelar
// ---------------------------------------------------------------------------

#[tokio::test]
async fn apelar_multa_by_owner_only() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_admin_id, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let (resident_id, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let (_stranger_id, stranger_email) = seed_user_in(&state, conjunto, Rol::Arrendatario).await;
    give_unidad(&state, conjunto, resident_id).await;
    let admin_token = login(&app, &admin_email).await;
    let resident_token = login(&app, &resident_email).await;
    let stranger_token = login(&app, &stranger_email).await;

    let (status, body) = emitir(&app, &admin_token, resident_id).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let multa_id = body["id"].as_str().unwrap().to_string();

    // A resident who is not the fined party cannot appeal → 403.
    let (status, _) = request(
        &app,
        Method::POST,
        &format!("/api/v1/multas/{multa_id}/apelar"),
        Some(&stranger_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // Unknown id → 404.
    let (status, _) = request(
        &app,
        Method::POST,
        &format!("/api/v1/multas/{}/apelar", Uuid::new_v4()),
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // The fined resident appeals → 200, transitions IMPUESTA → APELADA.
    let (status, body) = request(
        &app,
        Method::POST,
        &format!("/api/v1/multas/{multa_id}/apelar"),
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["estado"], "APELADA", "{body}");
    assert_eq!(body["id"].as_str().unwrap(), multa_id);
}

// ---------------------------------------------------------------------------
// POST /multas/{id}/anular
// ---------------------------------------------------------------------------

#[tokio::test]
async fn anular_multa_by_admin_only() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_admin_id, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let (resident_id, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    give_unidad(&state, conjunto, resident_id).await;
    let admin_token = login(&app, &admin_email).await;
    let resident_token = login(&app, &resident_email).await;

    let (status, body) = emitir(&app, &admin_token, resident_id).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let multa_id = body["id"].as_str().unwrap().to_string();

    // RBAC: a resident cannot void a fine → 403.
    let (status, _) = request(
        &app,
        Method::POST,
        &format!("/api/v1/multas/{multa_id}/anular"),
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // Unknown id → 404.
    let (status, _) = request(
        &app,
        Method::POST,
        &format!("/api/v1/multas/{}/anular", Uuid::new_v4()),
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // Admin voids the fine → 200, transitions to ANULADA.
    let (status, body) = request(
        &app,
        Method::POST,
        &format!("/api/v1/multas/{multa_id}/anular"),
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["estado"], "ANULADA", "{body}");

    // Voiding a terminal fine again → 400 (invalid transition).
    let (status, _) = request(
        &app,
        Method::POST,
        &format!("/api/v1/multas/{multa_id}/anular"),
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

// ---------------------------------------------------------------------------
// tenant isolation (Law 2): conjunto B never touches conjunto A's fines
// ---------------------------------------------------------------------------

#[tokio::test]
async fn multas_tenant_isolation() {
    let state = test_state().await;
    let app = router(state.clone());

    // Conjunto A: an admin issues a fine for a resident.
    let conjunto_a = seed_conjunto(&state).await;
    let (_admin_a_id, admin_a_email) = seed_user_in(&state, conjunto_a, Rol::Administrador).await;
    let (resident_a_id, _resident_a_email) = seed_user_in(&state, conjunto_a, Rol::Propietario).await;
    give_unidad(&state, conjunto_a, resident_a_id).await;
    let admin_a_token = login(&app, &admin_a_email).await;

    let (status, body) = emitir(&app, &admin_a_token, resident_a_id).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let multa_a_id = body["id"].as_str().unwrap().to_string();

    // Conjunto B users.
    let conjunto_b = seed_conjunto(&state).await;
    let (_admin_b_id, admin_b_email) = seed_user_in(&state, conjunto_b, Rol::Administrador).await;
    let (_resident_b_id, resident_b_email) = seed_user_in(&state, conjunto_b, Rol::Propietario).await;
    let admin_b_token = login(&app, &admin_b_email).await;
    let resident_b_token = login(&app, &resident_b_email).await;

    // B's admin list is empty — A's fine never leaks.
    let (status, body) =
        request(&app, Method::GET, "/api/v1/multas", Some(&admin_b_token), None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body.as_array().unwrap().len(), 0, "no cross-tenant fines: {body}");

    // B's admin cannot void A's fine → 404 (scoped away, not 403).
    let (status, _) = request(
        &app,
        Method::POST,
        &format!("/api/v1/multas/{multa_a_id}/anular"),
        Some(&admin_b_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // B's resident cannot appeal A's fine → 404.
    let (status, _) = request(
        &app,
        Method::POST,
        &format!("/api/v1/multas/{multa_a_id}/apelar"),
        Some(&resident_b_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}
