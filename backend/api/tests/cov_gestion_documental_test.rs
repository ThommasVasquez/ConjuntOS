mod common;

use axum::http::{Method, StatusCode};
use common::*;
use enconjunto_api::db::enums::Rol;
use serde_json::json;

#[tokio::test]
async fn admin_create_list_update_delete_documento() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let (_uid, email) = seed_user_in(&state, conj, Rol::Administrador).await;
    let token = login(&app, &email).await;

    // Create
    let (s, body) = request(
        &app,
        Method::POST,
        "/api/v1/documentos",
        Some(&token),
        Some(json!({
            "nombre": "Reglamento 2026",
            "categoria": "REGLAMENTO",
            "url": "https://s3.example.com/doc1.pdf",
            "descripcion": "Reglamento actualizado"
        })),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "create failed: {body}");
    assert_eq!(body["nombre"], "Reglamento 2026");
    assert_eq!(body["categoria"], "REGLAMENTO");
    let doc_id = body["id"].as_str().unwrap();

    // List
    let (s, body) = request(&app, Method::GET, "/api/v1/documentos", Some(&token), None).await;
    assert_eq!(s, StatusCode::OK);
    assert!(body.as_array().unwrap().iter().any(|d| d["id"] == doc_id));

    // Get by id
    let url = format!("/api/v1/documentos/{doc_id}");
    let (s, body) = request(&app, Method::GET, &url, Some(&token), None).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(body["nombre"], "Reglamento 2026");

    // Update
    let (s, body) = request(
        &app,
        Method::PUT,
        &url,
        Some(&token),
        Some(json!({ "nombre": "Reglamento 2026 v2" })),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "update failed: {body}");
    assert_eq!(body["nombre"], "Reglamento 2026 v2");

    // Delete
    let (s, body) = request(&app, Method::DELETE, &url, Some(&token), None).await;
    assert_eq!(s, StatusCode::OK, "delete failed: {body}");

    // Confirm deleted
    let (s, _) = request(&app, Method::GET, &url, Some(&token), None).await;
    assert_eq!(s, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn resident_cannot_create_documento() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let (_uid, email) = seed_user_in(&state, conj, Rol::Propietario).await;
    let token = login(&app, &email).await;

    let (s, _) = request(
        &app,
        Method::POST,
        "/api/v1/documentos",
        Some(&token),
        Some(json!({
            "nombre": "X",
            "categoria": "OTRO",
            "url": "https://x.com"
        })),
    )
    .await;
    assert_eq!(s, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn resident_sees_only_visible_documentos() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let (_admin_id, admin_email) = seed_user_in(&state, conj, Rol::Administrador).await;
    let (_res_id, res_email) = seed_user_in(&state, conj, Rol::Propietario).await;
    let admin_token = login(&app, &admin_email).await;
    let res_token = login(&app, &res_email).await;

    // Admin creates a non-visible doc
    let (s, body) = request(
        &app,
        Method::POST,
        "/api/v1/documentos",
        Some(&admin_token),
        Some(json!({
            "nombre": "Documento Interno",
            "categoria": "INFORME_EMPRESA",
            "url": "https://s3.example.com/internal.pdf",
            "visibleResidentes": false
        })),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "create failed: {body}");
    let doc_id = body["id"].as_str().unwrap();

    // Resident cannot see it in list
    let (s, body) = request(&app, Method::GET, "/api/v1/documentos", Some(&res_token), None).await;
    assert_eq!(s, StatusCode::OK);
    assert!(!body.as_array().unwrap().iter().any(|d| d["id"] == doc_id));

    // Resident gets 403 when accessing directly
    let url = format!("/api/v1/documentos/{doc_id}");
    let (s, _) = request(&app, Method::GET, &url, Some(&res_token), None).await;
    assert_eq!(s, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn create_documento_rejects_empty_nombre_and_invalid_categoria() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let (_uid, email) = seed_user_in(&state, conj, Rol::Administrador).await;
    let token = login(&app, &email).await;

    // Empty nombre
    let (s, _) = request(
        &app,
        Method::POST,
        "/api/v1/documentos",
        Some(&token),
        Some(json!({
            "nombre": "  ",
            "categoria": "OTRO",
            "url": "https://x.com"
        })),
    )
    .await;
    assert_eq!(s, StatusCode::BAD_REQUEST);

    // Invalid categoria
    let (s, _) = request(
        &app,
        Method::POST,
        "/api/v1/documentos",
        Some(&token),
        Some(json!({
            "nombre": "Test",
            "categoria": "CATEGORIA_FALSA",
            "url": "https://x.com"
        })),
    )
    .await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn documentos_tenant_isolation() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj_a = seed_conjunto(&state).await;
    let conj_b = seed_conjunto(&state).await;
    let (_a_id, a_email) = seed_user_in(&state, conj_a, Rol::Administrador).await;
    let (_b_id, b_email) = seed_user_in(&state, conj_b, Rol::Administrador).await;
    let token_a = login(&app, &a_email).await;
    let token_b = login(&app, &b_email).await;

    // A creates a doc
    let (s, body) = request(
        &app,
        Method::POST,
        "/api/v1/documentos",
        Some(&token_a),
        Some(json!({
            "nombre": "Doc A",
            "categoria": "OTRO",
            "url": "https://a.com"
        })),
    )
    .await;
    assert_eq!(s, StatusCode::OK);
    let doc_id = body["id"].as_str().unwrap();

    // B cannot see A's doc
    let url = format!("/api/v1/documentos/{doc_id}");
    let (s, _) = request(&app, Method::GET, &url, Some(&token_b), None).await;
    assert_eq!(s, StatusCode::NOT_FOUND);

    // B cannot delete A's doc
    let (s, _) = request(&app, Method::DELETE, &url, Some(&token_b), None).await;
    assert_eq!(s, StatusCode::NOT_FOUND);
}
