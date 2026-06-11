use axum::extract::{Path, Query, State};
use axum::routing::get;
use axum::{Json, Router};
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::domains::reservas::dto::{
    AreaComunDto, CreateReservaRequest, ReservaDto, SlotDto, SlotsQuery,
};
use crate::domains::reservas::repo;
use crate::error::{ApiError, ApiResult};
use crate::services::ws_hub::WsEvent;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/areas-comunes", get(listar_areas))
        .route("/areas-comunes/{id}/slots", get(slots))
        .route("/reservas", get(listar_reservas).post(crear_reserva))
}

#[utoipa::path(
    get,
    path = "/api/v1/areas-comunes",
    tag = "reservas",
    responses(
        (status = 200, description = "Active common areas of the conjunto", body = [AreaComunDto]),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn listar_areas(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<AreaComunDto>>> {
    let mut conn = state.pool.get().await?;
    let rows = repo::areas_activas(&mut conn, user.conjunto_id).await?;
    Ok(Json(rows.into_iter().map(AreaComunDto::from).collect()))
}

#[utoipa::path(
    get,
    path = "/api/v1/areas-comunes/{id}/slots",
    tag = "reservas",
    params(("id" = Uuid, Path, description = "Common area id"), SlotsQuery),
    responses(
        (status = 200, description = "Occupied slots of the area that day", body = [SlotDto]),
        (status = 404, description = "Area not found in this conjunto")
    )
)]
pub async fn slots(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Query(query): Query<SlotsQuery>,
) -> ApiResult<Json<Vec<SlotDto>>> {
    let mut conn = state.pool.get().await?;
    if repo::find_area(&mut conn, user.conjunto_id, id)
        .await?
        .is_none()
    {
        return Err(ApiError::NotFound("área común no encontrada".into()));
    }
    let rows = repo::slots_ocupados(&mut conn, user.conjunto_id, id, query.fecha).await?;
    Ok(Json(
        rows.into_iter()
            .map(|(fecha_inicio, fecha_fin)| SlotDto {
                fecha_inicio,
                fecha_fin,
            })
            .collect(),
    ))
}

#[utoipa::path(
    get,
    path = "/api/v1/reservas",
    tag = "reservas",
    responses(
        (status = 200, description = "Own upcoming reservations ordered by start", body = [ReservaDto]),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn listar_reservas(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<ReservaDto>>> {
    let mut conn = state.pool.get().await?;
    let rows = repo::reservas_propias(&mut conn, user.conjunto_id, user.id).await?;
    Ok(Json(
        rows.into_iter()
            .map(|(r, area_nombre, area_imagen_url)| ReservaDto {
                id: r.id,
                area_id: r.area_id,
                fecha_inicio: r.fecha_inicio,
                fecha_fin: r.fecha_fin,
                estado: r.estado,
                notas: r.notas,
                created_at: r.created_at,
                area_nombre,
                area_imagen_url,
            })
            .collect(),
    ))
}

#[utoipa::path(
    post,
    path = "/api/v1/reservas",
    tag = "reservas",
    request_body = CreateReservaRequest,
    responses(
        (status = 200, description = "Reservation created (PENDIENTE if the area requires a deposit)", body = ReservaDto),
        (status = 404, description = "Area not found in this conjunto"),
        (status = 409, description = "Slot overlaps an existing reservation")
    )
)]
pub async fn crear_reserva(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreateReservaRequest>,
) -> ApiResult<Json<ReservaDto>> {
    if req.fecha_inicio >= req.fecha_fin {
        return Err(ApiError::BadRequest("rango de tiempo inválido".into()));
    }
    let mut conn = state.pool.get().await?;
    let reserva = repo::crear_reserva(
        &mut conn,
        user.conjunto_id,
        user.id,
        req.area_id,
        req.fecha_inicio,
        req.fecha_fin,
        req.notas,
    )
    .await?;
    // Area existence was checked inside the transaction; re-read for the DTO.
    let area = repo::find_area(&mut conn, user.conjunto_id, reserva.area_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("área común no encontrada".into()))?;
    let dto = ReservaDto {
        id: reserva.id,
        area_id: reserva.area_id,
        fecha_inicio: reserva.fecha_inicio,
        fecha_fin: reserva.fecha_fin,
        estado: reserva.estado,
        notas: reserva.notas,
        created_at: reserva.created_at,
        area_nombre: area.nombre,
        area_imagen_url: area.imagen_url,
    };
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "reserva".into(),
                action: "created".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}
