//! Sesiones de cobro de celdas de VISITANTE.
//!
//! Flujo: al aprobar el inquilino una celda de visitante, se crea una sesión con
//! 2h gratis (`minutos_gratis`). Pasadas las 2h se cobra `tarifa_hora` (COP $3.000)
//! prorrateado **por minuto** ($50/min). El cobro se congela cuando el vehículo
//! llega a portería (al liberar la celda → `cerrar_sesion`).
//!
//! Liquidación al cerrar:
//!   - VISITANTE_PAGO  → el visitante pagó en sitio (no genera pago en la app).
//!   - CARGADO_APTO    → se crea un `pago` PENDIENTE a cargo del residente/apto.
//!   - SIN_COBRO       → cerró dentro de la ventana gratis (monto 0).

use bigdecimal::{BigDecimal, RoundingMode};
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel_async::scoped_futures::ScopedFutureExt;
use diesel_async::{AsyncConnection, RunQueryDsl};
use uuid::Uuid;

use crate::db::enums::EstadoPago;
use crate::db::schema::{pagos, sesiones_parqueadero};
use crate::db::DbConn;
use crate::domains::parqueadero::dto::SesionDto;
use crate::domains::parqueadero::models::{NuevaSesion, SesionParqueadero};
use crate::error::{ApiError, ApiResult};

pub const MINUTOS_GRATIS_DEFAULT: i32 = 120;
pub const TARIFA_HORA_DEFAULT: i64 = 3000;
/// Antelación del aviso previo al fin de la ventana gratis.
pub const AVISO_ANTELACION_MIN: i64 = 20;

/// Minutos cobrables (más allá de la ventana gratis) a una hora `ahora`.
/// Prorrateado por minuto; nunca negativo.
pub fn minutos_cobrables(s: &SesionParqueadero, ahora: DateTime<Utc>) -> i32 {
    let extra = (ahora - s.fin_gratis).num_minutes();
    extra.max(0) as i32
}

/// Monto acumulado a una hora `ahora` = minutos_cobrables * (tarifa_hora / 60).
/// Redondeado a 2 decimales (COP).
pub fn monto_a(s: &SesionParqueadero, ahora: DateTime<Utc>) -> BigDecimal {
    let mins = minutos_cobrables(s, ahora);
    if mins == 0 {
        return BigDecimal::from(0);
    }
    let por_minuto = &s.tarifa_hora / BigDecimal::from(60);
    (por_minuto * BigDecimal::from(mins)).with_scale_round(2, RoundingMode::HalfUp)
}

/// Construye el DTO con cálculo EN VIVO (conteo regresivo + monto actual).
pub fn to_dto(s: &SesionParqueadero, ahora: DateTime<Utc>) -> SesionDto {
    let segundos_restantes_gratis = (s.fin_gratis - ahora).num_seconds().max(0);
    let en_cobro = s.estado == "ACTIVA" && ahora >= s.fin_gratis;
    // Si está cerrada o retenida, usar los valores congelados; si activa, en vivo.
    let (minutos_cobrados, monto_actual) = if s.estado == "CERRADA" || s.estado == "RETENIDA" {
        (
            s.minutos_cobrados.unwrap_or(0),
            s.monto.clone().unwrap_or_else(|| BigDecimal::from(0)),
        )
    } else {
        (minutos_cobrables(s, ahora), monto_a(s, ahora))
    };
    SesionDto {
        id: s.id,
        parqueadero_id: s.parqueadero_id,
        celda_numero: s.celda_numero.clone(),
        residente_id: s.residente_id,
        residente_nombre: s.residente_nombre.clone(),
        placa: s.placa.clone(),
        estimado_minutos: s.estimado_minutos,
        inicio: s.inicio,
        fin_gratis: s.fin_gratis,
        minutos_gratis: s.minutos_gratis,
        tarifa_hora: s.tarifa_hora.clone(),
        estado: s.estado.clone(),
        segundos_restantes_gratis,
        en_cobro,
        minutos_cobrados,
        monto_actual,
        cerrado_en: s.cerrado_en,
        liquidacion: s.liquidacion.clone(),
        monto_final: s.monto.clone(),
    }
}

/// Minutos gratis ya consumidos por un apartamento (unidad) en las últimas 24h
/// (ventana RODANTE). Cada sesión consume = min(duración real, minutos_gratis
/// otorgados a esa sesión). Las sesiones activas cuentan su tiempo hasta `ahora`.
/// Esto cierra el abuso de "salir cerca de las 2h y reingresar para 2h nuevas":
/// el saldo gratis es una bolsa diaria de 120 min por apartamento, compartida
/// entre todas sus visitas, y los reingresos siguen descontando de la misma bolsa.
pub async fn minutos_gratis_consumidos_24h(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    unidad_id: Uuid,
    ahora: DateTime<Utc>,
) -> ApiResult<i32> {
    let desde = ahora - chrono::Duration::hours(24);
    let sesiones: Vec<SesionParqueadero> = sesiones_parqueadero::table
        .filter(sesiones_parqueadero::conjunto_id.eq(conjunto_id))
        .filter(sesiones_parqueadero::unidad_id.eq(unidad_id))
        .filter(sesiones_parqueadero::inicio.ge(desde))
        .select(SesionParqueadero::as_select())
        .load(conn)
        .await?;
    let mut total = 0i32;
    for s in &sesiones {
        let fin = s.cerrado_en.unwrap_or(ahora);
        let dur = (fin - s.inicio).num_minutes().max(0) as i32;
        // Una sesión nunca consume más gratis del que se le otorgó.
        total += dur.min(s.minutos_gratis);
    }
    Ok(total)
}

/// ¿El apartamento ya tiene otra sesión de visitante ACTIVA ahora mismo?
/// El tiempo gratis es una cortesía para UNA visita a la vez: si ya hay otra
/// activa, la nueva cobra desde la llegada (0 min gratis).
pub async fn tiene_sesion_activa_unidad(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    unidad_id: Uuid,
) -> ApiResult<bool> {
    let n: i64 = sesiones_parqueadero::table
        .filter(sesiones_parqueadero::conjunto_id.eq(conjunto_id))
        .filter(sesiones_parqueadero::unidad_id.eq(unidad_id))
        .filter(sesiones_parqueadero::estado.eq("ACTIVA"))
        .count()
        .get_result(conn)
        .await?;
    Ok(n > 0)
}

/// Minutos gratis que recibe una NUEVA sesión de visitante de un apartamento,
/// combinando las dos reglas anti-abuso:
///   1. Bolsa diaria por apto (24h rodante): 120 − consumidos.
///   2. Un solo gratis concurrente: si el apto YA tiene otra visita activa, la
///      nueva cobra desde la llegada (0 min gratis).
/// Sin unidad asignada no hay apto que rastrear → cae al default por sesión.
pub async fn minutos_gratis_para_nueva_sesion(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    unidad_id: Option<Uuid>,
    ahora: DateTime<Utc>,
) -> ApiResult<i32> {
    let uid = match unidad_id {
        Some(u) => u,
        None => return Ok(MINUTOS_GRATIS_DEFAULT),
    };
    // Regla 2: ya hay otra visita activa del mismo apto → sin gratis.
    if tiene_sesion_activa_unidad(conn, conjunto_id, uid).await? {
        return Ok(0);
    }
    // Regla 1: bolsa diaria.
    let consumidos = minutos_gratis_consumidos_24h(conn, conjunto_id, uid, ahora).await?;
    Ok((MINUTOS_GRATIS_DEFAULT - consumidos).max(0))
}

/// Crea la sesión de cobro al aprobarse la asignación de una celda de visitante.
/// El saldo gratis combina bolsa diaria (24h rodante) + un solo gratis concurrente
/// por apartamento (ver `minutos_gratis_para_nueva_sesion`).
#[allow(clippy::too_many_arguments)]
pub async fn crear_sesion(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    parqueadero_id: Uuid,
    celda_numero: String,
    solicitud_id: Option<Uuid>,
    residente_id: Uuid,
    residente_nombre: String,
    unidad_id: Option<Uuid>,
    placa: Option<String>,
    estimado_minutos: Option<i32>,
) -> ApiResult<SesionParqueadero> {
    let inicio = Utc::now();
    let minutos_gratis =
        minutos_gratis_para_nueva_sesion(conn, conjunto_id, unidad_id, inicio).await?;
    let fin_gratis = inicio + chrono::Duration::minutes(minutos_gratis as i64);
    let row = diesel::insert_into(sesiones_parqueadero::table)
        .values(NuevaSesion {
            conjunto_id,
            parqueadero_id: Some(parqueadero_id),
            celda_numero,
            solicitud_id,
            residente_id,
            residente_nombre,
            unidad_id,
            placa,
            estimado_minutos,
            inicio,
            minutos_gratis,
            fin_gratis,
            tarifa_hora: BigDecimal::from(TARIFA_HORA_DEFAULT),
        })
        .returning(SesionParqueadero::as_returning())
        .get_result(conn)
        .await?;
    Ok(row)
}

/// Una sesión por id (cualquier estado).
pub async fn obtener_sesion(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    sesion_id: Uuid,
) -> ApiResult<Option<SesionParqueadero>> {
    let row = sesiones_parqueadero::table
        .filter(sesiones_parqueadero::id.eq(sesion_id))
        .filter(sesiones_parqueadero::conjunto_id.eq(conjunto_id))
        .select(SesionParqueadero::as_select())
        .first(conn)
        .await
        .optional()?;
    Ok(row)
}

/// Sesión ACTIVA de una celda (si existe).
#[allow(dead_code)]
pub async fn sesion_activa_de_celda(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    parqueadero_id: Uuid,
) -> ApiResult<Option<SesionParqueadero>> {
    let row = sesiones_parqueadero::table
        .filter(sesiones_parqueadero::conjunto_id.eq(conjunto_id))
        .filter(sesiones_parqueadero::parqueadero_id.eq(parqueadero_id))
        .filter(sesiones_parqueadero::estado.eq("ACTIVA"))
        .select(SesionParqueadero::as_select())
        .first(conn)
        .await
        .optional()?;
    Ok(row)
}

/// Sesiones ACTIVAS dirigidas a un residente (para mostrar el conteo regresivo).
pub async fn sesiones_activas_de_residente(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    residente_id: Uuid,
) -> ApiResult<Vec<SesionParqueadero>> {
    let rows = sesiones_parqueadero::table
        .filter(sesiones_parqueadero::conjunto_id.eq(conjunto_id))
        .filter(sesiones_parqueadero::residente_id.eq(residente_id))
        .filter(sesiones_parqueadero::estado.eq("ACTIVA"))
        .order(sesiones_parqueadero::inicio.desc())
        .select(SesionParqueadero::as_select())
        .load(conn)
        .await?;
    Ok(rows)
}

/// Resultado de procesar el cierre/retención de una sesión, para que el handler
/// sepa si debe liberar la celda (vehículo sale) o retenerla (espera aprobación).
pub struct ResultadoCierre {
    pub sesion: SesionParqueadero,
    /// true → la celda debe liberarse (el vehículo puede salir).
    /// false → la celda queda RETENIDA (vehículo esperando aprobación del residente).
    pub liberar: bool,
}

/// Sesión "viva" de una celda (ACTIVA o RETENIDA), si existe.
pub async fn sesion_viva_de_celda(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    parqueadero_id: Uuid,
) -> ApiResult<Option<SesionParqueadero>> {
    let row = sesiones_parqueadero::table
        .filter(sesiones_parqueadero::conjunto_id.eq(conjunto_id))
        .filter(sesiones_parqueadero::parqueadero_id.eq(parqueadero_id))
        .filter(sesiones_parqueadero::estado.eq_any(vec!["ACTIVA", "RETENIDA"]))
        .select(SesionParqueadero::as_select())
        .first(conn)
        .await
        .optional()?;
    Ok(row)
}

/// Procesa el cierre de la sesión "viva" de una celda (vehículo en portería).
///
/// Regla crítica de retención: si el operario elige **cargar al apartamento**,
/// el vehículo NO sale todavía. La sesión pasa a `RETENIDA` con el monto
/// congelado y `CARGADO_APTO_PENDIENTE`; el residente debe aprobar para que el
/// vehículo pueda salir (ver `resolver_cargo`). Si el residente rechaza o no
/// responde, portería usa la válvula de escape: el visitante paga en sitio
/// (`VISITANTE_PAGO`) y entonces sí se libera.
///
/// - Desde ACTIVA:
///     - sin cobro            → CERRADA / SIN_COBRO        (libera)
///     - visitante pagó       → CERRADA / VISITANTE_PAGO   (libera)
///     - cargar al apto       → RETENIDA / CARGADO_APTO_PENDIENTE (NO libera)
/// - Desde RETENIDA (vehículo retenido esperando):
///     - visitante paga       → CERRADA / VISITANTE_PAGO   (libera)  ← válvula
///     - (cargar al apto)      → no-op, sigue retenida
pub async fn cerrar_sesion_de_celda(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    parqueadero_id: Uuid,
    liquidacion_preferida: Option<String>,
) -> ApiResult<Option<ResultadoCierre>> {
    let liq = liquidacion_preferida;
    conn.transaction(|conn| {
        async move {
            let sesion = match sesion_viva_de_celda(conn, conjunto_id, parqueadero_id).await? {
                Some(s) => s,
                None => return Ok::<_, ApiError>(None),
            };
            let ahora = Utc::now();
            let quiere_cargar_apto = liq.as_deref() == Some("CARGADO_APTO");

            // Sesión ya RETENIDA: solo aceptamos la válvula de escape
            // (el visitante paga en sitio). Cargar al apto sería redundante.
            if sesion.estado == "RETENIDA" {
                if quiere_cargar_apto {
                    // Ya está pendiente de aprobación; no hay nada que cambiar.
                    return Ok(Some(ResultadoCierre { sesion, liberar: false }));
                }
                // Válvula de escape: el visitante paga en sitio el monto ya
                // congelado al momento de la retención. Cierra y libera.
                let updated = diesel::update(
                    sesiones_parqueadero::table
                        .filter(sesiones_parqueadero::id.eq(sesion.id))
                        .filter(sesiones_parqueadero::conjunto_id.eq(conjunto_id)),
                )
                .set((
                    sesiones_parqueadero::estado.eq("CERRADA"),
                    sesiones_parqueadero::liquidacion.eq(Some("VISITANTE_PAGO".to_string())),
                    sesiones_parqueadero::cargo_resuelto_en.eq(Some(ahora)),
                ))
                .returning(SesionParqueadero::as_returning())
                .get_result(conn)
                .await?;
                return Ok(Some(ResultadoCierre { sesion: updated, liberar: true }));
            }

            // Sesión ACTIVA: congelar minutos/monto en vivo.
            let mins = minutos_cobrables(&sesion, ahora);
            let monto = monto_a(&sesion, ahora);
            let hay_cobro = mins > 0 && monto > BigDecimal::from(0);

            // Sin cobro (dentro de la ventana gratis): cierra y libera siempre,
            // sin importar la liquidación pedida.
            if !hay_cobro {
                let updated = diesel::update(
                    sesiones_parqueadero::table
                        .filter(sesiones_parqueadero::id.eq(sesion.id))
                        .filter(sesiones_parqueadero::conjunto_id.eq(conjunto_id)),
                )
                .set((
                    sesiones_parqueadero::estado.eq("CERRADA"),
                    sesiones_parqueadero::cerrado_en.eq(Some(ahora)),
                    sesiones_parqueadero::minutos_cobrados.eq(Some(mins)),
                    sesiones_parqueadero::monto.eq(Some(monto)),
                    sesiones_parqueadero::liquidacion.eq(Some("SIN_COBRO".to_string())),
                ))
                .returning(SesionParqueadero::as_returning())
                .get_result(conn)
                .await?;
                return Ok(Some(ResultadoCierre { sesion: updated, liberar: true }));
            }

            if quiere_cargar_apto {
                // RETENER: el vehículo NO sale. Congelamos el monto y dejamos la
                // sesión a la espera de la aprobación del residente. La celda
                // sigue OCUPADA (no se libera).
                let updated = diesel::update(
                    sesiones_parqueadero::table
                        .filter(sesiones_parqueadero::id.eq(sesion.id))
                        .filter(sesiones_parqueadero::conjunto_id.eq(conjunto_id)),
                )
                .set((
                    sesiones_parqueadero::estado.eq("RETENIDA"),
                    sesiones_parqueadero::cerrado_en.eq(Some(ahora)),
                    sesiones_parqueadero::minutos_cobrados.eq(Some(mins)),
                    sesiones_parqueadero::monto.eq(Some(monto)),
                    sesiones_parqueadero::liquidacion
                        .eq(Some("CARGADO_APTO_PENDIENTE".to_string())),
                ))
                .returning(SesionParqueadero::as_returning())
                .get_result(conn)
                .await?;
                return Ok(Some(ResultadoCierre { sesion: updated, liberar: false }));
            }

            // Visitante pagó en sitio: cierra y libera.
            let updated = diesel::update(
                sesiones_parqueadero::table
                    .filter(sesiones_parqueadero::id.eq(sesion.id))
                    .filter(sesiones_parqueadero::conjunto_id.eq(conjunto_id)),
            )
            .set((
                sesiones_parqueadero::estado.eq("CERRADA"),
                sesiones_parqueadero::cerrado_en.eq(Some(ahora)),
                sesiones_parqueadero::minutos_cobrados.eq(Some(mins)),
                sesiones_parqueadero::monto.eq(Some(monto)),
                sesiones_parqueadero::liquidacion.eq(Some("VISITANTE_PAGO".to_string())),
            ))
            .returning(SesionParqueadero::as_returning())
            .get_result(conn)
            .await?;
            Ok(Some(ResultadoCierre { sesion: updated, liberar: true }))
        }
        .scope_boxed()
    })
    .await
}

/// Sesiones CERRADAS con cargo al apto PENDIENTE de aprobación del residente.
/// El residente las ve con el monto para aprobar o rechazar.
pub async fn sesiones_cargo_pendiente_de_residente(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    residente_id: Uuid,
) -> ApiResult<Vec<SesionParqueadero>> {
    let rows = sesiones_parqueadero::table
        .filter(sesiones_parqueadero::conjunto_id.eq(conjunto_id))
        .filter(sesiones_parqueadero::residente_id.eq(residente_id))
        .filter(sesiones_parqueadero::liquidacion.eq("CARGADO_APTO_PENDIENTE"))
        .order(sesiones_parqueadero::cerrado_en.desc())
        .select(SesionParqueadero::as_select())
        .load(conn)
        .await?;
    Ok(rows)
}

/// El residente resuelve un cargo CARGADO_APTO_PENDIENTE a su apto.
///   - aprobar=true  → liquidación pasa a CARGADO_APTO y se crea el pago pendiente.
///   - aprobar=false → liquidación pasa a CARGADO_APTO_RECHAZADO (sin pago).
/// Solo el residente destinatario puede resolverlo (validado por el caller).
pub async fn resolver_cargo(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    sesion_id: Uuid,
    residente_id: Uuid,
    aprobar: bool,
) -> ApiResult<SesionParqueadero> {
    conn.transaction(|conn| {
        async move {
            let sesion = sesiones_parqueadero::table
                .filter(sesiones_parqueadero::id.eq(sesion_id))
                .filter(sesiones_parqueadero::conjunto_id.eq(conjunto_id))
                .select(SesionParqueadero::as_select())
                .first(conn)
                .await
                .optional()?
                .ok_or_else(|| ApiError::NotFound("sesión no encontrada".into()))?;

            // Solo el residente responsable puede resolver su propio cargo.
            if sesion.residente_id != residente_id {
                return Err(ApiError::Forbidden);
            }
            if sesion.liquidacion.as_deref() != Some("CARGADO_APTO_PENDIENTE") {
                return Err(ApiError::BadRequest(
                    "este cargo ya fue resuelto".into(),
                ));
            }

            let ahora = Utc::now();
            let (nueva_liq, nuevo_estado, pago_id) = if aprobar {
                // Crear el pago pendiente al apto (si tiene unidad).
                let mut pid: Option<Uuid> = None;
                if let Some(unidad_id) = sesion.unidad_id {
                    let mins = sesion.minutos_cobrados.unwrap_or(0);
                    let monto = sesion
                        .monto
                        .clone()
                        .unwrap_or_else(|| BigDecimal::from(0));
                    let concepto = format!(
                        "Parqueadero visitante {} ({} min)",
                        sesion.celda_numero, mins
                    );
                    let venc = ahora + chrono::Duration::days(15);
                    let new_pid: Uuid = diesel::insert_into(pagos::table)
                        .values((
                            pagos::conjunto_id.eq(conjunto_id),
                            pagos::unidad_id.eq(unidad_id),
                            pagos::usuario_id.eq(sesion.residente_id),
                            pagos::concepto.eq(concepto),
                            pagos::monto.eq(monto),
                            pagos::estado.eq(EstadoPago::Pendiente),
                            pagos::fecha_vencimiento.eq(venc),
                        ))
                        .returning(pagos::id)
                        .get_result(conn)
                        .await?;
                    pid = Some(new_pid);
                }
                // Aprobado: el cargo se carga al apto y el vehículo PUEDE SALIR.
                ("CARGADO_APTO".to_string(), "CERRADA".to_string(), pid)
            } else {
                // Rechazado: NO se carga al apto y el vehículo sigue RETENIDO.
                // Portería debe cobrarle al visitante en sitio (válvula de escape).
                (
                    "CARGADO_APTO_RECHAZADO".to_string(),
                    "RETENIDA".to_string(),
                    None,
                )
            };

            let updated = diesel::update(
                sesiones_parqueadero::table
                    .filter(sesiones_parqueadero::id.eq(sesion_id))
                    .filter(sesiones_parqueadero::conjunto_id.eq(conjunto_id)),
            )
            .set((
                sesiones_parqueadero::estado.eq(nuevo_estado),
                sesiones_parqueadero::liquidacion.eq(Some(nueva_liq)),
                sesiones_parqueadero::pago_id.eq(pago_id),
                sesiones_parqueadero::cargo_resuelto_en.eq(Some(ahora)),
            ))
            .returning(SesionParqueadero::as_returning())
            .get_result(conn)
            .await?;
            Ok(updated)
        }
        .scope_boxed()
    })
    .await
}
pub struct AvisoPendiente {
    pub conjunto_id: Uuid,
    pub residente_id: Uuid,
    pub titulo: String,
    pub mensaje: String,
}

/// Tick del scheduler: recorre sesiones ACTIVAS y marca los avisos a enviar.
/// - 20 min antes del fin gratis → aviso de "pronto inicia el cobro".
/// - al cruzar el fin gratis → aviso de "inició el cobro de $X/hora".
/// Marca los flags en DB (idempotente) y devuelve los avisos a notificar.
pub async fn tick_avisos(conn: &mut DbConn) -> ApiResult<Vec<AvisoPendiente>> {
    let ahora = Utc::now();
    let activas: Vec<SesionParqueadero> = sesiones_parqueadero::table
        .filter(sesiones_parqueadero::estado.eq("ACTIVA"))
        .select(SesionParqueadero::as_select())
        .load(conn)
        .await?;

    let mut avisos = Vec::new();
    for s in activas {
        // Aviso 20 min antes (umbral: faltan <= 20 min y aún no terminó la ventana).
        let faltan = (s.fin_gratis - ahora).num_minutes();
        if !s.aviso_20_enviado && faltan <= AVISO_ANTELACION_MIN && ahora < s.fin_gratis {
            diesel::update(
                sesiones_parqueadero::table.filter(sesiones_parqueadero::id.eq(s.id)),
            )
            .set(sesiones_parqueadero::aviso_20_enviado.eq(true))
            .execute(conn)
            .await?;
            avisos.push(AvisoPendiente {
                conjunto_id: s.conjunto_id,
                residente_id: s.residente_id,
                titulo: format!("Parqueadero {} — termina lo gratis", s.celda_numero),
                mensaje: format!(
                    "Quedan ~{} min de las 2h gratis del parqueadero de visitante {}. Luego se cobra ${}/hora.",
                    faltan.max(0),
                    s.celda_numero,
                    s.tarifa_hora.with_scale(0)
                ),
            });
        }

        // Aviso de inicio de cobro (al cruzar el fin de la ventana gratis).
        if !s.aviso_cobro_enviado && ahora >= s.fin_gratis {
            diesel::update(
                sesiones_parqueadero::table.filter(sesiones_parqueadero::id.eq(s.id)),
            )
            .set(sesiones_parqueadero::aviso_cobro_enviado.eq(true))
            .execute(conn)
            .await?;
            avisos.push(AvisoPendiente {
                conjunto_id: s.conjunto_id,
                residente_id: s.residente_id,
                titulo: format!("Parqueadero {} — inició el cobro", s.celda_numero),
                mensaje: format!(
                    "Se agotaron las 2h gratis del parqueadero de visitante {}. Desde ahora se cobra ${}/hora prorrateado por minuto.",
                    s.celda_numero,
                    s.tarifa_hora.with_scale(0)
                ),
            });
        }
    }
    Ok(avisos)
}

/// Arranca el scheduler en segundo plano: cada 60s revisa sesiones activas,
/// envía los avisos pendientes (20 min antes + inicio de cobro) como
/// notificaciones in-app y los emite por WebSocket. Resiliente a errores
/// transitorios de DB (loguea y continúa).
pub fn spawn_scheduler(state: crate::state::AppState) {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(std::time::Duration::from_secs(60));
        // El primer tick es inmediato; lo saltamos para no correr en el arranque.
        ticker.tick().await;
        loop {
            ticker.tick().await;
            let mut conn = match state.pool.get().await {
                Ok(c) => c,
                Err(e) => {
                    tracing::warn!("scheduler parqueadero: no DB conn: {e}");
                    continue;
                }
            };
            let avisos = match tick_avisos(&mut conn).await {
                Ok(a) => a,
                Err(e) => {
                    tracing::warn!("scheduler parqueadero: tick_avisos error: {e}");
                    continue;
                }
            };
            for aviso in avisos {
                if let Err(e) = crate::domains::notificaciones::repo::create_notificacion(
                    &mut conn,
                    aviso.conjunto_id,
                    aviso.residente_id,
                    "parqueadero",
                    &aviso.titulo,
                    &aviso.mensaje,
                    None,
                )
                .await
                {
                    tracing::warn!("scheduler parqueadero: create_notificacion error: {e}");
                    continue;
                }
                state
                    .ws_hub
                    .publish(
                        aviso.conjunto_id,
                        crate::services::ws_hub::WsEvent {
                            domain: "notification".into(),
                            action: "created".into(),
                            payload: None,
                            target_user_id: Some(aviso.residente_id),
                        },
                    )
                    .await;
                // También refrescar el conteo regresivo en la pantalla de parqueadero.
                state
                    .ws_hub
                    .publish(
                        aviso.conjunto_id,
                        crate::services::ws_hub::WsEvent {
                            domain: "parqueadero".into(),
                            action: "sesion_tick".into(),
                            payload: None,
                            target_user_id: None,
                        },
                    )
                    .await;
            }
        }
    });
}
