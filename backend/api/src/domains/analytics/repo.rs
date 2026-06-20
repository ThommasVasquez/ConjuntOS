use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use uuid::Uuid;

use crate::db::DbConn;
use crate::domains::analytics::dto::{ConteoRolDto, ConteoTorreDto, DemografiaDto};
use crate::error::ApiResult;

#[derive(QueryableByName)]
struct CountRow {
    #[diesel(sql_type = diesel::sql_types::BigInt)]
    cnt: i64,
}

#[derive(QueryableByName)]
struct RolCountRow {
    #[diesel(sql_type = diesel::sql_types::Text)]
    rol: String,
    #[diesel(sql_type = diesel::sql_types::BigInt)]
    cnt: i64,
}

#[derive(QueryableByName)]
struct TorreCountRow {
    #[diesel(sql_type = diesel::sql_types::Text)]
    torre: String,
    #[diesel(sql_type = diesel::sql_types::BigInt)]
    cnt: i64,
}

pub async fn demografia(conn: &mut DbConn, conjunto_id: Uuid) -> ApiResult<DemografiaDto> {
    let total_unidades = diesel::sql_query(
        "SELECT COUNT(*) as cnt FROM unidades WHERE conjunto_id = $1",
    )
    .bind::<diesel::sql_types::Uuid, _>(conjunto_id)
    .get_result::<CountRow>(conn)
    .await?
    .cnt;

    let total_usuarios = diesel::sql_query(
        "SELECT COUNT(*) as cnt FROM usuarios WHERE conjunto_id = $1 AND activo = true",
    )
    .bind::<diesel::sql_types::Uuid, _>(conjunto_id)
    .get_result::<CountRow>(conn)
    .await?
    .cnt;

    let por_rol: Vec<ConteoRolDto> = diesel::sql_query(
        "SELECT rol, COUNT(*) as cnt FROM usuarios WHERE conjunto_id = $1 AND activo = true GROUP BY rol ORDER BY cnt DESC",
    )
    .bind::<diesel::sql_types::Uuid, _>(conjunto_id)
    .load::<RolCountRow>(conn)
    .await?
    .into_iter()
    .map(|r| ConteoRolDto {
        rol: r.rol,
        cantidad: r.cnt,
    })
    .collect();

    let por_torre: Vec<ConteoTorreDto> = diesel::sql_query(
        "SELECT COALESCE(torre, 'Sin torre') as torre, COUNT(*) as cnt FROM usuarios WHERE conjunto_id = $1 AND activo = true GROUP BY torre ORDER BY cnt DESC",
    )
    .bind::<diesel::sql_types::Uuid, _>(conjunto_id)
    .load::<TorreCountRow>(conn)
    .await?
    .into_iter()
    .map(|r| ConteoTorreDto {
        torre: r.torre,
        cantidad: r.cnt,
    })
    .collect();

    let nuevos_este_mes = diesel::sql_query(
        "SELECT COUNT(*) as cnt FROM usuarios WHERE conjunto_id = $1 AND created_at >= date_trunc('month', now())",
    )
    .bind::<diesel::sql_types::Uuid, _>(conjunto_id)
    .get_result::<CountRow>(conn)
    .await?
    .cnt;

    let activos_30d = diesel::sql_query(
        "SELECT COUNT(*) as cnt FROM usuarios WHERE conjunto_id = $1 AND last_login_at >= now() - interval '30 days'",
    )
    .bind::<diesel::sql_types::Uuid, _>(conjunto_id)
    .get_result::<CountRow>(conn)
    .await?
    .cnt;

    Ok(DemografiaDto {
        total_unidades,
        total_usuarios,
        por_rol,
        por_torre,
        nuevos_este_mes,
        activos_30d,
    })
}
