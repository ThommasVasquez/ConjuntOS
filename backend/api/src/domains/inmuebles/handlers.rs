use axum::extract::{Query, State};
use axum::routing::get;
use axum::{Json, Router};

use crate::auth::extract::AuthUser;
use crate::domains::inmuebles::dto::{CreateInmuebleRequest, InmuebleDto, InmueblesQuery};
use crate::domains::inmuebles::models::NuevoInmueble;
use crate::domains::inmuebles::repo;
use crate::error::{ApiError, ApiResult};
use crate::services::ws_hub::WsEvent;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/inmuebles", get(listar_inmuebles).post(crear_inmueble))
}

#[utoipa::path(
    get,
    path = "/api/v1/inmuebles",
    tag = "inmuebles",
    params(InmueblesQuery),
    responses(
        (status = 200, description = "Latest 50 DISPONIBLE listings of the conjunto (plus the caller's own in any estado), optionally filtered", body = [InmuebleDto]),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn listar_inmuebles(
    State(state): State<AppState>,
    user: AuthUser,
    Query(query): Query<InmueblesQuery>,
) -> ApiResult<Json<Vec<InmuebleDto>>> {
    let mut conn = state.pool.get().await?;
    let rows = repo::listar_inmuebles(
        &mut conn,
        user.conjunto_id,
        user.id,
        query.tipo_negocio,
        query.tipo_unidad,
        query.habitaciones,
    )
    .await?;
    Ok(Json(rows.into_iter().map(InmuebleDto::from).collect()))
}

#[utoipa::path(
    post,
    path = "/api/v1/inmuebles",
    tag = "inmuebles",
    request_body = CreateInmuebleRequest,
    responses(
        (status = 200, description = "Listing published (estado DISPONIBLE, caller is the owner)", body = InmuebleDto),
        (status = 400, description = "Missing required fields"),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn crear_inmueble(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreateInmuebleRequest>,
) -> ApiResult<Json<InmuebleDto>> {
    if req.titulo.trim().is_empty() || req.descripcion.trim().is_empty() {
        return Err(ApiError::BadRequest(
            "titulo y descripcion son obligatorios".into(),
        ));
    }
    let imagenes = serde_json::to_value(req.imagenes.unwrap_or_default())
        .map_err(|e| ApiError::BadRequest(format!("imagenes inválidas: {e}")))?;
    let caracteristicas = serde_json::to_value(req.caracteristicas.unwrap_or_default())
        .map_err(|e| ApiError::BadRequest(format!("caracteristicas inválidas: {e}")))?;
    let mut conn = state.pool.get().await?;
    let inmueble = repo::crear_inmueble(
        &mut conn,
        NuevoInmueble {
            conjunto_id: user.conjunto_id,
            usuario_id: user.id,
            titulo: req.titulo.trim().to_string(),
            descripcion: req.descripcion.trim().to_string(),
            precio: req.precio,
            tipo_negocio: req.tipo_negocio,
            tipo_unidad: req.tipo_unidad,
            habitaciones: req.habitaciones.unwrap_or(0),
            banos: req.banos.unwrap_or(0),
            area: req.area,
            imagenes,
            caracteristicas,
        },
    )
    .await?;
    let dto = InmuebleDto::from(inmueble);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "inmueble".into(),
                action: "created".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}
