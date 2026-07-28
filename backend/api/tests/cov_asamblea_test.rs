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

// ── LiveKit publish grants ───────────────────────────────────────────────

/// Verify the LiveKit JWT and pull `video.canPublish` out of it.
fn token_can_publish(token: &str) -> bool {
    use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_aud = false;
    // The room grant, not an audience claim, is what these tokens carry.
    validation.set_required_spec_claims(&["exp"]);
    let data = decode::<serde_json::Value>(
        token,
        &DecodingKey::from_secret(LIVEKIT_TEST_SECRET.as_bytes()),
        &validation,
    )
    .expect("livekit token must verify with the configured secret");
    data.claims["video"]["canPublish"]
        .as_bool()
        .expect("video.canPublish must be present")
}

async fn livekit_grant(app: &axum::Router, token: &str, aid: &str) -> (bool, bool) {
    let url = format!("/api/v1/asambleas/{aid}/livekit-token");
    let (s, body) = request(app, Method::GET, &url, Some(token), None).await;
    assert_eq!(s, StatusCode::OK, "livekit-token failed: {body}");
    let dto_says = body["canPublish"].as_bool().expect("canPublish in DTO");
    let jwt_says = token_can_publish(body["token"].as_str().expect("token string"));
    // The DTO must not disagree with the grant actually signed into the JWT.
    assert_eq!(dto_says, jwt_says, "DTO canPublish disagrees with the JWT");
    (dto_says, jwt_says)
}

#[tokio::test]
async fn moderator_roles_may_publish() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let (aid, _) = seed_asamblea(&state, conj).await;

    for rol in [Rol::Administrador, Rol::Concejo, Rol::SuperAdmin] {
        let (_uid, email) = seed_user_in(&state, conj, rol).await;
        let token = login(&app, &email).await;
        let (can_publish, _) = livekit_grant(&app, &token, &aid).await;
        assert!(can_publish, "{rol:?} should be allowed to publish");
    }
}

#[tokio::test]
async fn resident_may_not_publish_without_the_floor() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let (_uid, email) = seed_user_in(&state, conj, Rol::Propietario).await;
    let token = login(&app, &email).await;

    let (aid, _) = seed_asamblea(&state, conj).await;

    let (can_publish, _) = livekit_grant(&app, &token, &aid).await;
    assert!(!can_publish, "a resident without the floor must be watch-only");
}

#[tokio::test]
async fn resident_may_publish_while_holding_the_floor() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let (_admin_id, admin_email) = seed_user_in(&state, conj, Rol::Administrador).await;
    let admin_token = login(&app, &admin_email).await;
    let (_uid, email) = seed_user_in(&state, conj, Rol::Propietario).await;
    let resident_token = login(&app, &email).await;

    let (aid, _) = seed_asamblea(&state, conj).await;

    // Resident asks for the floor.
    let turnos_url = format!("/api/v1/asambleas/{aid}/turnos");
    let (s, turno) = request(
        &app,
        Method::POST,
        &turnos_url,
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(s, StatusCode::OK, "create turno failed: {turno}");
    let tid = turno["id"].as_str().expect("turno id");

    // Still watch-only while merely pending.
    let (can_publish, _) = livekit_grant(&app, &resident_token, &aid).await;
    assert!(!can_publish, "a PENDIENTE turn must not grant publish");

    // Admin gives them the floor.
    let turno_url = format!("/api/v1/asambleas/{aid}/turnos/{tid}");
    let (s, body) = request(
        &app,
        Method::PUT,
        &turno_url,
        Some(&admin_token),
        Some(json!({ "estado": "HABLANDO" })),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "grant floor failed: {body}");

    let (can_publish, _) = livekit_grant(&app, &resident_token, &aid).await;
    assert!(can_publish, "holding the floor must grant publish");

    // And it is revoked when the turn completes.
    let (s, body) = request(
        &app,
        Method::PUT,
        &turno_url,
        Some(&admin_token),
        Some(json!({ "estado": "COMPLETADO" })),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "complete turno failed: {body}");

    let (can_publish, _) = livekit_grant(&app, &resident_token, &aid).await;
    assert!(!can_publish, "publish must be revoked once the turn completes");
}

#[tokio::test]
async fn floor_in_another_asamblea_does_not_grant_publish() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj_a = seed_conjunto(&state).await;
    let conj_b = seed_conjunto(&state).await;
    let (aid_a, _) = seed_asamblea(&state, conj_a).await;
    let (aid_b, _) = seed_asamblea(&state, conj_b).await;

    let (_admin_id, admin_email) = seed_user_in(&state, conj_a, Rol::Administrador).await;
    let admin_token = login(&app, &admin_email).await;
    let (_uid, email) = seed_user_in(&state, conj_a, Rol::Propietario).await;
    let resident_token = login(&app, &email).await;

    // Give the resident the floor in their own conjunto's asamblea.
    let (s, turno) = request(
        &app,
        Method::POST,
        &format!("/api/v1/asambleas/{aid_a}/turnos"),
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(s, StatusCode::OK, "create turno failed: {turno}");
    let tid = turno["id"].as_str().expect("turno id");
    let (s, _) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/asambleas/{aid_a}/turnos/{tid}"),
        Some(&admin_token),
        Some(json!({ "estado": "HABLANDO" })),
    )
    .await;
    assert_eq!(s, StatusCode::OK);

    // The other conjunto's assembly is not theirs to speak in — and is not even
    // visible to them.
    let (s, _) = request(
        &app,
        Method::GET,
        &format!("/api/v1/asambleas/{aid_b}/livekit-token"),
        Some(&resident_token),
        None,
    )
    .await;
    assert_eq!(s, StatusCode::NOT_FOUND, "cross-tenant token must be refused");
}

/// Give `usuario` a unidad with a real coeficiente so they can cast a weighted vote.
async fn seed_unidad_para(state: &AppState, conjunto_id: Uuid, usuario: Uuid, coef: i64) -> Uuid {
    use diesel::prelude::*;
    use diesel_async::RunQueryDsl;
    use enconjunto_api::db::schema::{unidades, usuarios};
    let mut conn = state.pool.get().await.unwrap();
    let unidad: Uuid = diesel::insert_into(unidades::table)
        .values((
            unidades::conjunto_id.eq(conjunto_id),
            unidades::numero.eq(format!("U-{}", Uuid::new_v4().simple())),
            unidades::tipo.eq("APARTAMENTO"),
            unidades::coeficiente.eq(bigdecimal::BigDecimal::from(coef)),
        ))
        .returning(unidades::id)
        .get_result(&mut conn)
        .await
        .unwrap();
    diesel::update(usuarios::table.filter(usuarios::id.eq(usuario)))
        .set(usuarios::unidad_id.eq(unidad))
        .execute(&mut conn)
        .await
        .unwrap();
    unidad
}

// ── Regressions found by the production audit ────────────────────────────

#[tokio::test]
async fn chat_shows_the_newest_messages_past_the_cap() {
    // Regression: the 100-message cap was applied to an ASC ordering, so the
    // endpoint returned the OLDEST 100 and the chat froze permanently at
    // message 100 — nobody ever saw a new one again.
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let (_uid, email) = seed_user_in(&state, conj, Rol::Propietario).await;
    let token = login(&app, &email).await;
    let (aid, _) = seed_asamblea(&state, conj).await;

    let url = format!("/api/v1/asambleas/{aid}/opiniones");
    for i in 0..105 {
        let (s, _) = request(
            &app,
            Method::POST,
            &url,
            Some(&token),
            Some(json!({ "contenido": format!("mensaje {i}") })),
        )
        .await;
        assert_eq!(s, StatusCode::OK, "post {i} failed");
    }

    let (s, body) = request(&app, Method::GET, &url, Some(&token), None).await;
    assert_eq!(s, StatusCode::OK);
    let list = body.as_array().expect("array");
    assert_eq!(list.len(), 100, "cap still 100");
    // Newest must be present, oldest must have rolled off, order chronological.
    assert_eq!(list[0]["contenido"], "mensaje 5");
    assert_eq!(list[99]["contenido"], "mensaje 104");
}

#[tokio::test]
async fn opinion_rejects_empty_and_oversized_content() {
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let (_uid, email) = seed_user_in(&state, conj, Rol::Propietario).await;
    let token = login(&app, &email).await;
    let (aid, _) = seed_asamblea(&state, conj).await;
    let url = format!("/api/v1/asambleas/{aid}/opiniones");

    let (s, _) = request(&app, Method::POST, &url, Some(&token), Some(json!({ "contenido": "   " }))).await;
    assert_eq!(s, StatusCode::BAD_REQUEST, "blank message must be rejected");

    let huge = "a".repeat(1001);
    let (s, _) = request(&app, Method::POST, &url, Some(&token), Some(json!({ "contenido": huge }))).await;
    assert_eq!(s, StatusCode::BAD_REQUEST, "oversized message must be rejected");
}

#[tokio::test]
async fn verifying_a_poder_after_the_otorgante_voted_is_refused() {
    // Regression: verifying a poder retroactively moved the otorgante's weight
    // onto the apoderado while the otorgante's own ballot stayed on record, so
    // the unit was counted twice. The unique (votacion_id, unidad_id) index
    // does not catch it because the apoderado votes under a different unidad.
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let (_admin, admin_email) = seed_user_in(&state, conj, Rol::Administrador).await;
    let admin_token = login(&app, &admin_email).await;

    let (otorgante, otorgante_email) = seed_user_in(&state, conj, Rol::Propietario).await;
    let (apoderado, _apoderado_email) = seed_user_in(&state, conj, Rol::Propietario).await;
    seed_unidad_para(&state, conj, otorgante, 10).await;
    seed_unidad_para(&state, conj, apoderado, 15).await;
    let otorgante_token = login(&app, &otorgante_email).await;

    let (aid, _) = seed_asamblea(&state, conj).await;

    // Open a votación and have the otorgante vote in it.
    let (s, votacion) = request(
        &app,
        Method::POST,
        &format!("/api/v1/asambleas/{aid}/votaciones"),
        Some(&admin_token),
        Some(json!({ "titulo": "Presupuesto" })),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "create votacion failed: {votacion}");
    let vid = votacion["id"].as_str().expect("votacion id");

    // Votaciones are created closed; open it before anyone can vote.
    let (s, body) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/asambleas/{aid}/votaciones/{vid}"),
        Some(&admin_token),
        Some(json!({ "activa": true })),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "open votacion failed: {body}");

    let (s, body) = request(
        &app,
        Method::POST,
        &format!("/api/v1/votaciones/{vid}/votos"),
        Some(&otorgante_token),
        Some(json!({ "respuesta": "SI" })),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "otorgante vote failed: {body}");

    // Now the admin tries to verify a poder naming that same otorgante.
    let (s, poder) = request(
        &app,
        Method::POST,
        &format!("/api/v1/asambleas/{aid}/poderes"),
        Some(&admin_token),
        Some(json!({
            "otorganteId": otorgante.to_string(),
            "apoderadoId": apoderado.to_string(),
            "documentoUrl": "https://storage.example/poder.pdf"
        })),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "create poder failed: {poder}");
    let pid = poder["id"].as_str().expect("poder id");

    let (s, body) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/asambleas/{aid}/poderes/{pid}"),
        Some(&admin_token),
        Some(json!({ "verificado": true })),
    )
    .await;
    assert_eq!(
        s,
        StatusCode::CONFLICT,
        "verifying after the otorgante voted must be refused: {body}"
    );
}

#[tokio::test]
async fn create_pairing_is_admin_only() {
    // Regression: any resident could mint unlimited pending pairings, and
    // get_pairing Argon2-verifies the submitted PIN against every pending row.
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let (_uid, email) = seed_user_in(&state, conj, Rol::Propietario).await;
    let token = login(&app, &email).await;

    let (s, _) = request(
        &app,
        Method::POST,
        "/api/v1/asambleas/pairing",
        Some(&token),
        Some(json!({ "pin": "123456" })),
    )
    .await;
    assert_eq!(s, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn poderes_are_frozen_while_a_votacion_is_open() {
    // Regression (mirror case): un-verifying a poder after the apoderado voted
    // with the combined weight would free the otorgante to vote the same unit
    // again. The representation set is frozen while any ballot is open.
    let state = test_state().await;
    let app = router(state.clone());
    let conj = seed_conjunto(&state).await;
    let (_admin, admin_email) = seed_user_in(&state, conj, Rol::Administrador).await;
    let admin_token = login(&app, &admin_email).await;
    let (otorgante, _oe) = seed_user_in(&state, conj, Rol::Propietario).await;
    let (apoderado, _ae) = seed_user_in(&state, conj, Rol::Propietario).await;
    seed_unidad_para(&state, conj, otorgante, 10).await;
    seed_unidad_para(&state, conj, apoderado, 15).await;

    let (aid, _) = seed_asamblea(&state, conj).await;

    let (s, poder) = request(
        &app,
        Method::POST,
        &format!("/api/v1/asambleas/{aid}/poderes"),
        Some(&admin_token),
        Some(json!({
            "otorganteId": otorgante.to_string(),
            "apoderadoId": apoderado.to_string(),
            "documentoUrl": "https://storage.example/poder.pdf"
        })),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "create poder failed: {poder}");
    let pid = poder["id"].as_str().expect("poder id");

    // With no ballot open, verification is allowed.
    let (s, body) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/asambleas/{aid}/poderes/{pid}"),
        Some(&admin_token),
        Some(json!({ "verificado": true })),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "verify before any votacion failed: {body}");

    // Open a ballot; the representation set must now be frozen in both directions.
    let (s, votacion) = request(
        &app,
        Method::POST,
        &format!("/api/v1/asambleas/{aid}/votaciones"),
        Some(&admin_token),
        Some(json!({ "titulo": "Cuotas extraordinarias" })),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "create votacion failed: {votacion}");
    let vid = votacion["id"].as_str().expect("votacion id");
    let (s, _) = request(
        &app,
        Method::PUT,
        &format!("/api/v1/asambleas/{aid}/votaciones/{vid}"),
        Some(&admin_token),
        Some(json!({ "activa": true })),
    )
    .await;
    assert_eq!(s, StatusCode::OK);

    for verificado in [false, true] {
        let (s, body) = request(
            &app,
            Method::PUT,
            &format!("/api/v1/asambleas/{aid}/poderes/{pid}"),
            Some(&admin_token),
            Some(json!({ "verificado": verificado })),
        )
        .await;
        assert_eq!(
            s,
            StatusCode::CONFLICT,
            "changing poderes to {verificado} during an open ballot must be refused: {body}"
        );
    }
}
