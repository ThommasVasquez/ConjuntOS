use axum::extract::{Path, Query, State};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::auth::guard;
use crate::db::enums::{CatServicio, EstadoSolicitud, PrioridadTicket, Rol};
use crate::db::schema::solicitudes_servicio;
use crate::db::DbConn;
use crate::domains::solicitudes::Solicitud;
use crate::domains::solicitudes::dto::TicketStats;
use crate::domains::solicitudes::repo;
use crate::error::{ApiError, ApiResult};
use crate::services::ws_hub::WsEvent;
use crate::state::AppState;

// ── DTOs ─────────────────────────────────────────────────────────────────────

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SolicitudServicioDto {
    pub id: Uuid,
    pub usuario_id: Uuid,
    pub categoria: CatServicio,
    pub tipo: String,
    pub descripcion: String,
    pub urgente: bool,
    pub imagenes: Vec<String>,
    pub estado: EstadoSolicitud,
    pub proveedor_id: Option<Uuid>,
    pub prioridad: PrioridadTicket,
    pub sla_horas: i32,
    pub sla_vencimiento: Option<DateTime<Utc>>,
    pub asignado_a_id: Option<Uuid>,
    pub fecha_asignacion: Option<DateTime<Utc>>,
    pub fecha_resolucion: Option<DateTime<Utc>>,
    pub fecha_cierre: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

impl From<Solicitud> for SolicitudServicioDto {
    fn from(s: Solicitud) -> Self {
        let imagenes: Vec<String> = serde_json::from_value(s.imagenes).unwrap_or_default();
        Self {
            id: s.id, usuario_id: s.usuario_id, categoria: s.categoria, tipo: s.tipo.as_str().to_string(),
            descripcion: s.descripcion, urgente: s.urgente, imagenes, estado: s.estado,
            proveedor_id: s.proveedor_id, prioridad: s.prioridad, sla_horas: s.sla_horas,
            sla_vencimiento: s.sla_vencimiento, asignado_a_id: s.asignado_a_id,
            fecha_asignacion: s.fecha_asignacion, fecha_resolucion: s.fecha_resolucion,
            fecha_cierre: s.fecha_cierre, created_at: s.created_at,
        }
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSolicitudRequest {
    pub estado: Option<EstadoSolicitud>,
    pub proveedor_id: Option<Uuid>,
    pub asignado_a_id: Option<Uuid>,
    pub prioridad: Option<PrioridadTicket>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminSolicitudesQuery {
    pub estado: Option<EstadoSolicitud>,
    pub categoria: Option<CatServicio>,
    pub urgente: Option<bool>,
}

#[derive(Deserialize, ToSchema)]
pub struct AgregarComentarioRequest {
    pub contenido: String,
}

// ── Router ───────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/admin/solicitudes", get(listar_admin))
        .route("/admin/solicitudes/stats", get(stats_admin))
        .route("/admin/solicitudes/{id}", put(actualizar))
        .route("/admin/solicitudes/{id}/comentarios", post(agregar_comentario))
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async fn listar_admin(
    State(state): State<AppState>,
    user: AuthUser,
    Query(filtros): Query<AdminSolicitudesQuery>,
) -> ApiResult<Json<Vec<SolicitudServicioDto>>> {
    guard::require_admin(&user)?;
    let mut conn = state.pool.get().await?;
    // Use repo for full DTO support
    let rows = repo::listar_solicitudes(&mut conn, user.conjunto_id, None, filtros.estado).await?;
    Ok(Json(rows.into_iter().map(SolicitudServicioDto::from).collect()))
}

async fn actualizar(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateSolicitudRequest>,
) -> ApiResult<Json<SolicitudServicioDto>> {
    guard::require_admin(&user)?;
    let mut conn = state.pool.get().await?;
    let existing = repo::solicitud_por_id(&mut conn, id).await?
        .ok_or_else(|| ApiError::NotFound("solicitud no encontrada".into()))?;
    if existing.conjunto_id != user.conjunto_id { return Err(ApiError::Forbidden); }

    // Register transition
    if let Some(ref nuevo_estado) = req.estado {
        let _ = repo::registrar_transicion(&mut conn, crate::domains::solicitudes::models::NuevaTransicion {
            ticket_id: id,
            estado_anterior: existing.estado.as_str().to_string(),
            estado_nuevo: nuevo_estado.as_str().to_string(),
            usuario_id: user.id,
        }).await;
    }

    let actualizada = repo::actualizar_ticket(
        &mut conn, id, req.estado,
        req.proveedor_id.map(|p| Some(p)),
        req.asignado_a_id.map(|a| Some(a)),
        req.prioridad,
    ).await?;

    let dto = SolicitudServicioDto::from(actualizada);
    state.ws_hub.publish(user.conjunto_id, WsEvent {
        domain: "solicitud".into(), action: "updated".into(),
        payload: Some(serde_json::to_value(&dto).unwrap_or_default()), target_user_id: None,
    }).await;
    Ok(Json(dto))
}

async fn stats_admin(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<TicketStats>> {
    guard::require_admin(&user)?;
    let mut conn = state.pool.get().await?;
    repo::ticket_stats(&mut conn, user.conjunto_id).await.map(Json)
}

async fn agregar_comentario(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<AgregarComentarioRequest>,
) -> ApiResult<Json<serde_json::Value>> {
    guard::require_admin(&user)?;
    if req.contenido.trim().is_empty() {
        return Err(ApiError::BadRequest("contenido es obligatorio".into()));
    }
    let mut conn = state.pool.get().await?;
    let _ = repo::solicitud_por_id(&mut conn, id).await?
        .ok_or_else(|| ApiError::NotFound("solicitud no encontrada".into()))?;
    repo::agregar_comentario(&mut conn, crate::domains::solicitudes::models::NuevoComentario {
        ticket_id: id, usuario_id: user.id, contenido: req.contenido.trim().to_string(),
    }).await?;
    Ok(Json(serde_json::json!({"status": "ok"})))
}
