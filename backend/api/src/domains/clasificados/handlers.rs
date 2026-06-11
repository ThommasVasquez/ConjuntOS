use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};

use crate::auth::extract::AuthUser;
use crate::domains::clasificados::dto::{ClasificadoDto, CreateClasificadoRequest};
use crate::domains::clasificados::models::NuevoLocal;
use crate::domains::clasificados::repo;
use crate::error::{ApiError, ApiResult};
use crate::services::ws_hub::WsEvent;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/clasificados",
        get(listar_clasificados).post(crear_clasificado),
    )
}

#[utoipa::path(
    get,
    path = "/api/v1/clasificados",
    tag = "clasificados",
    responses(
        (status = 200, description = "Latest 50 active classifieds of the conjunto with seller contact", body = [ClasificadoDto]),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn listar_clasificados(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<ClasificadoDto>>> {
    let mut conn = state.pool.get().await?;
    let rows = repo::listar_clasificados(&mut conn, user.conjunto_id).await?;
    Ok(Json(
        rows.into_iter().map(ClasificadoDto::from_row).collect(),
    ))
}

#[utoipa::path(
    post,
    path = "/api/v1/clasificados",
    tag = "clasificados",
    request_body = CreateClasificadoRequest,
    responses(
        (status = 200, description = "Classified published (caller becomes propietario)", body = ClasificadoDto),
        (status = 400, description = "Missing required fields"),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn crear_clasificado(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreateClasificadoRequest>,
) -> ApiResult<Json<ClasificadoDto>> {
    if req.nombre.trim().is_empty() {
        return Err(ApiError::BadRequest("el nombre es obligatorio".into()));
    }
    let mut conn = state.pool.get().await?;
    let local = repo::crear_clasificado(
        &mut conn,
        NuevoLocal {
            conjunto_id: user.conjunto_id,
            nombre: req.nombre.trim().to_string(),
            categoria: req.categoria,
            descripcion: req.descripcion,
            precio: req.precio,
            imagen_url: req.imagen_url,
            telefono: req.telefono,
            whatsapp: req.whatsapp,
            propietario_id: Some(user.id),
        },
    )
    .await?;
    // Seller contact comes joined on list reads; the create response carries
    // the caller's name from the verified claims.
    let propietario = Some((user.nombre, local.telefono.clone()));
    let dto = ClasificadoDto::from_row((local, propietario));
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "clasificado".into(),
                action: "created".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}
