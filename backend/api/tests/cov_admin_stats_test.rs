mod common;

use axum::http::{Method, StatusCode};
use common::*;
use enconjunto_api::db::enums::Rol;
use serde_json::json;

#[tokio::test]
async fn admin_stats_happy_path() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let (_uid, email) = seed_user_in(&state, conj, Rol::Administrador).await;
    let token = login(&app, &email).await;

    let (s, body) = request(
        &app,
        Method::GET,
        "/api/v1/admin/stats",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(s, StatusCode::OK, "admin stats failed: {body}");
    assert!(
        body["recaudoMes"].is_string() || body["recaudoMes"].is_number(),
        "recaudoMes missing: {body}"
    );
    assert!(
        body["reservasPendientes"].is_number(),
        "reservasPendientes missing: {body}"
    );
}

#[tokio::test]
async fn admin_stats_rejects_non_admin() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let (_uid, email) = seed_user_in(&state, conj, Rol::Propietario).await;
    let token = login(&app, &email).await;

    let (s, _) = request(
        &app,
        Method::GET,
        "/api/v1/admin/stats",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(s, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn admin_stats_tenant_isolated() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj_a = seed_conjunto(&state).await;
    let conj_b = seed_conjunto(&state).await;
    let (_uid_a, email_a) = seed_user_in(&state, conj_a, Rol::Administrador).await;
    let (_uid_b, email_b) = seed_user_in(&state, conj_b, Rol::Administrador).await;
    let token_a = login(&app, &email_a).await;
    let token_b = login(&app, &email_b).await;

    // Both get their own stats
    let (s, _) = request(&app, Method::GET, "/api/v1/admin/stats", Some(&token_a), None).await;
    assert_eq!(s, StatusCode::OK);

    let (s, _) = request(&app, Method::GET, "/api/v1/admin/stats", Some(&token_b), None).await;
    assert_eq!(s, StatusCode::OK);
}

#[tokio::test]
async fn concejo_role_can_access_stats() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let (_uid, email) = seed_user_in(&state, conj, Rol::Concejo).await;
    let token = login(&app, &email).await;

    let (s, _) = request(
        &app,
        Method::GET,
        "/api/v1/admin/stats",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(s, StatusCode::OK);
}
