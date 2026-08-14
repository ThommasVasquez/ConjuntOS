use chrono::Utc;
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use uuid::Uuid;

use crate::db::schema::{mudanzas, usuarios};
use crate::db::DbConn;

use super::models::{Mudanza, NewMudanza};

pub async fn create(conn: &mut DbConn, new_m: NewMudanza) -> anyhow::Result<Mudanza> {
    let m = diesel::insert_into(mudanzas::table)
        .values(&new_m)
        .get_result::<Mudanza>(conn)
        .await?;
    Ok(m)
}

pub async fn find_by_id(conn: &mut DbConn, id: Uuid) -> anyhow::Result<Option<Mudanza>> {
    let res = mudanzas::table
        .filter(mudanzas::id.eq(id))
        .first::<Mudanza>(conn)
        .await
        .optional()?;
    Ok(res)
}

pub async fn list_by_conjunto(conn: &mut DbConn, conjunto_id: Uuid) -> anyhow::Result<Vec<Mudanza>> {
    let res = mudanzas::table
        .filter(mudanzas::conjunto_id.eq(conjunto_id))
        .order(mudanzas::created_at.desc())
        .load::<Mudanza>(conn)
        .await?;
    Ok(res)
}

pub async fn list_by_usuario(conn: &mut DbConn, usuario_id: Uuid) -> anyhow::Result<Vec<Mudanza>> {
    let res = mudanzas::table
        .filter(mudanzas::usuario_id.eq(usuario_id))
        .order(mudanzas::created_at.desc())
        .load::<Mudanza>(conn)
        .await?;
    Ok(res)
}

pub async fn aprobar(
    conn: &mut DbConn,
    id: Uuid,
    codigo_pz: &str,
    admin_id: Uuid,
) -> anyhow::Result<Mudanza> {
    let m = diesel::update(mudanzas::table.filter(mudanzas::id.eq(id)))
        .set((
            mudanzas::estado.eq("APROBADO"),
            mudanzas::paz_y_salvo_codigo.eq(codigo_pz),
            mudanzas::aprobado_por_usuario_id.eq(admin_id),
            mudanzas::aprobado_at.eq(Utc::now()),
            mudanzas::updated_at.eq(Utc::now()),
        ))
        .get_result::<Mudanza>(conn)
        .await?;
    Ok(m)
}

pub async fn rechazar(
    conn: &mut DbConn,
    id: Uuid,
    motivo: &str,
    admin_id: Uuid,
) -> anyhow::Result<Mudanza> {
    let m = diesel::update(mudanzas::table.filter(mudanzas::id.eq(id)))
        .set((
            mudanzas::estado.eq("RECHAZADO"),
            mudanzas::motivo_rechazo.eq(motivo),
            mudanzas::aprobado_por_usuario_id.eq(admin_id),
            mudanzas::aprobado_at.eq(Utc::now()),
            mudanzas::updated_at.eq(Utc::now()),
        ))
        .get_result::<Mudanza>(conn)
        .await?;
    Ok(m)
}

pub async fn update_estado(
    conn: &mut DbConn,
    id: Uuid,
    nuevo_estado: &str,
) -> anyhow::Result<Mudanza> {
    let m = diesel::update(mudanzas::table.filter(mudanzas::id.eq(id)))
        .set((
            mudanzas::estado.eq(nuevo_estado),
            mudanzas::updated_at.eq(Utc::now()),
        ))
        .get_result::<Mudanza>(conn)
        .await?;
    Ok(m)
}

/// Helper: fetch user details (name, email, torre, apto)
pub async fn get_user_info(
    conn: &mut DbConn,
    uid: Uuid,
) -> anyhow::Result<Option<(String, String, Option<String>, Option<String>)>> {
    let res = usuarios::table
        .filter(usuarios::id.eq(uid))
        .select((
            usuarios::nombre,
            usuarios::email,
            usuarios::torre,
            usuarios::apto,
        ))
        .first::<(String, String, Option<String>, Option<String>)>(conn)
        .await
        .optional()?;
    Ok(res)
}

/// Helper: deactivate resident user and unlink unit on outgoing move completion
pub async fn deactivate_user(conn: &mut DbConn, uid: Uuid) -> anyhow::Result<()> {
    diesel::update(usuarios::table.filter(usuarios::id.eq(uid)))
        .set((
            usuarios::activo.eq(false),
            usuarios::unidad_id.eq(Option::<Uuid>::None),
            usuarios::torre.eq(Option::<String>::None),
            usuarios::apto.eq(Option::<String>::None),
        ))
        .execute(conn)
        .await?;
    Ok(())
}
