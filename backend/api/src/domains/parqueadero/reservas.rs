//! Reservas de CUPO de parqueadero de visitante (con antelación).
//!
//! El residente reserva un cupo del pool de celdas de visitante de una categoría
//! (CARRO/MOTO/BICI) para una franja [llegada, fin]. NO elige celda: el vigilante
//! asigna la celda física cuando la visita llega. La disponibilidad se calcula
//! por SOLAPAMIENTO: en la franja hay cupo si las reservas activas que se solapan
//! son menos que las celdas de visitante de esa categoría.

use chrono::{DateTime, Duration, Utc};
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use uuid::Uuid;

use crate::db::enums::TipoCeldaParqueadero;
use crate::db::schema::{parqueaderos, reservas_visitante_parqueadero};
use crate::db::DbConn;
use crate::domains::parqueadero::dto::{DisponibilidadCupoDto, ReservaVisitanteDto};
use crate::domains::parqueadero::models::{NuevaReservaVisitante, ReservaVisitante};
use crate::error::{ApiError, ApiResult};

/// Horizonte para reservas de "tiempo libre" (sin hora de salida): se asume que
/// ocupan el cupo durante esta ventana para el cálculo de solapamiento.
pub const HORIZONTE_TIEMPO_LIBRE_MIN: i64 = 240; // 4 horas

/// Estados que mantienen "viva" una reserva (ocupan cupo en el solapamiento).
const ESTADOS_ACTIVOS: [&str; 2] = ["PENDIENTE", "LLEGO"];

/// Normaliza y valida la categoría de celda (carro/moto/bici).
pub fn normalizar_categoria(cat: &str) -> ApiResult<String> {
    let c = cat.trim().to_uppercase();
    match c.as_str() {
        "CARRO" | "MOTO" | "BICI" => Ok(c),
        _ => Err(ApiError::BadRequest(
            "categoría inválida (use CARRO, MOTO o BICI)".into(),
        )),
    }
}

/// Fin efectivo de una franja para el cálculo de solapamiento: si hay duración,
/// llegada + duración; si es tiempo libre, llegada + horizonte.
fn fin_efectivo(llegada: DateTime<Utc>, duracion_minutos: Option<i32>) -> DateTime<Utc> {
    match duracion_minutos {
        Some(m) if m > 0 => llegada + Duration::minutes(m as i64),
        _ => llegada + Duration::minutes(HORIZONTE_TIEMPO_LIBRE_MIN),
    }
}

fn to_dto(r: &ReservaVisitante) -> ReservaVisitanteDto {
    ReservaVisitanteDto {
        id: r.id,
        residente_id: r.residente_id,
        residente_nombre: r.residente_nombre.clone(),
        categoria: r.categoria.clone(),
        visitante_nombre: r.visitante_nombre.clone(),
        placa: r.placa.clone(),
        llegada_estimada: r.llegada_estimada,
        duracion_minutos: r.duracion_minutos,
        fin_estimado: r.fin_estimado,
        tiempo_libre: r.duracion_minutos.is_none(),
        estado: r.estado.clone(),
        sesion_id: r.sesion_id,
        notas: r.notas.clone(),
        created_at: r.created_at,
    }
}

/// Cuenta las celdas de visitante de una categoría en el conjunto.
async fn total_celdas_visitante(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    categoria: &str,
) -> ApiResult<i64> {
    let n: i64 = parqueaderos::table
        .filter(parqueaderos::conjunto_id.eq(conjunto_id))
        .filter(parqueaderos::tipo.eq(TipoCeldaParqueadero::Visitante))
        .filter(parqueaderos::categoria.eq(categoria))
        .count()
        .get_result(conn)
        .await?;
    Ok(n)
}

/// Cuenta cuántas reservas activas de una categoría se SOLAPAN con [ini, fin).
/// Dos franjas [a1,a2) y [b1,b2) se solapan si a1 < b2 && b1 < a2.
async fn reservas_solapadas(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    categoria: &str,
    ini: DateTime<Utc>,
    fin: DateTime<Utc>,
    excluir_id: Option<Uuid>,
) -> ApiResult<i64> {
    // Traemos las reservas activas de la categoría y filtramos solapamiento en
    // Rust (el fin efectivo de "tiempo libre" no está siempre materializado).
    let mut q = reservas_visitante_parqueadero::table
        .filter(reservas_visitante_parqueadero::conjunto_id.eq(conjunto_id))
        .filter(reservas_visitante_parqueadero::categoria.eq(categoria))
        .filter(reservas_visitante_parqueadero::estado.eq_any(ESTADOS_ACTIVOS))
        .into_boxed();
    if let Some(id) = excluir_id {
        q = q.filter(reservas_visitante_parqueadero::id.ne(id));
    }
    let filas: Vec<ReservaVisitante> = q
        .select(ReservaVisitante::as_select())
        .load(conn)
        .await?;
    let mut n = 0i64;
    for r in &filas {
        let r_ini = r.llegada_estimada;
        let r_fin = r
            .fin_estimado
            .unwrap_or_else(|| fin_efectivo(r.llegada_estimada, r.duracion_minutos));
        if r_ini < fin && ini < r_fin {
            n += 1;
        }
    }
    Ok(n)
}

/// Disponibilidad de cupos para una categoría en una franja.
pub async fn disponibilidad(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    categoria: &str,
    llegada: DateTime<Utc>,
    duracion_minutos: Option<i32>,
) -> ApiResult<DisponibilidadCupoDto> {
    let fin = fin_efectivo(llegada, duracion_minutos);
    let total = total_celdas_visitante(conn, conjunto_id, categoria).await?;
    let ocupados = reservas_solapadas(conn, conjunto_id, categoria, llegada, fin, None).await?;
    let libres = (total - ocupados).max(0);
    Ok(DisponibilidadCupoDto {
        categoria: categoria.to_string(),
        total,
        ocupados,
        libres,
        hay_cupo: libres > 0,
    })
}

/// Crea una reserva si hay cupo libre en la franja (validación atómica de cupo).
#[allow(clippy::too_many_arguments)]
pub async fn crear_reserva(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    residente_id: Uuid,
    residente_nombre: String,
    unidad_id: Option<Uuid>,
    categoria: String,
    visitante_nombre: Option<String>,
    placa: Option<String>,
    llegada: DateTime<Utc>,
    duracion_minutos: Option<i32>,
    notas: Option<String>,
) -> ApiResult<ReservaVisitanteDto> {
    // No permitir reservar en el pasado (con 5 min de tolerancia).
    if llegada < Utc::now() - Duration::minutes(5) {
        return Err(ApiError::BadRequest(
            "la hora de llegada no puede estar en el pasado".into(),
        ));
    }
    if let Some(m) = duracion_minutos {
        if m <= 0 {
            return Err(ApiError::BadRequest(
                "la duración debe ser mayor a 0 minutos".into(),
            ));
        }
    }
    let fin = fin_efectivo(llegada, duracion_minutos);
    let total = total_celdas_visitante(conn, conjunto_id, &categoria).await?;
    if total == 0 {
        return Err(ApiError::BadRequest(format!(
            "no hay celdas de visitante de tipo {categoria} en el conjunto"
        )));
    }
    let ocupados = reservas_solapadas(conn, conjunto_id, &categoria, llegada, fin, None).await?;
    if ocupados >= total {
        return Err(ApiError::Conflict(
            "no hay cupos de visitante disponibles para esa franja horaria".into(),
        ));
    }
    let fin_estimado = duracion_minutos.map(|_| fin);
    let nueva = NuevaReservaVisitante {
        conjunto_id,
        residente_id,
        residente_nombre,
        unidad_id,
        categoria,
        visitante_nombre,
        placa,
        llegada_estimada: llegada,
        duracion_minutos,
        fin_estimado,
    };
    let row: ReservaVisitante = diesel::insert_into(reservas_visitante_parqueadero::table)
        .values(&nueva)
        .returning(ReservaVisitante::as_returning())
        .get_result(conn)
        .await?;
    Ok(to_dto(&row))
}

/// Reservas de un residente (las próximas/activas primero).
pub async fn reservas_de_residente(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    residente_id: Uuid,
) -> ApiResult<Vec<ReservaVisitanteDto>> {
    let filas: Vec<ReservaVisitante> = reservas_visitante_parqueadero::table
        .filter(reservas_visitante_parqueadero::conjunto_id.eq(conjunto_id))
        .filter(reservas_visitante_parqueadero::residente_id.eq(residente_id))
        .order(reservas_visitante_parqueadero::llegada_estimada.desc())
        .limit(100)
        .select(ReservaVisitante::as_select())
        .load(conn)
        .await?;
    Ok(filas.iter().map(to_dto).collect())
}

/// Reservas PRÓXIMAS del conjunto (para el vigilante): activas, ordenadas por
/// hora de llegada ascendente. Incluye las de hoy y futuras.
pub async fn reservas_proximas(
    conn: &mut DbConn,
    conjunto_id: Uuid,
) -> ApiResult<Vec<ReservaVisitanteDto>> {
    let desde = Utc::now() - Duration::hours(2);
    let filas: Vec<ReservaVisitante> = reservas_visitante_parqueadero::table
        .filter(reservas_visitante_parqueadero::conjunto_id.eq(conjunto_id))
        .filter(reservas_visitante_parqueadero::estado.eq_any(ESTADOS_ACTIVOS))
        .filter(reservas_visitante_parqueadero::llegada_estimada.ge(desde))
        .order(reservas_visitante_parqueadero::llegada_estimada.asc())
        .limit(200)
        .select(ReservaVisitante::as_select())
        .load(conn)
        .await?;
    Ok(filas.iter().map(to_dto).collect())
}

/// Cancela una reserva. Solo el residente dueño puede cancelarla.
pub async fn cancelar_reserva(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    reserva_id: Uuid,
    residente_id: Uuid,
) -> ApiResult<ReservaVisitanteDto> {
    let reserva: ReservaVisitante = reservas_visitante_parqueadero::table
        .filter(reservas_visitante_parqueadero::id.eq(reserva_id))
        .filter(reservas_visitante_parqueadero::conjunto_id.eq(conjunto_id))
        .select(ReservaVisitante::as_select())
        .first(conn)
        .await
        .optional()?
        .ok_or_else(|| ApiError::NotFound("reserva no encontrada".into()))?;
    if reserva.residente_id != residente_id {
        return Err(ApiError::Forbidden);
    }
    if reserva.estado != "PENDIENTE" {
        return Err(ApiError::BadRequest(
            "solo se pueden cancelar reservas pendientes".into(),
        ));
    }
    let row: ReservaVisitante = diesel::update(
        reservas_visitante_parqueadero::table
            .filter(reservas_visitante_parqueadero::id.eq(reserva_id)),
    )
    .set((
        reservas_visitante_parqueadero::estado.eq("CANCELADA"),
        reservas_visitante_parqueadero::updated_at.eq(Utc::now()),
    ))
    .returning(ReservaVisitante::as_returning())
    .get_result(conn)
    .await?;
    Ok(to_dto(&row))
}

/// Marca una reserva como LLEGO (el vigilante registra la llegada). Idempotente.
pub async fn marcar_llegada(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    reserva_id: Uuid,
) -> ApiResult<ReservaVisitanteDto> {
    let row: ReservaVisitante = diesel::update(
        reservas_visitante_parqueadero::table
            .filter(reservas_visitante_parqueadero::id.eq(reserva_id))
            .filter(reservas_visitante_parqueadero::conjunto_id.eq(conjunto_id))
            .filter(reservas_visitante_parqueadero::estado.eq("PENDIENTE")),
    )
    .set((
        reservas_visitante_parqueadero::estado.eq("LLEGO"),
        reservas_visitante_parqueadero::updated_at.eq(Utc::now()),
    ))
    .returning(ReservaVisitante::as_returning())
    .get_result(conn)
    .await
    .optional()?
    .ok_or_else(|| ApiError::NotFound("reserva no encontrada o ya procesada".into()))?;
    Ok(to_dto(&row))
}
