//! Admin common-area CRUD and cross-tenant reservation listing.
//! Flat module (same pattern as admin_usuarios.rs / admin_finanzas.rs):
//! endpoints + DTOs + inline repository helpers in one file.

use axum::extract::{Path, Query, State};
use axum::routing::{get, put};
use axum::{Json, Router};
use bigdecimal::BigDecimal;
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::auth::guard;
use crate::db::enums::EstadoReserva;
use crate::db::schema::{areas_comunes, reservas, usuarios};
use crate::db::DbConn;
use crate::domains::reservas::models::AreaComun;
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

// ── Router ──────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/admin/areas-comunes",
            get(listar_areas).post(crear_area),
        )
        .route(
            "/admin/areas-comunes/{id}",
            put(editar_area).delete(eliminar_area),
        )
        .route("/admin/reservas", get(listar_reservas))
}

// ── DTOs ────────────────────────────────────────────────────────────────────

/// Common area visible to admins (includes all areas, not just active ones).
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdminAreaComunDto {
    pub id: Uuid,
    pub nombre: String,
    pub descripcion: Option<String>,
    pub capacidad_max: i32,
    pub imagen_url: Option<String>,
    pub requiere_deposito: bool,
    /// Decimal serialized as string.
    #[schema(value_type = Option<String>)]
    pub deposito_monto: Option<BigDecimal>,
    pub hora_apertura: String,
    pub hora_cierre: String,
    pub dias_disponibles: String,
    pub duracion_slot: i32,
    pub activa: bool,
}

impl From<AreaComun> for AdminAreaComunDto {
    fn from(a: AreaComun) -> Self {
        Self {
            id: a.id,
            nombre: a.nombre,
            descripcion: a.descripcion,
            capacidad_max: a.capacidad_max,
            imagen_url: a.imagen_url,
            requiere_deposito: a.requiere_deposito,
            deposito_monto: a.deposito_monto,
            hora_apertura: a.hora_apertura,
            hora_cierre: a.hora_cierre,
            dias_disponibles: a.dias_disponibles,
            duracion_slot: a.duracion_slot,
            activa: a.activa,
        }
    }
}

/// Payload for POST /admin/areas-comunes.
#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateAreaRequest {
    pub nombre: String,
    pub descripcion: Option<String>,
    pub capacidad_max: i32,
    pub imagen_url: Option<String>,
    pub requiere_deposito: bool,
    #[schema(value_type = Option<String>)]
    pub deposito_monto: Option<BigDecimal>,
    pub hora_apertura: String,
    pub hora_cierre: String,
    pub dias_disponibles: String,
    pub duracion_slot: i32,
    pub activa: bool,
}

/// Payload for PUT /admin/areas-comunes/{id} — partial update.
#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAreaRequest {
    pub nombre: Option<String>,
    pub descripcion: Option<String>,
    pub capacidad_max: Option<i32>,
    pub imagen_url: Option<String>,
    pub requiere_deposito: Option<bool>,
    #[schema(value_type = Option<String>)]
    pub deposito_monto: Option<BigDecimal>,
    pub hora_apertura: Option<String>,
    pub hora_cierre: Option<String>,
    pub dias_disponibles: Option<String>,
    pub duracion_slot: Option<i32>,
    pub activa: Option<bool>,
}

/// Reservation row for the admin list — includes resident and area info.
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReservaAdminDto {
    pub id: Uuid,
    pub usuario_id: Uuid,
    pub residente_nombre: String,
    pub residente_torre: Option<String>,
    pub residente_apto: Option<String>,
    pub area_id: Uuid,
    pub area_nombre: String,
    pub fecha_inicio: DateTime<Utc>,
    pub fecha_fin: DateTime<Utc>,
    pub estado: EstadoReserva,
    pub notas: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Query-string filters for GET /admin/reservas.
#[derive(Deserialize)]
pub struct AdminReservasQuery {
    #[serde(default)]
    pub estado: Option<String>,
    #[serde(default)]
    pub area_id: Option<Uuid>,
    #[serde(default)]
    pub desde: Option<String>,
    #[serde(default)]
    pub hasta: Option<String>,
}

// ── Handlers ────────────────────────────────────────────────────────────────

/// GET /admin/areas-comunes
///
/// List all common areas in the admin's conjunto (including inactive ones).
#[utoipa::path(
    get,
    path = "/api/v1/admin/areas-comunes",
    tag = "admin",
    responses(
        (status = 200, description = "All common areas of the conjunto", body = [AdminAreaComunDto]),
        (status = 403, description = "Requires admin role")
    )
)]
pub async fn listar_areas(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<AdminAreaComunDto>>> {
    guard::require_admin(&user)?;

    let mut conn = state.pool.get().await?;
    let rows = list_all_areas(&mut conn, user.conjunto_id).await?;
    Ok(Json(rows.into_iter().map(AdminAreaComunDto::from).collect()))
}

/// POST /admin/areas-comunes
///
/// Create a new common area.
#[utoipa::path(
    post,
    path = "/api/v1/admin/areas-comunes",
    tag = "admin",
    request_body = CreateAreaRequest,
    responses(
        (status = 201, description = "Area created", body = AdminAreaComunDto),
        (status = 400, description = "Invalid fields"),
        (status = 403, description = "Requires admin role")
    )
)]
pub async fn crear_area(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreateAreaRequest>,
) -> ApiResult<(axum::http::StatusCode, Json<AdminAreaComunDto>)> {
    guard::require_admin(&user)?;

    validate_area_fields(
        &req.nombre,
        &req.hora_apertura,
        &req.hora_cierre,
        &req.dias_disponibles,
        req.capacidad_max,
        req.duracion_slot,
    )?;

    let mut conn = state.pool.get().await?;
    let created = insert_area(&mut conn, user.conjunto_id, &req).await?;

    Ok((
        axum::http::StatusCode::CREATED,
        Json(AdminAreaComunDto::from(created)),
    ))
}

/// PUT /admin/areas-comunes/{id}
///
/// Partial update of a common area.
#[utoipa::path(
    put,
    path = "/api/v1/admin/areas-comunes/{id}",
    tag = "admin",
    params(
        ("id" = Uuid, Path, description = "Area ID")
    ),
    request_body = UpdateAreaRequest,
    responses(
        (status = 200, description = "Area updated", body = AdminAreaComunDto),
        (status = 400, description = "Invalid fields"),
        (status = 403, description = "Requires admin role"),
        (status = 404, description = "Area not found in this conjunto")
    )
)]
pub async fn editar_area(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateAreaRequest>,
) -> ApiResult<Json<AdminAreaComunDto>> {
    guard::require_admin(&user)?;

    // Validate only the provided fields.
    if let Some(ref nombre) = req.nombre {
        if nombre.trim().is_empty() {
            return Err(ApiError::BadRequest("el nombre no puede estar vacío".into()));
        }
    }
    if let Some(cap) = req.capacidad_max {
        if cap < 1 {
            return Err(ApiError::BadRequest(
                "capacidad_max debe ser mayor que 0".into(),
            ));
        }
    }
    if let Some(dur) = req.duracion_slot {
        if dur < 1 {
            return Err(ApiError::BadRequest(
                "duracion_slot debe ser mayor que 0".into(),
            ));
        }
    }

    let mut conn = state.pool.get().await?;
    let updated = update_area(&mut conn, user.conjunto_id, id, &req).await?;

    Ok(Json(AdminAreaComunDto::from(updated)))
}

/// DELETE /admin/areas-comunes/{id}
///
/// Delete a common area — only allowed when there are no active reservations
/// (CONFIRMADA or PENDIENTE) for that area.
#[utoipa::path(
    delete,
    path = "/api/v1/admin/areas-comunes/{id}",
    tag = "admin",
    params(
        ("id" = Uuid, Path, description = "Area ID")
    ),
    responses(
        (status = 204, description = "Area deleted"),
        (status = 403, description = "Requires admin role"),
        (status = 404, description = "Area not found in this conjunto"),
        (status = 409, description = "Area has active reservations")
    )
)]
pub async fn eliminar_area(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<axum::http::StatusCode> {
    guard::require_admin(&user)?;

    let mut conn = state.pool.get().await?;
    delete_area(&mut conn, user.conjunto_id, id).await?;

    Ok(axum::http::StatusCode::NO_CONTENT)
}

/// GET /admin/reservas
///
/// List all reservations in the conjunto with optional filters
/// (?estado=, ?area_id=, ?desde=, ?hasta=).  Includes resident name/torre/apto
/// via a join with the usuarios table and area name via areas_comunes.
#[utoipa::path(
    get,
    path = "/api/v1/admin/reservas",
    tag = "admin",
    params(
        ("estado" = Option<String>, Query, description = "Filter by reservation state (PENDIENTE, CONFIRMADA, CANCELADA, COMPLETADA)"),
        ("area_id" = Option<Uuid>, Query, description = "Filter by common area"),
        ("desde" = Option<String>, Query, description = "Reservations with fecha_inicio >= this ISO-8601 datetime"),
        ("hasta" = Option<String>, Query, description = "Reservations with fecha_inicio <= this ISO-8601 datetime")
    ),
    responses(
        (status = 200, description = "Filtered reservation list", body = [ReservaAdminDto]),
        (status = 400, description = "Invalid filter value"),
        (status = 403, description = "Requires admin role")
    )
)]
pub async fn listar_reservas(
    State(state): State<AppState>,
    user: AuthUser,
    Query(query): Query<AdminReservasQuery>,
) -> ApiResult<Json<Vec<ReservaAdminDto>>> {
    guard::require_admin(&user)?;

    // Parse optional filters.
    let estado: Option<EstadoReserva> = match query.estado.as_deref() {
        Some(s) if !s.trim().is_empty() => {
            let e = s.trim().parse::<EstadoReserva>().map_err(|_| {
                ApiError::BadRequest(format!("estado inválido: {s}"))
            })?;
            Some(e)
        }
        _ => None,
    };

    let desde: Option<DateTime<Utc>> = match query.desde.as_deref() {
        Some(s) if !s.trim().is_empty() => {
            let dt = s.trim().parse::<DateTime<Utc>>().map_err(|_| {
                ApiError::BadRequest(format!("desde inválido (use ISO-8601): {s}"))
            })?;
            Some(dt)
        }
        _ => None,
    };

    let hasta: Option<DateTime<Utc>> = match query.hasta.as_deref() {
        Some(s) if !s.trim().is_empty() => {
            let dt = s.trim().parse::<DateTime<Utc>>().map_err(|_| {
                ApiError::BadRequest(format!("hasta inválido (use ISO-8601): {s}"))
            })?;
            Some(dt)
        }
        _ => None,
    };

    let mut conn = state.pool.get().await?;
    let rows = list_reservas_admin(
        &mut conn,
        user.conjunto_id,
        estado,
        query.area_id,
        desde,
        hasta,
    )
    .await?;

    Ok(Json(
        rows.into_iter()
            .map(
                |(
                    id,
                    usuario_id,
                    residente_nombre,
                    residente_torre,
                    residente_apto,
                    area_id,
                    area_nombre,
                    fecha_inicio,
                    fecha_fin,
                    estado,
                    notas,
                    created_at,
                )| ReservaAdminDto {
                    id,
                    usuario_id,
                    residente_nombre,
                    residente_torre,
                    residente_apto,
                    area_id,
                    area_nombre,
                    fecha_inicio,
                    fecha_fin,
                    estado,
                    notas,
                    created_at,
                },
            )
            .collect(),
    ))
}

// ── Validation ──────────────────────────────────────────────────────────────

fn validate_area_fields(
    nombre: &str,
    hora_apertura: &str,
    hora_cierre: &str,
    dias_disponibles: &str,
    capacidad_max: i32,
    duracion_slot: i32,
) -> ApiResult<()> {
    if nombre.trim().is_empty() {
        return Err(ApiError::BadRequest("el nombre es requerido".into()));
    }
    if hora_apertura.trim().is_empty() {
        return Err(ApiError::BadRequest("hora_apertura es requerida".into()));
    }
    if hora_cierre.trim().is_empty() {
        return Err(ApiError::BadRequest("hora_cierre es requerida".into()));
    }
    if dias_disponibles.trim().is_empty() {
        return Err(ApiError::BadRequest("dias_disponibles es requerido".into()));
    }
    if capacidad_max < 1 {
        return Err(ApiError::BadRequest(
            "capacidad_max debe ser mayor que 0".into(),
        ));
    }
    if duracion_slot < 1 {
        return Err(ApiError::BadRequest(
            "duracion_slot debe ser mayor que 0".into(),
        ));
    }
    Ok(())
}

// ── Repository helpers (inline, flat-module style) ──────────────────────────

/// List all areas (active and inactive) in the conjunto.
async fn list_all_areas(
    conn: &mut DbConn,
    conjunto_id: Uuid,
) -> ApiResult<Vec<AreaComun>> {
    let rows = areas_comunes::table
        .filter(areas_comunes::conjunto_id.eq(conjunto_id))
        .order(areas_comunes::nombre.asc())
        .select(AreaComun::as_select())
        .load(conn)
        .await?;
    Ok(rows)
}

/// Insert a new common area and return the created row.
async fn insert_area(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    req: &CreateAreaRequest,
) -> ApiResult<AreaComun> {
    let created = diesel::insert_into(areas_comunes::table)
        .values((
            areas_comunes::conjunto_id.eq(conjunto_id),
            areas_comunes::nombre.eq(&req.nombre),
            areas_comunes::descripcion.eq(&req.descripcion),
            areas_comunes::capacidad_max.eq(req.capacidad_max),
            areas_comunes::imagen_url.eq(&req.imagen_url),
            areas_comunes::requiere_deposito.eq(req.requiere_deposito),
            areas_comunes::deposito_monto.eq(&req.deposito_monto),
            areas_comunes::hora_apertura.eq(&req.hora_apertura),
            areas_comunes::hora_cierre.eq(&req.hora_cierre),
            areas_comunes::dias_disponibles.eq(&req.dias_disponibles),
            areas_comunes::duracion_slot.eq(req.duracion_slot),
            areas_comunes::activa.eq(req.activa),
        ))
        .returning(AreaComun::as_returning())
        .get_result(conn)
        .await?;
    Ok(created)
}

/// Partial update of a common area. Returns 404 if not found in the conjunto.
async fn update_area(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    area_id: Uuid,
    req: &UpdateAreaRequest,
) -> ApiResult<AreaComun> {
    let updated = diesel::update(
        areas_comunes::table
            .filter(areas_comunes::id.eq(area_id))
            .filter(areas_comunes::conjunto_id.eq(conjunto_id)),
    )
    .set((
        req.nombre.as_ref().map(|n| areas_comunes::nombre.eq(n)),
        req.descripcion
            .as_ref()
            .map(|d| areas_comunes::descripcion.eq(d)),
        req.capacidad_max
            .map(|c| areas_comunes::capacidad_max.eq(c)),
        req.imagen_url
            .as_ref()
            .map(|u| areas_comunes::imagen_url.eq(u)),
        req.requiere_deposito
            .map(|r| areas_comunes::requiere_deposito.eq(r)),
        req.deposito_monto
            .as_ref()
            .map(|m| areas_comunes::deposito_monto.eq(m)),
        req.hora_apertura
            .as_ref()
            .map(|h| areas_comunes::hora_apertura.eq(h)),
        req.hora_cierre
            .as_ref()
            .map(|h| areas_comunes::hora_cierre.eq(h)),
        req.dias_disponibles
            .as_ref()
            .map(|d| areas_comunes::dias_disponibles.eq(d)),
        req.duracion_slot
            .map(|d| areas_comunes::duracion_slot.eq(d)),
        req.activa.map(|a| areas_comunes::activa.eq(a)),
    ))
    .returning(AreaComun::as_returning())
    .get_result(conn)
    .await
    .map_err(|e| match e {
        diesel::result::Error::NotFound => {
            ApiError::NotFound("área común no encontrada".into())
        }
        other => ApiError::from(other),
    })?;
    Ok(updated)
}

/// Delete a common area after verifying it has no active reservations.
async fn delete_area(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    area_id: Uuid,
) -> ApiResult<()> {
    // Verify the area exists in this conjunto.
    let exists: bool = diesel::select(diesel::dsl::exists(
        areas_comunes::table
            .filter(areas_comunes::id.eq(area_id))
            .filter(areas_comunes::conjunto_id.eq(conjunto_id)),
    ))
    .get_result(conn)
    .await?;

    if !exists {
        return Err(ApiError::NotFound("área común no encontrada".into()));
    }

    // Count active reservations (CONFIRMADA or PENDIENTE) for this area.
    let active_count: i64 = reservas::table
        .filter(reservas::area_id.eq(area_id))
        .filter(reservas::conjunto_id.eq(conjunto_id))
        .filter(
            reservas::estado
                .eq(EstadoReserva::Confirmada)
                .or(reservas::estado.eq(EstadoReserva::Pendiente)),
        )
        .count()
        .get_result(conn)
        .await?;

    if active_count > 0 {
        return Err(ApiError::Conflict(
            "no se puede eliminar un área con reservas activas (CONFIRMADA o PENDIENTE)"
                .into(),
        ));
    }

    diesel::delete(
        areas_comunes::table
            .filter(areas_comunes::id.eq(area_id))
            .filter(areas_comunes::conjunto_id.eq(conjunto_id)),
    )
    .execute(conn)
    .await?;

    Ok(())
}

/// List all reservations in the conjunto with optional filters.
/// Joins usuarios (for resident name/torre/apto) and areas_comunes (for area name).
#[allow(clippy::type_complexity)]
async fn list_reservas_admin(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    estado: Option<EstadoReserva>,
    area_id: Option<Uuid>,
    desde: Option<DateTime<Utc>>,
    hasta: Option<DateTime<Utc>>,
) -> ApiResult<
    Vec<(
        Uuid,          // id
        Uuid,          // usuario_id
        String,        // residente_nombre
        Option<String>, // residente_torre
        Option<String>, // residente_apto
        Uuid,          // area_id
        String,        // area_nombre
        DateTime<Utc>, // fecha_inicio
        DateTime<Utc>, // fecha_fin
        EstadoReserva, // estado
        Option<String>, // notas
        DateTime<Utc>, // created_at
    )>,
> {
    let mut query = reservas::table
        .inner_join(usuarios::table.on(reservas::usuario_id.eq(usuarios::id)))
        .inner_join(areas_comunes::table.on(reservas::area_id.eq(areas_comunes::id)))
        .filter(reservas::conjunto_id.eq(conjunto_id))
        .into_boxed();

    if let Some(e) = estado {
        query = query.filter(reservas::estado.eq(e));
    }

    if let Some(aid) = area_id {
        query = query.filter(reservas::area_id.eq(aid));
    }

    if let Some(d) = desde {
        query = query.filter(reservas::fecha_inicio.ge(d));
    }

    if let Some(h) = hasta {
        query = query.filter(reservas::fecha_inicio.le(h));
    }

    let rows = query
        .order(reservas::fecha_inicio.desc())
        .select((
            reservas::id,
            reservas::usuario_id,
            usuarios::nombre,
            usuarios::torre,
            usuarios::apto,
            reservas::area_id,
            areas_comunes::nombre,
            reservas::fecha_inicio,
            reservas::fecha_fin,
            reservas::estado,
            reservas::notas,
            reservas::created_at,
        ))
        .load(conn)
        .await?;

    Ok(rows)
}
