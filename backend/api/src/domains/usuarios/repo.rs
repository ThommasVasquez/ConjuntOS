use bigdecimal::BigDecimal;
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use uuid::Uuid;

use crate::db::enums::TipoUnidad;
use crate::db::schema::{unidades, usuarios};
use crate::db::DbConn;
use crate::domains::conjuntos::models::Unidad;
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

pub async fn find_unidad(conn: &mut DbConn, unidad_id: Uuid) -> ApiResult<Option<Unidad>> {
    let unidad = unidades::table
        .find(unidad_id)
        .select(Unidad::as_select())
        .first(conn)
        .await
        .optional()?;
    Ok(unidad)
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
