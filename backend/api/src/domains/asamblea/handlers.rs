use axum::extract::{Path, Query, State};
use axum::routing::{get, put};
use axum::{Json, Router};
use bigdecimal::BigDecimal;
use chrono::Utc;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::auth::guard;
use crate::auth::password;
use crate::db::enums::{EstadoPairing, EstadoTurno, Rol};
use crate::domains::asamblea::dto::{
    AsambleaDto, AsistenciaDto, CreateAsistenciaRequest, CreateOpinionRequest,
    CreatePairingRequest, CreatePoderRequest, CreateVotacionRequest, CreateVotoRequest,
    LiveKitTokenDto, OpinionDto, PairingDto, PairingQuery, PoderDto, QuorumDto,
    SessionUpdateRequest, TurnoDto, UpdatePoderRequest, UpdateTurnoRequest, UpdateVotacionRequest,
    VotacionDto, VotoDto,
};
use crate::domains::asamblea::models::{
    AsambleaPairing, NuevaAsistencia, NuevaOpinion, NuevaVotacion, NuevoPairing, NuevoPoder,
    NuevoTurno, NuevoVoto,
};
use crate::domains::asamblea::repo;
use crate::error::{ApiError, ApiResult};
use crate::services::ws_hub::WsEvent;
use crate::state::AppState;

const ADMIN_ROLES: &[Rol] = &[Rol::Administrador, Rol::SuperAdmin];

pub fn router() -> Router<AppState> {
    Router::new()
        // Session
        .route(
            "/asambleas/activa/session",
            get(get_session).put(update_session),
        )
        // Pairing
        .route("/asambleas/pairing", get(get_pairing).post(create_pairing))
        // Votaciones
        .route(
            "/asambleas/{id}/votaciones",
            get(list_votaciones).post(create_votacion),
        )
        .route("/asambleas/{id}/votaciones/{vid}", put(update_votacion))
        // Votos
        .route("/votaciones/{id}/votos", get(list_votos).post(cast_voto))
        // Asistencias
        .route(
            "/asambleas/{id}/asistencias",
            get(list_asistencias).post(register_asistencia),
        )
        // Opiniones
        .route(
            "/asambleas/{id}/opiniones",
            get(list_opiniones).post(create_opinion),
        )
        // Turnos
        .route(
            "/asambleas/{id}/turnos",
            get(list_turnos).post(create_turno),
        )
        .route("/asambleas/{id}/turnos/{tid}", put(update_turno))
        // Poderes
        .route(
            "/asambleas/{id}/poderes",
            get(list_poderes).post(create_poder),
        )
        .route("/asambleas/{id}/poderes/{pid}", put(update_poder))
        // LiveKit
        .route("/asambleas/{id}/livekit-token", get(livekit_token))
}

// ── Helpers ──────────────────────────────────────────────────────────────

fn format_apto(torre: &Option<String>, apto: &Option<String>) -> Option<String> {
    match (torre.as_deref(), apto.as_deref()) {
        (Some(t), Some(a)) => Some(format!("T{t} Apto {a}")),
        (Some(t), None) => Some(format!("T{t}")),
        (None, Some(a)) => Some(format!("Apto {a}")),
        (None, None) => None,
    }
}

fn compute_hash_firma(
    votacion_id: Uuid,
    unidad_id: Option<Uuid>,
    respuesta: &str,
    timestamp: &str,
) -> String {
    let uid = unidad_id.map(|u| u.to_string()).unwrap_or_default();
    let input = format!("{votacion_id}:{uid}:{respuesta}:{timestamp}");
    let hash = Sha256::digest(input.as_bytes());
    format!("{hash:x}")
}

// ── Session ──────────────────────────────────────────────────────────────

async fn get_session(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<AsambleaDto>> {
    let mut conn = state.pool.get().await?;
    let asamblea = repo::get_active_session(&mut conn, user.conjunto_id).await?;
    Ok(Json(AsambleaDto::from(asamblea)))
}

async fn update_session(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<SessionUpdateRequest>,
) -> ApiResult<Json<AsambleaDto>> {
    guard::require(&user, ADMIN_ROLES)?;
    let mut conn = state.pool.get().await?;

    let current = repo::get_active_session(&mut conn, user.conjunto_id).await?;

    let new_state = req.session_state.unwrap_or(current.session_state);
    let new_index = req.item_activo_index.unwrap_or(current.item_activo_index);
    let new_activa = req.activa.unwrap_or(current.activa);

    let rows = repo::update_session(
        &mut conn,
        user.conjunto_id,
        current.id,
        new_state,
        new_index,
        new_activa,
        req.version,
    )
    .await?;

    if rows == 0 {
        return Err(ApiError::Conflict(
            "version mismatch — session was updated by another client".into(),
        ));
    }

    let updated = repo::get_active_session(&mut conn, user.conjunto_id).await?;
    let dto = AsambleaDto::from(updated);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "asamblea".into(),
                action: "session_updated".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}

// ── Pairing ──────────────────────────────────────────────────────────────

async fn get_pairing(
    State(state): State<AppState>,
    user: AuthUser,
    Query(query): Query<PairingQuery>,
) -> ApiResult<Json<PairingDto>> {
    let mut conn = state.pool.get().await?;
    let pairings = repo::find_pending_pairings(&mut conn, user.conjunto_id).await?;

    let mut matched: Option<AsambleaPairing> = None;
    for pairing in pairings {
        let ok =
            password::verify_password_blocking(query.pin.clone(), pairing.pin_hash.clone()).await?;
        if ok {
            matched = Some(pairing);
            break;
        }
    }

    let pairing = matched.ok_or_else(|| ApiError::NotFound("pairing no encontrado".into()))?;
    let linked = repo::link_pairing(&mut conn, pairing.id, user.id).await?;
    Ok(Json(PairingDto::from(linked)))
}

async fn create_pairing(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreatePairingRequest>,
) -> ApiResult<Json<PairingDto>> {
    if req.pin.trim().is_empty() {
        return Err(ApiError::BadRequest("pin es obligatorio".into()));
    }
    let pin_hash = password::hash_password_blocking(req.pin).await?;
    let expires_minutes = req.expires_minutes.unwrap_or(5);
    let expires_at = Utc::now()
        + chrono::Duration::try_minutes(expires_minutes)
            .ok_or_else(|| ApiError::BadRequest("expires_minutes inválido".into()))?;

    let mut conn = state.pool.get().await?;
    let pairing = repo::create_pairing(
        &mut conn,
        NuevoPairing {
            conjunto_id: user.conjunto_id,
            pin_hash,
            estado: EstadoPairing::Pendiente,
            expires_at,
        },
    )
    .await?;
    Ok(Json(PairingDto::from(pairing)))
}

// ── Votaciones ───────────────────────────────────────────────────────────

async fn list_votaciones(
    State(state): State<AppState>,
    user: AuthUser,
    Path(asamblea_id): Path<Uuid>,
) -> ApiResult<Json<Vec<VotacionDto>>> {
    let mut conn = state.pool.get().await?;
    repo::verify_asamblea_tenant(&mut conn, asamblea_id, user.conjunto_id).await?;
    let rows = repo::list_votaciones(&mut conn, asamblea_id).await?;
    Ok(Json(rows.into_iter().map(VotacionDto::from).collect()))
}

async fn create_votacion(
    State(state): State<AppState>,
    user: AuthUser,
    Path(asamblea_id): Path<Uuid>,
    Json(req): Json<CreateVotacionRequest>,
) -> ApiResult<Json<VotacionDto>> {
    guard::require(&user, ADMIN_ROLES)?;
    let mut conn = state.pool.get().await?;
    repo::verify_asamblea_tenant(&mut conn, asamblea_id, user.conjunto_id).await?;

    if req.titulo.trim().is_empty() {
        return Err(ApiError::BadRequest("titulo es obligatorio".into()));
    }

    let opciones = req
        .opciones
        .unwrap_or_else(|| vec!["SI".to_string(), "NO".to_string(), "ABSTENCION".to_string()]);
    let opciones_json = serde_json::to_value(&opciones)
        .map_err(|e| ApiError::BadRequest(format!("opciones inválidas: {e}")))?;

    let votacion = repo::create_votacion(
        &mut conn,
        NuevaVotacion {
            asamblea_id,
            titulo: req.titulo.trim().to_string(),
            descripcion: req.descripcion,
            opciones: opciones_json,
        },
    )
    .await?;
    let dto = VotacionDto::from(votacion);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "asamblea".into(),
                action: "votacion_created".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}

async fn update_votacion(
    State(state): State<AppState>,
    user: AuthUser,
    Path((asamblea_id, vid)): Path<(Uuid, Uuid)>,
    Json(req): Json<UpdateVotacionRequest>,
) -> ApiResult<Json<VotacionDto>> {
    guard::require(&user, ADMIN_ROLES)?;
    let mut conn = state.pool.get().await?;
    repo::verify_asamblea_tenant(&mut conn, asamblea_id, user.conjunto_id).await?;

    let votacion = repo::update_votacion(&mut conn, asamblea_id, vid, req.activa).await?;
    let dto = VotacionDto::from(votacion);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "asamblea".into(),
                action: "votacion_updated".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}

// ── Votos ────────────────────────────────────────────────────────────────

async fn list_votos(
    State(state): State<AppState>,
    user: AuthUser,
    Path(votacion_id): Path<Uuid>,
) -> ApiResult<Json<Vec<VotoDto>>> {
    let mut conn = state.pool.get().await?;
    repo::get_votacion_with_tenant_check(&mut conn, votacion_id, user.conjunto_id).await?;
    let rows = repo::list_votos(&mut conn, votacion_id).await?;
    Ok(Json(rows.into_iter().map(VotoDto::from).collect()))
}

async fn cast_voto(
    State(state): State<AppState>,
    user: AuthUser,
    Path(votacion_id): Path<Uuid>,
    Json(req): Json<CreateVotoRequest>,
) -> ApiResult<Json<VotoDto>> {
    let mut conn = state.pool.get().await?;

    // Tenant check + fetch votación
    let votacion =
        repo::get_votacion_with_tenant_check(&mut conn, votacion_id, user.conjunto_id).await?;

    if !votacion.activa {
        return Err(ApiError::BadRequest("la votación no está activa".into()));
    }

    // Validate option
    let opciones: Vec<String> = serde_json::from_value(votacion.opciones).unwrap_or_default();
    if !opciones.contains(&req.respuesta) {
        return Err(ApiError::BadRequest("opción de voto inválida".into()));
    }

    // Effective coeficiente (own + poderes)
    let (unidad_id, coeficiente) =
        repo::compute_effective_coeficiente(&mut conn, votacion.asamblea_id, user.id).await?;

    let coeficiente = if coeficiente == BigDecimal::default() {
        // Fallback to a minimal coeficiente rather than zero
        BigDecimal::from(1) / BigDecimal::from(100)
    } else {
        coeficiente
    };

    // Hash firma
    let timestamp = Utc::now().to_rfc3339();
    let hash_firma = compute_hash_firma(votacion_id, unidad_id, &req.respuesta, &timestamp);

    let voto = repo::cast_voto(
        &mut conn,
        NuevoVoto {
            votacion_id,
            usuario_id: user.id,
            unidad_id,
            respuesta: req.respuesta,
            coeficiente,
            es_virtual: req.es_virtual.unwrap_or(true),
            hash_firma,
        },
    )
    .await?;

    let dto = VotoDto::from(voto);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "asamblea".into(),
                action: "voto_cast".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}

// ── Asistencias ──────────────────────────────────────────────────────────

async fn list_asistencias(
    State(state): State<AppState>,
    user: AuthUser,
    Path(asamblea_id): Path<Uuid>,
) -> ApiResult<Json<QuorumDto>> {
    let mut conn = state.pool.get().await?;
    let asamblea = repo::verify_asamblea_tenant(&mut conn, asamblea_id, user.conjunto_id).await?;

    let rows = repo::list_asistencias(&mut conn, asamblea_id).await?;
    let (total, presente, percentage) =
        repo::get_quorum(&mut conn, asamblea_id, asamblea.conjunto_id).await?;

    Ok(Json(QuorumDto {
        asistencias: rows.into_iter().map(AsistenciaDto::from).collect(),
        total_coeficiente: total,
        presente_coeficiente: presente,
        quorum_porcentaje: percentage,
    }))
}

async fn register_asistencia(
    State(state): State<AppState>,
    user: AuthUser,
    Path(asamblea_id): Path<Uuid>,
    Json(req): Json<CreateAsistenciaRequest>,
) -> ApiResult<Json<AsistenciaDto>> {
    let mut conn = state.pool.get().await?;
    repo::verify_asamblea_tenant(&mut conn, asamblea_id, user.conjunto_id).await?;

    let asistencia = repo::register_asistencia(
        &mut conn,
        NuevaAsistencia {
            asamblea_id,
            usuario_id: user.id,
            tipo: req.tipo,
            verificado: true,
            ip: req.ip,
            dispositivo: req.dispositivo,
        },
    )
    .await?;

    let dto = AsistenciaDto::from(asistencia);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "asamblea".into(),
                action: "asistencia_registered".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}

// ── Opiniones ────────────────────────────────────────────────────────────

async fn list_opiniones(
    State(state): State<AppState>,
    user: AuthUser,
    Path(asamblea_id): Path<Uuid>,
) -> ApiResult<Json<Vec<OpinionDto>>> {
    let mut conn = state.pool.get().await?;
    repo::verify_asamblea_tenant(&mut conn, asamblea_id, user.conjunto_id).await?;
    let rows = repo::list_opiniones(&mut conn, asamblea_id).await?;
    Ok(Json(rows.into_iter().map(OpinionDto::from).collect()))
}

async fn create_opinion(
    State(state): State<AppState>,
    user: AuthUser,
    Path(asamblea_id): Path<Uuid>,
    Json(req): Json<CreateOpinionRequest>,
) -> ApiResult<Json<OpinionDto>> {
    let mut conn = state.pool.get().await?;
    repo::verify_asamblea_tenant(&mut conn, asamblea_id, user.conjunto_id).await?;

    if req.contenido.trim().is_empty() {
        return Err(ApiError::BadRequest(
            "contenido no puede estar vacío".into(),
        ));
    }

    let (nombre, torre, apto) = repo::get_user_info(&mut conn, user.id).await?;
    let apto_text = format_apto(&torre, &apto);

    let opinion = repo::create_opinion(
        &mut conn,
        NuevaOpinion {
            asamblea_id,
            usuario_id: user.id,
            nombre,
            apto: apto_text,
            contenido: req.contenido.trim().to_string(),
        },
    )
    .await?;

    let dto = OpinionDto::from(opinion);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "asamblea".into(),
                action: "opinion_created".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}

// ── Turnos ───────────────────────────────────────────────────────────────

async fn list_turnos(
    State(state): State<AppState>,
    user: AuthUser,
    Path(asamblea_id): Path<Uuid>,
) -> ApiResult<Json<Vec<TurnoDto>>> {
    let mut conn = state.pool.get().await?;
    repo::verify_asamblea_tenant(&mut conn, asamblea_id, user.conjunto_id).await?;
    let rows = repo::list_turnos(&mut conn, asamblea_id).await?;
    Ok(Json(rows.into_iter().map(TurnoDto::from).collect()))
}

async fn create_turno(
    State(state): State<AppState>,
    user: AuthUser,
    Path(asamblea_id): Path<Uuid>,
) -> ApiResult<Json<TurnoDto>> {
    let mut conn = state.pool.get().await?;
    repo::verify_asamblea_tenant(&mut conn, asamblea_id, user.conjunto_id).await?;

    let (nombre, torre, apto) = repo::get_user_info(&mut conn, user.id).await?;
    let apto_text = format_apto(&torre, &apto);

    let turno = repo::create_turno(
        &mut conn,
        NuevoTurno {
            asamblea_id,
            usuario_id: user.id,
            nombre,
            apto: apto_text,
            estado: EstadoTurno::Pendiente,
        },
    )
    .await?;

    let dto = TurnoDto::from(turno);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "asamblea".into(),
                action: "turno_created".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}

async fn update_turno(
    State(state): State<AppState>,
    user: AuthUser,
    Path((asamblea_id, tid)): Path<(Uuid, Uuid)>,
    Json(req): Json<UpdateTurnoRequest>,
) -> ApiResult<Json<TurnoDto>> {
    guard::require(&user, ADMIN_ROLES)?;
    let mut conn = state.pool.get().await?;
    repo::verify_asamblea_tenant(&mut conn, asamblea_id, user.conjunto_id).await?;

    // Only HABLANDO and COMPLETADO are valid target states via PUT.
    if req.estado == EstadoTurno::Pendiente {
        return Err(ApiError::BadRequest("transición de estado inválida".into()));
    }

    let turno = repo::update_turno(&mut conn, asamblea_id, tid, req.estado).await?;
    let dto = TurnoDto::from(turno);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "asamblea".into(),
                action: "turno_updated".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}

// ── Poderes ──────────────────────────────────────────────────────────────

async fn list_poderes(
    State(state): State<AppState>,
    user: AuthUser,
    Path(asamblea_id): Path<Uuid>,
) -> ApiResult<Json<Vec<PoderDto>>> {
    let mut conn = state.pool.get().await?;
    repo::verify_asamblea_tenant(&mut conn, asamblea_id, user.conjunto_id).await?;
    let rows = repo::list_poderes(&mut conn, asamblea_id).await?;
    Ok(Json(rows.into_iter().map(PoderDto::from).collect()))
}

async fn create_poder(
    State(state): State<AppState>,
    user: AuthUser,
    Path(asamblea_id): Path<Uuid>,
    Json(req): Json<CreatePoderRequest>,
) -> ApiResult<Json<PoderDto>> {
    let mut conn = state.pool.get().await?;
    repo::verify_asamblea_tenant(&mut conn, asamblea_id, user.conjunto_id).await?;

    if req.documento_url.trim().is_empty() {
        return Err(ApiError::BadRequest("documento_url es obligatorio".into()));
    }

    let poder = repo::create_poder(
        &mut conn,
        NuevoPoder {
            asamblea_id,
            otorgante_id: req.otorgante_id,
            apoderado_id: req.apoderado_id,
            documento_url: req.documento_url,
        },
    )
    .await?;

    let dto = PoderDto::from(poder);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "asamblea".into(),
                action: "poder_created".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}

async fn update_poder(
    State(state): State<AppState>,
    user: AuthUser,
    Path((asamblea_id, pid)): Path<(Uuid, Uuid)>,
    Json(req): Json<UpdatePoderRequest>,
) -> ApiResult<Json<PoderDto>> {
    guard::require(&user, ADMIN_ROLES)?;
    let mut conn = state.pool.get().await?;
    repo::verify_asamblea_tenant(&mut conn, asamblea_id, user.conjunto_id).await?;

    let poder = repo::update_poder(&mut conn, asamblea_id, pid, req.verificado).await?;
    let dto = PoderDto::from(poder);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "asamblea".into(),
                action: "poder_updated".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}

// ── LiveKit ─────────────────────────────────────────────────────────────

/// GET /api/v1/asambleas/{id}/livekit-token
/// Returns a LiveKit access token for joining the assembly video room.
async fn livekit_token(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<LiveKitTokenDto>> {
    let mut conn = state.pool.get().await?;
    repo::verify_asamblea_tenant(&mut conn, id, user.conjunto_id).await?;

    let (api_key, api_secret) = match (
        &state.config.livekit_api_key,
        &state.config.livekit_api_secret,
    ) {
        (Some(k), Some(s)) => (k.as_str(), s.as_str()),
        _ => {
            return Err(ApiError::ServiceUnavailable(
                "LiveKit no configurado".into(),
            ))
        }
    };

    let room_name = format!("asamblea-{id}");
    let identity = user.id.to_string();
    let can_publish = matches!(user.rol, Rol::Administrador | Rol::Concejo);
    let metadata = serde_json::json!({
        "nombre": user.nombre,
        "rol": user.rol.as_str(),
    })
    .to_string();

    let token = crate::services::livekit::generate_token(
        api_key,
        api_secret,
        &room_name,
        &identity,
        can_publish,
        &metadata,
    )
    .map_err(|e| ApiError::Internal(anyhow::anyhow!("token generation failed: {e}")))?;

    let livekit_url = state
        .config
        .livekit_url
        .clone()
        .unwrap_or_else(|| "ws://localhost:7880".to_string());

    Ok(Json(LiveKitTokenDto {
        token,
        url: livekit_url,
    }))
}
