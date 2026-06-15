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
    // Si está cerrada, usar los valores congelados; si activa, calcular en vivo.
    let (minutos_cobrados, monto_actual) = if s.estado == "CERRADA" {
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

/// Crea la sesión de cobro al aprobarse la asignación de una celda de visitante.
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
    let fin_gratis = inicio + chrono::Duration::minutes(MINUTOS_GRATIS_DEFAULT as i64);
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
            minutos_gratis: MINUTOS_GRATIS_DEFAULT,
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

/// Cierra la sesión ACTIVA de una celda (vehículo en portería): congela monto y
/// minutos, aplica liquidación. Si CARGADO_APTO crea un pago pendiente al apto.
/// Devuelve la sesión cerrada (o None si la celda no tenía sesión activa).
pub async fn cerrar_sesion_de_celda(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    parqueadero_id: Uuid,
    liquidacion_preferida: Option<String>,
) -> ApiResult<Option<SesionParqueadero>> {
    let liq = liquidacion_preferida;
    conn.transaction(|conn| {
        async move {
            let sesion = match sesion_activa_de_celda(conn, conjunto_id, parqueadero_id).await? {
                Some(s) => s,
                None => return Ok::<_, ApiError>(None),
            };
            let ahora = Utc::now();
            let mins = minutos_cobrables(&sesion, ahora);
            let monto = monto_a(&sesion, ahora);
            let hay_cobro = mins > 0 && monto > BigDecimal::from(0);

            // Resolver liquidación: si no hubo cobro → SIN_COBRO sin importar lo pedido.
            let liquidacion = if !hay_cobro {
                "SIN_COBRO".to_string()
            } else {
                match liq.as_deref() {
                    Some("CARGADO_APTO") => "CARGADO_APTO".to_string(),
                    _ => "VISITANTE_PAGO".to_string(),
                }
            };

            // Si se carga al apto y hay unidad, crear pago pendiente.
            let mut pago_id: Option<Uuid> = None;
            if liquidacion == "CARGADO_APTO" && hay_cobro {
                if let Some(unidad_id) = sesion.unidad_id {
                    let concepto = format!(
                        "Parqueadero visitante {} ({} min)",
                        sesion.celda_numero, mins
                    );
                    let venc = ahora + chrono::Duration::days(15);
                    let pid: Uuid = diesel::insert_into(pagos::table)
                        .values((
                            pagos::conjunto_id.eq(conjunto_id),
                            pagos::unidad_id.eq(unidad_id),
                            pagos::usuario_id.eq(sesion.residente_id),
                            pagos::concepto.eq(concepto),
                            pagos::monto.eq(monto.clone()),
                            pagos::estado.eq(EstadoPago::Pendiente),
                            pagos::fecha_vencimiento.eq(venc),
                        ))
                        .returning(pagos::id)
                        .get_result(conn)
                        .await?;
                    pago_id = Some(pid);
                }
            }

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
                sesiones_parqueadero::liquidacion.eq(Some(liquidacion)),
                sesiones_parqueadero::pago_id.eq(pago_id),
            ))
            .returning(SesionParqueadero::as_returning())
            .get_result(conn)
            .await?;
            Ok(Some(updated))
        }
        .scope_boxed()
    })
    .await
}

/// Una notificación pendiente que el scheduler debe enviar tras el tick.
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
