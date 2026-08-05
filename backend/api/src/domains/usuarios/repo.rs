use bigdecimal::BigDecimal;
use diesel::prelude::*;
use diesel_async::scoped_futures::ScopedFutureExt;
use diesel_async::{AsyncConnection, RunQueryDsl};
use uuid::Uuid;

use crate::db::enums::{Rol, TipoUnidad};
use crate::db::schema::{
    mascotas, native_push_tokens, push_subscriptions, tramites, unidades, usuarios, vehiculos,
};
use crate::db::DbConn;
use crate::domains::conjuntos::models::Unidad;
use crate::domains::parqueadero::models::Vehiculo;
use crate::domains::tramites::models::Tramite;
use crate::domains::usuarios::models::Usuario;
use crate::error::{ApiError, ApiResult};

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

/// Roles that keep a conjunto operable. If the last one deletes itself there is
/// nobody left to bill, approve or re-invite anyone.
fn manda_el_conjunto(rol: Rol) -> bool {
    matches!(rol, Rol::Administrador | Rol::SuperAdmin)
}

/// Erases a user's personal data in place and deactivates the account
/// (Play Store / GDPR "delete my account").
///
/// This is deliberately NOT a `DELETE FROM usuarios`: 30 tables carry a
/// `usuario_id` FK with no ON DELETE rule, so the delete would simply fail — and
/// several of those tables (pagos, multas, asamblea_votos) hold records the
/// copropiedad is legally required to retain. Instead the PII is scrubbed off the
/// row and the now-nameless row stays behind to satisfy those foreign keys.
///
/// Bumping `password_changed_at` revokes every JWT already issued to this user
/// (auth/extract.rs:50), so all their sessions die the instant this commits.
pub async fn anonymize_account(conn: &mut DbConn, user_id: Uuid) -> ApiResult<()> {
    conn.transaction(|conn| {
        async move {
            let user = usuarios::table
                .find(user_id)
                .select(Usuario::as_select())
                .first(conn)
                .await
                .optional()?
                .ok_or(ApiError::Unauthorized)?;

            if manda_el_conjunto(user.rol) {
                let otros: i64 = usuarios::table
                    .filter(usuarios::conjunto_id.eq(user.conjunto_id))
                    .filter(usuarios::activo.eq(true))
                    .filter(usuarios::id.ne(user_id))
                    .filter(
                        usuarios::rol
                            .eq(Rol::Administrador)
                            .or(usuarios::rol.eq(Rol::SuperAdmin)),
                    )
                    .count()
                    .get_result(conn)
                    .await?;
                if otros == 0 {
                    return Err(ApiError::Conflict(
                        "eres el único administrador del conjunto; nombra otro administrador antes de eliminar tu cuenta".into(),
                    ));
                }
            }

            // Frees the real address for re-registration while keeping
            // UNIQUE(email) satisfied. `.invalid` is reserved by RFC 2606 and can
            // never resolve, so nothing can ever be mailed to this row again.
            let lapida = format!("eliminado-{user_id}@conjuntos.invalid");

            diesel::update(usuarios::table.find(user_id))
                .set((
                    usuarios::nombre.eq("Usuario eliminado"),
                    usuarios::email.eq(lapida),
                    // Not a parseable Argon2 hash, so verify_password always
                    // returns false (auth/password.rs:24) — no password can ever
                    // open this account again.
                    usuarios::password_hash.eq(""),
                    usuarios::telefono.eq(None::<String>),
                    usuarios::avatar.eq(None::<String>),
                    usuarios::genero.eq(None::<String>),
                    usuarios::activo.eq(false),
                    usuarios::password_changed_at.eq(chrono::Utc::now()),
                ))
                .execute(conn)
                .await?;

            // Push registrations are pure delivery routing with no retention
            // basis; leaving them would keep pushing to a deleted user's device.
            diesel::delete(
                native_push_tokens::table.filter(native_push_tokens::usuario_id.eq(user_id)),
            )
            .execute(conn)
            .await?;
            diesel::delete(
                push_subscriptions::table.filter(push_subscriptions::usuario_id.eq(user_id)),
            )
            .execute(conn)
            .await?;

            // Pets and vehicles are personal data (names, plates) and are leaf
            // tables — nothing references them, so they can go for real.
            diesel::delete(mascotas::table.filter(mascotas::usuario_id.eq(user_id)))
                .execute(conn)
                .await?;
            diesel::delete(vehiculos::table.filter(vehiculos::usuario_id.eq(user_id)))
                .execute(conn)
                .await?;

            Ok::<_, ApiError>(())
        }
        .scope_boxed()
    })
    .await
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
