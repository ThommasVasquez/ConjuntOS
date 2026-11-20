use std::collections::{HashMap, HashSet};

use axum::extract::{Path, State};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use chrono::Timelike;
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::auth::guard;
use crate::db::enums::{Rol, TipoAnuncio};
use crate::db::schema::{anuncio_events, anuncios, conjuntos};
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
        .route("/anuncios/{id}/view", post(registrar_vista_anuncio))
        .route("/anuncios/{id}/cta-click", post(registrar_clic_cta_anuncio))
        .route("/superadmin/anuncios", get(listar_anuncios_globales).post(crear_anuncio_global))
        .route(
            "/superadmin/anuncios/{id}",
            put(actualizar_anuncio_global).delete(eliminar_anuncio_global),
        )
        .route("/superadmin/anuncios/{id}/stats", get(estadisticas_anuncio_global))
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
    let archivos_vec = req.archivos_url.unwrap_or_default();
    let archivos_url = serde_json::to_value(&archivos_vec)
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

// ── Tracking & Stats for SuperAdmin Announcements ───────────────────────────

/// POST /api/v1/anuncios/{id}/view — record announcement view with Colombia local hour.
pub async fn registrar_vista_anuncio(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<serde_json::Value>> {
    let mut conn = state.pool.get().await?;
    let updated: Option<(Uuid,)> = diesel::update(anuncios::table.filter(anuncios::id.eq(id)))
        .set(anuncios::vistas.eq(anuncios::vistas + 1))
        .returning((anuncios::conjunto_id,))
        .get_result(&mut conn)
        .await
        .optional()?;

    if let Some((conjunto_id,)) = updated {
        let hora_local = crate::domains::ad_spaces::repo::colombia_now().hour() as i32;
        let _ = diesel::insert_into(anuncio_events::table)
            .values((
                anuncio_events::anuncio_id.eq(id),
                anuncio_events::conjunto_id.eq(conjunto_id),
                anuncio_events::usuario_id.eq(Some(user.id)),
                anuncio_events::tipo.eq("VIEW"),
                anuncio_events::hora_local.eq(hora_local),
            ))
            .execute(&mut conn)
            .await;
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// POST /api/v1/anuncios/{id}/cta-click — record CTA button click with Colombia local hour.
pub async fn registrar_clic_cta_anuncio(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<serde_json::Value>> {
    let mut conn = state.pool.get().await?;
    let found: Option<(Uuid,)> = anuncios::table
        .filter(anuncios::id.eq(id))
        .select((anuncios::conjunto_id,))
        .first(&mut conn)
        .await
        .optional()?;

    if let Some((conjunto_id,)) = found {
        let hora_local = crate::domains::ad_spaces::repo::colombia_now().hour() as i32;
        let _ = diesel::insert_into(anuncio_events::table)
            .values((
                anuncio_events::anuncio_id.eq(id),
                anuncio_events::conjunto_id.eq(conjunto_id),
                anuncio_events::usuario_id.eq(Some(user.id)),
                anuncio_events::tipo.eq("CTA_CLICK"),
                anuncio_events::hora_local.eq(hora_local),
            ))
            .execute(&mut conn)
            .await;
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnuncioHourlyMetricDto {
    pub hora: i32,
    pub vistas: i64,
    pub clics_cta: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnuncioConjuntoMetricDto {
    pub conjunto_id: Uuid,
    pub conjunto_nombre: String,
    pub vistas: i64,
    pub clics_cta: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalAnuncioStatsDto {
    pub id: Uuid,
    pub titulo: String,
    pub vistas: i64,
    pub usuarios_unicos: i64,
    pub clics_cta: i64,
    pub usuarios_cta_unicos: i64,
    pub ctr: f64,
    pub hora_pico: Option<i32>,
    pub por_hora: Vec<AnuncioHourlyMetricDto>,
    pub por_conjunto: Vec<AnuncioConjuntoMetricDto>,
}

/// GET /api/v1/superadmin/anuncios/{id}/stats — full view + hourly + CTA metrics.
pub async fn estadisticas_anuncio_global(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<GlobalAnuncioStatsDto>> {
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
        return Err(ApiError::NotFound("anuncio no encontrado".into()));
    };

    let siblings: Vec<(Uuid, Uuid, i32)> = anuncios::table
        .filter(anuncios::tipo.eq(TipoAnuncio::Conjuntos))
        .filter(anuncios::titulo.eq(&sample.titulo))
        .filter(anuncios::contenido.eq(&sample.contenido))
        .select((anuncios::id, anuncios::conjunto_id, anuncios::vistas))
        .load(&mut conn)
        .await?;

    let anuncio_ids: Vec<Uuid> = siblings.iter().map(|(aid, _, _)| *aid).collect();
    let conj_rows: Vec<(Uuid, String)> = conjuntos::table
        .select((conjuntos::id, conjuntos::nombre))
        .load(&mut conn)
        .await?;
    let conj_map: HashMap<Uuid, String> = conj_rows.into_iter().collect();

    let events: Vec<(Uuid, String, i32, Option<Uuid>)> = anuncio_events::table
        .filter(anuncio_events::anuncio_id.eq_any(&anuncio_ids))
        .select((
            anuncio_events::conjunto_id,
            anuncio_events::tipo,
            anuncio_events::hora_local,
            anuncio_events::usuario_id,
        ))
        .load(&mut conn)
        .await?;

    let mut hourly_views = [0i64; 24];
    let mut hourly_cta = [0i64; 24];
    let mut unique_viewers: HashSet<Uuid> = HashSet::new();
    let mut unique_cta_users: HashSet<Uuid> = HashSet::new();
    let mut cta_by_conjunto: HashMap<Uuid, i64> = HashMap::new();
    let mut views_from_events: i64 = 0;
    let mut clics_cta: i64 = 0;

    for (cid, tipo, hora, uid) in events {
        let h = hora.clamp(0, 23) as usize;
        if tipo == "VIEW" {
            hourly_views[h] += 1;
            views_from_events += 1;
            if let Some(u) = uid {
                unique_viewers.insert(u);
            }
        } else if tipo == "CTA_CLICK" {
            hourly_cta[h] += 1;
            clics_cta += 1;
            *cta_by_conjunto.entry(cid).or_insert(0) += 1;
            if let Some(u) = uid {
                unique_cta_users.insert(u);
            }
        }
    }

    let vistas_sum: i64 = siblings.iter().map(|(_, _, v)| i64::from(*v)).sum();
    let vistas = vistas_sum.max(views_from_events);
    let ctr = if vistas > 0 {
        ((clics_cta as f64 / vistas as f64) * 10_000.0).round() / 100.0
    } else {
        0.0
    };

    let por_hora: Vec<AnuncioHourlyMetricDto> = (0..24)
        .map(|h| AnuncioHourlyMetricDto {
            hora: h as i32,
            vistas: hourly_views[h],
            clics_cta: hourly_cta[h],
        })
        .collect();

    let hora_pico = por_hora
        .iter()
        .filter(|h| h.vistas > 0)
        .max_by_key(|h| h.vistas)
        .map(|h| h.hora);

    let mut por_conjunto: Vec<AnuncioConjuntoMetricDto> = siblings
        .into_iter()
        .map(|(_, cid, v)| AnuncioConjuntoMetricDto {
            conjunto_id: cid,
            conjunto_nombre: conj_map
                .get(&cid)
                .cloned()
                .unwrap_or_else(|| "Conjunto".to_string()),
            vistas: i64::from(v),
            clics_cta: *cta_by_conjunto.get(&cid).unwrap_or(&0),
        })
        .collect();
    por_conjunto.sort_by(|a, b| b.vistas.cmp(&a.vistas));

    Ok(Json(GlobalAnuncioStatsDto {
        id: sample.id,
        titulo: sample.titulo,
        vistas,
        usuarios_unicos: unique_viewers.len() as i64,
        clics_cta,
        usuarios_cta_unicos: unique_cta_users.len() as i64,
        ctr,
        hora_pico,
        por_hora,
        por_conjunto,
    }))
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
    pub archivos_url: Vec<String>,
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
            let archivos_url: Vec<String> =
                serde_json::from_value(a.archivos_url).unwrap_or_default();
            out.push(GlobalAnuncioSummaryDto {
                id: a.id,
                titulo: a.titulo,
                contenido: a.contenido,
                imagen_url: a.imagen_url,
                archivos_url,
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
    let archivos_vec = req.archivos_url.unwrap_or_default();
    let archivos_url = serde_json::to_value(&archivos_vec)
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
        archivos_url: archivos_vec,
        fijado,
        publicado_en: first_pub,
        conjuntos_count: published,
    }))
}

/// PUT /api/v1/superadmin/anuncios/{id} — edit a global ConjuntOS® announcement
/// across all conjuntos where it was published.
pub async fn actualizar_anuncio_global(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
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

    let imagen_url = req.imagen_url.filter(|u| !u.trim().is_empty());
    let archivos_vec = req.archivos_url.unwrap_or_default();
    let archivos_url = serde_json::to_value(&archivos_vec)
        .map_err(|e| ApiError::BadRequest(format!("archivosUrl inválido: {e}")))?;
    let fijado = req.fijado.unwrap_or(sample.fijado);

    let updated_rows: Vec<crate::domains::comunicaciones::models::Anuncio> = diesel::update(
        anuncios::table
            .filter(anuncios::tipo.eq(TipoAnuncio::Conjuntos))
            .filter(anuncios::titulo.eq(&sample.titulo))
            .filter(anuncios::contenido.eq(&sample.contenido)),
    )
    .set((
        anuncios::titulo.eq(&titulo),
        anuncios::contenido.eq(&contenido),
        anuncios::imagen_url.eq(&imagen_url),
        anuncios::archivos_url.eq(&archivos_url),
        anuncios::fijado.eq(fijado),
    ))
    .returning(crate::domains::comunicaciones::models::Anuncio::as_returning())
    .load(&mut conn)
    .await?;

    let count = updated_rows.len();
    for a in updated_rows {
        let cid = a.conjunto_id;
        let dto = AnuncioDto::from(a);
        state
            .ws_hub
            .publish(
                cid,
                WsEvent {
                    domain: "anuncio".into(),
                    action: "updated".into(),
                    payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                    target_user_id: None,
                },
            )
            .await;
    }

    Ok(Json(GlobalAnuncioSummaryDto {
        id: sample.id,
        titulo,
        contenido,
        imagen_url,
        archivos_url: archivos_vec,
        fijado,
        publicado_en: sample.publicado_en,
        conjuntos_count: count,
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
