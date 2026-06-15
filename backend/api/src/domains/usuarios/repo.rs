use bigdecimal::BigDecimal;
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use uuid::Uuid;

use crate::db::enums::TipoUnidad;
use crate::db::schema::{mascotas, tramites, unidades, usuarios, vehiculos};
use crate::db::DbConn;
use crate::domains::conjuntos::models::Unidad;
use crate::domains::parqueadero::models::Vehiculo;
use crate::domains::tramites::models::Tramite;
use crate::domains::usuarios::models::Usuario;
use crate::error::ApiResult;

pub async fn find_by_email(conn: &mut DbConn, email: &str) -> ApiResult<Option<Usuario>> {
    let user = usuarios::table
        .filter(usuarios::email.eq(email))
        .select(Usuario::as_select())
        .first(conn)
        .await
        .optional()?;
    Ok(user)
}

pub async fn find_by_id(conn: &mut DbConn, id: Uuid) -> ApiResult<Option<Usuario>> {
    let user = usuarios::table
        .find(id)
        .select(Usuario::as_select())
        .first(conn)
        .await
        .optional()?;
    Ok(user)
}

/// Active users in the conjunto for the citofonía directory (excluding the
/// caller). Optional case-insensitive filter on name or internal number.
#[allow(clippy::type_complexity)]
pub async fn directorio(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    exclude: Uuid,
    q: Option<&str>,
) -> ApiResult<Vec<(Uuid, String, String, crate::db::enums::Rol, Option<String>, Option<String>)>> {
    use diesel::PgTextExpressionMethods;

    let mut query = usuarios::table
        .filter(usuarios::conjunto_id.eq(conjunto_id))
        .filter(usuarios::activo.eq(true))
        .filter(usuarios::id.ne(exclude))
        .into_boxed();

    if let Some(term) = q.map(str::trim).filter(|t| !t.is_empty()) {
        let pattern = format!("%{term}%");
        query = query.filter(
            usuarios::nombre
                .ilike(pattern.clone())
                .or(usuarios::numero_interno.ilike(pattern)),
        );
    }

    let rows = query
        .order(usuarios::nombre.asc())
        .limit(100)
        .select((
            usuarios::id,
            usuarios::nombre,
            usuarios::numero_interno,
            usuarios::rol,
            usuarios::torre,
            usuarios::apto,
        ))
        .load(conn)
        .await?;
    Ok(rows)
}

pub async fn find_unidad(conn: &mut DbConn, unidad_id: Uuid) -> ApiResult<Option<Unidad>> {
    let unidad = unidades::table
        .find(unidad_id)
        .select(Unidad::as_select())
        .first(conn)
        .await
        .optional()?;
    Ok(unidad)
}

/// Vehículos aprobados/registrados del usuario (para su perfil).
pub async fn vehiculos_de(conn: &mut DbConn, usuario_id: Uuid) -> ApiResult<Vec<Vehiculo>> {
    let rows = vehiculos::table
        .filter(vehiculos::usuario_id.eq(usuario_id))
        .order(vehiculos::created_at.desc())
        .select(Vehiculo::as_select())
        .load(conn)
        .await?;
    Ok(rows)
}

/// Mascotas registradas del usuario (para su perfil).
pub async fn mascotas_de(
    conn: &mut DbConn,
    usuario_id: Uuid,
) -> ApiResult<Vec<crate::domains::usuarios::models::Mascota>> {
    let rows = mascotas::table
        .filter(mascotas::usuario_id.eq(usuario_id))
        .order(mascotas::created_at.desc())
        .select(crate::domains::usuarios::models::Mascota::as_select())
        .load(conn)
        .await?;
    Ok(rows)
}

/// Trámites solicitados por el usuario (para su perfil).
pub async fn tramites_de(conn: &mut DbConn, usuario_id: Uuid) -> ApiResult<Vec<Tramite>> {
    let rows = tramites::table
        .filter(tramites::usuario_id.eq(usuario_id))
        .order(tramites::created_at.desc())
        .select(Tramite::as_select())
        .load(conn)
        .await?;
    Ok(rows)
}

/// Updates a user's role and returns the refreshed row. Used by the tester
/// role-switch endpoint — the change is persisted, so the role is fully real.
pub async fn update_rol(
    conn: &mut DbConn,
    user_id: Uuid,
    rol: crate::db::enums::Rol,
) -> ApiResult<Usuario> {
    let user = diesel::update(usuarios::table.find(user_id))
        .set(usuarios::rol.eq(rol))
        .returning(Usuario::as_returning())
        .get_result(conn)
        .await?;
    Ok(user)
}

#[derive(AsChangeset, Default)]
#[diesel(table_name = usuarios)]
pub struct ProfileChanges {
    pub nombre: Option<String>,
    pub telefono: Option<String>,
    pub genero: Option<String>,
    pub avatar: Option<String>,
    pub torre: Option<String>,
    pub apto: Option<String>,
    pub unidad_id: Option<Uuid>,
}

pub async fn update_profile(
    conn: &mut DbConn,
    user_id: Uuid,
    changes: ProfileChanges,
) -> ApiResult<Usuario> {
    let user = diesel::update(usuarios::table.find(user_id))
        .set(changes)
        .returning(Usuario::as_returning())
        .get_result(conn)
        .await?;
    Ok(user)
}

pub async fn update_password(
    conn: &mut DbConn,
    user_id: Uuid,
    password_hash: &str,
) -> ApiResult<()> {
    diesel::update(usuarios::table.find(user_id))
        .set((
            usuarios::password_hash.eq(password_hash),
            usuarios::must_change_password.eq(false),
            // Invalidate every session token issued before this moment (revocation).
            usuarios::password_changed_at.eq(chrono::Utc::now()),
        ))
        .execute(conn)
        .await?;
    Ok(())
}

/// Legacy profile-save bootstrapped a unit when the resident filled torre/apto
/// before any unit existed. Coefficient starts at 0 until administration sets it.
pub async fn bootstrap_unidad(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    torre: Option<&str>,
    numero: &str,
) -> ApiResult<Unidad> {
    let unidad = diesel::insert_into(unidades::table)
        .values((
            unidades::conjunto_id.eq(conjunto_id),
            unidades::numero.eq(numero),
            unidades::torre.eq(torre),
            unidades::tipo.eq(TipoUnidad::Apartamento),
            unidades::coeficiente.eq(BigDecimal::from(0)),
        ))
        .returning(Unidad::as_returning())
        .get_result(conn)
        .await?;
    Ok(unidad)
}
