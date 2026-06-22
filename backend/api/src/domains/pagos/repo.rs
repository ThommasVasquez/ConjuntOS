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

/// Fetch a pago the caller owns (needed to read its amount before charging).
pub async fn pago_por_id(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    usuario_id: Uuid,
    pago_id: Uuid,
) -> ApiResult<Option<Pago>> {
    let row = pagos::table
        .filter(pagos::id.eq(pago_id))
        .filter(pagos::conjunto_id.eq(conjunto_id))
        .filter(pagos::usuario_id.eq(usuario_id))
        .select(Pago::as_select())
        .first(conn)
        .await
        .optional()?;
    Ok(row)
}

/// Apply a gateway outcome to an owned pago: set estado/metodo/provider-ref,
/// stamping fecha_pago only when actually paid. Only the owner can pay their pago.
pub async fn aplicar_estado_pago(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    usuario_id: Uuid,
    pago_id: Uuid,
    estado: EstadoPago,
    metodo: MetodoPago,
    referencia: &str,
) -> ApiResult<Option<Pago>> {
    let fecha_pago = (estado == EstadoPago::Pagado).then(Utc::now);
    let row = diesel::update(
        pagos::table
            .filter(pagos::id.eq(pago_id))
            .filter(pagos::conjunto_id.eq(conjunto_id))
            .filter(pagos::usuario_id.eq(usuario_id)),
    )
    .set((
        pagos::estado.eq(estado),
        pagos::metodo.eq(metodo),
        pagos::wompi_ref.eq(referencia),
        pagos::fecha_pago.eq(fecha_pago),
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
