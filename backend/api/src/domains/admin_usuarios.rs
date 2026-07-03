//! Admin resident management: list, detail, edit, invite. Flat module like
//! admin_stats.rs — endpoints + queries in one file.

use axum::extract::{Path, Query, State};
use axum::routing::{get, post};
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
use crate::db::enums::{EstadoPago, Rol};
use crate::db::schema::{mascotas, pagos, unidades, usuarios, vehiculos};
use crate::db::DbConn;
use crate::domains::conjuntos::models::Unidad;
use crate::domains::pagos::models::Pago;
use crate::domains::parqueadero::models::Vehiculo;
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

// ── Router ──────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/admin/usuarios/invitar", post(invitar_residente))
        .route("/admin/usuarios", get(listar_usuarios))
        .route("/admin/usuarios/{id}", get(detalle_usuario).put(editar_usuario))
}

// ── DTOs ────────────────────────────────────────────────────────────────────

/// Row in the admin user table.
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdminUsuarioDto {
    pub id: Uuid,
    pub nombre: String,
    pub email: String,
    pub telefono: Option<String>,
    pub rol: Rol,
    pub torre: Option<String>,
    pub apto: Option<String>,
    pub activo: bool,
    pub numero_interno: String,
    pub created_at: DateTime<Utc>,
}

/// Full resident detail card: user + unit + vehicles + pets + recent payments.
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdminResidenteDetalleDto {
    pub id: Uuid,
    pub nombre: String,
    pub email: String,
    pub telefono: Option<String>,
    pub rol: Rol,
    pub torre: Option<String>,
    pub apto: Option<String>,
    pub activo: bool,
    pub numero_interno: String,
    pub created_at: DateTime<Utc>,
    pub unidad: Option<AdminUnidadDto>,
    #[serde(default)]
    pub vehiculos: Vec<AdminVehiculoDto>,
    #[serde(default)]
    pub mascotas: Vec<AdminMascotaDto>,
    #[serde(default)]
    pub pagos_recientes: Vec<AdminPagoDto>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdminUnidadDto {
    pub id: Uuid,
    pub numero: String,
    pub torre: Option<String>,
    pub piso: Option<i32>,
    pub tipo: crate::db::enums::TipoUnidad,
    #[schema(value_type = String)]
    pub coeficiente: BigDecimal,
}

impl From<Unidad> for AdminUnidadDto {
    fn from(u: Unidad) -> Self {
        Self {
            id: u.id,
            numero: u.numero,
            torre: u.torre,
            piso: u.piso,
            tipo: u.tipo,
            coeficiente: u.coeficiente,
        }
    }
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdminVehiculoDto {
    pub id: Uuid,
    pub placa: String,
    pub marca: Option<String>,
    pub modelo: Option<String>,
    pub color: Option<String>,
    pub tipo: crate::db::enums::TipoVehiculo,
}

impl From<Vehiculo> for AdminVehiculoDto {
    fn from(v: Vehiculo) -> Self {
        Self {
            id: v.id,
            placa: v.placa,
            marca: v.marca,
            modelo: v.modelo,
            color: v.color,
            tipo: v.tipo,
        }
    }
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdminMascotaDto {
    pub id: Uuid,
    pub nombre: String,
    pub tipo: String,
    pub raza: Option<String>,
    pub foto_url: Option<String>,
}

impl From<crate::domains::usuarios::models::Mascota> for AdminMascotaDto {
    fn from(m: crate::domains::usuarios::models::Mascota) -> Self {
        Self {
            id: m.id,
            nombre: m.nombre,
            tipo: m.tipo,
            raza: m.raza,
            foto_url: m.foto_url,
        }
    }
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdminPagoDto {
    pub id: Uuid,
    pub concepto: String,
    #[schema(value_type = String)]
    pub monto: BigDecimal,
    pub estado: EstadoPago,
    pub fecha_vencimiento: DateTime<Utc>,
    pub fecha_pago: Option<DateTime<Utc>>,
}

impl From<Pago> for AdminPagoDto {
    fn from(p: Pago) -> Self {
        Self {
            id: p.id,
            concepto: p.concepto,
            monto: p.monto,
            estado: p.estado,
            fecha_vencimiento: p.fecha_vencimiento,
            fecha_pago: p.fecha_pago,
        }
    }
}

/// Fields the admin may edit on a resident.
#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdminUpdateUsuarioRequest {
    pub nombre: Option<String>,
    pub telefono: Option<String>,
    pub rol: Option<String>,
    pub torre: Option<String>,
    pub apto: Option<String>,
    pub activo: Option<bool>,
}

/// Payload to invite a new resident.
#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct InvitarResidenteRequest {
    pub email: String,
    pub nombre: String,
    pub rol: String,
    pub torre: Option<String>,
    pub apto: Option<String>,
}

/// Query-string filters for the user list.
#[derive(Deserialize)]
pub struct ListaUsuariosQuery {
    #[serde(default)]
    pub q: Option<String>,
    #[serde(default)]
    pub rol: Option<String>,
}

// ── Handlers ────────────────────────────────────────────────────────────────

/// GET /admin/usuarios
///
/// List all users in the admin's conjunto with optional filters.
#[utoipa::path(
    get,
    path = "/api/v1/admin/usuarios",
    tag = "admin",
    params(
        ("q" = Option<String>, Query, description = "Search by name or email"),
        ("rol" = Option<String>, Query, description = "Filter by role")
    ),
    responses(
        (status = 200, description = "Paginated user list", body = [AdminUsuarioDto]),
        (status = 403, description = "Requires admin role")
    )
)]
pub async fn listar_usuarios(
    State(state): State<AppState>,
    user: AuthUser,
    Query(query): Query<ListaUsuariosQuery>,
) -> ApiResult<Json<Vec<AdminUsuarioDto>>> {
    guard::require_admin(&user)?;

    let rol: Option<Rol> = match query.rol.as_deref() {
        Some(s) if !s.trim().is_empty() => {
            let r = s.trim().parse::<Rol>()
                .map_err(|_| ApiError::BadRequest(format!("rol inválido: {s}")))?;
            Some(r)
        }
        _ => None,
    };

    let mut conn = state.pool.get().await?;
    let rows = list_users(&mut conn, user.conjunto_id, query.q.as_deref(), rol).await?;
    let out = rows
        .into_iter()
        .map(
            |(id, nombre, email, telefono, rol, torre, apto, activo, numero_interno, created_at)| {
                AdminUsuarioDto {
                    id,
                    nombre,
                    email,
                    telefono,
                    rol,
                    torre,
                    apto,
                    activo,
                    numero_interno,
                    created_at,
                }
            },
        )
        .collect();
    Ok(Json(out))
}

/// GET /admin/usuarios/{id}
///
/// Full resident detail with unit, vehicles, pets, and recent payments.
#[utoipa::path(
    get,
    path = "/api/v1/admin/usuarios/{id}",
    tag = "admin",
    params(
        ("id" = Uuid, Path, description = "User ID")
    ),
    responses(
        (status = 200, description = "Full resident detail", body = AdminResidenteDetalleDto),
        (status = 403, description = "Requires admin role"),
        (status = 404, description = "User not found in this conjunto")
    )
)]
pub async fn detalle_usuario(
    State(state): State<AppState>,
    user: AuthUser,
    Path(target_id): Path<Uuid>,
) -> ApiResult<Json<AdminResidenteDetalleDto>> {
    guard::require_admin(&user)?;

    let mut conn = state.pool.get().await?;

    // Fetch the target user (must be in the same conjunto).
    let target = find_user_in_conjunto(&mut conn, target_id, user.conjunto_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("usuario no encontrado".into()))?;

    let unidad = match target.unidad_id {
        Some(uid) => find_unidad_by_id(&mut conn, uid).await?.map(AdminUnidadDto::from),
        None => None,
    };

    let vehiculos_rows: Vec<AdminVehiculoDto> = vehiculos::table
        .filter(vehiculos::usuario_id.eq(target_id))
        .order(vehiculos::created_at.desc())
        .select(Vehiculo::as_select())
        .load(&mut conn)
        .await?
        .into_iter()
        .map(AdminVehiculoDto::from)
        .collect();

    let mascotas_rows: Vec<AdminMascotaDto> = mascotas::table
        .filter(mascotas::usuario_id.eq(target_id))
        .order(mascotas::created_at.desc())
        .select(crate::domains::usuarios::models::Mascota::as_select())
        .load(&mut conn)
        .await?
        .into_iter()
        .map(AdminMascotaDto::from)
        .collect();

    let pagos_rows: Vec<AdminPagoDto> = pagos::table
        .filter(pagos::usuario_id.eq(target_id))
        .filter(pagos::conjunto_id.eq(user.conjunto_id))
        .order(pagos::created_at.desc())
        .limit(10)
        .select(Pago::as_select())
        .load(&mut conn)
        .await?
        .into_iter()
        .map(AdminPagoDto::from)
        .collect();

    Ok(Json(AdminResidenteDetalleDto {
        id: target.id,
        nombre: target.nombre,
        email: target.email,
        telefono: target.telefono,
        rol: target.rol,
        torre: target.torre,
        apto: target.apto,
        activo: target.activo,
        numero_interno: target.numero_interno,
        created_at: target.created_at,
        unidad,
        vehiculos: vehiculos_rows,
        mascotas: mascotas_rows,
        pagos_recientes: pagos_rows,
    }))
}

/// PUT /admin/usuarios/{id}
///
/// Edit resident fields (nombre, telefono, rol, torre, apto, activo).
#[utoipa::path(
    put,
    path = "/api/v1/admin/usuarios/{id}",
    tag = "admin",
    params(
        ("id" = Uuid, Path, description = "User ID")
    ),
    request_body = AdminUpdateUsuarioRequest,
    responses(
        (status = 200, description = "Updated user", body = AdminUsuarioDto),
        (status = 400, description = "Invalid role or empty name"),
        (status = 403, description = "Requires admin role"),
        (status = 404, description = "User not found in this conjunto")
    )
)]
pub async fn editar_usuario(
    State(state): State<AppState>,
    user: AuthUser,
    Path(target_id): Path<Uuid>,
    Json(req): Json<AdminUpdateUsuarioRequest>,
) -> ApiResult<Json<AdminUsuarioDto>> {
    guard::require_admin(&user)?;

    // Validate name if provided.
    if let Some(ref nombre) = req.nombre {
        if nombre.trim().is_empty() {
            return Err(ApiError::BadRequest("el nombre no puede estar vacío".into()));
        }
    }

    // Parse rol if provided.
    let rol: Option<Rol> = match req.rol.as_deref() {
        Some(s) if !s.trim().is_empty() => {
            let r = s.trim().parse::<Rol>()
                .map_err(|_| ApiError::BadRequest(format!("rol inválido: {s}")))?;
            Some(r)
        }
        _ => None,
    };
    if let Some(r) = rol {
        ensure_assignable_rol(&user, r)?;
    }

    let mut conn = state.pool.get().await?;
    let updated = update_user(
        &mut conn,
        target_id,
        user.conjunto_id,
        req.nombre,
        req.telefono,
        rol,
        req.torre,
        req.apto,
        req.activo,
    )
    .await?;

    Ok(Json(AdminUsuarioDto {
        id: updated.id,
        nombre: updated.nombre,
        email: updated.email,
        telefono: updated.telefono,
        rol: updated.rol,
        torre: updated.torre,
        apto: updated.apto,
        activo: updated.activo,
        numero_interno: updated.numero_interno,
        created_at: updated.created_at,
    }))
}

/// POST /admin/usuarios/invitar
///
/// Invite a new resident: create user with temporary password and
/// must_change_password = true.
#[utoipa::path(
    post,
    path = "/api/v1/admin/usuarios/invitar",
    tag = "admin",
    request_body = InvitarResidenteRequest,
    responses(
        (status = 201, description = "Resident created", body = AdminUsuarioDto),
        (status = 400, description = "Invalid fields"),
        (status = 403, description = "Requires admin role"),
        (status = 409, description = "Email already registered")
    )
)]
pub async fn invitar_residente(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<InvitarResidenteRequest>,
) -> ApiResult<(axum::http::StatusCode, Json<AdminUsuarioDto>)> {
    guard::require_admin(&user)?;

    let email = req.email.trim().to_lowercase();
    if email.is_empty() {
        return Err(ApiError::BadRequest("email es requerido".into()));
    }
    let nombre = req.nombre.trim().to_string();
    if nombre.is_empty() {
        return Err(ApiError::BadRequest("nombre es requerido".into()));
    }

    let rol: Rol = req.rol.trim().parse::<Rol>()
        .map_err(|_| ApiError::BadRequest(format!("rol inválido: {}", req.rol)))?;
    ensure_assignable_rol(&user, rol)?;

    // Temporary password: "temp_" + UUID v4; must_change_password = true.
    // It MUST be hashed before storage — insert_user writes the value verbatim
    // into password_hash, so passing the plaintext would (a) store a credential in
    // the clear and (b) make login impossible (verify_password expects an Argon2 hash).
    let temp_password = format!("temp_{}", Uuid::new_v4());
    let temp_password_hash = crate::auth::password::hash_password_blocking(temp_password.clone()).await?;

    let mut conn = state.pool.get().await?;

    // Generate a unique 4-digit numero_interno for the conjunto.
    let numero_interno = generate_numero_interno(&mut conn, user.conjunto_id).await?;

    let created = insert_user(
        &mut conn,
        user.conjunto_id,
        &nombre,
        &email,
        &temp_password_hash,
        rol,
        req.torre.as_deref(),
        req.apto.as_deref(),
        &numero_interno,
    )
    .await?;

    Ok((
        axum::http::StatusCode::CREATED,
        Json(AdminUsuarioDto {
            id: created.id,
            nombre: created.nombre,
            email: created.email,
            telefono: created.telefono,
            rol: created.rol,
            torre: created.torre,
            apto: created.apto,
            activo: created.activo,
            numero_interno: created.numero_interno,
            created_at: created.created_at,
        }),
    ))
}

/// A conjunto admin must not be able to mint a SUPER_ADMIN — that role is a
/// cross-tenant god account (see auth/guard.rs), so assigning it from an
/// admin-scoped endpoint is privilege escalation out of the tenant. Only an
/// existing super-admin may grant it.
fn ensure_assignable_rol(actor: &AuthUser, target: Rol) -> ApiResult<()> {
    if matches!(target, Rol::SuperAdmin) && !matches!(actor.rol, Rol::SuperAdmin) {
        return Err(ApiError::Forbidden);
    }
    Ok(())
}

// ── Repository helpers (inline, flat-module style) ──────────────────────────

/// Lightweight row for the list query (no full Usuario model load).
#[allow(clippy::type_complexity)]
async fn list_users(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    q: Option<&str>,
    rol: Option<Rol>,
) -> ApiResult<Vec<(Uuid, String, String, Option<String>, Rol, Option<String>, Option<String>, bool, String, DateTime<Utc>)>> {
    use diesel::PgTextExpressionMethods;

    let mut query = usuarios::table
        .filter(usuarios::conjunto_id.eq(conjunto_id))
        .into_boxed();

    if let Some(term) = q.map(str::trim).filter(|t| !t.is_empty()) {
        let pattern = format!("%{term}%");
        query = query.filter(
            usuarios::nombre
                .ilike(pattern.clone())
                .or(usuarios::email.ilike(pattern)),
        );
    }

    if let Some(r) = rol {
        query = query.filter(usuarios::rol.eq(r));
    }

    let rows = query
        .order(usuarios::nombre.asc())
        .select((
            usuarios::id,
            usuarios::nombre,
            usuarios::email,
            usuarios::telefono,
            usuarios::rol,
            usuarios::torre,
            usuarios::apto,
            usuarios::activo,
            usuarios::numero_interno,
            usuarios::created_at,
        ))
        .load(conn)
        .await?;
    Ok(rows)
}

/// Lookup a user row scoped to a conjunto (returns full Usuario model).
async fn find_user_in_conjunto(
    conn: &mut DbConn,
    user_id: Uuid,
    conjunto_id: Uuid,
) -> ApiResult<Option<crate::domains::usuarios::models::Usuario>> {
    let u = usuarios::table
        .filter(usuarios::id.eq(user_id))
        .filter(usuarios::conjunto_id.eq(conjunto_id))
        .select(crate::domains::usuarios::models::Usuario::as_select())
        .first(conn)
        .await
        .optional()?;
    Ok(u)
}

async fn find_unidad_by_id(conn: &mut DbConn, unidad_id: Uuid) -> ApiResult<Option<Unidad>> {
    let u = unidades::table
        .find(unidad_id)
        .select(Unidad::as_select())
        .first(conn)
        .await
        .optional()?;
    Ok(u)
}

/// Update editable fields on a user scoped to the admin's conjunto.
/// Returns the updated Usuario row, or 404 if not found.
async fn update_user(
    conn: &mut DbConn,
    target_id: Uuid,
    conjunto_id: Uuid,
    nombre: Option<String>,
    telefono: Option<String>,
    rol: Option<Rol>,
    torre: Option<String>,
    apto: Option<String>,
    activo: Option<bool>,
) -> ApiResult<crate::domains::usuarios::models::Usuario> {
    let updated = diesel::update(
        usuarios::table
            .filter(usuarios::id.eq(target_id))
            .filter(usuarios::conjunto_id.eq(conjunto_id)),
    )
    .set((
        nombre.map(|n| usuarios::nombre.eq(n)),
        telefono.map(|t| usuarios::telefono.eq(Some(t))),
        rol.map(|r| usuarios::rol.eq(r)),
        torre.map(|t| usuarios::torre.eq(Some(t))),
        apto.map(|a| usuarios::apto.eq(Some(a))),
        activo.map(|a| usuarios::activo.eq(a)),
    ))
    .returning(crate::domains::usuarios::models::Usuario::as_returning())
    .get_result(conn)
    .await
    .map_err(|e| match e {
        diesel::result::Error::NotFound => ApiError::NotFound("usuario no encontrado".into()),
        other => ApiError::from(other),
    })?;
    Ok(updated)
}

/// Insert a new user with temporary password and must_change_password = true.
async fn insert_user(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    nombre: &str,
    email: &str,
    password_hash: &str,
    rol: Rol,
    torre: Option<&str>,
    apto: Option<&str>,
    numero_interno: &str,
) -> ApiResult<crate::domains::usuarios::models::Usuario> {
    let created = diesel::insert_into(usuarios::table)
        .values((
            usuarios::conjunto_id.eq(conjunto_id),
            usuarios::nombre.eq(nombre),
            usuarios::email.eq(email),
            usuarios::password_hash.eq(password_hash),
            usuarios::must_change_password.eq(true),
            usuarios::rol.eq(rol),
            usuarios::torre.eq(torre),
            usuarios::apto.eq(apto),
            usuarios::activo.eq(true),
            usuarios::numero_interno.eq(numero_interno),
        ))
        .returning(crate::domains::usuarios::models::Usuario::as_returning())
        .get_result(conn)
        .await?;
    Ok(created)
}

/// Generate a unique 4-digit citofonía code for a given conjunto.
/// Retries up to 10 times on collisions.
async fn generate_numero_interno(conn: &mut DbConn, conjunto_id: Uuid) -> ApiResult<String> {
    for _ in 0..10 {
        // Derive 4 digits from a random UUID.
        let candidate = format!("{:04}", (Uuid::new_v4().as_u128() % 10000) as u16);
        let exists: bool = diesel::select(diesel::dsl::exists(
            usuarios::table
                .filter(usuarios::conjunto_id.eq(conjunto_id))
                .filter(usuarios::numero_interno.eq(&candidate)),
        ))
        .get_result(conn)
        .await?;
        if !exists {
            return Ok(candidate);
        }
    }
    // Fallback: take max + 1 (wraps at 9999).
    let max_code: Option<String> = usuarios::table
        .filter(usuarios::conjunto_id.eq(conjunto_id))
        .select(diesel::dsl::max(usuarios::numero_interno))
        .first(conn)
        .await?;
    let next = match max_code {
        Some(ref code) => {
            let n: u32 = code.parse().unwrap_or(0);
            format!("{:04}", (n + 1) % 10000)
        }
        None => "0001".to_string(),
    };
    Ok(next)
}
