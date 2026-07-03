use axum::extract::{Path, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::auth::guard;
use crate::domains::ad_spaces::models::{
    AdSpaceChangeset, AdSpaceDto, AdSpaceFeedDto, CreateAdSpaceRequest, NuevoAdSpace,
    UpdateAdSpaceRequest,
};
use crate::domains::ad_spaces::repo;
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

const ADMIN_ROLES: &[crate::db::enums::Rol] = &[
    crate::db::enums::Rol::Administrador,
    crate::db::enums::Rol::Concejo,
    crate::db::enums::Rol::SuperAdmin,
];

pub fn router() -> Router<AppState> {
    Router::new()
        // Admin CRUD
        .route("/admin/ad-spaces", get(list).post(create))
        .route(
            "/admin/ad-spaces/{id}",
            get(get_one).put(update).delete(delete_handler),
        )
        // Público (feed)
        .route("/ad-spaces/active", get(active_for_feed))
        // Tracking
        .route("/ad-spaces/{id}/impress", post(impression))
        .route("/ad-spaces/{id}/click", post(click))
}

// ── Admin: list all ─────────────────────────────────────────────────────────

/// GET /api/v1/admin/ad-spaces
#[utoipa::path(
    get,
    path = "/api/v1/admin/ad-spaces",
    tag = "admin",
    responses(
        (status = 200, description = "All ad spaces for the conjunto", body = [AdSpaceDto]),
        (status = 403, description = "Requires admin role")
    )
)]
async fn list(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<AdSpaceDto>>> {
    guard::require(&user, ADMIN_ROLES)?;
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
        (status = 403, description = "Requires admin role")
    )
)]
async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreateAdSpaceRequest>,
) -> ApiResult<Json<AdSpaceDto>> {
    guard::require(&user, ADMIN_ROLES)?;
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
        (status = 403, description = "Requires admin role")
    )
)]
async fn get_one(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<AdSpaceDto>> {
    guard::require(&user, ADMIN_ROLES)?;
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
        (status = 403, description = "Requires admin role")
    )
)]
async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateAdSpaceRequest>,
) -> ApiResult<Json<AdSpaceDto>> {
    guard::require(&user, ADMIN_ROLES)?;
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
        (status = 403, description = "Requires admin role")
    )
)]
async fn delete_handler(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<serde_json::Value>> {
    guard::require(&user, ADMIN_ROLES)?;
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
    let ads = repo::list_active_for_feed(&mut conn, user.conjunto_id).await?;
    Ok(Json(ads))
}

// ── Tracking ────────────────────────────────────────────────────────────────

/// POST /api/v1/ad-spaces/{id}/impress — registrar impresión.
#[utoipa::path(
    post,
    path = "/api/v1/ad-spaces/{id}/impress",
    tag = "publicidad",
    params(("id" = Uuid, Path, description = "Ad space id")),
    responses((status = 200, description = "Impression registered"))
)]
async fn impression(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<serde_json::Value>> {
    let mut conn = state.pool.get().await?;
    repo::register_impression(&mut conn, id).await?;
    Ok(Json(serde_json::json!({"ok": true})))
}

/// POST /api/v1/ad-spaces/{id}/click — registrar clic.
#[utoipa::path(
    post,
    path = "/api/v1/ad-spaces/{id}/click",
    tag = "publicidad",
    params(("id" = Uuid, Path, description = "Ad space id")),
    responses((status = 200, description = "Click registered"))
)]
async fn click(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<serde_json::Value>> {
    let mut conn = state.pool.get().await?;
    repo::register_click(&mut conn, id).await?;
    Ok(Json(serde_json::json!({"ok": true})))
}
