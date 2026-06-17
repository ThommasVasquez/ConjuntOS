use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel_async::scoped_futures::ScopedFutureExt;
use diesel_async::{AsyncConnection, RunQueryDsl};
use uuid::Uuid;

use crate::db::enums::{EstadoCorrespondencia, EstadoPaquete, Rol, TipoCorrespondencia};
use crate::db::schema::{correspondencia, paquetes, usuarios, visitas};
use crate::db::DbConn;
use crate::domains::notificaciones::repo::create_notificacion;
use crate::domains::vigilancia::models::{Correspondencia, NuevaVisita, Paquete, Visita};
use crate::error::{ApiError, ApiResult};

type ResidenteRef = (String, Option<String>, Option<String>);

/// UTC day window [00:00 today, 00:00 tomorrow) — accepted v1 simplification.
pub fn today_utc_range() -> (DateTime<Utc>, DateTime<Utc>) {
    let start = Utc::now()
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .expect("midnight is valid")
        .and_utc();
    (start, start + chrono::Duration::days(1))
}

/// Existence check used to keep cross-tenant recipients out (Law 2).
pub async fn usuario_en_conjunto(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    usuario_id: Uuid,
) -> ApiResult<bool> {
    let found: Option<Uuid> = usuarios::table
        .filter(usuarios::id.eq(usuario_id))
        .filter(usuarios::conjunto_id.eq(conjunto_id))
        .select(usuarios::id)
        .first(conn)
        .await
        .optional()?;
    Ok(found.is_some())
}

pub async fn visitas_de_hoy(
    conn: &mut DbConn,
    conjunto_id: Uuid,
) -> ApiResult<Vec<(Visita, ResidenteRef)>> {
    let (start, end) = today_utc_range();
    let rows = visitas::table
        .inner_join(usuarios::table)
        .filter(visitas::conjunto_id.eq(conjunto_id))
        .filter(visitas::fecha.ge(start))
        .filter(visitas::fecha.lt(end))
        .order(visitas::fecha.desc())
        .select((
            Visita::as_select(),
            (usuarios::nombre, usuarios::torre, usuarios::apto),
        ))
        .load(conn)
        .await?;
    Ok(rows)
}

pub async fn crear_visita(conn: &mut DbConn, nueva: NuevaVisita) -> ApiResult<Visita> {
    let row = diesel::insert_into(visitas::table)
        .values(nueva)
        .returning(Visita::as_returning())
        .get_result(conn)
        .await?;
    Ok(row)
}

pub async fn visitas_propias(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    usuario_id: Uuid,
    limit: i64,
) -> ApiResult<Vec<Visita>> {
    let rows = visitas::table
        .filter(visitas::conjunto_id.eq(conjunto_id))
        .filter(visitas::usuario_id.eq(usuario_id))
        .order(visitas::fecha.desc())
        .limit(limit)
        .select(Visita::as_select())
        .load(conn)
        .await?;
    Ok(rows)
}

pub async fn paquetes_conjunto(
    conn: &mut DbConn,
    conjunto_id: Uuid,
) -> ApiResult<Vec<(Paquete, ResidenteRef)>> {
    let rows = paquetes::table
        .inner_join(usuarios::table)
        .filter(paquetes::conjunto_id.eq(conjunto_id))
        .order(paquetes::fecha_llegada.desc())
        .limit(50)
        .select((
            Paquete::as_select(),
            (usuarios::nombre, usuarios::torre, usuarios::apto),
        ))
        .load(conn)
        .await?;
    Ok(rows)
}

/// Package arrival + recipient notification in one transaction: the resident
/// is always told about a package that exists, and vice versa.
pub async fn crear_paquete_con_notificacion(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    destinatario_id: Uuid,
    descripcion: &str,
    remitente: &str,
) -> ApiResult<Paquete> {
    conn.transaction(|conn| {
        async move {
            let paquete: Paquete = diesel::insert_into(paquetes::table)
                .values((
                    paquetes::conjunto_id.eq(conjunto_id),
                    paquetes::usuario_id.eq(destinatario_id),
                    paquetes::descripcion.eq(descripcion),
                    paquetes::remitente.eq(remitente),
                    paquetes::estado.eq(EstadoPaquete::EnPorteria),
                ))
                .returning(Paquete::as_returning())
                .get_result(conn)
                .await?;

            create_notificacion(
                conn,
                conjunto_id,
                destinatario_id,
                "PAQUETE",
                "Paquete en portería",
                &format!("Tienes un paquete de {remitente} en portería: {descripcion}"),
            )
            .await?;

            Ok::<_, ApiError>(paquete)
        }
        .scope_boxed()
    })
    .await
}

pub async fn entregar_paquete(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    paquete_id: Uuid,
) -> ApiResult<Option<Paquete>> {
    let row = diesel::update(
        paquetes::table
            .filter(paquetes::id.eq(paquete_id))
            .filter(paquetes::conjunto_id.eq(conjunto_id)),
    )
    .set((
        paquetes::estado.eq(EstadoPaquete::Entregado),
        paquetes::entregado_en.eq(Utc::now()),
    ))
    .returning(Paquete::as_returning())
    .get_result(conn)
    .await
    .optional()?;
    Ok(row)
}

pub async fn paquetes_propios_en_porteria(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    usuario_id: Uuid,
    limit: i64,
) -> ApiResult<Vec<Paquete>> {
    let rows = paquetes::table
        .filter(paquetes::conjunto_id.eq(conjunto_id))
        .filter(paquetes::usuario_id.eq(usuario_id))
        .filter(paquetes::estado.eq(EstadoPaquete::EnPorteria))
        .order(paquetes::fecha_llegada.desc())
        .limit(limit)
        .select(Paquete::as_select())
        .load(conn)
        .await?;
    Ok(rows)
}

/// (visitas hoy, paquetes EN_PORTERIA, residentes activos).
pub async fn stats(conn: &mut DbConn, conjunto_id: Uuid) -> ApiResult<(i64, i64, i64)> {
    let (start, end) = today_utc_range();
    let visitas_hoy: i64 = visitas::table
        .filter(visitas::conjunto_id.eq(conjunto_id))
        .filter(visitas::fecha.ge(start))
        .filter(visitas::fecha.lt(end))
        .count()
        .get_result(conn)
        .await?;
    let paquetes_pendientes: i64 = paquetes::table
        .filter(paquetes::conjunto_id.eq(conjunto_id))
        .filter(paquetes::estado.eq(EstadoPaquete::EnPorteria))
        .count()
        .get_result(conn)
        .await?;
    let total_residentes: i64 = usuarios::table
        .filter(usuarios::conjunto_id.eq(conjunto_id))
        .filter(usuarios::rol.eq_any(vec![Rol::Arrendatario, Rol::Propietario]))
        .filter(usuarios::activo.eq(true))
        .count()
        .get_result(conn)
        .await?;
    Ok((visitas_hoy, paquetes_pendientes, total_residentes))
}

// ── Correspondencia ────────────────────────────────────────────────────

pub async fn correspondencia_conjunto(
    conn: &mut DbConn,
    conjunto_id: Uuid,
) -> ApiResult<Vec<(Correspondencia, ResidenteRef)>> {
    let rows = correspondencia::table
        .inner_join(usuarios::table)
        .filter(correspondencia::conjunto_id.eq(conjunto_id))
        .order(correspondencia::fecha_llegada.desc())
        .limit(50)
        .select((
            Correspondencia::as_select(),
            (usuarios::nombre, usuarios::torre, usuarios::apto),
        ))
        .load(conn)
        .await?;
    Ok(rows)
}

pub async fn crear_correspondencia_con_notificacion(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    destinatario_id: Uuid,
    tipo: TipoCorrespondencia,
    remitente: &str,
    descripcion: Option<&str>,
) -> ApiResult<Correspondencia> {
    conn.transaction(|conn| {
        async move {
            let corr: Correspondencia = diesel::insert_into(correspondencia::table)
                .values((
                    correspondencia::conjunto_id.eq(conjunto_id),
                    correspondencia::usuario_id.eq(destinatario_id),
                    correspondencia::tipo.eq(tipo),
                    correspondencia::remitente.eq(remitente),
                    correspondencia::descripcion.eq(descripcion),
                    correspondencia::estado.eq(EstadoCorrespondencia::EnPorteria),
                ))
                .returning(Correspondencia::as_returning())
                .get_result(conn)
                .await?;

            create_notificacion(
                conn,
                conjunto_id,
                destinatario_id,
                "PAQUETE",
                "Correspondencia en portería",
                &format!("Tienes {tipo} de {remitente} en portería{}",
                    descripcion.map_or(String::new(), |d| format!(": {d}"))),
            )
            .await?;

            Ok::<_, ApiError>(corr)
        }
        .scope_boxed()
    })
    .await
}

pub async fn entregar_correspondencia(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    corr_id: Uuid,
) -> ApiResult<Option<Correspondencia>> {
    let row = diesel::update(
        correspondencia::table
            .filter(correspondencia::id.eq(corr_id))
            .filter(correspondencia::conjunto_id.eq(conjunto_id)),
    )
    .set((
        correspondencia::estado.eq(EstadoCorrespondencia::Entregado),
        correspondencia::entregado_en.eq(Utc::now()),
    ))
    .returning(Correspondencia::as_returning())
    .get_result(conn)
    .await
    .optional()?;
    Ok(row)
}
