use diesel::prelude::*;
use diesel::result::OptionalExtension;
use diesel_async::RunQueryDsl;
use uuid::Uuid;

use crate::db::schema::{asamblea_actas, asamblea_subtitulos};
use crate::db::DbConn;
use crate::domains::ai::models::{AsambleaActa, AsambleaSubtitulo, NuevaActa, NuevoSubtitulo};
use crate::error::ApiResult;

// ── Actas ────────────────────────────────────────────────────────────────

pub async fn get_acta(conn: &mut DbConn, asamblea_id: Uuid) -> ApiResult<Option<AsambleaActa>> {
    asamblea_actas::table
        .filter(asamblea_actas::asamblea_id.eq(asamblea_id))
        .select(AsambleaActa::as_select())
        .first(conn)
        .await
        .optional()
        .map_err(Into::into)
}

/// Inserts a new acta or updates the existing one for the assembly.
pub async fn upsert_acta(
    conn: &mut DbConn,
    asamblea_id: Uuid,
    contenido: String,
    generado_por: String,
) -> ApiResult<AsambleaActa> {
    let existing = get_acta(conn, asamblea_id).await?;

    match existing {
        Some(acta) => diesel::update(asamblea_actas::table.filter(asamblea_actas::id.eq(acta.id)))
            .set((
                asamblea_actas::contenido.eq(&contenido),
                asamblea_actas::generado_por.eq(&generado_por),
            ))
            .returning(AsambleaActa::as_returning())
            .get_result(conn)
            .await
            .map_err(Into::into),

        None => diesel::insert_into(asamblea_actas::table)
            .values(&NuevaActa {
                asamblea_id,
                contenido,
                generado_por,
            })
            .returning(AsambleaActa::as_returning())
            .get_result(conn)
            .await
            .map_err(Into::into),
    }
}

// ── Subtítulos ───────────────────────────────────────────────────────────

pub async fn list_subtitulos(
    conn: &mut DbConn,
    asamblea_id: Uuid,
) -> ApiResult<Vec<AsambleaSubtitulo>> {
    asamblea_subtitulos::table
        .filter(asamblea_subtitulos::asamblea_id.eq(asamblea_id))
        .order(asamblea_subtitulos::created_at.desc())
        .limit(50)
        .select(AsambleaSubtitulo::as_select())
        .load(conn)
        .await
        .map_err(Into::into)
}

pub async fn create_subtitulo(
    conn: &mut DbConn,
    nuevo: NuevoSubtitulo,
) -> ApiResult<AsambleaSubtitulo> {
    diesel::insert_into(asamblea_subtitulos::table)
        .values(&nuevo)
        .returning(AsambleaSubtitulo::as_returning())
        .get_result(conn)
        .await
        .map_err(Into::into)
}
