//! Coverage integration tests for the "convivencia" (comité de convivencia)
//! domain: comité management, casos, mediación, actas y firmas.
//! Covers happy paths, RBAC guards (ADMIN_CONVIVENCIA = Administrador /
//! SuperAdmin / Concejo) and cross-tenant isolation (Law 2).
//! Runs against TEST_DATABASE_URL via the shared harness in tests/common.

mod common;
use axum::http::{Method, StatusCode};
use common::*;
use enconjunto_api::db::enums::Rol;
use serde_json::json;
use serde_json::Value;
use uuid::Uuid;

// The committee period must bracket "today" (2026-07-11 per the test env) so
// `comite_actual` finds it as the active committee.
const PERIODO_INICIO: &str = "2026-01-01";
const PERIODO_FIN: &str = "2026-12-31";

/// Build a `miembros` array for CrearComiteRequest — all entries reuse the same
/// usuario/unidad (no unique constraint exists on comite_miembros).
fn miembros_json(usuario: Uuid, unidad: Uuid, n: usize) -> Vec<Value> {
    (0..n)
        .map(|_| json!({ "usuario_id": usuario, "calidad": "PROPIETARIO", "unidad_id": unidad }))
        .collect()
}

fn crear_comite_body(usuario: Uuid, unidad: Uuid, n: usize) -> Value {
    json!({
        "periodo_inicio": PERIODO_INICIO,
        "periodo_fin": PERIODO_FIN,
        "miembros": miembros_json(usuario, unidad, n),
    })
}

// ═══════════════════════════════════════════════════════════════════════════
// Comité: actual / crear / histórico
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn comite_actual_crear_and_historico_happy_path() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (uid, email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let unidad = seed_unidad(&state, conjunto).await;
    let token = login(&app, &email).await;

    // No committee yet → 404.
    let (status, body) =
        request(&app, Method::GET, "/api/v1/convivencia/comite", Some(&token), None).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");

    // Create an active committee with 3 (odd) members → 200.
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/convivencia/comite",
        Some(&token),
        Some(crear_comite_body(uid, unidad, 3)),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body["id"].is_string(), "{body}");
    assert_eq!(body["miembros"].as_array().map(Vec::len), Some(3), "{body}");

    // Now the current committee resolves with the vencimiento fields present.
    let (status, body) =
        request(&app, Method::GET, "/api/v1/convivencia/comite", Some(&token), None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body["comite"]["id"].is_string(), "{body}");
    assert!(body["dias_restantes"].is_number(), "{body}");
    assert!(body["alerta_vencimiento"].is_boolean(), "{body}");

    // Histórico lists at least the one we created.
    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/convivencia/comite/historico",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(!body.as_array().unwrap().is_empty(), "{body}");
}

#[tokio::test]
async fn crear_comite_rejects_even_or_too_few_members() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (uid, email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let unidad = seed_unidad(&state, conjunto).await;
    let token = login(&app, &email).await;

    // Fewer than 3 → 400 (Ley 675/2001).
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/convivencia/comite",
        Some(&token),
        Some(crear_comite_body(uid, unidad, 2)),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // Even count ≥ 3 → 400 (must be odd).
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/convivencia/comite",
        Some(&token),
        Some(crear_comite_body(uid, unidad, 4)),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn comite_endpoints_forbidden_for_residents() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (uid, admin_email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let (_, res_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let unidad = seed_unidad(&state, conjunto).await;
    let _ = admin_email;
    let res_token = login(&app, &res_email).await;

    // A resident (Propietario) is not part of ADMIN_CONVIVENCIA.
    let (status, _) =
        request(&app, Method::GET, "/api/v1/convivencia/comite", Some(&res_token), None).await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/convivencia/comite",
        Some(&res_token),
        Some(crear_comite_body(uid, unidad, 3)),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    let (status, _) = request(
        &app,
        Method::GET,
        "/api/v1/convivencia/comite/historico",
        Some(&res_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

// ═══════════════════════════════════════════════════════════════════════════
// Comité: agregar / desactivar miembros
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn agregar_and_desactivar_miembro() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    // Concejo is also an ADMIN_CONVIVENCIA role.
    let (uid, email) = seed_user_in(&state, conjunto, Rol::Concejo).await;
    let unidad = seed_unidad(&state, conjunto).await;
    let token = login(&app, &email).await;

    // Start from an active committee of 3 members.
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/convivencia/comite",
        Some(&token),
        Some(crear_comite_body(uid, unidad, 3)),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let miembro_id = body["miembros"][0]["id"].as_str().unwrap().to_string();

    let nuevo_miembro = json!({ "usuario_id": uid, "calidad": "RESIDENTE", "unidad_id": unidad });

    // Adding one → 4 members (even) → the guard rejects with 400, but the member
    // row was inserted (endpoint validates parity after the insert).
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/convivencia/comite/miembros",
        Some(&token),
        Some(nuevo_miembro.clone()),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // Adding another → 5 members (odd) → 200.
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/convivencia/comite/miembros",
        Some(&token),
        Some(nuevo_miembro),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body["id"].is_string(), "{body}");

    // Deactivate an existing member → 200.
    let (status, body) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/convivencia/comite/miembros/{miembro_id}"),
        Some(&token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    // Unknown member id → 404.
    let (status, _) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/convivencia/comite/miembros/{}", Uuid::new_v4()),
        Some(&token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // A resident cannot add members.
    let (_, res_email) = seed_user_in(&state, conjunto, Rol::Arrendatario).await;
    let res_token = login(&app, &res_email).await;
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/convivencia/comite/miembros",
        Some(&res_token),
        Some(json!({ "usuario_id": uid, "calidad": "RESIDENTE", "unidad_id": unidad })),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

// ═══════════════════════════════════════════════════════════════════════════
// Casos: crear / listar / stats / actualizar
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn casos_crud_list_and_stats() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_, email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let unidad = seed_unidad(&state, conjunto).await;
    let token = login(&app, &email).await;

    // Create a caso.
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/convivencia/casos",
        Some(&token),
        Some(json!({
            "tipo": "RUIDO",
            "descripcion": "Música a alto volumen después de medianoche",
            "unidad_reporta_id": unidad,
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["estado"], "REPORTADO", "{body}");
    assert_eq!(body["tipo"], "RUIDO", "{body}");
    let caso_id = body["id"].as_str().unwrap().to_string();

    // Blank descripcion → 400.
    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/convivencia/casos",
        Some(&token),
        Some(json!({ "tipo": "OTRO", "descripcion": "   ", "unidad_reporta_id": unidad })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // List casos.
    let (status, body) =
        request(&app, Method::GET, "/api/v1/convivencia/casos", Some(&token), None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body.is_array(), "{body}");
    assert!(!body.as_array().unwrap().is_empty(), "{body}");

    // Filtered list (valid estado query) still returns an array.
    let (status, body) = request(
        &app,
        Method::GET,
        "/api/v1/convivencia/casos?estado=REPORTADO",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body.is_array(), "{body}");

    // Stats.
    let (status, body) =
        request(&app, Method::GET, "/api/v1/convivencia/casos/stats", Some(&token), None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body["total"].is_number(), "{body}");
    assert!(body["reportados"].is_number(), "{body}");

    // Update estado + resolución.
    let (status, body) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/convivencia/casos/{caso_id}"),
        Some(&token),
        Some(json!({ "estado": "ARCHIVADO", "resolucion": "Resuelto por acuerdo verbal" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["estado"], "ARCHIVADO", "{body}");

    // Updating an unknown caso → 404.
    let (status, _) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/convivencia/casos/{}", Uuid::new_v4()),
        Some(&token),
        Some(json!({ "estado": "ARCHIVADO" })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn casos_endpoints_forbidden_for_residents() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_, res_email) = seed_user_in(&state, conjunto, Rol::Propietario).await;
    let unidad = seed_unidad(&state, conjunto).await;
    let res_token = login(&app, &res_email).await;

    let (status, _) =
        request(&app, Method::GET, "/api/v1/convivencia/casos", Some(&res_token), None).await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    let (status, _) = request(
        &app,
        Method::GET,
        "/api/v1/convivencia/casos/stats",
        Some(&res_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    let (status, _) = request(
        &app,
        Method::POST,
        "/api/v1/convivencia/casos",
        Some(&res_token),
        Some(json!({ "tipo": "RUIDO", "descripcion": "x", "unidad_reporta_id": unidad })),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    let (status, _) = request(
        &app,
        Method::GET,
        "/api/v1/convivencia/unidades",
        Some(&res_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

// ═══════════════════════════════════════════════════════════════════════════
// Casos: asignar → mediación → acta → firmar (full flow, no PDF/S3 needed)
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn caso_asignar_mediacion_acta_y_firma() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (uid, email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let unidad = seed_unidad(&state, conjunto).await;
    let token = login(&app, &email).await;

    // Create a caso.
    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/convivencia/casos",
        Some(&token),
        Some(json!({
            "tipo": "MASCOTAS",
            "descripcion": "Perro sin correa en zonas comunes",
            "unidad_reporta_id": unidad,
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let caso_id = body["id"].as_str().unwrap().to_string();

    // Assign a committee member (miembro_asignado_id references usuarios(id),
    // so we pass a real user id).
    let (status, body) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/convivencia/casos/{caso_id}/asignar"),
        Some(&token),
        Some(json!({ "miembro_id": uid })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["estado"], "ASIGNADO", "{body}");

    // Generating the acta before any mediación is recorded → 400.
    let (status, _) = request(
        &app,
        Method::POST,
        &format!("/api/v1/convivencia/casos/{caso_id}/acta"),
        Some(&token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // Invalid mediación resultado (must be ACUERDO or SIN_ACUERDO) → 400.
    let (status, _) = request(
        &app,
        Method::POST,
        &format!("/api/v1/convivencia/casos/{caso_id}/mediacion"),
        Some(&token),
        Some(json!({ "fecha": "2026-07-01", "notas": "n/a", "resultado": "REPORTADO" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // Record a valid mediación → 200.
    let (status, body) = request(
        &app,
        Method::POST,
        &format!("/api/v1/convivencia/casos/{caso_id}/mediacion"),
        Some(&token),
        Some(json!({
            "fecha": "2026-07-01",
            "notas": "Las partes acordaron usar correa siempre",
            "resultado": "ACUERDO",
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["estado"], "ACUERDO", "{body}");

    // Now the acta can be generated (markdown only, no PDF/S3) → 200.
    let (status, body) = request(
        &app,
        Method::POST,
        &format!("/api/v1/convivencia/casos/{caso_id}/acta"),
        Some(&token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body["contenido"].is_string(), "{body}");
    let acta_id = body["id"].as_str().unwrap().to_string();

    // Sign the acta → 200 (firmar_acta has no role guard, only tenant scope).
    let (status, body) = request(
        &app,
        Method::POST,
        &format!("/api/v1/convivencia/actas/{acta_id}/firmar"),
        Some(&token),
        Some(json!({ "tipo": "ADMINISTRADOR" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body["firmas"].as_array().map(Vec::len).unwrap_or(0) >= 1, "{body}");

    // Signing an unknown acta → 404.
    let (status, _) = request(
        &app,
        Method::POST,
        &format!("/api/v1/convivencia/actas/{}/firmar", Uuid::new_v4()),
        Some(&token),
        Some(json!({ "tipo": "MIEMBRO_COMITE" })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

// ═══════════════════════════════════════════════════════════════════════════
// Catálogos + tenant isolation (Law 2)
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn listar_unidades_happy_path() {
    let state = test_state().await;
    let app = router(state.clone());
    let conjunto = seed_conjunto(&state).await;
    let (_, email) = seed_user_in(&state, conjunto, Rol::Administrador).await;
    let _unidad = seed_unidad(&state, conjunto).await;
    let token = login(&app, &email).await;

    let (status, body) =
        request(&app, Method::GET, "/api/v1/convivencia/unidades", Some(&token), None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body.is_array(), "{body}");
    assert!(!body.as_array().unwrap().is_empty(), "seeded unidad must appear: {body}");
}

#[tokio::test]
async fn tenant_isolation_convivencia() {
    let state = test_state().await;
    let app = router(state.clone());

    // Conjunto B owns a caso.
    let conjunto_b = seed_conjunto(&state).await;
    let (_, admin_b_email) = seed_user_in(&state, conjunto_b, Rol::Administrador).await;
    let unidad_b = seed_unidad(&state, conjunto_b).await;
    let admin_b_token = login(&app, &admin_b_email).await;

    let (status, body) = request(
        &app,
        Method::POST,
        "/api/v1/convivencia/casos",
        Some(&admin_b_token),
        Some(json!({
            "tipo": "RUIDO",
            "descripcion": "Solo del conjunto B",
            "unidad_reporta_id": unidad_b,
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let caso_b = body["id"].as_str().unwrap().to_string();

    // Conjunto A admin sees none of B's casos.
    let conjunto_a = seed_conjunto(&state).await;
    let (uid_a, admin_a_email) = seed_user_in(&state, conjunto_a, Rol::Administrador).await;
    let admin_a_token = login(&app, &admin_a_email).await;

    let (status, body) =
        request(&app, Method::GET, "/api/v1/convivencia/casos", Some(&admin_a_token), None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body.as_array().map(Vec::len), Some(0), "leaked B's casos: {body}");

    // Direct-id probes from A on B's caso → 403 (found, but wrong conjunto).
    let (status, _) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/convivencia/casos/{caso_b}"),
        Some(&admin_a_token),
        Some(json!({ "estado": "ARCHIVADO" })),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    let (status, _) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/convivencia/casos/{caso_b}/asignar"),
        Some(&admin_a_token),
        Some(json!({ "miembro_id": uid_a })),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    let (status, _) = request(
        &app,
        Method::POST,
        &format!("/api/v1/convivencia/casos/{caso_b}/mediacion"),
        Some(&admin_a_token),
        Some(json!({ "fecha": "2026-07-01", "notas": "x", "resultado": "ACUERDO" })),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // Generating an acta on B's caso from A → 403.
    let (status, _) = request(
        &app,
        Method::POST,
        &format!("/api/v1/convivencia/casos/{caso_b}/acta"),
        Some(&admin_a_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}
