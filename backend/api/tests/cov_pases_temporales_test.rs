mod common;

use axum::http::{Method, StatusCode};
use common::*;
use enconjunto_api::db::enums::Rol;
use serde_json::json;

fn pase_body(unidad_id: &str, email: &str) -> serde_json::Value {
    json!({
        "unidad_id": unidad_id,
        "nombre_anfitrion": "Anfitrion",
        "nombre_huesped": "Huesped",
        "email_huesped": email,
        "fecha_inicio": "2026-07-11",
        "fecha_fin": "2026-07-20",
        "permiso_gimnasio": false,
        "permiso_piscina": false,
        "permiso_entrada_salida": true,
        "permiso_vehiculo": false,
        "permiso_asamblea": false
    })
}

#[tokio::test]
async fn crear_pase_and_list_mis_pases() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let unidad = seed_unidad(&state, conj).await;
    let (_uid, email) = seed_user_in(&state, conj, Rol::Propietario).await;
    let token = login(&app, &email).await;

    let guest = format!("guest-{}@example.com", uuid::Uuid::new_v4().simple());

    // Create pase
    let (s, body) = request(
        &app,
        Method::POST,
        "/api/v1/pases-temporales",
        Some(&token),
        Some(pase_body(&unidad.to_string(), &guest)),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "create pase failed: {body}");
    assert_eq!(body["nombre_huesped"], "Huesped");
    assert_eq!(body["estado"], "ACTIVO");
    assert_eq!(body["permiso_entrada_salida"], true);
    let pase_id = body["id"].as_str().unwrap();

    // List mis-pases
    let (s, body) = request(
        &app,
        Method::GET,
        "/api/v1/pases-temporales/mis-pases",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(s, StatusCode::OK);
    assert!(body.as_array().unwrap().iter().any(|p| p["id"] == pase_id));
}

#[tokio::test]
async fn tenant_isolation_rejects_foreign_unidad() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj_a = seed_conjunto(&state).await;
    let conj_b = seed_conjunto(&state).await;
    let unidad_b = seed_unidad(&state, conj_b).await;
    let (_uid, email) = seed_user_in(&state, conj_a, Rol::Propietario).await;
    let token = login(&app, &email).await;

    let guest = format!("guest-{}@example.com", uuid::Uuid::new_v4().simple());
    let (s, _) = request(
        &app,
        Method::POST,
        "/api/v1/pases-temporales",
        Some(&token),
        Some(pase_body(&unidad_b.to_string(), &guest)),
    )
    .await;
    assert_eq!(s, StatusCode::NOT_FOUND, "foreign unidad must be rejected");
}

#[tokio::test]
async fn reject_dates_fin_before_inicio() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let unidad = seed_unidad(&state, conj).await;
    let (_uid, email) = seed_user_in(&state, conj, Rol::Propietario).await;
    let token = login(&app, &email).await;

    let guest = format!("guest-{}@example.com", uuid::Uuid::new_v4().simple());
    let (s, _) = request(
        &app,
        Method::POST,
        "/api/v1/pases-temporales",
        Some(&token),
        Some(json!({
            "unidad_id": unidad.to_string(),
            "nombre_anfitrion": "A",
            "nombre_huesped": "H",
            "email_huesped": guest,
            "fecha_inicio": "2026-07-20",
            "fecha_fin": "2026-07-11",
            "permiso_gimnasio": false,
            "permiso_piscina": false,
            "permiso_entrada_salida": true,
            "permiso_vehiculo": false,
            "permiso_asamblea": false
        })),
    )
    .await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn revocar_pase_and_validate_codigo() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let unidad = seed_unidad(&state, conj).await;
    let (_uid, email) = seed_user_in(&state, conj, Rol::Propietario).await;
    let token = login(&app, &email).await;

    let guest = format!("guest-{}@example.com", uuid::Uuid::new_v4().simple());

    // Create
    let (s, body) = request(
        &app,
        Method::POST,
        "/api/v1/pases-temporales",
        Some(&token),
        Some(pase_body(&unidad.to_string(), &guest)),
    )
    .await;
    assert_eq!(s, StatusCode::OK);
    let pase_id = body["id"].as_str().unwrap();
    let codigo = body["codigo_acceso"].as_str().unwrap().to_string();

    // Validate code — should be valid
    let val_url = format!("/api/v1/pases-temporales/validar/{codigo}");
    let (s, body) = request(&app, Method::GET, &val_url, Some(&token), None).await;
    assert_eq!(s, StatusCode::OK, "validate failed: {body}");
    assert_eq!(body["valido"], true);

    // Revoke
    let rev_url = format!("/api/v1/pases-temporales/{pase_id}/revocar");
    let (s, _) = request(&app, Method::PUT, &rev_url, Some(&token), None).await;
    assert_eq!(s, StatusCode::OK);

    // Validate again — should be invalid
    let (s, body) = request(&app, Method::GET, &val_url, Some(&token), None).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(body["valido"], false);
}

#[tokio::test]
async fn editar_pase_updates_fields() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let unidad = seed_unidad(&state, conj).await;
    let (_uid, email) = seed_user_in(&state, conj, Rol::Propietario).await;
    let token = login(&app, &email).await;

    let guest = format!("guest-{}@example.com", uuid::Uuid::new_v4().simple());

    let (s, body) = request(
        &app,
        Method::POST,
        "/api/v1/pases-temporales",
        Some(&token),
        Some(pase_body(&unidad.to_string(), &guest)),
    )
    .await;
    assert_eq!(s, StatusCode::OK);
    let pase_id = body["id"].as_str().unwrap();

    // Edit
    let edit_url = format!("/api/v1/pases-temporales/{pase_id}");
    let (s, body) = request(
        &app,
        Method::PUT,
        &edit_url,
        Some(&token),
        Some(json!({
            "nombre_huesped": "Huesped Updated",
            "permiso_piscina": true
        })),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "edit failed: {body}");
    assert_eq!(body["nombre_huesped"], "Huesped Updated");
    assert_eq!(body["permiso_piscina"], true);
}

#[tokio::test]
async fn pases_requires_propietario_or_admin_role() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let unidad = seed_unidad(&state, conj).await;
    let (_uid, email) = seed_user_in(&state, conj, Rol::Arrendatario).await;
    let token = login(&app, &email).await;

    let guest = format!("guest-{}@example.com", uuid::Uuid::new_v4().simple());
    let (s, _) = request(
        &app,
        Method::POST,
        "/api/v1/pases-temporales",
        Some(&token),
        Some(pase_body(&unidad.to_string(), &guest)),
    )
    .await;
    assert_eq!(s, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn pases_tenant_isolation_on_list() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj_a = seed_conjunto(&state).await;
    let conj_b = seed_conjunto(&state).await;
    let unidad_a = seed_unidad(&state, conj_a).await;
    let (_uid_a, email_a) = seed_user_in(&state, conj_a, Rol::Propietario).await;
    let (_uid_b, email_b) = seed_user_in(&state, conj_b, Rol::Propietario).await;
    let token_a = login(&app, &email_a).await;
    let token_b = login(&app, &email_b).await;

    // A creates a pase
    let guest = format!("guest-{}@example.com", uuid::Uuid::new_v4().simple());
    let (s, _) = request(
        &app,
        Method::POST,
        "/api/v1/pases-temporales",
        Some(&token_a),
        Some(pase_body(&unidad_a.to_string(), &guest)),
    )
    .await;
    assert_eq!(s, StatusCode::OK);

    // B's mis-pases should not include A's pase
    let (s, body) = request(
        &app,
        Method::GET,
        "/api/v1/pases-temporales/mis-pases",
        Some(&token_b),
        None,
    )
    .await;
    assert_eq!(s, StatusCode::OK);
    assert!(body.as_array().unwrap().is_empty());
}
