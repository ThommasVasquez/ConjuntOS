use axum::extract::{Path, State};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use chrono::Utc;
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::auth::guard;
use crate::db::enums::{Rol, SeveridadNovedad, TipoCorrespondencia, TipoNovedad};
use crate::domains::vigilancia::dto::{
    ComunicacionesDto, CorrespondenciaDto, CorrespondenciaVigilanciaDto,
    CreateCorrespondenciaRequest, CreateNovedadRequest, CreatePaqueteRequest,
    CreateVisitaResidenteRequest, CreateVisitaVigilanciaRequest, NovedadDto,
    NovedadVigilanciaDto, PaqueteDto, PaqueteVigilanciaDto, ResolverNovedadRequest,
    VigilanciaStatsDto, VisitaDto, VisitaVigilanciaDto,
};
use crate::domains::vigilancia::models::{NuevaNovedad, NuevaVisita};
use crate::domains::vigilancia::repo;
use crate::error::{ApiError, ApiResult};
use crate::services::ws_hub::WsEvent;
use crate::state::AppState;

/// Gate staff + administration (legacy /api/vigilancia/* role list).
const ROLES_VIGILANCIA: &[Rol] = &[
    Rol::Vigilante,
    Rol::SupervisorVigilancia,
    Rol::Administrador,
];

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/vigilancia/visitas",
            get(listar_visitas_hoy).post(crear_visita_vigilancia),
        )
        .route(
            "/vigilancia/paquetes",
            get(listar_paquetes).post(crear_paquete),
        )
        .route("/vigilancia/paquetes/{id}/entregar", put(entregar_paquete))
        .route("/vigilancia/stats", get(vigilancia_stats))
        .route("/paquetes/mios", get(paquetes_mios))
        .route("/comunicaciones", get(comunicaciones))
        .route("/visitas", post(crear_visita_residente))
        .route("/visitas/preregistro", post(super::preregistro::preregistrar))
        .route("/visitas/scan", post(super::preregistro::escanear))
        .route(
            "/vigilancia/correspondencia",
            get(listar_correspondencia).post(crear_correspondencia),
        )
        .route("/vigilancia/correspondencia/{id}/entregar", put(entregar_correspondencia_handler))
        .route(
            "/vigilancia/novedades",
            get(listar_novedades).post(crear_novedad_handler),
        )
        .route("/vigilancia/novedades/{id}/resolver", put(resolver_novedad_handler))
}

#[utoipa::path(
    get,
    path = "/api/v1/vigilancia/visitas",
    tag = "vigilancia",
    responses(
        (status = 200, description = "Today's visits of the conjunto with recipient info", body = [VisitaVigilanciaDto]),
        (status = 403, description = "Requires gate staff or admin role")
    )
)]
pub async fn listar_visitas_hoy(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<VisitaVigilanciaDto>>> {
    guard::require(&user, ROLES_VIGILANCIA)?;
    let mut conn = state.pool.get().await?;
    let rows = repo::visitas_de_hoy(&mut conn, user.conjunto_id).await?;
    Ok(Json(
        rows.into_iter()
            .map(|(visita, residente)| VisitaVigilanciaDto {
                visita: visita.into(),
                residente: residente.into(),
            })
            .collect(),
    ))
}

#[utoipa::path(
    post,
    path = "/api/v1/vigilancia/visitas",
    tag = "vigilancia",
    request_body = CreateVisitaVigilanciaRequest,
    responses(
        (status = 200, description = "Visit registered", body = VisitaDto),
        (status = 403, description = "Requires gate staff or admin role"),
        (status = 404, description = "Recipient not found in this conjunto")
    )
)]
pub async fn crear_visita_vigilancia(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreateVisitaVigilanciaRequest>,
) -> ApiResult<Json<VisitaDto>> {
    guard::require(&user, ROLES_VIGILANCIA)?;
    if req.nombre.trim().is_empty() {
        return Err(ApiError::BadRequest("el nombre es obligatorio".into()));
    }
    let mut conn = state.pool.get().await?;
    if !repo::usuario_en_conjunto(&mut conn, user.conjunto_id, req.usuario_id).await? {
        return Err(ApiError::NotFound("residente destino no encontrado".into()));
    }
    let visita = repo::crear_visita(
        &mut conn,
        NuevaVisita {
            conjunto_id: user.conjunto_id,
            usuario_id: req.usuario_id,
            nombre: req.nombre.trim().to_string(),
            tipo: req.tipo,
            vehiculo_tipo: req.vehiculo_tipo,
            placa: req.placa,
            fecha: req.fecha.unwrap_or_else(Utc::now),
            tiene_parqueadero: req.tiene_parqueadero.unwrap_or(false),
            observacion: req.observacion,
        },
    )
    .await?;
    let dto = VisitaDto::from(visita);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "visita".into(),
                action: "created".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}

#[utoipa::path(
    post,
    path = "/api/v1/visitas",
    tag = "vigilancia",
    request_body = CreateVisitaResidenteRequest,
    responses(
        (status = 200, description = "Own scheduled visit", body = VisitaDto),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn crear_visita_residente(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreateVisitaResidenteRequest>,
) -> ApiResult<Json<VisitaDto>> {
    if req.nombre.trim().is_empty() {
        return Err(ApiError::BadRequest("el nombre es obligatorio".into()));
    }
    let mut conn = state.pool.get().await?;
    let visita = repo::crear_visita(
        &mut conn,
        NuevaVisita {
            conjunto_id: user.conjunto_id,
            usuario_id: user.id,
            nombre: req.nombre.trim().to_string(),
            tipo: req.tipo,
            vehiculo_tipo: req.vehiculo_tipo,
            placa: req.placa,
            fecha: req.fecha.unwrap_or_else(Utc::now),
            tiene_parqueadero: req.tiene_parqueadero.unwrap_or(false),
            observacion: req.observacion,
        },
    )
    .await?;
    let dto = VisitaDto::from(visita);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "visita".into(),
                action: "created".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}

#[utoipa::path(
    get,
    path = "/api/v1/vigilancia/paquetes",
    tag = "vigilancia",
    responses(
        (status = 200, description = "Latest 50 packages of the conjunto with recipient info", body = [PaqueteVigilanciaDto]),
        (status = 403, description = "Requires gate staff or admin role")
    )
)]
pub async fn listar_paquetes(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<PaqueteVigilanciaDto>>> {
    guard::require(&user, ROLES_VIGILANCIA)?;
    let mut conn = state.pool.get().await?;
    let rows = repo::paquetes_conjunto(&mut conn, user.conjunto_id).await?;
    Ok(Json(
        rows.into_iter()
            .map(|(paquete, residente)| PaqueteVigilanciaDto {
                paquete: paquete.into(),
                residente: residente.into(),
            })
            .collect(),
    ))
}

#[utoipa::path(
    post,
    path = "/api/v1/vigilancia/paquetes",
    tag = "vigilancia",
    request_body = CreatePaqueteRequest,
    responses(
        (status = 200, description = "Package registered; recipient gets an in-app notification", body = PaqueteDto),
        (status = 403, description = "Requires gate staff or admin role"),
        (status = 404, description = "Recipient not found in this conjunto")
    )
)]
pub async fn crear_paquete(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreatePaqueteRequest>,
) -> ApiResult<Json<PaqueteDto>> {
    guard::require(&user, ROLES_VIGILANCIA)?;
    if req.descripcion.trim().is_empty() || req.remitente.trim().is_empty() {
        return Err(ApiError::BadRequest(
            "descripcion y remitente son obligatorios".into(),
        ));
    }
    let mut conn = state.pool.get().await?;
    if !repo::usuario_en_conjunto(&mut conn, user.conjunto_id, req.usuario_id).await? {
        return Err(ApiError::NotFound("residente destino no encontrado".into()));
    }
    let paquete = repo::crear_paquete_con_notificacion(
        &mut conn,
        user.conjunto_id,
        req.usuario_id,
        req.descripcion.trim(),
        req.remitente.trim(),
    )
    .await?;
    let dto = PaqueteDto::from(paquete);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "paquete".into(),
                action: "created".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: Some(req.usuario_id),
            },
        )
        .await;
    Ok(Json(dto))
}

#[utoipa::path(
    put,
    path = "/api/v1/vigilancia/paquetes/{id}/entregar",
    tag = "vigilancia",
    params(("id" = Uuid, Path, description = "Package id")),
    responses(
        (status = 200, description = "Package marked delivered", body = PaqueteDto),
        (status = 403, description = "Requires gate staff or admin role"),
        (status = 404, description = "Package not found in this conjunto")
    )
)]
pub async fn entregar_paquete(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<PaqueteDto>> {
    guard::require(&user, ROLES_VIGILANCIA)?;
    let mut conn = state.pool.get().await?;
    let paquete = repo::entregar_paquete(&mut conn, user.conjunto_id, id)
        .await?
        .ok_or_else(|| ApiError::NotFound("paquete no encontrado".into()))?;
    let dto = PaqueteDto::from(paquete);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "paquete".into(),
                action: "delivered".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}

#[utoipa::path(
    get,
    path = "/api/v1/vigilancia/stats",
    tag = "vigilancia",
    responses(
        (status = 200, description = "Gate dashboard counters", body = VigilanciaStatsDto),
        (status = 403, description = "Requires gate staff or admin role")
    )
)]
pub async fn vigilancia_stats(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<VigilanciaStatsDto>> {
    guard::require(&user, ROLES_VIGILANCIA)?;
    let mut conn = state.pool.get().await?;
    let (visitas_hoy, paquetes_pendientes, total_residentes) =
        repo::stats(&mut conn, user.conjunto_id).await?;
    Ok(Json(VigilanciaStatsDto {
        visitas_hoy,
        paquetes_pendientes,
        total_residentes,
    }))
}

#[utoipa::path(
    get,
    path = "/api/v1/paquetes/mios",
    tag = "vigilancia",
    responses(
        (status = 200, description = "Own packages waiting at the gate", body = [PaqueteDto]),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn paquetes_mios(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<PaqueteDto>>> {
    let mut conn = state.pool.get().await?;
    let rows =
        repo::paquetes_propios_en_porteria(&mut conn, user.conjunto_id, user.id, 100).await?;
    Ok(Json(rows.into_iter().map(PaqueteDto::from).collect()))
}

#[utoipa::path(
    get,
    path = "/api/v1/comunicaciones",
    tag = "vigilancia",
    responses(
        (status = 200, description = "Own latest visits and pending packages", body = ComunicacionesDto),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn comunicaciones(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<ComunicacionesDto>> {
    let mut conn = state.pool.get().await?;
    let visitas = repo::visitas_propias(&mut conn, user.conjunto_id, user.id, 20).await?;
    let paquetes =
        repo::paquetes_propios_en_porteria(&mut conn, user.conjunto_id, user.id, 20).await?;
    Ok(Json(ComunicacionesDto {
        visitas: visitas.into_iter().map(VisitaDto::from).collect(),
        paquetes: paquetes.into_iter().map(PaqueteDto::from).collect(),
    }))
}

// ── Correspondencia ────────────────────────────────────────────────────

async fn listar_correspondencia(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<CorrespondenciaVigilanciaDto>>> {
    guard::require(&user, ROLES_VIGILANCIA)?;
    let mut conn = state.pool.get().await?;
    let rows = repo::correspondencia_conjunto(&mut conn, user.conjunto_id).await?;
    Ok(Json(
        rows.into_iter()
            .map(|(corr, residente)| CorrespondenciaVigilanciaDto {
                correspondencia: corr.into(),
                residente: residente.into(),
            })
            .collect(),
    ))
}

async fn crear_correspondencia(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreateCorrespondenciaRequest>,
) -> ApiResult<Json<CorrespondenciaDto>> {
    guard::require(&user, ROLES_VIGILANCIA)?;
    if req.remitente.trim().is_empty() {
        return Err(ApiError::BadRequest("el remitente es obligatorio".into()));
    }
    let mut conn = state.pool.get().await?;
    if !repo::usuario_en_conjunto(&mut conn, user.conjunto_id, req.usuario_id).await? {
        return Err(ApiError::NotFound("residente destino no encontrado".into()));
    }
    let tipo = req.tipo.unwrap_or(TipoCorrespondencia::Carta);
    let corr = repo::crear_correspondencia_con_notificacion(
        &mut conn,
        user.conjunto_id,
        req.usuario_id,
        tipo,
        req.remitente.trim(),
        req.descripcion.as_deref(),
    )
    .await?;
    let dto = CorrespondenciaDto::from(corr);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "correspondencia".into(),
                action: "created".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: Some(req.usuario_id),
            },
        )
        .await;
    Ok(Json(dto))
}

// ── Novedades ──────────────────────────────────────────────────────────

async fn listar_novedades(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<NovedadVigilanciaDto>>> {
    guard::require(&user, ROLES_VIGILANCIA)?;
    let mut conn = state.pool.get().await?;
    let rows = repo::novedades_conjunto(&mut conn, user.conjunto_id).await?;
    Ok(Json(
        rows.into_iter()
            .map(|(nov, reportado_por)| NovedadVigilanciaDto {
                novedad: nov.into(),
                reportado_por: reportado_por.into(),
            })
            .collect(),
    ))
}

async fn crear_novedad_handler(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreateNovedadRequest>,
) -> ApiResult<Json<NovedadDto>> {
    guard::require(&user, ROLES_VIGILANCIA)?;
    if req.descripcion.trim().is_empty() {
        return Err(ApiError::BadRequest("la descripción es obligatoria".into()));
    }
    let mut conn = state.pool.get().await?;
    let novedad = repo::crear_novedad(
        &mut conn,
        NuevaNovedad {
            conjunto_id: user.conjunto_id,
            usuario_id: user.id,
            tipo: req.tipo,
            ubicacion: req.ubicacion,
            descripcion: req.descripcion.trim().to_string(),
            severidad: req.severidad.unwrap_or(SeveridadNovedad::Baja),
        },
    )
    .await?;
    let dto = NovedadDto::from(novedad);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "novedad".into(),
                action: "created".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}

async fn resolver_novedad_handler(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<ResolverNovedadRequest>,
) -> ApiResult<Json<NovedadDto>> {
    guard::require(&user, ROLES_VIGILANCIA)?;
    let mut conn = state.pool.get().await?;
    let novedad = repo::resolver_novedad(&mut conn, user.conjunto_id, id, user.id, &req.resolucion)
        .await?
        .ok_or_else(|| ApiError::NotFound("novedad no encontrada".into()))?;
    Ok(Json(novedad.into()))
}

async fn entregar_correspondencia_handler(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<CorrespondenciaDto>> {
    guard::require(&user, ROLES_VIGILANCIA)?;
    let mut conn = state.pool.get().await?;
    let corr = repo::entregar_correspondencia(&mut conn, user.conjunto_id, id)
        .await?
        .ok_or_else(|| ApiError::NotFound("correspondencia no encontrada".into()))?;
    let dto = CorrespondenciaDto::from(corr);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "correspondencia".into(),
                action: "delivered".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}
