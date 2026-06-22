use chrono::{DateTime, NaiveDate, Utc};
use diesel::prelude::*;
use diesel_async::scoped_futures::ScopedFutureExt;
use diesel_async::{AsyncConnection, RunQueryDsl};
use uuid::Uuid;

use crate::db::enums::EstadoReserva;
use crate::db::schema::{areas_comunes, reservas, usuarios};
use crate::db::DbConn;
use crate::domains::reservas::models::{AreaComun, Reserva};
use crate::error::{ApiError, ApiResult};

pub async fn areas_activas(conn: &mut DbConn, conjunto_id: Uuid) -> ApiResult<Vec<AreaComun>> {
    let rows = areas_comunes::table
        .filter(areas_comunes::conjunto_id.eq(conjunto_id))
        .filter(areas_comunes::activa.eq(true))
        .order(areas_comunes::nombre.asc())
        .select(AreaComun::as_select())
        .load(conn)
        .await?;
    Ok(rows)
}

pub async fn find_area(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    area_id: Uuid,
) -> ApiResult<Option<AreaComun>> {
    let row = areas_comunes::table
        .filter(areas_comunes::id.eq(area_id))
        .filter(areas_comunes::conjunto_id.eq(conjunto_id))
        .select(AreaComun::as_select())
        .first(conn)
        .await
        .optional()?;
    Ok(row)
}

/// Occupied [inicio, fin] pairs of non-cancelled reservations starting that day.
pub async fn slots_ocupados(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    area_id: Uuid,
    fecha: NaiveDate,
) -> ApiResult<Vec<(DateTime<Utc>, DateTime<Utc>)>> {
    let start = fecha
        .and_hms_opt(0, 0, 0)
        .expect("midnight is valid")
        .and_utc();
    let end = start + chrono::Duration::days(1);
    let rows = reservas::table
        .filter(reservas::conjunto_id.eq(conjunto_id))
        .filter(reservas::area_id.eq(area_id))
        .filter(reservas::estado.ne(EstadoReserva::Cancelada))
        .filter(reservas::fecha_inicio.ge(start))
        .filter(reservas::fecha_inicio.lt(end))
        .order(reservas::fecha_inicio.asc())
        .select((reservas::fecha_inicio, reservas::fecha_fin))
        .load(conn)
        .await?;
    Ok(rows)
}

/// Own upcoming/ongoing reservations (fecha_fin >= now) with area info.
pub async fn reservas_propias(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    usuario_id: Uuid,
) -> ApiResult<Vec<(Reserva, String, Option<String>)>> {
    let rows = reservas::table
        .inner_join(areas_comunes::table)
        .filter(reservas::conjunto_id.eq(conjunto_id))
        .filter(reservas::usuario_id.eq(usuario_id))
        .filter(reservas::fecha_fin.ge(Utc::now()))
        .order(reservas::fecha_inicio.asc())
        .select((
            Reserva::as_select(),
            areas_comunes::nombre,
            areas_comunes::imagen_url,
        ))
        .load(conn)
        .await?;
    Ok(rows)
}

/// Today's active reservations for a specific area, joined with user info.
/// Used by area admins (Piscina, Gym) to see who has reserved today.
pub async fn reservas_hoy_por_area(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    area_id: Uuid,
) -> ApiResult<Vec<(Reserva, String, String, Option<String>, Option<String>)>> {
    let now = Utc::now();
    let today_end = now
        .date_naive()
        .and_hms_opt(23, 59, 59)
        .unwrap()
        .and_utc();
    let rows = reservas::table
        .inner_join(areas_comunes::table.on(reservas::area_id.eq(areas_comunes::id)))
        .inner_join(usuarios::table.on(reservas::usuario_id.eq(usuarios::id)))
        .filter(reservas::conjunto_id.eq(conjunto_id))
        .filter(reservas::area_id.eq(area_id))
        .filter(reservas::estado.ne(EstadoReserva::Cancelada))
        .filter(reservas::fecha_inicio.le(today_end))
        .filter(reservas::fecha_fin.ge(now))
        .order(reservas::fecha_inicio.asc())
        .select((
            Reserva::as_select(),
            areas_comunes::nombre,
            usuarios::nombre,
            usuarios::torre.nullable(),
            usuarios::apto.nullable(),
        ))
        .load(conn)
        .await?;
    Ok(rows)
}

/// Overlap check + insert in one transaction.

/// Find a single reservation by ID with user + area info.
pub async fn find_reserva_by_id(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    id: Uuid,
) -> ApiResult<Option<(Reserva, String, String, Option<String>, Option<String>)>> {
    let row = reservas::table
        .inner_join(areas_comunes::table.on(reservas::area_id.eq(areas_comunes::id)))
        .inner_join(usuarios::table.on(reservas::usuario_id.eq(usuarios::id)))
        .filter(reservas::conjunto_id.eq(conjunto_id))
        .filter(reservas::id.eq(id))
        .select((
            Reserva::as_select(),
            areas_comunes::nombre,
            usuarios::nombre,
            usuarios::torre.nullable(),
            usuarios::apto.nullable(),
        ))
        .first(conn)
        .await
        .optional()?;
    Ok(row)
}

/// Overlap check + insert in one transaction. Estado is derived from the
/// area's deposit requirement (PENDIENTE awaiting deposit, else CONFIRMADA).
pub async fn crear_reserva(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    usuario_id: Uuid,
    area_id: Uuid,
    fecha_inicio: DateTime<Utc>,
    fecha_fin: DateTime<Utc>,
    notas: Option<String>,
) -> ApiResult<Reserva> {
    conn.transaction(|conn| {
        async move {
            let area: AreaComun = areas_comunes::table
                .filter(areas_comunes::id.eq(area_id))
                .filter(areas_comunes::conjunto_id.eq(conjunto_id))
                .filter(areas_comunes::activa.eq(true))
                .select(AreaComun::as_select())
                .first(conn)
                .await
                .optional()?
                .ok_or_else(|| ApiError::NotFound("área común no encontrada".into()))?;

            let overlapping: i64 = reservas::table
                .filter(reservas::conjunto_id.eq(conjunto_id))
                .filter(reservas::area_id.eq(area_id))
                .filter(reservas::estado.ne(EstadoReserva::Cancelada))
                .filter(reservas::fecha_inicio.lt(fecha_fin))
                .filter(reservas::fecha_fin.gt(fecha_inicio))
                .count()
                .get_result(conn)
                .await?;
            if overlapping > 0 {
                return Err(ApiError::Conflict(
                    "este horario ya se encuentra reservado".into(),
                ));
            }

            let estado = if area.requiere_deposito {
                EstadoReserva::Pendiente
            } else {
                EstadoReserva::Confirmada
            };

            let reserva: Reserva = diesel::insert_into(reservas::table)
                .values((
                    reservas::conjunto_id.eq(conjunto_id),
                    reservas::usuario_id.eq(usuario_id),
                    reservas::area_id.eq(area_id),
                    reservas::fecha_inicio.eq(fecha_inicio),
                    reservas::fecha_fin.eq(fecha_fin),
                    reservas::estado.eq(estado),
                    reservas::notas.eq(notas),
                ))
                .returning(Reserva::as_returning())
                .get_result(conn)
                .await?;
            Ok::<_, ApiError>(reserva)
        }
        .scope_boxed()
    })
    .await
}
