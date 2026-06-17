use axum::extract::{Path, Query, State};
use axum::routing::{get, put};
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::auth::guard;
use crate::db::enums::{CatServicio, EstadoSolicitud, Rol};
use crate::db::schema::solicitudes_servicio;
use crate::db::DbConn;
use crate::error::{ApiError, ApiResult};
use crate::services::ws_hub::WsEvent;
use crate::state::AppState;

// ── Models ───────────────────────────────────────────────────────────────────

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = solicitudes_servicio, check_for_backend(diesel::pg::Pg))]
pub struct SolicitudServicio {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub usuario_id: Uuid,
    pub categoria: CatServicio,
    pub tipo: String,
    pub descripcion: String,
    pub urgente: bool,
    /// `Vec<String>` of image URLs.
    pub imagenes: serde_json::Value,
    pub estado: EstadoSolicitud,
    pub proveedor_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = solicitudes_servicio)]
pub struct NuevaSolicitudServicio {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub usuario_id: Uuid,
    pub categoria: CatServicio,
    pub tipo: String,
    pub descripcion: String,
    pub urgente: bool,
    pub imagenes: serde_json::Value,
    pub estado: String,
    pub created_at: DateTime<Utc>,
}

// ── DTOs ─────────────────────────────────────────────────────────────────────

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SolicitudServicioDto {
    pub id: Uuid,
    pub usuario_id: Uuid,
    pub categoria: CatServicio,
    pub tipo: String,
    pub descripcion: String,
    pub urgente: bool,
    pub imagenes: Vec<String>,
    pub estado: EstadoSolicitud,
    pub proveedor_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
}

impl From<SolicitudServicio> for SolicitudServicioDto {
    fn from(s: SolicitudServicio) -> Self {
        let imagenes: Vec<String> = serde_json::from_value(s.imagenes).unwrap_or_default();
        Self {
            id: s.id,
            usuario_id: s.usuario_id,
            categoria: s.categoria,
            tipo: s.tipo,
            descripcion: s.descripcion,
            urgente: s.urgente,
            imagenes,
            estado: s.estado,
            proveedor_id: s.proveedor_id,
            created_at: s.created_at,
        }
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateSolicitudServicioRequest {
    pub categoria: CatServicio,
    pub tipo: String,
    pub descripcion: String,
    pub urgente: bool,
    pub imagenes: Option<Vec<String>>,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSolicitudServicioRequest {
    pub estado: Option<EstadoSolicitud>,
    pub proveedor_id: Option<Uuid>,
    pub notas: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminSolicitudesQuery {
    pub estado: Option<EstadoSolicitud>,
    pub categoria: Option<CatServicio>,
    pub urgente: Option<bool>,
}

// ── Repo (inline) ────────────────────────────────────────────────────────────

async fn listar_mis_solicitudes(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    usuario_id: Uuid,
) -> ApiResult<Vec<SolicitudServicio>> {
    let rows = solicitudes_servicio::table
        .filter(solicitudes_servicio::conjunto_id.eq(conjunto_id))
        .filter(solicitudes_servicio::usuario_id.eq(usuario_id))
        .order(solicitudes_servicio::created_at.desc())
        .select(SolicitudServicio::as_select())
        .load(conn)
        .await?;
    Ok(rows)
}

async fn find_solicitud(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    id: Uuid,
) -> ApiResult<Option<SolicitudServicio>> {
    let row = solicitudes_servicio::table
        .filter(solicitudes_servicio::id.eq(id))
        .filter(solicitudes_servicio::conjunto_id.eq(conjunto_id))
        .select(SolicitudServicio::as_select())
        .first(conn)
        .await
        .optional()?;
    Ok(row)
}

async fn crear_solicitud_servicio(
    conn: &mut DbConn,
    nueva: NuevaSolicitudServicio,
) -> ApiResult<SolicitudServicio> {
    let row: SolicitudServicio = diesel::insert_into(solicitudes_servicio::table)
        .values(&nueva)
        .returning(SolicitudServicio::as_returning())
        .get_result(conn)
        .await?;
    Ok(row)
}

async fn listar_admin_solicitudes(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    filtros: &AdminSolicitudesQuery,
) -> ApiResult<Vec<SolicitudServicio>> {
    let mut query = solicitudes_servicio::table
        .filter(solicitudes_servicio::conjunto_id.eq(conjunto_id))
        .into_boxed();

    if let Some(ref estado) = filtros.estado {
        query = query.filter(solicitudes_servicio::estado.eq(estado.clone()));
    }
    if let Some(ref categoria) = filtros.categoria {
        query = query.filter(solicitudes_servicio::categoria.eq(categoria.clone()));
    }
    if let Some(urgente) = filtros.urgente {
        query = query.filter(solicitudes_servicio::urgente.eq(urgente));
    }

    let rows = query
        .order(solicitudes_servicio::created_at.desc())
        .select(SolicitudServicio::as_select())
        .load(conn)
        .await?;
    Ok(rows)
}

async fn actualizar_solicitud(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    id: Uuid,
    req: &UpdateSolicitudServicioRequest,
) -> ApiResult<SolicitudServicio> {
    let target = solicitudes_servicio::table
        .filter(solicitudes_servicio::id.eq(id))
        .filter(solicitudes_servicio::conjunto_id.eq(conjunto_id));

    let row = match (&req.estado, &req.proveedor_id) {
        (Some(estado), Some(proveedor_id)) => {
            diesel::update(target)
                .set((
                    solicitudes_servicio::estado.eq(estado.clone()),
                    solicitudes_servicio::proveedor_id.eq(Some(*proveedor_id)),
                ))
                .returning(SolicitudServicio::as_returning())
                .get_result(conn)
                .await?
        }
        (Some(estado), None) => {
            diesel::update(target)
                .set(solicitudes_servicio::estado.eq(estado.clone()))
                .returning(SolicitudServicio::as_returning())
                .get_result(conn)
                .await?
        }
        (None, Some(proveedor_id)) => {
            diesel::update(target)
                .set(solicitudes_servicio::proveedor_id.eq(Some(*proveedor_id)))
                .returning(SolicitudServicio::as_returning())
                .get_result(conn)
                .await?
        }
        (None, None) => {
            return Err(ApiError::BadRequest(
                "al menos estado o proveedor_id es requerido".into(),
            ));
        }
    };
    Ok(row)
}

// ── Router ───────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        // Resident endpoints
        .route(
            "/solicitudes-servicio",
            get(listar_mis).post(crear),
        )
        .route(
            "/solicitudes-servicio/{id}",
            get(ver_detalle),
        )
        // Admin endpoints
        .route(
            "/admin/solicitudes",
            get(listar_admin),
        )
        .route(
            "/admin/solicitudes/{id}",
            put(actualizar),
        )
}

// ── Handlers ─────────────────────────────────────────────────────────────────

/// GET /solicitudes-servicio — Lista las solicitudes del residente autenticado.
#[utoipa::path(
    get,
    path = "/api/v1/solicitudes-servicio",
    tag = "servicios",
    responses(
        (status = 200, description = "Solicitudes del residente autenticado", body = [SolicitudServicioDto]),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn listar_mis(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<SolicitudServicioDto>>> {
    let mut conn = state.pool.get().await?;
    let rows = listar_mis_solicitudes(&mut conn, user.conjunto_id, user.id).await?;
    Ok(Json(rows.into_iter().map(SolicitudServicioDto::from).collect()))
}

/// POST /solicitudes-servicio — Crea una nueva solicitud de servicio/PQRS.
#[utoipa::path(
    post,
    path = "/api/v1/solicitudes-servicio",
    tag = "servicios",
    request_body = CreateSolicitudServicioRequest,
    responses(
        (status = 200, description = "Solicitud creada (estado ABIERTA)", body = SolicitudServicioDto),
        (status = 400, description = "descripcion es obligatoria"),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn crear(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreateSolicitudServicioRequest>,
) -> ApiResult<Json<SolicitudServicioDto>> {
    if req.descripcion.trim().is_empty() {
        return Err(ApiError::BadRequest(
            "la descripcion es obligatoria".into(),
        ));
    }
    let imagenes = serde_json::to_value(req.imagenes.unwrap_or_default())
        .map_err(|e| ApiError::BadRequest(format!("imagenes inválidas: {e}")))?;

    let mut conn = state.pool.get().await?;
    let solicitud = crear_solicitud_servicio(
        &mut conn,
        NuevaSolicitudServicio {
            id: uuid::Uuid::new_v4(),
            conjunto_id: user.conjunto_id,
            usuario_id: user.id,
            categoria: req.categoria,
            tipo: req.tipo,
            descripcion: req.descripcion.trim().to_string(),
            urgente: req.urgente,
            imagenes,
            estado: EstadoSolicitud::Abierta.as_str().to_string(),
            created_at: chrono::Utc::now(),
        },
    )
    .await?;

    let dto = SolicitudServicioDto::from(solicitud);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "servicio".into(),
                action: "created".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}

/// GET /solicitudes-servicio/{id} — Ver detalle de una solicitud propia.
#[utoipa::path(
    get,
    path = "/api/v1/solicitudes-servicio/{id}",
    tag = "servicios",
    params(("id" = Uuid, Path, description = "Solicitud id")),
    responses(
        (status = 200, description = "Detalle de la solicitud", body = SolicitudServicioDto),
        (status = 401, description = "Not authenticated"),
        (status = 404, description = "No encontrada")
    )
)]
pub async fn ver_detalle(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<SolicitudServicioDto>> {
    let mut conn = state.pool.get().await?;
    let solicitud = find_solicitud(&mut conn, user.conjunto_id, id)
        .await?
        .ok_or_else(|| ApiError::NotFound("solicitud no encontrada".into()))?;

    // Residentes solo pueden ver sus propias solicitudes; admin/concejo pueden ver cualquiera
    if solicitud.usuario_id != user.id
        && !matches!(user.rol, Rol::Administrador | Rol::Concejo | Rol::SuperAdmin)
    {
        return Err(ApiError::Forbidden);
    }

    Ok(Json(SolicitudServicioDto::from(solicitud)))
}

/// GET /admin/solicitudes — Lista todas las solicitudes del conjunto con filtros.
#[utoipa::path(
    get,
    path = "/api/v1/admin/solicitudes",
    tag = "servicios",
    params(
        ("estado" = Option<EstadoSolicitud>, Query, description = "Filtrar por estado"),
        ("categoria" = Option<CatServicio>, Query, description = "Filtrar por categoría"),
        ("urgente" = Option<bool>, Query, description = "Filtrar por urgente")
    ),
    responses(
        (status = 200, description = "Lista de solicitudes filtradas", body = [SolicitudServicioDto]),
        (status = 401, description = "Not authenticated"),
        (status = 403, description = "Requiere rol admin/concejo")
    )
)]
pub async fn listar_admin(
    State(state): State<AppState>,
    user: AuthUser,
    Query(filtros): Query<AdminSolicitudesQuery>,
) -> ApiResult<Json<Vec<SolicitudServicioDto>>> {
    guard::require_admin(&user)?;
    let mut conn = state.pool.get().await?;
    let rows = listar_admin_solicitudes(&mut conn, user.conjunto_id, &filtros).await?;
    Ok(Json(rows.into_iter().map(SolicitudServicioDto::from).collect()))
}

/// PUT /admin/solicitudes/{id} — Actualiza estado y/o asigna proveedor.
#[utoipa::path(
    put,
    path = "/api/v1/admin/solicitudes/{id}",
    tag = "servicios",
    params(("id" = Uuid, Path, description = "Solicitud id")),
    request_body = UpdateSolicitudServicioRequest,
    responses(
        (status = 200, description = "Solicitud actualizada", body = SolicitudServicioDto),
        (status = 401, description = "Not authenticated"),
        (status = 403, description = "Requiere rol admin/concejo"),
        (status = 404, description = "Solicitud no encontrada")
    )
)]
pub async fn actualizar(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateSolicitudServicioRequest>,
) -> ApiResult<Json<SolicitudServicioDto>> {
    guard::require_admin(&user)?;

    // Validate the solicitud exists
    let mut conn = state.pool.get().await?;
    let _ = find_solicitud(&mut conn, user.conjunto_id, id)
        .await?
        .ok_or_else(|| ApiError::NotFound("solicitud no encontrada".into()))?;

    let actualizada = actualizar_solicitud(&mut conn, user.conjunto_id, id, &req).await?;
    let dto = SolicitudServicioDto::from(actualizada);

    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "servicio".into(),
                action: "updated".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;

    Ok(Json(dto))
}
