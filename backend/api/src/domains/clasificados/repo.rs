use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use uuid::Uuid;

use crate::db::schema::{locales, usuarios};
use crate::db::DbConn;
use crate::domains::clasificados::models::{Local, NuevoLocal};
use crate::error::ApiResult;

type PropietarioRef = Option<(String, Option<String>)>;

pub async fn listar_clasificados(
    conn: &mut DbConn,
    conjunto_id: Uuid,
) -> ApiResult<Vec<(Local, PropietarioRef)>> {
    let rows = locales::table
        .left_join(usuarios::table)
        .filter(locales::conjunto_id.eq(conjunto_id))
        .filter(locales::activo.eq(true))
        .order(locales::created_at.desc())
        .limit(50)
        .select((
            Local::as_select(),
            (usuarios::nombre, usuarios::telefono).nullable(),
        ))
        .load(conn)
        .await?;
    Ok(rows)
}

pub async fn crear_clasificado(conn: &mut DbConn, nuevo: NuevoLocal) -> ApiResult<Local> {
    let row = diesel::insert_into(locales::table)
        .values(&nuevo)
        .returning(Local::as_returning())
        .get_result(conn)
        .await?;
    Ok(row)
}
