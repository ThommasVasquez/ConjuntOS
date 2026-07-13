//! Regression tests for the production-readiness security fixes.
//! Real router + real Postgres (TEST_DATABASE_URL). No mocks.

mod common;

use axum::http::{Method, StatusCode};
use common::*;
use enconjunto_api::db::enums::Rol;
use serde_json::json;

fn pase_body(unidad_id: &str, email_huesped: &str) -> serde_json::Value {
    json!({
        "unidad_id": unidad_id,
        "nombre_anfitrion": "Anfitrion",
        "nombre_huesped": "Huesped",
        "email_huesped": email_huesped,
        "fecha_inicio": "2026-07-11",
        "fecha_fin": "2026-07-20",
        "permiso_gimnasio": false,
        "permiso_piscina": false,
        "permiso_entrada_salida": true,
        "permiso_vehiculo": false,
        "permiso_asamblea": false
    })
}

/// A resident MUST NOT be able to hijack a real account by issuing a temporary
/// pass with that account's email (the CRITICAL account-takeover fix).
#[tokio::test]
async fn temporary_pass_cannot_hijack_existing_account() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let unidad = seed_unidad(&state, conjunto).await;
    let (_admin_id, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let (_prop_id, prop_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let token = login(&app, &prop_email).await;

    // Attack: pass targeting the admin's email → 409, admin untouched.
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/pases-temporales",
        Some(&token),
        Some(pase_body(&unidad.to_string(), &admin_email)),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT, "takeover must be rejected: {body}");

    // The admin's credentials still work (password was not overwritten).
    let (login_status, _) = request(
        &app,
        Method::POST,
        "/api/v1/auth/login",
        None,
        Some(json!({ "email": admin_email, "password": TEST_PASSWORD })),
    )
    .await;
    assert_eq!(login_status, StatusCode::OK, "admin login must still work");
}

/// A legitimate pass for a brand-new guest email still succeeds.
#[tokio::test]
async fn temporary_pass_for_new_guest_succeeds() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let unidad = seed_unidad(&state, conjunto).await;
    let (_prop_id, prop_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let token = login(&app, &prop_email).await;

    let guest = format!("guest-{}@example.com", uuid::Uuid::new_v4().simple());
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/pases-temporales",
        Some(&token),
        Some(pase_body(&unidad.to_string(), &guest)),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "legit pass should succeed: {body}");
}

/// unidad_id from another conjunto must be rejected (tenant isolation).
#[tokio::test]
async fn temporary_pass_rejects_foreign_unidad() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto_a = seed_conjunto(&state).await;
    let conjunto_b = seed_conjunto(&state).await;
    let unidad_b = seed_unidad(&state, conjunto_b).await; // belongs to B
    let (_prop_id, prop_email) = seed_user_in(&state, conjunto_a, Rol::Propietario).await;
    let token = login(&app, &prop_email).await;

    let guest = format!("guest-{}@example.com", uuid::Uuid::new_v4().simple());
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/pases-temporales",
        Some(&token),
        Some(pase_body(&unidad_b.to_string(), &guest)),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "foreign unidad must be rejected: {body}"
    );
}

/// SVG uploads are rejected (stored-XSS vector); PNG is accepted.
#[tokio::test]
async fn svg_upload_rejected_png_allowed() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_id, email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let token = login(&app, &email).await;

    // data: URL with an SVG content-type → 400.
    let svg = "data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+";
    let (svg_status, _) = request(
        &app,
        Method::POST,
        "/api/v1/uploads/imagen",
        Some(&token),
        Some(json!({ "data": svg })),
    )
    .await;
    assert_eq!(svg_status, StatusCode::BAD_REQUEST, "SVG must be rejected");

    // A PNG passes the image-type allowlist. (Storage is unconfigured in the
    // test env, so the upload then 502s — the point is it is NOT rejected as an
    // invalid image type the way SVG is.)
    let png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    let (png_status, body) = request(
        &app,
        Method::POST,
        "/api/v1/uploads/imagen",
        Some(&token),
        Some(json!({ "data": png })),
    )
    .await;
    assert_ne!(
        png_status,
        StatusCode::BAD_REQUEST,
        "PNG must not be rejected by the image-type allowlist: {body}"
    );
}
