use axum::extract::{Path, Query, State};
use axum::routing::get;
use axum::{Json, Router};
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::auth::guard;
use crate::db::enums::Rol;
use crate::domains::reservas::dto::{
    AreaComunDto, CreateReservaRequest, ReservaAdminDto, ReservaDto, SlotDto, SlotsQuery,
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
        .route("/reservas/area/{area_id}/hoy", get(listar_reservas_area_hoy))
        .route("/reservas/{id}/verificar", get(verificar_reserva))
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

/// List today's reservations for a specific area. Guard: area admins only.
pub async fn listar_reservas_area_hoy(
    State(state): State<AppState>,
    user: AuthUser,
    Path(area_id): Path<Uuid>,
) -> ApiResult<Json<Vec<ReservaAdminDto>>> {
    guard::require(
        &user,
        &[
            Rol::AdministradorPiscina,
            Rol::AdministradorGym,
            Rol::Administrador,
        ],
    )?;

    // Area admins can only see their own area.
    if user.rol == Rol::AdministradorPiscina || user.rol == Rol::AdministradorGym {
        let area = repo::find_area(&mut state.pool.get().await?, user.conjunto_id, area_id)
            .await?
            .ok_or_else(|| ApiError::NotFound("área no encontrada".into()))?;
        let expected = if user.rol == Rol::AdministradorPiscina { "Piscina" } else { "Gimnasio" };
        if area.nombre.to_lowercase() != expected.to_lowercase() {
            return Err(ApiError::Forbidden);
        }
    }

    let mut conn = state.pool.get().await?;
    let rows = repo::reservas_hoy_por_area(&mut conn, user.conjunto_id, area_id).await?;
    let dtos: Vec<ReservaAdminDto> = rows
        .into_iter()
        .map(|(r, area_nombre, usuario_nombre, torre, apto)| ReservaAdminDto {
            id: r.id,
            area_id: r.area_id,
            area_nombre,
            usuario_nombre,
            usuario_torre: torre,
            usuario_apto: apto,
            fecha_inicio: r.fecha_inicio,
            fecha_fin: r.fecha_fin,
            estado: r.estado,
            notas: r.notas,
        })
        .collect();
    Ok(Json(dtos))
}

/// Verify a reservation by ID (QR scan). Returns full details for area admin verification.
pub async fn verificar_reserva(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<ReservaAdminDto>> {
    guard::require(
        &user,
        &[
            Rol::AdministradorPiscina,
            Rol::AdministradorGym,
            Rol::Administrador,
        ],
    )?;

    let mut conn = state.pool.get().await?;
    let (r, area_nombre, usuario_nombre, torre, apto) = repo::find_reserva_by_id(&mut conn, user.conjunto_id, id)
        .await?
        .ok_or_else(|| ApiError::NotFound("reserva no encontrada".into()))?;

    let dto = ReservaAdminDto {
        id: r.id,
        area_id: r.area_id,
        area_nombre,
        usuario_nombre,
        usuario_torre: torre,
        usuario_apto: apto,
        fecha_inicio: r.fecha_inicio,
        fecha_fin: r.fecha_fin,
        estado: r.estado,
        notas: r.notas,
    };
    Ok(Json(dto))
}
