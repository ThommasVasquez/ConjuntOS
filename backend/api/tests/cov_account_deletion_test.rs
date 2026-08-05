//! Integration tests for DELETE /api/v1/usuarios/me — self-service account
//! deletion (a Google Play requirement for any app with account creation).
//!
//! Covers: password re-authentication, the PII scrub, session revocation, the
//! last-administrator guard, and the fact that legally-retained rows survive.

mod common;
use axum::http::{Method, StatusCode};
use common::*;
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use enconjunto_api::db::enums::Rol;
use enconjunto_api::db::schema::usuarios;
use serde_json::json;
use uuid::Uuid;

/// Read the raw row straight from Postgres — the API can no longer show it.
async fn raw_user(
    state: &enconjunto_api::state::AppState,
    id: Uuid,
) -> (String, String, Option<String>, Option<String>, bool) {
    let mut conn = state.pool.get().await.unwrap();
    usuarios::table
        .find(id)
        .select((
            usuarios::nombre,
            usuarios::email,
            usuarios::telefono,
            usuarios::avatar,
            usuarios::activo,
        ))
        .first(&mut conn)
        .await
        .unwrap()
}

// ---------------------------------------------------------------------------
// Re-authentication
// ---------------------------------------------------------------------------

#[tokio::test]
async fn wrong_password_does_not_delete() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (uid, email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let token = login(&app, &email).await;

    let (status, _) = request(
        &app,
        Method::DELETE,
        "/api/v1/usuarios/me",
        Some(&token),
        Some(json!({ "password": "no-es-la-clave" })),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    // Account untouched: still active, still usable.
    let (_, mail, _, _, activo) = raw_user(&state, uid).await;
    assert!(activo, "account must survive a failed confirmation");
    assert_eq!(mail, email, "email must not be tombstoned");

    let (status, _) = request(
        &app,
        Method::GET,
        "/api/v1/usuarios/me/profile",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "session must still work");
}

#[tokio::test]
async fn anonymous_caller_cannot_delete() {
    let state = test_state().await;
    let app = router(state.clone());
    let (status, _) = request(
        &app,
        Method::DELETE,
        "/api/v1/usuarios/me",
        None,
        Some(json!({ "password": TEST_PASSWORD })),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

#[tokio::test]
async fn deletes_account_scrubs_pii_and_kills_every_session() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (uid, email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let token = login(&app, &email).await;

    // A second, older session — deletion must revoke this one too, not just the
    // token that made the call.
    let other_token = login(&app, &email).await;

    // Give the profile some PII to scrub.
    let (status, _) = request(
        &app,
        Method::PUT,
        "/api/v1/usuarios/me/profile",
        Some(&token),
        Some(json!({ "nombre": "Ana Restrepo", "telefono": "3001234567", "genero": "F" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, _) = request(
        &app,
        Method::DELETE,
        "/api/v1/usuarios/me",
        Some(&token),
        Some(json!({ "password": TEST_PASSWORD })),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    // PII is gone from the row.
    let (nombre, mail, telefono, avatar, activo) = raw_user(&state, uid).await;
    assert_eq!(nombre, "Usuario eliminado");
    assert_ne!(mail, email, "real address must be released");
    assert!(mail.ends_with("@conjuntos.invalid"), "got {mail}");
    assert!(telefono.is_none());
    assert!(avatar.is_none());
    assert!(!activo);

    // Both sessions are dead, not just the calling one.
    for (label, tok) in [("calling", &token), ("other", &other_token)] {
        let (status, _) = request(
            &app,
            Method::GET,
            "/api/v1/usuarios/me/profile",
            Some(tok),
            None,
        )
        .await;
        assert_eq!(
            status,
            StatusCode::UNAUTHORIZED,
            "{label} session survived deletion"
        );
    }

    // And the old credentials no longer log in.
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/auth/login",
        None,
        Some(json!({ "email": email, "password": TEST_PASSWORD })),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn freed_email_can_register_again() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_, email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let token = login(&app, &email).await;

    let (status, _) = request(
        &app,
        Method::DELETE,
        "/api/v1/usuarios/me",
        Some(&token),
        Some(json!({ "password": TEST_PASSWORD })),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    // The tombstoned address must not collide with UNIQUE(email): the same
    // person can come back later.
    let new_id = seed_user_email(&state, conjunto, &email, Rol::Propietario).await;
    let token = login(&app, &email).await;
    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/usuarios/me/profile",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["id"].as_str().unwrap(), new_id.to_string());
}

// ---------------------------------------------------------------------------
// Last-administrator guard
// ---------------------------------------------------------------------------

#[tokio::test]
async fn sole_administrator_cannot_orphan_the_conjunto() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (uid, email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    // Residents do not count — only another admin can take over.
    seed_user_in(&state, conjunto, Rol::Propietario).await;
    let token = login(&app, &email).await;

    let (status, body) = request(
        &app,
        Method::DELETE,
        "/api/v1/usuarios/me",
        Some(&token),
        Some(json!({ "password": TEST_PASSWORD })),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT, "{body}");

    let (_, _, _, _, activo) = raw_user(&state, uid).await;
    assert!(activo, "blocked deletion must not half-apply");
}

#[tokio::test]
async fn administrator_can_delete_when_another_admin_remains() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (uid, email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    seed_user_in(&state, conjunto, Rol::Administrador).await;
    let token = login(&app, &email).await;

    let (status, body) = request(
        &app,
        Method::DELETE,
        "/api/v1/usuarios/me",
        Some(&token),
        Some(json!({ "password": TEST_PASSWORD })),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");

    let (_, _, _, _, activo) = raw_user(&state, uid).await;
    assert!(!activo);
}

/// An admin in a *different* conjunto must not count as cover: the guard is
/// scoped per conjunto, so this one is still the last admin of their own.
#[tokio::test]
async fn admin_of_another_conjunto_does_not_satisfy_the_guard() {
    let state = test_state().await;
    let app = router(state.clone());
    let mine = seed_conjunto(&state).await;
    let theirs = seed_conjunto(&state).await;
    let (_, email) = seed_user_in(&state, mine, Rol::Administrador).await;
    seed_user_in(&state, theirs, Rol::Administrador).await;
    let token = login(&app, &email).await;

    let (status, _) = request(
        &app,
        Method::DELETE,
        "/api/v1/usuarios/me",
        Some(&token),
        Some(json!({ "password": TEST_PASSWORD })),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
}
