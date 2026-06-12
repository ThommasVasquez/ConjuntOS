use diesel::prelude::*;
use diesel_async::scoped_futures::ScopedFutureExt;
use diesel_async::{AsyncConnection, RunQueryDsl};
use uuid::Uuid;

use crate::db::enums::Rol;
use crate::db::schema::{anuncios, usuarios};
use crate::db::DbConn;
use crate::domains::comunicaciones::models::{Anuncio, NuevoAnuncio};
use crate::domains::notificaciones::repo::create_notificacion;
use crate::error::{ApiError, ApiResult};

/// (id, nombre, torre, apto, telefono) — Habeas-Data-limited fields only.
pub type DirectorioRow = (Uuid, String, Option<String>, Option<String>, Option<String>);

pub async fn listar_anuncios(conn: &mut DbConn, conjunto_id: Uuid) -> ApiResult<Vec<Anuncio>> {
    let rows = anuncios::table
        .filter(anuncios::conjunto_id.eq(conjunto_id))
        .order((anuncios::fijado.desc(), anuncios::publicado_en.desc()))
        .limit(50)
        .select(Anuncio::as_select())
        .load(conn)
        .await?;
    Ok(rows)
}

/// First ~100 chars of the announcement body, used as the notification message.
fn resumen(contenido: &str) -> String {
    let mut s: String = contenido.chars().take(100).collect();
    if contenido.chars().count() > 100 {
        s.push_str("...");
    }
    s
}

/// Announcement + notification fan-out in one transaction: every active
/// resident (ARRENDATARIO|PROPIETARIO) is told about an announcement that
/// exists, and vice versa.
pub async fn crear_anuncio_con_notificaciones(
    conn: &mut DbConn,
    nuevo: NuevoAnuncio,
) -> ApiResult<Anuncio> {
    conn.transaction(|conn| {
        async move {
            let anuncio: Anuncio = diesel::insert_into(anuncios::table)
                .values(&nuevo)
                .returning(Anuncio::as_returning())
                .get_result(conn)
                .await?;

            let residentes: Vec<Uuid> = usuarios::table
                .filter(usuarios::conjunto_id.eq(anuncio.conjunto_id))
                .filter(usuarios::rol.eq_any(vec![Rol::Arrendatario, Rol::Propietario]))
                .filter(usuarios::activo.eq(true))
                .select(usuarios::id)
                .load(conn)
                .await?;

            let titulo = format!("Nuevo anuncio: {}", anuncio.titulo);
            let mensaje = resumen(&anuncio.contenido);
            for residente_id in residentes {
                create_notificacion(
                    conn,
                    anuncio.conjunto_id,
                    residente_id,
                    "INFO",
                    &titulo,
                    &mensaje,
                )
                .await?;
            }

            Ok::<_, ApiError>(anuncio)
        }
        .scope_boxed()
    })
    .await
}

pub async fn eliminar_anuncio(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    anuncio_id: Uuid,
) -> ApiResult<usize> {
    let deleted = diesel::delete(
        anuncios::table
            .filter(anuncios::id.eq(anuncio_id))
            .filter(anuncios::conjunto_id.eq(conjunto_id)),
    )
    .execute(conn)
    .await?;
    Ok(deleted)
}

/// Apply a partial update to an announcement, scoped to its conjunto (Law 2:
/// tenant isolation — an admin can only edit announcements of their own
/// conjunto). Returns the updated row, or None if it doesn't exist here.
pub async fn update_anuncio(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    anuncio_id: Uuid,
    cambios: crate::domains::comunicaciones::models::AnuncioCambios,
) -> ApiResult<Option<Anuncio>> {
    let row = diesel::update(
        anuncios::table
            .filter(anuncios::id.eq(anuncio_id))
            .filter(anuncios::conjunto_id.eq(conjunto_id)),
    )
    .set(cambios)
    .returning(Anuncio::as_returning())
    .get_result(conn)
    .await
    .optional()?;
    Ok(row)
}

pub async fn directorio_residentes(
    conn: &mut DbConn,
    conjunto_id: Uuid,
) -> ApiResult<Vec<DirectorioRow>> {
    let rows = usuarios::table
        .filter(usuarios::conjunto_id.eq(conjunto_id))
        .filter(usuarios::activo.eq(true))
        .filter(
            // A resident is anyone with a Propietario/Arrendatario role, OR
            // anyone who actually has an apartment assigned (torre + apto).
            // The latter covers testers and admins who really live in a unit
            // (e.g. SUPER_ADMIN assigned to apt 1410), so they can receive visits.
            usuarios::rol
                .eq_any(vec![Rol::Arrendatario, Rol::Propietario])
                .or(usuarios::torre.is_not_null().and(usuarios::apto.is_not_null())),
        )
        .order((usuarios::torre.asc(), usuarios::apto.asc()))
        .select((
            usuarios::id,
            usuarios::nombre,
            usuarios::torre,
            usuarios::apto,
            usuarios::telefono,
        ))
        .load(conn)
        .await?;
    Ok(rows)
}
