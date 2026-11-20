use axum::extract::{Path, State};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::auth::guard;
use crate::db::enums::Rol;
use crate::db::schema::conjuntos;
use crate::domains::ad_spaces::models::{
    AdCampaignMetricsDto, AdCampaignSummaryDto, AdSpaceChangeset, AdSpaceDto, AdSpaceFeedDto,
    CreateAdSpaceRequest, NuevoAdSpace, UpdateAdSpaceRequest,
};
use crate::domains::ad_spaces::repo;
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

/// Only SUPER_ADMIN can manage advertising campaigns & spaces.
const SUPER_ADMIN_ONLY: &[Rol] = &[Rol::SuperAdmin];

pub fn router() -> Router<AppState> {
    Router::new()
        // SuperAdmin multi-conjunto ad publisher
        .route("/superadmin/ad-spaces", get(list_campaigns).post(create_campaign))
        .route(
            "/superadmin/ad-spaces/{campana_id}",
            put(update_campaign).delete(delete_campaign),
        )
        .route(
            "/superadmin/ad-spaces/{campana_id}/toggle",
            put(toggle_campaign),
        )
        .route(
            "/superadmin/ad-spaces/{campana_id}/metrics",
            get(campaign_metrics),
        )
        // Legacy per-conjunto CRUD (now also restricted to SUPER_ADMIN)
        .route("/admin/ad-spaces", get(list).post(create))
        .route(
            "/admin/ad-spaces/{id}",
            get(get_one).put(update).delete(delete_handler),
        )
        // Público (feed filtrado por conjunto, fechas, franja horaria y tope)
        .route("/ad-spaces/active", get(active_for_feed))
        // Tracking detallado (impresiones + clics con hora local y usuario)
        .route("/ad-spaces/{id}/impress", post(impression))
        .route("/ad-spaces/{id}/click", post(click))
}

// ── SuperAdmin Campaign Publisher ───────────────────────────────────────────

/// GET /api/v1/superadmin/ad-spaces — list all ad campaigns across all conjuntos.
async fn list_campaigns(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<AdCampaignSummaryDto>>> {
    guard::require(&user, SUPER_ADMIN_ONLY)?;
    let mut conn = state.pool.get().await?;
    let campaigns = repo::list_campaigns(&mut conn).await?;
    Ok(Json(campaigns))
}

/// POST /api/v1/superadmin/ad-spaces — create an ad campaign targeting ALL or selected conjuntos.
async fn create_campaign(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreateAdSpaceRequest>,
) -> ApiResult<Json<AdCampaignSummaryDto>> {
    guard::require(&user, SUPER_ADMIN_ONLY)?;
    let nombre = req.nombre.trim().to_string();
    if nombre.is_empty() {
        return Err(ApiError::BadRequest("nombre de campaña es obligatorio".into()));
    }
    if req.fin_en <= req.inicio_en {
        return Err(ApiError::BadRequest(
            "la fecha de fin debe ser posterior a la fecha de inicio".into(),
        ));
    }

    let hora_inicio = req.hora_inicio.unwrap_or(0).clamp(0, 23);
    let hora_fin = req.hora_fin.unwrap_or(23).clamp(0, 23);
    let dias_semana = req
        .dias_semana
        .filter(|d| !d.trim().is_empty())
        .unwrap_or_else(|| "1,2,3,4,5,6,7".to_string());
    let prioridad = req.prioridad.unwrap_or(1).clamp(1, 3);
    let posicion = if req.posicion.trim().is_empty() {
        "FEED".to_string()
    } else {
        req.posicion.trim().to_string()
    };

    let mut conn = state.pool.get().await?;
    let target_conjuntos: Vec<(Uuid, String)> = match req.conjunto_ids {
        Some(ids) if !ids.is_empty() => {
            conjuntos::table
                .filter(conjuntos::id.eq_any(&ids))
                .select((conjuntos::id, conjuntos::nombre))
                .load(&mut conn)
                .await?
        }
        _ => {
            conjuntos::table
                .select((conjuntos::id, conjuntos::nombre))
                .load(&mut conn)
                .await?
        }
    };

    if target_conjuntos.is_empty() {
        return Err(ApiError::BadRequest(
            "no se encontraron conjuntos destino válidos".into(),
        ));
    }

    let campana_id = Uuid::new_v4();
    let imagen_url = req.imagen_url.filter(|u| !u.trim().is_empty());
    let link_url = req.link_url.filter(|u| !u.trim().is_empty());
    let cta_texto = req.cta_texto.filter(|u| !u.trim().is_empty());
    let empresa = req.empresa.filter(|u| !u.trim().is_empty());

    let mut nombres = Vec::with_capacity(target_conjuntos.len());
    for (cid, cname) in target_conjuntos {
        let nuevo = NuevoAdSpace {
            conjunto_id: cid,
            nombre: nombre.clone(),
            posicion: posicion.clone(),
            imagen_url: imagen_url.clone(),
            link_url: link_url.clone(),
            activo: true,
            empresa: empresa.clone(),
            inicio_en: req.inicio_en,
            fin_en: req.fin_en,
            campana_id: Some(campana_id),
            hora_inicio,
            hora_fin,
            dias_semana: dias_semana.clone(),
            cta_texto: cta_texto.clone(),
            prioridad,
            max_impresiones: req.max_impresiones,
            max_por_usuario_dia: req.max_por_usuario_dia,
        };
        repo::create(&mut conn, nuevo).await?;
        nombres.push(cname);
    }

    Ok(Json(AdCampaignSummaryDto {
        campana_id,
        nombre,
        empresa,
        posicion,
        imagen_url,
        link_url,
        cta_texto,
        activo: true,
        inicio_en: req.inicio_en,
        fin_en: req.fin_en,
        hora_inicio,
        hora_fin,
        dias_semana,
        prioridad,
        max_impresiones: req.max_impresiones,
        max_por_usuario_dia: req.max_por_usuario_dia,
        conjuntos_count: nombres.len(),
        conjuntos_nombres: nombres,
        impresiones: 0,
        clics: 0,
        ctr: 0.0,
    }))
}

/// PUT /api/v1/superadmin/ad-spaces/{campana_id} — update campaign metadata, schedule, CTA & caps across all conjuntos in the campaign.
async fn update_campaign(
    State(state): State<AppState>,
    user: AuthUser,
    Path(campana_id): Path<Uuid>,
    Json(req): Json<UpdateAdSpaceRequest>,
) -> ApiResult<Json<AdCampaignSummaryDto>> {
    guard::require(&user, SUPER_ADMIN_ONLY)?;
    let mut conn = state.pool.get().await?;
    let changes = AdSpaceChangeset {
        nombre: req.nombre.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
        posicion: req.posicion,
        imagen_url: req.imagen_url.map(|v| if v.trim().is_empty() { None } else { Some(v.trim().to_string()) }),
        link_url: req.link_url.map(|v| if v.trim().is_empty() { None } else { Some(v.trim().to_string()) }),
        activo: req.activo,
        empresa: req.empresa.map(|v| if v.trim().is_empty() { None } else { Some(v.trim().to_string()) }),
        inicio_en: req.inicio_en,
        fin_en: req.fin_en,
        hora_inicio: req.hora_inicio.map(|h| h.clamp(0, 23)),
        hora_fin: req.hora_fin.map(|h| h.clamp(0, 23)),
        dias_semana: req.dias_semana.filter(|d| !d.trim().is_empty()),
        cta_texto: req.cta_texto.map(|v| if v.trim().is_empty() { None } else { Some(v.trim().to_string()) }),
        prioridad: req.prioridad.map(|p| p.clamp(1, 3)),
        max_impresiones: req.max_impresiones.map(|v| if v > 0 { Some(v) } else { None }),
        max_por_usuario_dia: req.max_por_usuario_dia.map(|v| if v > 0 { Some(v) } else { None }),
    };
    let updated = repo::update_campaign(&mut conn, campana_id, changes)
        .await?
        .ok_or_else(|| ApiError::NotFound("campaña no encontrada".into()))?;
    Ok(Json(updated))
}

/// PUT /api/v1/superadmin/ad-spaces/{campana_id}/toggle — pause/resume campaign.
async fn toggle_campaign(
    State(state): State<AppState>,
    user: AuthUser,
    Path(campana_id): Path<Uuid>,
) -> ApiResult<Json<serde_json::Value>> {
    guard::require(&user, SUPER_ADMIN_ONLY)?;
    let mut conn = state.pool.get().await?;
    let activo = repo::toggle_campaign(&mut conn, campana_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("campaña no encontrada".into()))?;
    Ok(Json(serde_json::json!({ "campanaId": campana_id, "activo": activo })))
}

/// DELETE /api/v1/superadmin/ad-spaces/{campana_id} — delete campaign from all conjuntos.
async fn delete_campaign(
    State(state): State<AppState>,
    user: AuthUser,
    Path(campana_id): Path<Uuid>,
) -> ApiResult<Json<serde_json::Value>> {
    guard::require(&user, SUPER_ADMIN_ONLY)?;
    let mut conn = state.pool.get().await?;
    let deleted = repo::delete_campaign(&mut conn, campana_id).await?;
    if deleted == 0 {
        return Err(ApiError::NotFound("campaña no encontrada".into()));
    }
    Ok(Json(serde_json::json!({ "deleted": deleted })))
}

/// GET /api/v1/superadmin/ad-spaces/{campana_id}/metrics — hourly & per-conjunto metrics.
async fn campaign_metrics(
    State(state): State<AppState>,
    user: AuthUser,
    Path(campana_id): Path<Uuid>,
) -> ApiResult<Json<AdCampaignMetricsDto>> {
    guard::require(&user, SUPER_ADMIN_ONLY)?;
    let mut conn = state.pool.get().await?;
    let metrics = repo::campaign_metrics(&mut conn, campana_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("campaña no encontrada".into()))?;
    Ok(Json(metrics))
}

// ── Legacy Admin CRUD (restricted to SUPER_ADMIN) ───────────────────────────

/// GET /api/v1/admin/ad-spaces
#[utoipa::path(
    get,
    path = "/api/v1/admin/ad-spaces",
    tag = "admin",
    responses(
        (status = 200, description = "All ad spaces for the conjunto", body = [AdSpaceDto]),
        (status = 403, description = "Requires super admin role")
    )
)]
async fn list(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<AdSpaceDto>>> {
    guard::require(&user, SUPER_ADMIN_ONLY)?;
    let mut conn = state.pool.get().await?;
    let rows = repo::list_all(&mut conn, user.conjunto_id).await?;
    Ok(Json(rows.into_iter().map(AdSpaceDto::from).collect()))
}

/// POST /api/v1/admin/ad-spaces
#[utoipa::path(
    post,
    path = "/api/v1/admin/ad-spaces",
    tag = "admin",
    request_body = CreateAdSpaceRequest,
    responses(
        (status = 200, description = "Created ad space", body = AdSpaceDto),
        (status = 403, description = "Requires super admin role")
    )
)]
async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreateAdSpaceRequest>,
) -> ApiResult<Json<AdSpaceDto>> {
    guard::require(&user, SUPER_ADMIN_ONLY)?;
    let mut conn = state.pool.get().await?;
    let nuevo = NuevoAdSpace {
        conjunto_id: user.conjunto_id,
        nombre: req.nombre,
        posicion: req.posicion,
        imagen_url: req.imagen_url,
        link_url: req.link_url,
        activo: true,
        empresa: req.empresa,
        inicio_en: req.inicio_en,
        fin_en: req.fin_en,
        campana_id: Some(Uuid::new_v4()),
        hora_inicio: req.hora_inicio.unwrap_or(0).clamp(0, 23),
        hora_fin: req.hora_fin.unwrap_or(23).clamp(0, 23),
        dias_semana: req
            .dias_semana
            .filter(|d| !d.trim().is_empty())
            .unwrap_or_else(|| "1,2,3,4,5,6,7".to_string()),
        cta_texto: req.cta_texto,
        prioridad: req.prioridad.unwrap_or(1).clamp(1, 3),
        max_impresiones: req.max_impresiones,
        max_por_usuario_dia: req.max_por_usuario_dia,
    };
    let ad = repo::create(&mut conn, nuevo).await?;
    Ok(Json(AdSpaceDto::from(ad)))
}

/// GET /api/v1/admin/ad-spaces/{id}
#[utoipa::path(
    get,
    path = "/api/v1/admin/ad-spaces/{id}",
    tag = "admin",
    params(("id" = Uuid, Path, description = "Ad space id")),
    responses(
        (status = 200, description = "Ad space", body = AdSpaceDto),
        (status = 404, description = "Not found"),
        (status = 403, description = "Requires super admin role")
    )
)]
async fn get_one(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<AdSpaceDto>> {
    guard::require(&user, SUPER_ADMIN_ONLY)?;
    let mut conn = state.pool.get().await?;
    let ad = repo::find_by_id(&mut conn, user.conjunto_id, id)
        .await?
        .ok_or_else(|| ApiError::NotFound("espacio publicitario no encontrado".into()))?;
    Ok(Json(AdSpaceDto::from(ad)))
}

/// PUT /api/v1/admin/ad-spaces/{id}
#[utoipa::path(
    put,
    path = "/api/v1/admin/ad-spaces/{id}",
    tag = "admin",
    params(("id" = Uuid, Path, description = "Ad space id")),
    request_body = UpdateAdSpaceRequest,
    responses(
        (status = 200, description = "Updated ad space", body = AdSpaceDto),
        (status = 404, description = "Not found"),
        (status = 403, description = "Requires super admin role")
    )
)]
async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateAdSpaceRequest>,
) -> ApiResult<Json<AdSpaceDto>> {
    guard::require(&user, SUPER_ADMIN_ONLY)?;
    let mut conn = state.pool.get().await?;

    let changes = AdSpaceChangeset {
        nombre: req.nombre,
        posicion: req.posicion,
        imagen_url: req.imagen_url.map(|v| if v.is_empty() { None } else { Some(v) }),
        link_url: req.link_url.map(|v| if v.is_empty() { None } else { Some(v) }),
        activo: req.activo,
        empresa: req.empresa.map(|v| if v.is_empty() { None } else { Some(v) }),
        inicio_en: req.inicio_en,
        fin_en: req.fin_en,
        hora_inicio: req.hora_inicio.map(|h| h.clamp(0, 23)),
        hora_fin: req.hora_fin.map(|h| h.clamp(0, 23)),
        dias_semana: req.dias_semana,
        cta_texto: req.cta_texto.map(|v| if v.is_empty() { None } else { Some(v) }),
        prioridad: req.prioridad.map(|p| p.clamp(1, 3)),
        max_impresiones: req.max_impresiones.map(Some),
        max_por_usuario_dia: req.max_por_usuario_dia.map(Some),
    };
    let ad = repo::update(&mut conn, user.conjunto_id, id, changes)
        .await?
        .ok_or_else(|| ApiError::NotFound("espacio publicitario no encontrado".into()))?;
    Ok(Json(AdSpaceDto::from(ad)))
}

/// DELETE /api/v1/admin/ad-spaces/{id}
#[utoipa::path(
    delete,
    path = "/api/v1/admin/ad-spaces/{id}",
    tag = "admin",
    params(("id" = Uuid, Path, description = "Ad space id")),
    responses(
        (status = 200, description = "Deleted"),
        (status = 404, description = "Not found"),
        (status = 403, description = "Requires super admin role")
    )
)]
async fn delete_handler(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<serde_json::Value>> {
    guard::require(&user, SUPER_ADMIN_ONLY)?;
    let mut conn = state.pool.get().await?;
    let deleted = repo::delete(&mut conn, user.conjunto_id, id).await?;
    if deleted == 0 {
        return Err(ApiError::NotFound("espacio publicitario no encontrado".into()));
    }
    Ok(Json(serde_json::json!({"deleted": deleted})))
}

// ── Public feed ─────────────────────────────────────────────────────────────

/// GET /api/v1/ad-spaces/active — ads activos para mostrar en el feed.
#[utoipa::path(
    get,
    path = "/api/v1/ad-spaces/active",
    tag = "publicidad",
    responses(
        (status = 200, description = "Active ad spaces for the current conjunto", body = [AdSpaceFeedDto])
    )
)]
async fn active_for_feed(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<AdSpaceFeedDto>>> {
    let mut conn = state.pool.get().await?;
    let ads = repo::list_active_for_feed(&mut conn, user.conjunto_id, user.id).await?;
    Ok(Json(ads))
}

// ── Tracking ────────────────────────────────────────────────────────────────

/// POST /api/v1/ad-spaces/{id}/impress — registrar impresión con hora local y usuario.
#[utoipa::path(
    post,
    path = "/api/v1/ad-spaces/{id}/impress",
    tag = "publicidad",
    params(("id" = Uuid, Path, description = "Ad space id")),
    responses((status = 200, description = "Impression registered"))
)]
async fn impression(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<serde_json::Value>> {
    let mut conn = state.pool.get().await?;
    repo::register_impression(&mut conn, id, Some(user.id)).await?;
    Ok(Json(serde_json::json!({"ok": true})))
}

/// POST /api/v1/ad-spaces/{id}/click — registrar clic con hora local y usuario.
#[utoipa::path(
    post,
    path = "/api/v1/ad-spaces/{id}/click",
    tag = "publicidad",
    params(("id" = Uuid, Path, description = "Ad space id")),
    responses((status = 200, description = "Click registered"))
)]
async fn click(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<serde_json::Value>> {
    let mut conn = state.pool.get().await?;
    repo::register_click(&mut conn, id, Some(user.id)).await?;
    Ok(Json(serde_json::json!({"ok": true})))
}
