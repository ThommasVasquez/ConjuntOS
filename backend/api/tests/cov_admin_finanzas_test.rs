//! Integration coverage for the admin_finanzas domain: financial KPIs, payment
//! listing, delinquency report, and the gasto (expense) CRUD. Each test seeds
//! its own conjunto/users so the suite is parallel-safe. Admin gate is
//! `require_admin` → allows ADMINISTRADOR / CONCEJO / SUPER_ADMIN; residents
//! (PROPIETARIO/ARRENDATARIO) must get 403.

mod common;
use axum::http::{Method, StatusCode};
use common::*;
use enconjunto_api::db::enums::Rol;
use serde_json::json;

/// A valid gasto request body. `fecha` is a DateTime<Utc> in the DTO, so it must
/// be RFC3339, not a bare date. `monto` travels as a string (Law 6).
fn gasto_body() -> serde_json::Value {
    json!({
        "categoria": "MANTENIMIENTO",
        "descripcion": "Reparación de bomba de agua",
        "monto": "150000.00",
        "proveedor": "Servicios ACME",
        "fecha": "2026-07-11T00:00:00Z"
    })
}

// ---------------------------------------------------------------------------
// GET /admin/finanzas/resumen
// ---------------------------------------------------------------------------

#[tokio::test]
async fn resumen_happy_path_and_rbac_and_tenant_isolation() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    seed_unidad(&state, conjunto).await;
    let (_uid, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let (_rid, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let admin_token = login(&app, &admin_email).await;
    let resident_token = login(&app, &resident_email).await;

    // Happy path: admin gets the KPI object with camelCase fields.
    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/admin/finanzas/resumen",
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    // Money fields are strings; counts are numbers. We seeded exactly one unidad.
    assert!(body["recaudoMes"].is_string(), "{body}");
    assert!(body["morosidad"].is_string(), "{body}");
    assert!(body["gastosMes"].is_string(), "{body}");
    assert!(body["balance"].is_string(), "{body}");
    assert_eq!(body["totalUnidades"], 1, "{body}");
    assert!(body["unidadesAlDia"].is_number(), "{body}");

    // RBAC: a resident is forbidden.
    let (status, _) = request(
        &app,
        Method::GET,
        "/api/v1/admin/finanzas/resumen",
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // Tenant isolation: an admin in another conjunto sees zero unidades here.
    let conjunto_b = seed_conjunto(&state).await;
    let (_bid, admin_b_email) = seed_user_in(&state, conjunto_b, Rol::Administrador).await;
    let admin_b_token = login(&app, &admin_b_email).await;
    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/admin/finanzas/resumen",
        Some(&admin_b_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["totalUnidades"], 0, "tenant leak: {body}");
}

// ---------------------------------------------------------------------------
// GET /admin/pagos
// ---------------------------------------------------------------------------

#[tokio::test]
async fn listar_pagos_returns_paginated_envelope_and_rbac() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_uid, admin_email) = seed_user_in(&state, conjunto, Rol::Concejo).await;
    let (_rid, resident_email) = seed_user_in(&state, conjunto, Rol::Arrendatario).await;
    let admin_token = login(&app, &admin_email).await;
    let resident_token = login(&app, &resident_email).await;

    // Happy path: Concejo (an admin-level role) gets the paginated envelope.
    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/admin/pagos",
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body["data"].is_array(), "{body}");
    assert!(body["total"].is_number(), "{body}");
    assert_eq!(body["page"], 1, "{body}");
    assert!(body["pages"].is_number(), "{body}");

    // A filter query still returns the envelope.
    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/admin/pagos?estado=PENDIENTE&page=1&limit=10",
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body["data"].is_array(), "{body}");

    // RBAC: a resident is forbidden.
    let (status, _) = request(
        &app,
        Method::GET,
        "/api/v1/admin/pagos",
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

// ---------------------------------------------------------------------------
// GET /admin/morosidad
// ---------------------------------------------------------------------------

#[tokio::test]
async fn morosidad_returns_array_and_rbac() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_uid, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let (_rid, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let admin_token = login(&app, &admin_email).await;
    let resident_token = login(&app, &resident_email).await;

    // Happy path: admin gets an array (empty for a fresh conjunto with no pagos).
    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/admin/morosidad",
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body.is_array(), "{body}");

    // RBAC: a resident is forbidden.
    let (status, _) = request(
        &app,
        Method::GET,
        "/api/v1/admin/morosidad",
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

// ---------------------------------------------------------------------------
// POST /admin/gastos
// ---------------------------------------------------------------------------

#[tokio::test]
async fn crear_gasto_happy_rbac_and_rejects_non_positive_monto() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_uid, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let (_rid, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let admin_token = login(&app, &admin_email).await;
    let resident_token = login(&app, &resident_email).await;

    // Happy path: 201 Created with the echoed fields (camelCase).
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/admin/gastos",
        Some(&admin_token),
        Some(gasto_body()),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    assert!(body["id"].is_string(), "{body}");
    assert_eq!(body["categoria"], "MANTENIMIENTO", "{body}");
    assert_eq!(body["descripcion"], "Reparación de bomba de agua", "{body}");
    assert!(body["monto"].is_string(), "{body}");
    assert_eq!(body["proveedor"], "Servicios ACME", "{body}");

    // RBAC: a resident cannot create a gasto.
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/admin/gastos",
        Some(&resident_token),
        Some(gasto_body()),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // Non-positive monto is rejected with 400.
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/admin/gastos",
        Some(&admin_token),
        Some(json!({
            "categoria": "OTRO",
            "descripcion": "monto inválido",
            "monto": "0",
            "fecha": "2026-07-11T00:00:00Z"
        })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

// ---------------------------------------------------------------------------
// GET /admin/gastos
// ---------------------------------------------------------------------------

#[tokio::test]
async fn listar_gastos_reflects_created_rows_rbac_and_tenant_isolation() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_uid, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let (_rid, resident_email) = seed_user_in(&state, conjunto, Rol::Arrendatario).await;
    let admin_token = login(&app, &admin_email).await;
    let resident_token = login(&app, &resident_email).await;

    // Empty to start.
    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/admin/gastos",
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body.as_array().map(Vec::len), Some(0), "{body}");

    // Create one, then it shows up.
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/admin/gastos",
        Some(&admin_token),
        Some(gasto_body()),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);

    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/admin/gastos",
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body.as_array().map(Vec::len), Some(1), "{body}");
    assert_eq!(body[0]["categoria"], "MANTENIMIENTO", "{body}");

    // Category filter narrows to zero for a different category.
    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/admin/gastos?categoria=NOMINA",
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body.as_array().map(Vec::len), Some(0), "{body}");

    // RBAC: a resident is forbidden.
    let (status, _) = request(
        &app,
        Method::GET,
        "/api/v1/admin/gastos",
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // Tenant isolation: an admin in another conjunto sees none of these gastos.
    let conjunto_b = seed_conjunto(&state).await;
    let (_bid, admin_b_email) = seed_user_in(&state, conjunto_b, Rol::Administrador).await;
    let admin_b_token = login(&app, &admin_b_email).await;
    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/admin/gastos",
        Some(&admin_b_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body.as_array().map(Vec::len), Some(0), "tenant leak: {body}");
}

// ---------------------------------------------------------------------------
// PUT /admin/gastos/{id}
// ---------------------------------------------------------------------------

#[tokio::test]
async fn editar_gasto_updates_fields_rbac_and_404s() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_uid, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let (_rid, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let admin_token = login(&app, &admin_email).await;
    let resident_token = login(&app, &resident_email).await;

    // Create a gasto to edit.
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/admin/gastos",
        Some(&admin_token),
        Some(gasto_body()),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let id = body["id"].as_str().unwrap().to_string();

    // Partial update: change descripcion + monto only.
    let (status, body) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/admin/gastos/{id}"),
        Some(&admin_token),
        Some(json!({ "descripcion": "Reparación completada", "monto": "175000.00" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["id"].as_str().unwrap(), id, "{body}");
    assert_eq!(body["descripcion"], "Reparación completada", "{body}");
    // Untouched field is preserved.
    assert_eq!(body["categoria"], "MANTENIMIENTO", "{body}");

    // RBAC: a resident cannot edit.
    let (status, _) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/admin/gastos/{id}"),
        Some(&resident_token),
        Some(json!({ "descripcion": "hack" })),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // Unknown id → 404.
    let (status, _) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/admin/gastos/{}", uuid::Uuid::new_v4()),
        Some(&admin_token),
        Some(json!({ "descripcion": "nope" })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

// ---------------------------------------------------------------------------
// DELETE /admin/gastos/{id}
// ---------------------------------------------------------------------------

#[tokio::test]
async fn eliminar_gasto_removes_row_rbac_and_404s() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_uid, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let (_rid, resident_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let admin_token = login(&app, &admin_email).await;
    let resident_token = login(&app, &resident_email).await;

    // Create a gasto to delete.
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/admin/gastos",
        Some(&admin_token),
        Some(gasto_body()),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let id = body["id"].as_str().unwrap().to_string();

    // RBAC: a resident cannot delete.
    let (status, _) = request(
        &app,
        Method::DELETE,
        &format!("/api/v1/admin/gastos/{id}"),
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // Admin deletes it → 204 No Content.
    let (status, _) = request(
        &app,
        Method::DELETE,
        &format!("/api/v1/admin/gastos/{id}"),
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    // It is gone from the list.
    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/admin/gastos",
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body.as_array().map(Vec::len), Some(0), "{body}");

    // Deleting again (or an unknown id) → 404.
    let (status, _) = request(
        &app,
        Method::DELETE,
        &format!("/api/v1/admin/gastos/{id}"),
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}
