//! Admin financial dashboard: KPIs, payment management, expense CRUD,
//! and delinquency report. Flat module like admin_stats.rs.

use axum::extract::{Path, Query, State};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use bigdecimal::BigDecimal;
use chrono::{Datelike, DateTime, NaiveDate, Utc};
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::auth::guard;
use crate::db::enums::{CatGasto, EstadoPago};
use crate::db::schema::{gastos, pagos, unidades};
use crate::db::DbConn;
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/admin/finanzas/resumen", get(resumen))
        .route("/admin/pagos", get(listar_pagos))
        .route("/admin/gastos", post(crear_gasto).get(listar_gastos))
        .route("/admin/gastos/{id}", put(editar_gasto).delete(eliminar_gasto))
        .route("/admin/morosidad", get(morosidad))
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdminFinanzasResumenDto {
    /// Sum of PAGADO amounts with fecha_pago in the current UTC month.
    #[schema(value_type = String)]
    pub recaudo_mes: BigDecimal,
    /// Total pending + overdue amounts across all unidades.
    #[schema(value_type = String)]
    pub morosidad: BigDecimal,
    /// Sum of gastos in the current UTC month.
    #[schema(value_type = String)]
    pub gastos_mes: BigDecimal,
    /// recaudo_mes - gastos_mes.
    #[schema(value_type = String)]
    pub balance: BigDecimal,
    /// Total number of unidades in the conjunto.
    pub total_unidades: i64,
    /// Number of unidades with zero overdue balance.
    pub unidades_al_dia: i64,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PagoAdminDto {
    pub id: Uuid,
    pub unidad_id: Uuid,
    pub usuario_id: Uuid,
    pub torre: Option<String>,
    pub apto: String,
    pub concepto: String,
    #[schema(value_type = String)]
    pub monto: BigDecimal,
    pub estado: EstadoPago,
    pub metodo: Option<String>,
    pub fecha_vencimiento: DateTime<Utc>,
    pub fecha_pago: Option<DateTime<Utc>>,
    pub comprobante: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdminPagosPage {
    pub data: Vec<PagoAdminDto>,
    pub total: i64,
    pub page: i64,
    pub pages: i64,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GastoDto {
    pub id: Uuid,
    pub categoria: CatGasto,
    pub descripcion: String,
    #[schema(value_type = String)]
    pub monto: BigDecimal,
    pub proveedor: Option<String>,
    pub soporte_url: Option<String>,
    pub fecha: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CrearGastoRequest {
    pub categoria: CatGasto,
    pub descripcion: String,
    #[schema(value_type = String)]
    pub monto: BigDecimal,
    pub proveedor: Option<String>,
    pub fecha: DateTime<Utc>,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EditarGastoRequest {
    pub categoria: Option<CatGasto>,
    pub descripcion: Option<String>,
    #[schema(value_type = String)]
    pub monto: Option<BigDecimal>,
    pub proveedor: Option<String>,
    pub fecha: Option<DateTime<Utc>>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UnidadMorosaDto {
    pub unidad_id: Uuid,
    pub torre: Option<String>,
    pub apto: String,
    #[schema(value_type = String)]
    pub total_adeudado: BigDecimal,
    pub cantidad_recibos_vencidos: i64,
}

#[derive(Deserialize)]
pub struct PagosQuery {
    #[serde(default)]
    pub estado: Option<EstadoPago>,
    pub unidad_id: Option<Uuid>,
    pub desde: Option<DateTime<Utc>>,
    pub hasta: Option<DateTime<Utc>>,
    #[serde(default = "default_page")]
    pub page: i64,
    #[serde(default = "default_limit")]
    pub limit: i64,
}

fn default_page() -> i64 {
    1
}
fn default_limit() -> i64 {
    20
}

#[derive(Deserialize)]
pub struct GastosQuery {
    pub categoria: Option<CatGasto>,
    pub desde: Option<DateTime<Utc>>,
    pub hasta: Option<DateTime<Utc>>,
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/// Sum of PAGADO amounts with fecha_pago in the current UTC month.
async fn query_recaudo_mes(conn: &mut DbConn, conjunto_id: Uuid) -> ApiResult<BigDecimal> {
    let now = Utc::now();
    let month_start = NaiveDate::from_ymd_opt(now.year(), now.month(), 1)
        .expect("first of month is valid")
        .and_hms_opt(0, 0, 0)
        .expect("midnight is valid")
        .and_utc();
    let total: Option<BigDecimal> = pagos::table
        .filter(pagos::conjunto_id.eq(conjunto_id))
        .filter(pagos::estado.eq(EstadoPago::Pagado))
        .filter(pagos::fecha_pago.ge(month_start))
        .select(diesel::dsl::sum(pagos::monto))
        .first(conn)
        .await?;
    Ok(total.unwrap_or_else(|| BigDecimal::from(0)))
}

/// Sum of pending + overdue pagos across all unidades.
async fn query_morosidad(conn: &mut DbConn, conjunto_id: Uuid) -> ApiResult<BigDecimal> {
    let total: Option<BigDecimal> = pagos::table
        .filter(pagos::conjunto_id.eq(conjunto_id))
        .filter(
            pagos::estado
                .eq(EstadoPago::Pendiente)
                .or(pagos::estado.eq(EstadoPago::Vencido)),
        )
        .select(diesel::dsl::sum(pagos::monto))
        .first(conn)
        .await?;
    Ok(total.unwrap_or_else(|| BigDecimal::from(0)))
}

/// Sum of gastos in the current UTC month.
async fn query_gastos_mes(conn: &mut DbConn, conjunto_id: Uuid) -> ApiResult<BigDecimal> {
    let now = Utc::now();
    let month_start = NaiveDate::from_ymd_opt(now.year(), now.month(), 1)
        .expect("first of month is valid")
        .and_hms_opt(0, 0, 0)
        .expect("midnight is valid")
        .and_utc();
    let total: Option<BigDecimal> = gastos::table
        .filter(gastos::conjunto_id.eq(conjunto_id))
        .filter(gastos::fecha.ge(month_start))
        .select(diesel::dsl::sum(gastos::monto))
        .first(conn)
        .await?;
    Ok(total.unwrap_or_else(|| BigDecimal::from(0)))
}

/// Total number of unidades in the conjunto.
async fn query_total_unidades(conn: &mut DbConn, conjunto_id: Uuid) -> ApiResult<i64> {
    let count = unidades::table
        .filter(unidades::conjunto_id.eq(conjunto_id))
        .count()
        .get_result(conn)
        .await?;
    Ok(count)
}

/// Count unidades with zero overdue balance.
async fn query_unidades_al_dia(conn: &mut DbConn, conjunto_id: Uuid) -> ApiResult<i64> {
    // Subquery: unidades that have at least one pending/overdue pago
    use diesel::dsl::exists;
    let morosas = pagos::table
        .filter(pagos::unidad_id.eq(unidades::id))
        .filter(
            pagos::estado
                .eq(EstadoPago::Pendiente)
                .or(pagos::estado.eq(EstadoPago::Vencido)),
        )
        .select(pagos::id);

    let count = unidades::table
        .filter(unidades::conjunto_id.eq(conjunto_id))
        .filter(diesel::dsl::not(exists(morosas)))
        .count()
        .get_result(conn)
        .await?;
    Ok(count)
}

/// Paginated list of pagos with optional filters, joined with unidades for
/// torre/apto. Uses a macro to rebuild the same filter predicates for both
/// count and data queries without moving the boxed statement.
macro_rules! pagos_filtered {
    ($table:expr, $q:expr $(,)?) => {{
        let mut q = $table
            .inner_join(unidades::table)
            .filter(pagos::conjunto_id.eq($q.conjunto_id))
            .into_boxed();
        if let Some(ref estado) = $q.estado {
            q = q.filter(pagos::estado.eq(*estado));
        }
        if let Some(uid) = $q.unidad_id {
            q = q.filter(pagos::unidad_id.eq(uid));
        }
        if let Some(desde) = $q.desde {
            q = q.filter(pagos::created_at.ge(desde));
        }
        if let Some(hasta) = $q.hasta {
            q = q.filter(pagos::created_at.le(hasta));
        }
        q
    }};
}

async fn query_pagos_admin(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    q: &PagosQuery,
) -> ApiResult<(Vec<PagoAdminDto>, i64)> {
    use diesel::dsl::sql;
    use diesel::sql_types::BigInt;

    // Wrapper to satisfy the macro's `q.conjunto_id` access
    struct FilterCtx {
        conjunto_id: Uuid,
        estado: Option<EstadoPago>,
        unidad_id: Option<Uuid>,
        desde: Option<DateTime<Utc>>,
        hasta: Option<DateTime<Utc>>,
    }
    let ctx = FilterCtx {
        conjunto_id,
        estado: q.estado,
        unidad_id: q.unidad_id,
        desde: q.desde,
        hasta: q.hasta,
    };

    let total: i64 = pagos_filtered!(pagos::table, ctx)
        .select(sql::<BigInt>("count(*)"))
        .first(conn)
        .await?;

    let limit = q.limit.max(1).min(100);
    let offset = ((q.page - 1).max(0) * limit) as i64;

    let rows: Vec<(
        Uuid,
        Uuid,
        Uuid,
        String,
        BigDecimal,
        EstadoPago,
        Option<String>,
        DateTime<Utc>,
        Option<DateTime<Utc>>,
        Option<String>,
        DateTime<Utc>,
        Option<String>,
        String,
    )> = pagos_filtered!(pagos::table, ctx)
        .select((
            pagos::id,
            pagos::unidad_id,
            pagos::usuario_id,
            pagos::concepto,
            pagos::monto,
            pagos::estado,
            pagos::metodo.nullable(),
            pagos::fecha_vencimiento,
            pagos::fecha_pago,
            pagos::comprobante,
            pagos::created_at,
            unidades::torre.nullable(),
            unidades::numero,
        ))
        .order(pagos::created_at.desc())
        .limit(limit)
        .offset(offset)
        .load(conn)
        .await?;

    let data = rows
        .into_iter()
        .map(
            |(
                id,
                unidad_id,
                usuario_id,
                concepto,
                monto,
                estado,
                metodo,
                fecha_vencimiento,
                fecha_pago,
                comprobante,
                created_at,
                torre,
                apto,
            )| PagoAdminDto {
                id,
                unidad_id,
                usuario_id,
                torre,
                apto,
                concepto,
                monto,
                estado,
                metodo,
                fecha_vencimiento,
                fecha_pago,
                comprobante,
                created_at,
            },
        )
        .collect();

    Ok((data, total))
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /admin/finanzas/resumen — Financial KPIs.
#[utoipa::path(
    get,
    path = "/api/v1/admin/finanzas/resumen",
    tag = "admin",
    responses(
        (status = 200, description = "Financial dashboard KPIs", body = AdminFinanzasResumenDto),
        (status = 403, description = "Requires admin role")
    )
)]
pub async fn resumen(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<AdminFinanzasResumenDto>> {
    guard::require_admin(&user)?;
    let mut conn = state.pool.get().await?;

    let recaudo_mes = query_recaudo_mes(&mut conn, user.conjunto_id).await?;
    let morosidad = query_morosidad(&mut conn, user.conjunto_id).await?;
    let gastos_mes = query_gastos_mes(&mut conn, user.conjunto_id).await?;
    let balance = &recaudo_mes - &gastos_mes;
    let total_unidades = query_total_unidades(&mut conn, user.conjunto_id).await?;
    let unidades_al_dia = query_unidades_al_dia(&mut conn, user.conjunto_id).await?;

    Ok(Json(AdminFinanzasResumenDto {
        recaudo_mes,
        morosidad,
        gastos_mes,
        balance,
        total_unidades,
        unidades_al_dia,
    }))
}

/// GET /admin/pagos — Paginated list of all pagos with filters.
#[utoipa::path(
    get,
    path = "/api/v1/admin/pagos",
    tag = "admin",
    params(
        ("estado" = Option<EstadoPago>, Query, description = "Filter by payment status"),
        ("unidad_id" = Option<Uuid>, Query, description = "Filter by unit"),
        ("desde" = Option<DateTime>, Query, description = "From date"),
        ("hasta" = Option<DateTime>, Query, description = "To date"),
        ("page" = Option<i64>, Query, description = "Page number (default 1)"),
        ("limit" = Option<i64>, Query, description = "Items per page (default 20, max 100)")
    ),
    responses(
        (status = 200, description = "Paginated payment list", body = AdminPagosPage),
        (status = 403, description = "Requires admin role")
    )
)]
pub async fn listar_pagos(
    State(state): State<AppState>,
    user: AuthUser,
    Query(query): Query<PagosQuery>,
) -> ApiResult<Json<AdminPagosPage>> {
    guard::require_admin(&user)?;
    let mut conn = state.pool.get().await?;

    let (data, total) = query_pagos_admin(&mut conn, user.conjunto_id, &query).await?;
    let limit = query.limit.max(1).min(100);
    let pages = if limit == 0 {
        1
    } else {
        ((total + limit - 1) / limit).max(1)
    };

    Ok(Json(AdminPagosPage {
        data,
        total,
        page: query.page,
        pages,
    }))
}

/// POST /admin/gastos — Create a new expense.
#[utoipa::path(
    post,
    path = "/api/v1/admin/gastos",
    tag = "admin",
    request_body = CrearGastoRequest,
    responses(
        (status = 201, description = "Expense created", body = GastoDto),
        (status = 403, description = "Requires admin role")
    )
)]
pub async fn crear_gasto(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CrearGastoRequest>,
) -> ApiResult<(axum::http::StatusCode, Json<GastoDto>)> {
    guard::require_admin(&user)?;
    // Reject non-positive amounts: a negative gasto would inflate the budget and
    // corrupt finance totals/morosidad math.
    if req.monto <= BigDecimal::from(0) {
        return Err(ApiError::BadRequest("el monto debe ser mayor que cero".into()));
    }
    let mut conn = state.pool.get().await?;

    let now = Utc::now();
    let id = Uuid::new_v4();

    let row: (
        Uuid,
        CatGasto,
        String,
        BigDecimal,
        Option<String>,
        Option<String>,
        DateTime<Utc>,
        DateTime<Utc>,
    ) = diesel::insert_into(gastos::table)
        .values((
            gastos::id.eq(id),
            gastos::conjunto_id.eq(user.conjunto_id),
            gastos::categoria.eq(req.categoria),
            gastos::descripcion.eq(&req.descripcion),
            gastos::monto.eq(&req.monto),
            gastos::proveedor.eq(&req.proveedor),
            gastos::soporte_url.eq::<Option<String>>(None),
            gastos::fecha.eq(req.fecha),
            gastos::created_at.eq(now),
        ))
        .returning((
            gastos::id,
            gastos::categoria,
            gastos::descripcion,
            gastos::monto,
            gastos::proveedor,
            gastos::soporte_url,
            gastos::fecha,
            gastos::created_at,
        ))
        .get_result(&mut conn)
        .await?;

    let (id, categoria, descripcion, monto, proveedor, soporte_url, fecha, created_at) = row;

    Ok((
        axum::http::StatusCode::CREATED,
        Json(GastoDto {
            id,
            categoria,
            descripcion,
            monto,
            proveedor,
            soporte_url,
            fecha,
            created_at,
        }),
    ))
}

/// GET /admin/gastos — List expenses with optional filters.
#[utoipa::path(
    get,
    path = "/api/v1/admin/gastos",
    tag = "admin",
    params(
        ("categoria" = Option<CatGasto>, Query, description = "Filter by category"),
        ("desde" = Option<DateTime>, Query, description = "From date"),
        ("hasta" = Option<DateTime>, Query, description = "To date")
    ),
    responses(
        (status = 200, description = "Expense list", body = [GastoDto]),
        (status = 403, description = "Requires admin role")
    )
)]
pub async fn listar_gastos(
    State(state): State<AppState>,
    user: AuthUser,
    Query(query): Query<GastosQuery>,
) -> ApiResult<Json<Vec<GastoDto>>> {
    guard::require_admin(&user)?;
    let mut conn = state.pool.get().await?;

    let rows: Vec<(
        Uuid,
        CatGasto,
        String,
        BigDecimal,
        Option<String>,
        Option<String>,
        DateTime<Utc>,
        DateTime<Utc>,
    )> = {
        let mut base = gastos::table
            .filter(gastos::conjunto_id.eq(user.conjunto_id))
            .into_boxed();

        if let Some(ref cat) = query.categoria {
            base = base.filter(gastos::categoria.eq(*cat));
        }
        if let Some(desde) = query.desde {
            base = base.filter(gastos::fecha.ge(desde));
        }
        if let Some(hasta) = query.hasta {
            base = base.filter(gastos::fecha.le(hasta));
        }

        base.select((
            gastos::id,
            gastos::categoria,
            gastos::descripcion,
            gastos::monto,
            gastos::proveedor,
            gastos::soporte_url,
            gastos::fecha,
            gastos::created_at,
        ))
        .order(gastos::fecha.desc())
        .load(&mut conn)
        .await?
    };

    let data = rows
        .into_iter()
        .map(
            |(id, categoria, descripcion, monto, proveedor, soporte_url, fecha, created_at)| {
                GastoDto {
                    id,
                    categoria,
                    descripcion,
                    monto,
                    proveedor,
                    soporte_url,
                    fecha,
                    created_at,
                }
            },
        )
        .collect();

    Ok(Json(data))
}

/// PUT /admin/gastos/{id} — Partial update of an expense.
#[utoipa::path(
    put,
    path = "/api/v1/admin/gastos/{id}",
    tag = "admin",
    params(("id" = Uuid, Path, description = "Gasto id")),
    request_body = EditarGastoRequest,
    responses(
        (status = 200, description = "Expense updated", body = GastoDto),
        (status = 404, description = "Gasto not found"),
        (status = 403, description = "Requires admin role")
    )
)]
pub async fn editar_gasto(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<EditarGastoRequest>,
) -> ApiResult<Json<GastoDto>> {
    guard::require_admin(&user)?;
    let mut conn = state.pool.get().await?;

    let target = gastos::table
        .filter(gastos::id.eq(id))
        .filter(gastos::conjunto_id.eq(user.conjunto_id));

    // Diesel's update().set() works with tuples of optional assignments
    let row: (
        Uuid,
        CatGasto,
        String,
        BigDecimal,
        Option<String>,
        Option<String>,
        DateTime<Utc>,
        DateTime<Utc>,
    ) = diesel::update(target)
        .set((
            req.categoria.as_ref().map(|c| gastos::categoria.eq(*c)),
            req.descripcion.as_ref().map(|d| gastos::descripcion.eq(d.clone())),
            req.monto.as_ref().map(|m| gastos::monto.eq(m.clone())),
            req.proveedor
                .as_ref()
                .map(|p| gastos::proveedor.eq(p.clone())),
            req.fecha.map(|f| gastos::fecha.eq(f)),
        ))
        .returning((
            gastos::id,
            gastos::categoria,
            gastos::descripcion,
            gastos::monto,
            gastos::proveedor,
            gastos::soporte_url,
            gastos::fecha,
            gastos::created_at,
        ))
        .get_result(&mut conn)
        .await
        .map_err(|e| match e {
            diesel::result::Error::NotFound => {
                ApiError::NotFound("gasto no encontrado".into())
            }
            other => ApiError::from(other),
        })?;

    let (id, categoria, descripcion, monto, proveedor, soporte_url, fecha, created_at) = row;

    Ok(Json(GastoDto {
        id,
        categoria,
        descripcion,
        monto,
        proveedor,
        soporte_url,
        fecha,
        created_at,
    }))
}

/// DELETE /admin/gastos/{id} — Delete an expense.
#[utoipa::path(
    delete,
    path = "/api/v1/admin/gastos/{id}",
    tag = "admin",
    params(("id" = Uuid, Path, description = "Gasto id")),
    responses(
        (status = 204, description = "Expense deleted"),
        (status = 404, description = "Gasto not found"),
        (status = 403, description = "Requires admin role")
    )
)]
pub async fn eliminar_gasto(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<axum::http::StatusCode> {
    guard::require_admin(&user)?;
    let mut conn = state.pool.get().await?;

    let deleted = diesel::delete(
        gastos::table
            .filter(gastos::id.eq(id))
            .filter(gastos::conjunto_id.eq(user.conjunto_id)),
    )
    .execute(&mut conn)
    .await?;

    if deleted == 0 {
        return Err(ApiError::NotFound("gasto no encontrado".into()));
    }

    Ok(axum::http::StatusCode::NO_CONTENT)
}

/// GET /admin/morosidad — Units with overdue balance.
#[utoipa::path(
    get,
    path = "/api/v1/admin/morosidad",
    tag = "admin",
    responses(
        (status = 200, description = "Delinquent units", body = [UnidadMorosaDto]),
        (status = 403, description = "Requires admin role")
    )
)]
pub async fn morosidad(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<UnidadMorosaDto>>> {
    guard::require_admin(&user)?;
    let mut conn = state.pool.get().await?;

    let rows: Vec<(Uuid, Option<String>, String, Option<BigDecimal>, i64)> = pagos::table
        .inner_join(unidades::table)
        .filter(pagos::conjunto_id.eq(user.conjunto_id))
        .filter(
            pagos::estado
                .eq(EstadoPago::Pendiente)
                .or(pagos::estado.eq(EstadoPago::Vencido)),
        )
        .group_by((unidades::id, unidades::torre, unidades::numero))
        .select((
            unidades::id,
            unidades::torre,
            unidades::numero,
            diesel::dsl::sum(pagos::monto),
            diesel::dsl::count(pagos::id),
        ))
        .load(&mut conn)
        .await?;

    let data = rows
        .into_iter()
        .map(
            |(unidad_id, torre, apto, total_adeudado, cantidad_recibos_vencidos)| {
                UnidadMorosaDto {
                    unidad_id,
                    torre,
                    apto,
                    total_adeudado: total_adeudado.unwrap_or_else(|| BigDecimal::from(0)),
                    cantidad_recibos_vencidos,
                }
            },
        )
        .collect();

    Ok(Json(data))
}
