use bigdecimal::BigDecimal;
use chrono::{Datelike, NaiveDate, Utc};
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use uuid::Uuid;

use crate::db::enums::{EstadoPago, EstadoReserva, MetodoPago};
use crate::db::schema::{pagos, recibos_publicos, reservas, usuarios};
use crate::db::DbConn;
use crate::domains::pagos::models::{Pago, ReciboPublico};
use crate::error::ApiResult;

pub async fn unidad_de_usuario(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    usuario_id: Uuid,
) -> ApiResult<Option<Uuid>> {
    let unidad: Option<Option<Uuid>> = usuarios::table
        .filter(usuarios::id.eq(usuario_id))
        .filter(usuarios::conjunto_id.eq(conjunto_id))
        .select(usuarios::unidad_id)
        .first(conn)
        .await
        .optional()?;
    Ok(unidad.flatten())
}

pub async fn pagos_de_unidad(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    unidad_id: Uuid,
) -> ApiResult<Vec<Pago>> {
    let rows = pagos::table
        .filter(pagos::conjunto_id.eq(conjunto_id))
        .filter(pagos::unidad_id.eq(unidad_id))
        .order(pagos::created_at.desc())
        .limit(24)
        .select(Pago::as_select())
        .load(conn)
        .await?;
    Ok(rows)
}

pub async fn recibos_de_unidad(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    unidad_id: Uuid,
) -> ApiResult<Vec<ReciboPublico>> {
    let rows = recibos_publicos::table
        .filter(recibos_publicos::conjunto_id.eq(conjunto_id))
        .filter(recibos_publicos::unidad_id.eq(unidad_id))
        .order(recibos_publicos::created_at.desc())
        .limit(12)
        .select(ReciboPublico::as_select())
        .load(conn)
        .await?;
    Ok(rows)
}

/// Simulated payment (legacy parity): only the owner can pay their pago.
pub async fn pagar(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    usuario_id: Uuid,
    pago_id: Uuid,
    metodo: MetodoPago,
) -> ApiResult<Option<Pago>> {
    let row = diesel::update(
        pagos::table
            .filter(pagos::id.eq(pago_id))
            .filter(pagos::conjunto_id.eq(conjunto_id))
            .filter(pagos::usuario_id.eq(usuario_id)),
    )
    .set((
        pagos::estado.eq(EstadoPago::Pagado),
        pagos::fecha_pago.eq(Utc::now()),
        pagos::metodo.eq(metodo),
    ))
    .returning(Pago::as_returning())
    .get_result(conn)
    .await
    .optional()?;
    Ok(row)
}

/// Sum of PAGADO amounts with fecha_pago in the current UTC month.
pub async fn recaudo_mes(conn: &mut DbConn, conjunto_id: Uuid) -> ApiResult<BigDecimal> {
    let now = Utc::now();
    let month_start = NaiveDate::from_ymd_opt(now.year(), now.month(), 1)
        .expect("first of month is valid")
        .and_hms_opt(0, 0, 0)
        .expect("midnight is valid")
        .and_utc();
    let total: Option<BigDecimal> = pagos::table
        .filter(pagos::conjunto_id.eq(conjunto_id))
        .filter(pagos::estado.eq(EstadoPago::Pagado))
        .filter(pagos::fecha_pago.ge(month_start))
        .select(diesel::dsl::sum(pagos::monto))
        .first(conn)
        .await?;
    Ok(total.unwrap_or_else(|| BigDecimal::from(0)))
}

pub async fn reservas_pendientes(conn: &mut DbConn, conjunto_id: Uuid) -> ApiResult<i64> {
    let count = reservas::table
        .filter(reservas::conjunto_id.eq(conjunto_id))
        .filter(reservas::estado.eq(EstadoReserva::Pendiente))
        .count()
        .get_result(conn)
        .await?;
    Ok(count)
}
