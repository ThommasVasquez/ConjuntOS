use chrono::Utc;
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use uuid::Uuid;

use crate::db::schema::ad_spaces;
use crate::db::DbConn;
use crate::domains::ad_spaces::models::{AdSpace, AdSpaceChangeset, AdSpaceFeedDto, NuevoAdSpace};
use crate::error::ApiResult;

pub async fn list_all(conn: &mut DbConn, conjunto_id: Uuid) -> ApiResult<Vec<AdSpace>> {
    let rows = ad_spaces::table
        .filter(ad_spaces::conjunto_id.eq(conjunto_id))
        .order(ad_spaces::inicio_en.desc())
        .select(AdSpace::as_select())
        .load(conn)
        .await?;
    Ok(rows)
}

pub async fn list_active_for_feed(
    conn: &mut DbConn,
    conjunto_id: Uuid,
) -> ApiResult<Vec<AdSpaceFeedDto>> {
    let now = Utc::now();
    let rows = ad_spaces::table
        .filter(ad_spaces::conjunto_id.eq(conjunto_id))
        .filter(ad_spaces::activo.eq(true))
        .filter(ad_spaces::inicio_en.le(now))
        .filter(ad_spaces::fin_en.ge(now))
        .select(AdSpace::as_select())
        .load(conn)
        .await?;
    Ok(rows.into_iter().map(AdSpaceFeedDto::from).collect())
}

pub async fn find_by_id(conn: &mut DbConn, id: Uuid) -> ApiResult<Option<AdSpace>> {
    let row = ad_spaces::table
        .filter(ad_spaces::id.eq(id))
        .select(AdSpace::as_select())
        .first(conn)
        .await
        .optional()?;
    Ok(row)
}

pub async fn create(conn: &mut DbConn, nuevo: NuevoAdSpace) -> ApiResult<AdSpace> {
    let row = diesel::insert_into(ad_spaces::table)
        .values(&nuevo)
        .returning(AdSpace::as_returning())
        .get_result(conn)
        .await?;
    Ok(row)
}

pub async fn update(
    conn: &mut DbConn,
    id: Uuid,
    changes: AdSpaceChangeset,
) -> ApiResult<Option<AdSpace>> {
    let row = diesel::update(ad_spaces::table.filter(ad_spaces::id.eq(id)))
        .set(&changes)
        .returning(AdSpace::as_returning())
        .get_result(conn)
        .await
        .optional()?;
    Ok(row)
}

pub async fn delete(conn: &mut DbConn, conjunto_id: Uuid, id: Uuid) -> ApiResult<usize> {
    let deleted = diesel::delete(
        ad_spaces::table
            .filter(ad_spaces::id.eq(id))
            .filter(ad_spaces::conjunto_id.eq(conjunto_id)),
    )
    .execute(conn)
    .await?;
    Ok(deleted)
}

pub async fn register_impression(conn: &mut DbConn, id: Uuid) -> ApiResult<()> {
    diesel::update(ad_spaces::table.filter(ad_spaces::id.eq(id)))
        .set(ad_spaces::impresiones.eq(ad_spaces::impresiones + 1))
        .execute(conn)
        .await?;
    Ok(())
}

pub async fn register_click(conn: &mut DbConn, id: Uuid) -> ApiResult<()> {
    diesel::update(ad_spaces::table.filter(ad_spaces::id.eq(id)))
        .set(ad_spaces::clics.eq(ad_spaces::clics + 1))
        .execute(conn)
        .await?;
    Ok(())
}
