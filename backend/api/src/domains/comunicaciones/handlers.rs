use axum::extract::{Path, State};
use axum::routing::{delete, get};
use axum::{Json, Router};
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::auth::guard;
use crate::db::enums::Rol;
use crate::domains::comunicaciones::dto::{
    AnuncioDto, CreateAnuncioRequest, DeleteAnuncioResponse, DirectorioEntradaDto,
};
use crate::domains::comunicaciones::models::NuevoAnuncio;
use crate::domains::comunicaciones::repo;
use crate::error::{ApiError, ApiResult};
use crate::services::ws_hub::WsEvent;
use crate::state::AppState;

/// Publishing roles for the conjunto board (specs/008).
const ROLES_PUBLICAR: &[Rol] = &[Rol::Administrador, Rol::Concejo];

/// Directory readers per legacy /api/user/directory role list.
const ROLES_DIRECTORIO: &[Rol] = &[
    Rol::Administrador,
    Rol::Concejo,
    Rol::Vigilante,
    Rol::SupervisorVigilancia,
];

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/anuncios", get(listar_anuncios).post(crear_anuncio))
        .route("/anuncios/{id}", delete(eliminar_anuncio))
        .route("/directorio", get(directorio))
}

#[utoipa::path(
    get,
    path = "/api/v1/anuncios",
    tag = "comunicaciones",
    responses(
        (status = 200, description = "Latest 50 announcements of the conjunto, pinned first then newest", body = [AnuncioDto]),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn listar_anuncios(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<AnuncioDto>>> {
    let mut conn = state.pool.get().await?;
    let rows = repo::listar_anuncios(&mut conn, user.conjunto_id).await?;
    Ok(Json(rows.into_iter().map(AnuncioDto::from).collect()))
}

#[utoipa::path(
    post,
    path = "/api/v1/anuncios",
    tag = "comunicaciones",
    request_body = CreateAnuncioRequest,
    responses(
        (status = 200, description = "Announcement published; every active resident gets an INFO notification", body = AnuncioDto),
        (status = 400, description = "Missing required fields"),
        (status = 403, description = "Requires ADMINISTRADOR or CONCEJO role")
    )
)]
pub async fn crear_anuncio(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreateAnuncioRequest>,
) -> ApiResult<Json<AnuncioDto>> {
    guard::require(&user, ROLES_PUBLICAR)?;
    if req.titulo.trim().is_empty() || req.contenido.trim().is_empty() {
        return Err(ApiError::BadRequest(
            "titulo y contenido son obligatorios".into(),
        ));
    }
    let archivos_url = serde_json::to_value(req.archivos_url.unwrap_or_default())
        .map_err(|e| ApiError::BadRequest(format!("archivosUrl inválido: {e}")))?;
    let mut conn = state.pool.get().await?;
    let anuncio = repo::crear_anuncio_con_notificaciones(
        &mut conn,
        NuevoAnuncio {
            conjunto_id: user.conjunto_id,
            titulo: req.titulo.trim().to_string(),
            contenido: req.contenido.trim().to_string(),
            tipo: req.tipo,
            imagen_url: req.imagen_url,
            archivos_url,
            fijado: req.fijado.unwrap_or(false),
            expires_en: req.expires_en,
        },
    )
    .await?;
    let dto = AnuncioDto::from(anuncio);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "anuncio".into(),
                action: "created".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}

#[utoipa::path(
    delete,
    path = "/api/v1/anuncios/{id}",
    tag = "comunicaciones",
    params(("id" = Uuid, Path, description = "Announcement id")),
    responses(
        (status = 200, description = "Announcement deleted", body = DeleteAnuncioResponse),
        (status = 403, description = "Requires ADMINISTRADOR or CONCEJO role"),
        (status = 404, description = "Announcement not found in this conjunto")
    )
)]
pub async fn eliminar_anuncio(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<DeleteAnuncioResponse>> {
    guard::require(&user, ROLES_PUBLICAR)?;
    let mut conn = state.pool.get().await?;
    let deleted = repo::eliminar_anuncio(&mut conn, user.conjunto_id, id).await?;
    if deleted == 0 {
        return Err(ApiError::NotFound("anuncio no encontrado".into()));
    }
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "anuncio".into(),
                action: "deleted".into(),
                payload: Some(serde_json::json!({ "id": id })),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(DeleteAnuncioResponse { deleted }))
}

#[utoipa::path(
    get,
    path = "/api/v1/directorio",
    tag = "comunicaciones",
    responses(
        (status = 200, description = "Active residents of the conjunto, Habeas-Data-limited fields", body = [DirectorioEntradaDto]),
        (status = 403, description = "Requires admin, concejo or gate staff role")
    )
)]
pub async fn directorio(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<DirectorioEntradaDto>>> {
    guard::require(&user, ROLES_DIRECTORIO)?;
    let mut conn = state.pool.get().await?;
    let rows = repo::directorio_residentes(&mut conn, user.conjunto_id).await?;
    Ok(Json(
        rows.into_iter()
            .map(|(id, nombre, torre, apto, telefono)| DirectorioEntradaDto {
                id,
                nombre,
                torre,
                apto,
                telefono,
            })
            .collect(),
    ))
}
