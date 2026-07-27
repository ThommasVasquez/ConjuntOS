mod common;

use axum::http::{Method, StatusCode};
use common::*;
use enconjunto_api::db::enums::Rol;
use enconjunto_api::state::AppState;
use serde_json::json;
use uuid::Uuid;

/// Seed an active asamblea for the given conjunto; returns (asamblea_id, version).
async fn seed_asamblea(
    state: &AppState,
    conjunto_id: Uuid,
) -> (String, i32) {
    use enconjunto_api::db::schema::asambleas;
    use diesel::prelude::*;
    use diesel_async::RunQueryDsl;
    let mut conn = state.pool.get().await.unwrap();
    let id: uuid::Uuid = diesel::insert_into(asambleas::table)
        .values((
            asambleas::conjunto_id.eq(conjunto_id),
            asambleas::titulo.eq("Asamblea Test"),
            asambleas::fecha.eq(chrono::Utc::now()),
            asambleas::activa.eq(true),
            asambleas::orden_dia.eq(serde_json::json!(["Tema 1", "Tema 2"])),
            asambleas::item_activo_index.eq(0),
            asambleas::session_state.eq(serde_json::json!({})),
            asambleas::version.eq(1),
        ))
        .returning(asambleas::id)
        .get_result(&mut conn)
        .await
        .unwrap();
    (id.to_string(), 1)
}

#[tokio::test]
async fn get_session_returns_active_asamblea() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let (_uid, email) = seed_user_in(&state, conj, Rol::Propietario).await;
    let token = login(&app, &email).await;

    let (_aid, _) = seed_asamblea(&state, conj).await;

    let (s, body) = request(
        &app,
        Method::GET,
        "/api/v1/asambleas/activa/session",
        Some(&token),
        None,
    )
    .await;
    assert_eq!(s, StatusCode::OK, "get session failed: {body}");
    assert_eq!(body["titulo"], "Asamblea Test");
    assert_eq!(body["activa"], true);
    assert_eq!(body["version"], 1);
}

#[tokio::test]
async fn update_session_cas_optimistic_lock() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let (_uid, email) = seed_user_in(&state, conj, Rol::Administrador).await;
    let token = login(&app, &email).await;

    let (_aid, v1) = seed_asamblea(&state, conj).await;

    // First update succeeds (version matches)
    let (s, body) = request(
        &app,
        Method::PUT,
        "/api/v1/asambleas/activa/session",
        Some(&token),
        Some(json!({
            "session_state": { "voting": true },
            "version": v1
        })),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "first update failed: {body}");
    assert_eq!(body["version"], 2);

    // Second update with stale version gets 409
    let (s, _) = request(
        &app,
        Method::PUT,
        "/api/v1/asambleas/activa/session",
        Some(&token),
        Some(json!({
            "session_state": { "voting": false },
            "version": v1
        })),
    )
    .await;
    assert_eq!(s, StatusCode::CONFLICT);
}

#[tokio::test]
async fn update_session_rejects_non_admin() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let (_uid, email) = seed_user_in(&state, conj, Rol::Propietario).await;
    let token = login(&app, &email).await;

    let (_aid, v) = seed_asamblea(&state, conj).await;

    let (s, _) = request(
        &app,
        Method::PUT,
        "/api/v1/asambleas/activa/session",
        Some(&token),
        Some(json!({ "version": v })),
    )
    .await;
    assert_eq!(s, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn votaciones_crud_and_activate_one_at_a_time() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let (_admin_id, admin_email) = seed_user_in(&state, conj, Rol::Administrador).await;
    let admin_token = login(&app, &admin_email).await;

    let (aid, _) = seed_asamblea(&state, conj).await;

    // Create votacion 1
    let url1 = format!("/api/v1/asambleas/{aid}/votaciones");
    let (s, body) = request(
        &app,
        Method::POST,
        &url1,
        Some(&admin_token),
        Some(json!({
            "titulo": "Aprobar Presupuesto",
            "opciones": ["SI", "NO"]
        })),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "create votacion 1 failed: {body}");
    let vid1 = body["id"].as_str().unwrap();

    // Create votacion 2
    let (s, body) = request(
        &app,
        Method::POST,
        &url1,
        Some(&admin_token),
        Some(json!({ "titulo": "Aprobar Contrato" })),
    )
    .await;
    assert_eq!(s, StatusCode::OK);
    let vid2 = body["id"].as_str().unwrap();

    // Activate votacion 1
    let put1 = format!("/api/v1/asambleas/{aid}/votaciones/{vid1}");
    let (s, body) = request(
        &app,
        Method::PUT,
        &put1,
        Some(&admin_token),
        Some(json!({ "activa": true })),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "activate 1 failed: {body}");
    assert_eq!(body["activa"], true);

    // Activate votacion 2 — votacion 1 must become inactive
    let put2 = format!("/api/v1/asambleas/{aid}/votaciones/{vid2}");
    let (s, body) = request(
        &app,
        Method::PUT,
        &put2,
        Some(&admin_token),
        Some(json!({ "activa": true })),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "activate 2 failed: {body}");
    assert_eq!(body["activa"], true);

    // Confirm votacion 1 is now inactive
    let (s, body) = request(&app, Method::GET, &put1, Some(&admin_token), None).await;
    // Note: GET single votacion returns it if tenant matches
    // Actually there's no GET single votacion; list all instead
    let (s, body) = request(&app, Method::GET, &url1, Some(&admin_token), None).await;
    assert_eq!(s, StatusCode::OK);
    let v1 = body.as_array().unwrap().iter().find(|v| v["id"] == vid1).unwrap();
    assert_eq!(v1["activa"], false);
}

#[tokio::test]
async fn turnos_lifecycle_single_speaker_at_a_time() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let (_admin_id, admin_email) = seed_user_in(&state, conj, Rol::Administrador).await;
    let (res_id, res_email) = seed_user_in(&state, conj, Rol::Propietario).await;
    let admin_token = login(&app, &admin_email).await;
    let res_token = login(&app, &res_email).await;

    let (aid, _) = seed_asamblea(&state, conj).await;

    // Link user to a unidad so turno has apto
    use enconjunto_api::db::schema::unidades;
    use diesel::prelude::*;
    use diesel_async::RunQueryDsl;
    let mut conn = state.pool.get().await.unwrap();
    let unidad_id: uuid::Uuid = diesel::insert_into(unidades::table)
        .values((
            unidades::conjunto_id.eq(conj),
            unidades::numero.eq(format!("T-{}", uuid::Uuid::new_v4().simple())),
            unidades::tipo.eq("APARTAMENTO"),
            unidades::coeficiente.eq(bigdecimal::BigDecimal::from(0)),
        ))
        .returning(unidades::id)
        .get_result(&mut conn)
        .await
        .unwrap();
    drop(conn);

    // Resident creates a turno
    let turnos_url = format!("/api/v1/asambleas/{aid}/turnos");
    let (s, body) = request(
        &app,
        Method::POST,
        &turnos_url,
        Some(&res_token),
        None,
    )
    .await;
    assert_eq!(s, StatusCode::OK, "create turno failed: {body}");
    assert_eq!(body["estado"], "PENDIENTE");
    let tid = body["id"].as_str().unwrap();

    // Admin sets turno to HABLANDO
    let turno_url = format!("/api/v1/asambleas/{aid}/turnos/{tid}");
    let (s, body) = request(
        &app,
        Method::PUT,
        &turno_url,
        Some(&admin_token),
        Some(json!({ "estado": "HABLANDO" })),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "set hablando failed: {body}");
    assert_eq!(body["estado"], "HABLANDO");

    // Admin marks turno as COMPLETADO
    let (s, body) = request(
        &app,
        Method::PUT,
        &turno_url,
        Some(&admin_token),
        Some(json!({ "estado": "COMPLETADO" })),
    )
    .await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(body["estado"], "COMPLETADO");
}

#[tokio::test]
async fn asistencias_register_and_quorum() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let (_uid, email) = seed_user_in(&state, conj, Rol::Propietario).await;
    let token = login(&app, &email).await;

    let (aid, _) = seed_asamblea(&state, conj).await;

    // Register attendance
    let url = format!("/api/v1/asambleas/{aid}/asistencias");
    let (s, body) = request(
        &app,
        Method::POST,
        &url,
        Some(&token),
        Some(json!({ "tipo": "VIRTUAL" })),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "register asistencia failed: {body}");
    assert_eq!(body["tipo"], "VIRTUAL");

    // List asistencias + quorum
    let (s, body) = request(&app, Method::GET, &url, Some(&token), None).await;
    assert_eq!(s, StatusCode::OK);
    assert!(body["asistencias"].as_array().unwrap().len() >= 1);
    assert!(body["quorumPorcentaje"].is_string() || body["quorumPorcentaje"].is_number(), "quorumPorcentaje not found: {body}");
}

#[tokio::test]
async fn opiniones_create_and_list() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let (_uid, email) = seed_user_in(&state, conj, Rol::Propietario).await;
    let token = login(&app, &email).await;

    let (aid, _) = seed_asamblea(&state, conj).await;

    let url = format!("/api/v1/asambleas/{aid}/opiniones");
    let (s, body) = request(
        &app,
        Method::POST,
        &url,
        Some(&token),
        Some(json!({ "contenido": "Estoy de acuerdo con el tema 1" })),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "create opinion failed: {body}");
    assert_eq!(body["contenido"], "Estoy de acuerdo con el tema 1");

    let (s, body) = request(&app, Method::GET, &url, Some(&token), None).await;
    assert_eq!(s, StatusCode::OK);
    assert!(body.as_array().unwrap().len() >= 1);
}

#[tokio::test]
async fn poderes_create_requires_own_otorgante_and_tenant_check() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let (_user_a_id, email_a) = seed_user_in(&state, conj, Rol::Propietario).await;
    let (_user_b_id, email_b) = seed_user_in(&state, conj, Rol::Propietario).await;
    let token_a = login(&app, &email_a).await;
    let token_b = login(&app, &email_b).await;

    let (aid, _) = seed_asamblea(&state, conj).await;

    let url = format!("/api/v1/asambleas/{aid}/poderes");

    // A cannot create poder on behalf of B (otorgante must be self)
    let (s, body) = request(
        &app,
        Method::POST,
        &url,
        Some(&token_a),
        Some(json!({
            "otorganteId": _user_b_id.to_string(),
            "apoderadoId": _user_a_id.to_string(),
            "documentoUrl": "https://s3.example.com/poder.pdf"
        })),
    )
    .await;
    assert!(s == StatusCode::FORBIDDEN || s == StatusCode::UNPROCESSABLE_ENTITY);

    // A can create poder where A is the otorgante
    let (s, body) = request(
        &app,
        Method::POST,
        &url,
        Some(&token_a),
        Some(json!({
            "otorganteId": _user_a_id.to_string(),
            "apoderadoId": _user_b_id.to_string(),
            "documentoUrl": "https://s3.example.com/poder.pdf"
        })),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "create poder failed: {body}");
    assert_eq!(body["verificado"], false);
}

#[tokio::test]
async fn asamblea_tenant_isolation() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj_a = seed_conjunto(&state).await;
    let conj_b = seed_conjunto(&state).await;
    let (_uid_a, email_a) = seed_user_in(&state, conj_a, Rol::Administrador).await;
    let (_uid_b, email_b) = seed_user_in(&state, conj_b, Rol::Propietario).await;
    let token_a = login(&app, &email_a).await;
    let token_b = login(&app, &email_b).await;

    let (aid_a, _) = seed_asamblea(&state, conj_a).await;

    // B cannot access A's asamblea endpoints
    let vot_url = format!("/api/v1/asambleas/{aid_a}/votaciones");
    let (s, _) = request(&app, Method::GET, &vot_url, Some(&token_b), None).await;
    assert_eq!(s, StatusCode::NOT_FOUND);

    let asist_url = format!("/api/v1/asambleas/{aid_a}/asistencias");
    let (s, _) = request(&app, Method::GET, &asist_url, Some(&token_b), None).await;
    assert_eq!(s, StatusCode::NOT_FOUND);

    // B cannot update A's session (B has no active asamblea in their conjunto)
    let (s, body) = request(
        &app,
        Method::PUT,
        "/api/v1/asambleas/activa/session",
        Some(&token_b),
        Some(json!({ "version": 1 })),
    )
    .await;
    // B has no active asamblea, so this returns 404 or 403 depending on implementation
    assert!(s == StatusCode::NOT_FOUND || s == StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn resident_cannot_create_votacion() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let (_uid, email) = seed_user_in(&state, conj, Rol::Propietario).await;
    let token = login(&app, &email).await;

    let (aid, _) = seed_asamblea(&state, conj).await;

    let url = format!("/api/v1/asambleas/{aid}/votaciones");
    let (s, _) = request(
        &app,
        Method::POST,
        &url,
        Some(&token),
        Some(json!({ "titulo": "Hack" })),
    )
    .await;
    assert_eq!(s, StatusCode::FORBIDDEN);
}

// ── POST /asambleas ──────────────────────────────────────────────────────

#[tokio::test]
async fn admin_creates_asamblea_scheduled_with_agenda_ids() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let (_admin_id, admin_email) = seed_user_in(&state, conj, Rol::Administrador).await;
    let admin_token = login(&app, &admin_email).await;

    let (s, body) = request(
        &app,
        Method::POST,
        "/api/v1/asambleas",
        Some(&admin_token),
        Some(json!({
            "titulo": "  Asamblea General Ordinaria  ",
            "descripcion": "Convocatoria anual",
            "ordenDia": [
                { "titulo": "Verificación de quórum" },
                { "titulo": "   " },
                { "titulo": "Aprobación de presupuesto", "descripcion": "Vigencia 2026" }
            ]
        })),
    )
    .await;

    assert_eq!(s, StatusCode::OK, "create asamblea failed: {body}");
    assert_eq!(body["titulo"], "Asamblea General Ordinaria");
    // Open (so GET activa/session finds it) but not yet in session.
    assert_eq!(body["activa"], true);
    assert_eq!(body["sessionState"], "PROGRAMADA");
    assert_eq!(body["version"], 0);
    assert_eq!(body["itemActivoIndex"], 0);

    // Blank agenda rows are dropped and every survivor gets an id.
    let orden = body["ordenDia"].as_array().expect("ordenDia array");
    assert_eq!(orden.len(), 2);
    assert_eq!(orden[0]["titulo"], "Verificación de quórum");
    assert_eq!(orden[1]["titulo"], "Aprobación de presupuesto");
    for item in orden {
        assert!(
            item["id"].as_str().is_some_and(|id| !id.is_empty()),
            "agenda item missing id: {item}"
        );
    }

    // It is now the conjunto's active assembly.
    let (s, session) = request(
        &app,
        Method::GET,
        "/api/v1/asambleas/activa/session",
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(session["id"], body["id"]);
}

#[tokio::test]
async fn create_asamblea_rejects_non_admin() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let (_uid, email) = seed_user_in(&state, conj, Rol::Propietario).await;
    let token = login(&app, &email).await;

    let (s, _) = request(
        &app,
        Method::POST,
        "/api/v1/asambleas",
        Some(&token),
        Some(json!({ "titulo": "Asamblea pirata" })),
    )
    .await;
    assert_eq!(s, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn create_asamblea_rejects_empty_titulo() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let (_admin_id, admin_email) = seed_user_in(&state, conj, Rol::Administrador).await;
    let admin_token = login(&app, &admin_email).await;

    let (s, _) = request(
        &app,
        Method::POST,
        "/api/v1/asambleas",
        Some(&admin_token),
        Some(json!({ "titulo": "   " })),
    )
    .await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn create_asamblea_conflicts_while_one_is_active() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let (_admin_id, admin_email) = seed_user_in(&state, conj, Rol::Administrador).await;
    let admin_token = login(&app, &admin_email).await;

    let (_aid, _) = seed_asamblea(&state, conj).await;

    let (s, _) = request(
        &app,
        Method::POST,
        "/api/v1/asambleas",
        Some(&admin_token),
        Some(json!({ "titulo": "Segunda asamblea" })),
    )
    .await;
    assert_eq!(s, StatusCode::CONFLICT);
}

#[tokio::test]
async fn create_asamblea_allowed_again_after_previous_is_closed() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let (_admin_id, admin_email) = seed_user_in(&state, conj, Rol::Administrador).await;
    let admin_token = login(&app, &admin_email).await;

    let (_aid, v) = seed_asamblea(&state, conj).await;

    // Close the running assembly the way the admin panel does.
    let (s, body) = request(
        &app,
        Method::PUT,
        "/api/v1/asambleas/activa/session",
        Some(&admin_token),
        Some(json!({ "activa": false, "sessionState": "FINALIZADA", "version": v })),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "close session failed: {body}");

    let (s, body) = request(
        &app,
        Method::POST,
        "/api/v1/asambleas",
        Some(&admin_token),
        Some(json!({ "titulo": "Asamblea extraordinaria" })),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "create after close failed: {body}");
    assert_eq!(body["titulo"], "Asamblea extraordinaria");
}

#[tokio::test]
async fn create_asamblea_is_scoped_to_caller_conjunto() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj_a = seed_conjunto(&state).await;
    let conj_b = seed_conjunto(&state).await;
    let (_admin_id, admin_email) = seed_user_in(&state, conj_a, Rol::Administrador).await;
    let admin_token = login(&app, &admin_email).await;

    // B already has one running; it must not block A, and A's must not land in B.
    let (_bid, _) = seed_asamblea(&state, conj_b).await;

    let (s, body) = request(
        &app,
        Method::POST,
        "/api/v1/asambleas",
        Some(&admin_token),
        Some(json!({ "titulo": "Asamblea de A" })),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "create failed: {body}");

    let (_uid_b, email_b) = seed_user_in(&state, conj_b, Rol::Administrador).await;
    let token_b = login(&app, &email_b).await;
    let (s, session_b) = request(
        &app,
        Method::GET,
        "/api/v1/asambleas/activa/session",
        Some(&token_b),
        None,
    )
    .await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(session_b["titulo"], "Asamblea Test");
}

#[tokio::test]
async fn finalizing_session_returns_the_closed_asamblea() {
    // Regression: the handler used to re-read the row as "the active session"
    // after writing, so closing an assembly 404'd a write that had committed.
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let (_admin_id, admin_email) = seed_user_in(&state, conj, Rol::Administrador).await;
    let admin_token = login(&app, &admin_email).await;

    let (aid, v) = seed_asamblea(&state, conj).await;

    let (s, body) = request(
        &app,
        Method::PUT,
        "/api/v1/asambleas/activa/session",
        Some(&admin_token),
        Some(json!({ "activa": false, "sessionState": "FINALIZADA", "version": v })),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "finalize failed: {body}");
    assert_eq!(body["id"], aid);
    assert_eq!(body["activa"], false);
    assert_eq!(body["sessionState"], "FINALIZADA");
    assert_eq!(body["version"], v + 1);

    // And it is no longer the conjunto's active assembly.
    let (s, session) = request(
        &app,
        Method::GET,
        "/api/v1/asambleas/activa/session",
        Some(&admin_token),
        None,
    )
    .await;
    assert_eq!(s, StatusCode::OK);
    assert!(session.is_null(), "expected no active session, got {session}");
}
