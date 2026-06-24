use axum::extract::{Path, State};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::auth::guard;
use crate::db::enums::{EstadoSolicitud, PrioridadTicket, Rol, TipoPqr};
use crate::domains::solicitudes::dto::{
    AgregarComentarioRequest, CreateSolicitudRequest, SolicitudDto, TicketComentarioDto,
    TicketTransicionDto, UpdateTicketRequest,
};
use crate::domains::solicitudes::models::{NuevaSolicitud, NuevaTransicion, NuevoComentario};
use crate::domains::solicitudes::repo;
use crate::error::{ApiError, ApiResult};
use crate::services::ws_hub::WsEvent;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/solicitudes",
            get(listar_solicitudes).post(crear_solicitud),
        )
        .route("/solicitudes/mis-asignadas", get(mis_asignadas))
        .route("/solicitudes/{id}", get(ver_solicitud))
        .route("/solicitudes/{id}/estado", put(cambiar_estado))
        .route("/solicitudes/{id}/comentarios", get(comentarios).post(agregar_comentario))
}

#[utoipa::path(
    get,
    path = "/api/v1/solicitudes",
    tag = "solicitudes",
    responses(
        (status = 200, description = "Latest 50 PQRS — residents see their own, ADMINISTRADOR/CONCEJO the whole conjunto", body = [SolicitudDto]),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn listar_solicitudes(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<SolicitudDto>>> {
    let solo_usuario = match user.rol {
        Rol::Administrador | Rol::Concejo => None,
        _ => Some(user.id),
    };
    let mut conn = state.pool.get().await?;
    let rows = repo::listar_solicitudes(&mut conn, user.conjunto_id, solo_usuario, None, None).await?;
    let dtos: Vec<SolicitudDto> = rows.into_iter().map(|s| SolicitudDto::from_model(s, vec![], vec![])).collect();
    Ok(Json(dtos))
}

#[utoipa::path(
    post,
    path = "/api/v1/solicitudes",
    tag = "solicitudes",
    request_body = CreateSolicitudRequest,
    responses(
        (status = 200, description = "PQRS created (estado ABIERTA); every ADMINISTRADOR of the conjunto gets a notification", body = SolicitudDto),
        (status = 400, description = "Missing required fields"),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn crear_solicitud(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreateSolicitudRequest>,
) -> ApiResult<Json<SolicitudDto>> {
    if req.descripcion.trim().is_empty() {
        return Err(ApiError::BadRequest("la descripcion es obligatoria".into()));
    }
    let imagenes = serde_json::to_value(req.imagenes.unwrap_or_default())
        .map_err(|e| ApiError::BadRequest(format!("imagenes inválidas: {e}")))?;
    let mut conn = state.pool.get().await?;
    let solicitud = repo::crear_solicitud_con_notificaciones(
        &mut conn,
        NuevaSolicitud {
            conjunto_id: user.conjunto_id,
            usuario_id: user.id,
            categoria: req.categoria,
            tipo: req.tipo.unwrap_or(TipoPqr::Mantenimiento),
            descripcion: req.descripcion.trim().to_string(),
            urgente: req.urgente.unwrap_or(false),
            imagenes,
            prioridad: PrioridadTicket::Media,
            sla_horas: if req.urgente.unwrap_or(false) { 4 } else { 48 },
        },
        &user.nombre,
    )
    .await?;
    let dto = SolicitudDto::from_model(solicitud, vec![], vec![]);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "solicitud".into(),
                action: "created".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}

// ── Mantenimiento: mis tickets asignados ──────────────────────────────────

#[utoipa::path(
    get,
    path = "/api/v1/solicitudes/mis-asignadas",
    tag = "solicitudes",
    responses(
        (status = 200, description = "Tickets assigned to the current maintenance worker", body = [SolicitudDto]),
        (status = 401, description = "Not authenticated"),
        (status = 403, description = "Only MANTENIMIENTO_LOCATIVO")
    )
)]
pub async fn mis_asignadas(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<SolicitudDto>>> {
    // Restrict to MANTENIMIENTO_LOCATIVO (and admin/concejo/superadmin)
    guard::require(&user, &[Rol::MantenimientoLocativo, Rol::Administrador, Rol::SuperAdmin, Rol::Concejo])?;
    let mut conn = state.pool.get().await?;
    let rows = repo::listar_solicitudes(
        &mut conn,
        user.conjunto_id,
        None,
        Some(vec![EstadoSolicitud::Asignada, EstadoSolicitud::EnProgreso]),
        Some(user.id),
    ).await?;
    let dtos: Vec<SolicitudDto> = rows.into_iter()
        .map(|s| SolicitudDto::from_model(s, vec![], vec![]))
        .collect();
    Ok(Json(dtos))
}

// ── Ver detalle de un ticket ──────────────────────────────────────────────

#[utoipa::path(
    get,
    path = "/api/v1/solicitudes/{id}",
    tag = "solicitudes",
    params(("id" = Uuid, Path, description = "Ticket ID")),
    responses(
        (status = 200, description = "Ticket detail with comments and transitions", body = SolicitudDto),
        (status = 404, description = "Ticket not found")
    )
)]
pub async fn ver_solicitud(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<SolicitudDto>> {
    let mut conn = state.pool.get().await?;
    let s = repo::solicitud_por_id(&mut conn, id, user.conjunto_id).await?
        .ok_or(ApiError::NotFound("ticket no encontrado".into()))?;
    // Only allow the assigned worker, admin, or the creator
    if s.asignado_a_id != Some(user.id)
        && s.usuario_id != user.id
        && !matches!(user.rol, Rol::Administrador | Rol::SuperAdmin | Rol::Concejo)
    {
        return Err(ApiError::Forbidden);
    }
    let comentarios = repo::comentarios_por_ticket(&mut conn, id).await?;
    let transiciones = repo::transiciones_por_ticket(&mut conn, id).await?;
    let dto = SolicitudDto::from_model(
        s,
        comentarios.into_iter().map(TicketComentarioDto::from).collect(),
        transiciones.into_iter().map(TicketTransicionDto::from).collect(),
    );
    Ok(Json(dto))
}

// ── Cambiar estado de un ticket (aceptar, completar) ──────────────────────

#[derive(serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CambiarEstadoRequest {
    pub estado: EstadoSolicitud,
    pub notas: Option<String>,
    pub imagenes: Option<Vec<String>>,
}

#[utoipa::path(
    put,
    path = "/api/v1/solicitudes/{id}/estado",
    tag = "solicitudes",
    params(("id" = Uuid, Path, description = "Ticket ID")),
    request_body = CambiarEstadoRequest,
    responses(
        (status = 200, description = "Ticket status updated", body = SolicitudDto),
        (status = 400, description = "Invalid transition"),
        (status = 403, description = "Only assigned worker or admin"),
        (status = 404, description = "Ticket not found")
    )
)]
pub async fn cambiar_estado(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<CambiarEstadoRequest>,
) -> ApiResult<Json<SolicitudDto>> {
    let mut conn = state.pool.get().await?;
    let s = repo::solicitud_por_id(&mut conn, id, user.conjunto_id).await?
        .ok_or(ApiError::NotFound("ticket no encontrado".into()))?;

    // Only assigned worker or admin can change state
    if s.asignado_a_id != Some(user.id)
        && !matches!(user.rol, Rol::Administrador | Rol::SuperAdmin)
    {
        return Err(ApiError::Forbidden);
    }

    // Validate transitions
    match (&s.estado, &req.estado) {
        (EstadoSolicitud::Asignada, EstadoSolicitud::EnProgreso) => {} // Accept
        (EstadoSolicitud::EnProgreso, EstadoSolicitud::Resuelta) => {} // Complete
        (_, _) if matches!(user.rol, Rol::Administrador | Rol::SuperAdmin) => {} // Admin can do any
        _ => return Err(ApiError::BadRequest(format!(
            "transición inválida: {:?} → {:?}", s.estado, req.estado
        ))),
    }

    let estado_anterior = format!("{:?}", s.estado);
    let actualizado = repo::actualizar_ticket(
        &mut conn, id, Some(req.estado), None, None, None,
    ).await?;

    // Register transition
    repo::registrar_transicion(&mut conn, NuevaTransicion {
        ticket_id: id,
        estado_anterior,
        estado_nuevo: format!("{:?}", req.estado),
        usuario_id: user.id,
    }).await?;

    // Add notes as comment if provided
    if let Some(notas) = req.notas.filter(|n| !n.trim().is_empty()) {
        repo::agregar_comentario(&mut conn, NuevoComentario {
            ticket_id: id,
            usuario_id: user.id,
            contenido: notas,
        }).await?;
    }

    // Handle images if provided (append to existing)
    if let Some(imgs) = req.imagenes.filter(|i| !i.is_empty()) {
        let mut existing: Vec<String> = serde_json::from_value(actualizado.imagenes.clone()).unwrap_or_default();
        existing.extend(imgs);
        let json = serde_json::to_value(&existing)
            .map_err(|e| ApiError::BadRequest(format!("imagenes invalidas: {e}")))?;
        let sql = format!(
            "UPDATE solicitudes_servicio SET imagenes = '{}' WHERE id = '{}'",
            json.as_str().unwrap_or("[]").replace('\'', "''"),
            id
        );
        diesel_async::RunQueryDsl::execute(
            diesel::sql_query(&sql),
            &mut conn,
        ).await.map_err(|e| ApiError::Internal(anyhow::anyhow!("{e}")))?;
    }

    // WebSocket notify the ticket creator
    if actualizado.usuario_id != user.id {
        state.ws_hub.publish(
            actualizado.conjunto_id,
            WsEvent {
                domain: "solicitud".into(),
                action: "estado_cambiado".into(),
                payload: Some(serde_json::json!({
                    "ticketId": actualizado.id,
                    "estado": format!("{:?}", req.estado),
                    "actualizadoPor": user.nombre,
                })),
                target_user_id: Some(actualizado.usuario_id),
            },
        ).await;
    }

    let comentarios = repo::comentarios_por_ticket(&mut conn, id).await?;
    let transiciones = repo::transiciones_por_ticket(&mut conn, id).await?;
    let dto = SolicitudDto::from_model(
        actualizado,
        comentarios.into_iter().map(TicketComentarioDto::from).collect(),
        transiciones.into_iter().map(TicketTransicionDto::from).collect(),
    );
    Ok(Json(dto))
}

// ── Comentarios ────────────────────────────────────────────────────────────

#[utoipa::path(
    get,
    path = "/api/v1/solicitudes/{id}/comentarios",
    tag = "solicitudes",
    params(("id" = Uuid, Path, description = "Ticket ID")),
    responses(
        (status = 200, description = "Ticket comments", body = [TicketComentarioDto])
    )
)]
pub async fn comentarios(
    State(state): State<AppState>,
    _user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Vec<TicketComentarioDto>>> {
    let mut conn = state.pool.get().await?;
    let rows = repo::comentarios_por_ticket(&mut conn, id).await?;
    Ok(Json(rows.into_iter().map(TicketComentarioDto::from).collect()))
}

#[utoipa::path(
    post,
    path = "/api/v1/solicitudes/{id}/comentarios",
    tag = "solicitudes",
    params(("id" = Uuid, Path, description = "Ticket ID")),
    request_body = AgregarComentarioRequest,
    responses(
        (status = 200, description = "Comment added", body = TicketComentarioDto)
    )
)]
pub async fn agregar_comentario(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<AgregarComentarioRequest>,
) -> ApiResult<Json<TicketComentarioDto>> {
    let mut conn = state.pool.get().await?;
    let s = repo::solicitud_por_id(&mut conn, id, user.conjunto_id).await?
        .ok_or(ApiError::NotFound("ticket no encontrado".into()))?;
    // Only assigned worker, admin, or ticket creator can comment
    if s.asignado_a_id != Some(user.id)
        && s.usuario_id != user.id
        && !matches!(user.rol, Rol::Administrador | Rol::SuperAdmin)
    {
        return Err(ApiError::Forbidden);
    }
    let comentario = repo::agregar_comentario(&mut conn, NuevoComentario {
        ticket_id: id,
        usuario_id: user.id,
        contenido: req.contenido.trim().to_string(),
    }).await?;
    Ok(Json(TicketComentarioDto::from(comentario)))
}
