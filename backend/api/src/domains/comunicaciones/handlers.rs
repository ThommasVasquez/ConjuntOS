use axum::extract::{Path, State};
use axum::routing::{delete, get, put};
use axum::{Json, Router};
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::auth::guard;
use crate::db::enums::{Rol, TipoAnuncio};
use crate::db::schema::{anuncios, conjuntos};
use crate::domains::comunicaciones::dto::{
    AnuncioDto, CreateAnuncioRequest, DeleteAnuncioResponse, DirectorioEntradaDto,
    UpdateAnuncioRequest,
};
use crate::domains::comunicaciones::models::{AnuncioCambios, NuevoAnuncio};
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
    // El encargado de parqueadero necesita el directorio para asignar celdas de
    // visitante a un residente (selector de residente en el mapa).
    Rol::EncargadoParqueadero,
];

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/anuncios", get(listar_anuncios).post(crear_anuncio))
        .route("/anuncios/{id}", put(actualizar_anuncio).delete(eliminar_anuncio))
        .route("/superadmin/anuncios", get(listar_anuncios_globales).post(crear_anuncio_global))
        .route("/superadmin/anuncios/{id}", delete(eliminar_anuncio_global))
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
    if matches!(req.tipo, TipoAnuncio::Conjuntos) && !matches!(user.rol, Rol::SuperAdmin) {
        return Err(ApiError::Forbidden);
    }
    if req.titulo.trim().is_empty() || req.contenido.trim().is_empty() {
        return Err(ApiError::BadRequest(
            "titulo y contenido son obligatorios".into(),
        ));
    }
    let archivos_url = serde_json::to_value(req.archivos_url.unwrap_or_default())
        .map_err(|e| ApiError::BadRequest(format!("archivosUrl inválido: {e}")))?;
    let effective_tipo = if matches!(user.rol, Rol::SuperAdmin) {
        TipoAnuncio::Conjuntos
    } else {
        req.tipo
    };
    let mut conn = state.pool.get().await?;
    let anuncio = repo::crear_anuncio_con_notificaciones(
        &mut conn,
        NuevoAnuncio {
            conjunto_id: user.conjunto_id,
            titulo: req.titulo.trim().to_string(),
            contenido: req.contenido.trim().to_string(),
            tipo: effective_tipo,
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
    put,
    path = "/api/v1/anuncios/{id}",
    tag = "comunicaciones",
    params(("id" = Uuid, Path, description = "Announcement id")),
    request_body = UpdateAnuncioRequest,
    responses(
        (status = 200, description = "Announcement updated", body = AnuncioDto),
        (status = 400, description = "Invalid fields"),
        (status = 403, description = "Requires ADMINISTRADOR or CONCEJO role"),
        (status = 404, description = "Announcement not found in this conjunto")
    )
)]
pub async fn actualizar_anuncio(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateAnuncioRequest>,
) -> ApiResult<Json<AnuncioDto>> {
    guard::require(&user, ROLES_PUBLICAR)?;

    // Validate non-empty when the field is being changed.
    if let Some(ref t) = req.titulo {
        if t.trim().is_empty() {
            return Err(ApiError::BadRequest("titulo no puede estar vacío".into()));
        }
    }
    if let Some(ref c) = req.contenido {
        if c.trim().is_empty() {
            return Err(ApiError::BadRequest(
                "contenido no puede estar vacío".into(),
            ));
        }
    }

    let archivos_url = match req.archivos_url {
        Some(v) => Some(
            serde_json::to_value(v)
                .map_err(|e| ApiError::BadRequest(format!("archivosUrl inválido: {e}")))?,
        ),
        None => None,
    };

    let cambios = AnuncioCambios {
        titulo: req.titulo.map(|t| t.trim().to_string()),
        contenido: req.contenido.map(|c| c.trim().to_string()),
        tipo: req.tipo,
        imagen_url: req.imagen_url.map(Some),
        archivos_url,
        fijado: req.fijado,
        expires_en: req.expires_en.map(Some),
    };

    let mut conn = state.pool.get().await?;
    let anuncio = repo::update_anuncio(&mut conn, user.conjunto_id, id, cambios)
        .await?
        .ok_or_else(|| ApiError::NotFound("anuncio no encontrado".into()))?;
    let dto = AnuncioDto::from(anuncio);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "anuncio".into(),
                action: "updated".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
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

// ── SuperAdmin Global ConjuntOS® Announcements ───────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateGlobalAnuncioRequest {
    pub titulo: String,
    pub contenido: String,
    pub imagen_url: Option<String>,
    pub archivos_url: Option<Vec<String>>,
    pub fijado: Option<bool>,
    /// Optional subset of conjunto IDs; when omitted/empty, publishes to ALL conjuntos.
    pub conjunto_ids: Option<Vec<Uuid>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalAnuncioSummaryDto {
    pub id: Uuid,
    pub titulo: String,
    pub contenido: String,
    pub imagen_url: Option<String>,
    pub fijado: bool,
    pub publicado_en: chrono::DateTime<chrono::Utc>,
    pub conjuntos_count: usize,
}

/// GET /api/v1/superadmin/anuncios — list deduplicated global ConjuntOS® announcements.
pub async fn listar_anuncios_globales(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<GlobalAnuncioSummaryDto>>> {
    guard::require(&user, &[Rol::SuperAdmin])?;
    let mut conn = state.pool.get().await?;

    let rows: Vec<crate::domains::comunicaciones::models::Anuncio> = anuncios::table
        .filter(anuncios::tipo.eq(TipoAnuncio::Conjuntos))
        .order(anuncios::publicado_en.desc())
        .limit(200)
        .select(crate::domains::comunicaciones::models::Anuncio::as_select())
        .load(&mut conn)
        .await?;

    let mut out: Vec<GlobalAnuncioSummaryDto> = Vec::new();
    for a in rows {
        if let Some(existing) = out
            .iter_mut()
            .find(|g| g.titulo == a.titulo && g.contenido == a.contenido)
        {
            existing.conjuntos_count += 1;
        } else {
            out.push(GlobalAnuncioSummaryDto {
                id: a.id,
                titulo: a.titulo,
                contenido: a.contenido,
                imagen_url: a.imagen_url,
                fijado: a.fijado,
                publicado_en: a.publicado_en,
                conjuntos_count: 1,
            });
        }
    }

    Ok(Json(out))
}

/// POST /api/v1/superadmin/anuncios — publish an official ConjuntOS® announcement
/// to all conjuntos (or a specified list of conjuntos).
pub async fn crear_anuncio_global(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreateGlobalAnuncioRequest>,
) -> ApiResult<Json<GlobalAnuncioSummaryDto>> {
    guard::require(&user, &[Rol::SuperAdmin])?;
    let titulo = req.titulo.trim().to_string();
    let contenido = req.contenido.trim().to_string();
    if titulo.is_empty() || contenido.is_empty() {
        return Err(ApiError::BadRequest(
            "titulo y contenido son obligatorios".into(),
        ));
    }

    let mut conn = state.pool.get().await?;
    let target_conjuntos: Vec<Uuid> = match req.conjunto_ids {
        Some(ids) if !ids.is_empty() => ids,
        _ => conjuntos::table.select(conjuntos::id).load(&mut conn).await?,
    };

    let mut first_id: Option<Uuid> = None;
    let mut first_pub = chrono::Utc::now();
    let mut published = 0usize;
    let imagen_url = req.imagen_url.filter(|u| !u.trim().is_empty());
    let archivos_url = serde_json::to_value(req.archivos_url.unwrap_or_default())
        .map_err(|e| ApiError::BadRequest(format!("archivosUrl inválido: {e}")))?;
    let fijado = req.fijado.unwrap_or(true);

    for cid in target_conjuntos {
        let anuncio = repo::crear_anuncio_con_notificaciones(
            &mut conn,
            NuevoAnuncio {
                conjunto_id: cid,
                titulo: titulo.clone(),
                contenido: contenido.clone(),
                tipo: TipoAnuncio::Conjuntos,
                imagen_url: imagen_url.clone(),
                archivos_url: archivos_url.clone(),
                fijado,
                expires_en: None,
            },
        )
        .await?;

        if first_id.is_none() {
            first_id = Some(anuncio.id);
            first_pub = anuncio.publicado_en;
        }
        published += 1;

        let dto = AnuncioDto::from(anuncio);
        state
            .ws_hub
            .publish(
                cid,
                WsEvent {
                    domain: "anuncio".into(),
                    action: "created".into(),
                    payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                    target_user_id: None,
                },
            )
            .await;
    }

    Ok(Json(GlobalAnuncioSummaryDto {
        id: first_id.unwrap_or_else(Uuid::new_v4),
        titulo,
        contenido,
        imagen_url,
        fijado,
        publicado_en: first_pub,
        conjuntos_count: published,
    }))
}

/// DELETE /api/v1/superadmin/anuncios/{id} — remove a global ConjuntOS® announcement
/// across every conjunto where it was published.
pub async fn eliminar_anuncio_global(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<DeleteAnuncioResponse>> {
    guard::require(&user, &[Rol::SuperAdmin])?;
    let mut conn = state.pool.get().await?;

    let sample: Option<crate::domains::comunicaciones::models::Anuncio> = anuncios::table
        .filter(anuncios::id.eq(id))
        .filter(anuncios::tipo.eq(TipoAnuncio::Conjuntos))
        .select(crate::domains::comunicaciones::models::Anuncio::as_select())
        .first(&mut conn)
        .await
        .optional()?;

    let Some(sample) = sample else {
        return Err(ApiError::NotFound("anuncio global no encontrado".into()));
    };

    let affected_conjuntos: Vec<Uuid> = anuncios::table
        .filter(anuncios::tipo.eq(TipoAnuncio::Conjuntos))
        .filter(anuncios::titulo.eq(&sample.titulo))
        .filter(anuncios::contenido.eq(&sample.contenido))
        .select(anuncios::conjunto_id)
        .load(&mut conn)
        .await?;

    let deleted = diesel::delete(
        anuncios::table
            .filter(anuncios::tipo.eq(TipoAnuncio::Conjuntos))
            .filter(anuncios::titulo.eq(&sample.titulo))
            .filter(anuncios::contenido.eq(&sample.contenido)),
    )
    .execute(&mut conn)
    .await?;

    for cid in affected_conjuntos {
        state
            .ws_hub
            .publish(
                cid,
                WsEvent {
                    domain: "anuncio".into(),
                    action: "deleted".into(),
                    payload: Some(serde_json::json!({ "id": id })),
                    target_user_id: None,
                },
            )
            .await;
    }

    Ok(Json(DeleteAnuncioResponse { deleted }))
}
