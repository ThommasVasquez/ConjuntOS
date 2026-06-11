use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use uuid::Uuid;

use crate::db::enums::Plan;
use crate::db::schema::conjuntos;
use crate::db::DbConn;
use crate::domains::conjuntos::models::Conjunto;
use crate::error::ApiResult;

pub async fn list_all(conn: &mut DbConn) -> ApiResult<Vec<Conjunto>> {
    let rows = conjuntos::table
        .order(conjuntos::created_at.desc())
        .select(Conjunto::as_select())
        .load(conn)
        .await?;
    Ok(rows)
}

#[derive(Insertable)]
#[diesel(table_name = conjuntos)]
pub struct NuevoConjunto {
    pub nombre: String,
    pub nit: Option<String>,
    pub subdominio: String,
    pub direccion: String,
    pub ciudad: String,
    pub logo_url: Option<String>,
    pub color_primario: Option<String>,
    pub plan: Option<Plan>,
    pub representante_legal: Option<String>,
    pub notaria_escritura: Option<String>,
    pub numero_escritura: Option<String>,
    pub fecha_escritura: Option<chrono::DateTime<chrono::Utc>>,
    pub matricula_inmobiliaria: Option<String>,
    pub total_unidades: Option<i32>,
}

pub async fn create(conn: &mut DbConn, nuevo: NuevoConjunto) -> ApiResult<Conjunto> {
    let row = diesel::insert_into(conjuntos::table)
        .values(nuevo)
        .returning(Conjunto::as_returning())
        .get_result(conn)
        .await?;
    Ok(row)
}

#[derive(AsChangeset, Default)]
#[diesel(table_name = conjuntos)]
pub struct ConjuntoChanges {
    pub nombre: Option<String>,
    pub nit: Option<String>,
    pub direccion: Option<String>,
    pub ciudad: Option<String>,
    pub logo_url: Option<String>,
    pub color_primario: Option<String>,
    pub plan: Option<Plan>,
    pub activo: Option<bool>,
    pub representante_legal: Option<String>,
    pub notaria_escritura: Option<String>,
    pub numero_escritura: Option<String>,
    pub fecha_escritura: Option<chrono::DateTime<chrono::Utc>>,
    pub matricula_inmobiliaria: Option<String>,
    pub total_unidades: Option<i32>,
}

pub async fn update(conn: &mut DbConn, id: Uuid, changes: ConjuntoChanges) -> ApiResult<Conjunto> {
    let row = diesel::update(conjuntos::table.find(id))
        .set(changes)
        .returning(Conjunto::as_returning())
        .get_result(conn)
        .await?;
    Ok(row)
}
