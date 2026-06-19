use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};

use crate::auth::extract::AuthUser;
use crate::db::enums::{PrioridadTicket, Rol, TipoPqr};
use crate::domains::solicitudes::dto::{CreateSolicitudRequest, SolicitudDto};
use crate::domains::solicitudes::models::NuevaSolicitud;
use crate::domains::solicitudes::repo;
use crate::error::{ApiError, ApiResult};
use crate::services::ws_hub::WsEvent;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/solicitudes",
        get(listar_solicitudes).post(crear_solicitud),
    )
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
    let rows = repo::listar_solicitudes(&mut conn, user.conjunto_id, solo_usuario, None).await?;
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
