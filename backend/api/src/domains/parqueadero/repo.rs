use chrono::Utc;
use diesel::prelude::*;
use diesel_async::scoped_futures::ScopedFutureExt;
use diesel_async::{AsyncConnection, RunQueryDsl};
use uuid::Uuid;

use crate::db::enums::{
    AccionParqueadero, EstadoParqueadero, EstadoSolicitudParqueadero, TipoCeldaParqueadero,
    TipoRegistroParqueadero,
};
use crate::db::schema::{
    parqueaderos, registros_parqueadero, rondas_parqueadero, solicitudes_parqueadero, usuarios,
    vehiculos,
};
use crate::db::DbConn;
use crate::domains::parqueadero::models::{
    NuevaCelda, NuevaSolicitud, NuevoVehiculo, Parqueadero, RegistroParqueadero, RondaParqueadero,
    SolicitudParqueadero, Vehiculo,
};
use crate::domains::vigilancia::repo::today_utc_range;
use crate::error::{ApiError, ApiResult};

type OcupanteRef = (String, Option<String>, Option<String>);

/// Quién ejecuta el movimiento (para el log inmutable).
#[derive(Clone)]
pub struct Actor {
    pub id: Uuid,
    pub nombre: String,
    pub rol: String,
}

/// Inserta una fila EJECUTADA en el log inmutable dentro de una transacción ya
/// abierta (movimiento que se realizó de inmediato, sin requerir aprobación).
async fn log_ejecutada(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    parqueadero_id: Option<Uuid>,
    celda_numero: &str,
    accion: AccionParqueadero,
    detalle: &str,
    payload: Option<serde_json::Value>,
    actor: &Actor,
) -> Result<(), ApiError> {
    diesel::insert_into(solicitudes_parqueadero::table)
        .values((
            solicitudes_parqueadero::conjunto_id.eq(conjunto_id),
            solicitudes_parqueadero::parqueadero_id.eq(parqueadero_id),
            solicitudes_parqueadero::celda_numero.eq(celda_numero),
            solicitudes_parqueadero::accion.eq(accion),
            solicitudes_parqueadero::estado.eq(EstadoSolicitudParqueadero::Ejecutada),
            solicitudes_parqueadero::requiere_aprobacion.eq(false),
            solicitudes_parqueadero::detalle.eq(detalle),
            solicitudes_parqueadero::payload.eq(payload),
            solicitudes_parqueadero::solicitante_id.eq(actor.id),
            solicitudes_parqueadero::solicitante_nombre.eq(&actor.nombre),
            solicitudes_parqueadero::solicitante_rol.eq(&actor.rol),
        ))
        .execute(conn)
        .await?;
    Ok(())
}

pub async fn vehiculos_propios(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    usuario_id: Uuid,
) -> ApiResult<Vec<Vehiculo>> {
    let rows = vehiculos::table
        .filter(vehiculos::conjunto_id.eq(conjunto_id))
        .filter(vehiculos::usuario_id.eq(usuario_id))
        .order(vehiculos::created_at.desc())
        .select(Vehiculo::as_select())
        .load(conn)
        .await?;
    Ok(rows)
}

pub async fn celdas_propias(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    usuario_id: Uuid,
) -> ApiResult<Vec<Parqueadero>> {
    let rows = parqueaderos::table
        .filter(parqueaderos::conjunto_id.eq(conjunto_id))
        .filter(parqueaderos::usuario_id.eq(usuario_id))
        .order(parqueaderos::numero.asc())
        .select(Parqueadero::as_select())
        .load(conn)
        .await?;
    Ok(rows)
}

/// Duplicate placa surfaces as 409 via the unique-violation → Conflict mapping.
pub async fn crear_vehiculo(conn: &mut DbConn, nuevo: NuevoVehiculo) -> ApiResult<Vehiculo> {
    let row = diesel::insert_into(vehiculos::table)
        .values(nuevo)
        .returning(Vehiculo::as_returning())
        .get_result(conn)
        .await?;
    Ok(row)
}

/// Inserta una o varias celdas en un solo statement y devuelve las creadas.
pub async fn crear_celdas(
    conn: &mut DbConn,
    nuevas: Vec<NuevaCelda>,
) -> ApiResult<Vec<Parqueadero>> {
    let rows = diesel::insert_into(parqueaderos::table)
        .values(nuevas)
        .returning(Parqueadero::as_returning())
        .get_results(conn)
        .await?;
    Ok(rows)
}

pub async fn mapa(
    conn: &mut DbConn,
    conjunto_id: Uuid,
) -> ApiResult<Vec<(Parqueadero, Option<OcupanteRef>)>> {
    let rows = parqueaderos::table
        .left_join(usuarios::table)
        .filter(parqueaderos::conjunto_id.eq(conjunto_id))
        .order(parqueaderos::numero.asc())
        .select((
            Parqueadero::as_select(),
            (usuarios::nombre, usuarios::torre, usuarios::apto).nullable(),
        ))
        .load(conn)
        .await?;
    Ok(rows)
}

/// State change + VERIFICACION audit row in one transaction (spec 005:
/// every mapa mutation leaves a registros_parqueadero trace).
pub async fn actualizar_celda(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    celda_id: Uuid,
    actor: Actor,
    nuevo_estado: EstadoParqueadero,
) -> ApiResult<Parqueadero> {
    conn.transaction(|conn| {
        async move {
            let celda: Parqueadero = parqueaderos::table
                .filter(parqueaderos::id.eq(celda_id))
                .filter(parqueaderos::conjunto_id.eq(conjunto_id))
                .select(Parqueadero::as_select())
                .first(conn)
                .await
                .optional()?
                .ok_or_else(|| ApiError::NotFound("celda no encontrada".into()))?;

            let anterior = celda.estado;
            let numero = celda.numero.clone();
            let updated: Parqueadero = diesel::update(
                parqueaderos::table
                    .filter(parqueaderos::id.eq(celda_id))
                    .filter(parqueaderos::conjunto_id.eq(conjunto_id)),
            )
            .set(parqueaderos::estado.eq(nuevo_estado))
            .returning(Parqueadero::as_returning())
            .get_result(conn)
            .await?;

            diesel::insert_into(registros_parqueadero::table)
                .values((
                    registros_parqueadero::conjunto_id.eq(conjunto_id),
                    registros_parqueadero::parqueadero_id.eq(celda_id),
                    registros_parqueadero::usuario_id.eq(actor.id),
                    registros_parqueadero::tipo.eq(TipoRegistroParqueadero::Verificacion),
                    registros_parqueadero::observacion
                        .eq(format!("cambio estado {anterior}->{nuevo_estado}")),
                ))
                .execute(conn)
                .await?;

            log_ejecutada(
                conn,
                conjunto_id,
                Some(celda_id),
                &numero,
                AccionParqueadero::CambiarEstado,
                &format!("cambio de estado {anterior} -> {nuevo_estado}"),
                None,
                &actor,
            )
            .await?;

            Ok::<_, ApiError>(updated)
        }
        .scope_boxed()
    })
    .await
}

/// Asignación permanente de una celda a un residente con cláusula temporal.
/// Setea usuario_id, estado=OCUPADO, asignado_en=now, asignado_hasta=now+meses
/// (NULL si meses es None/0). Deja traza VERIFICACION. Una transacción.
pub async fn asignar_celda(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    celda_id: Uuid,
    actor: Actor,
    residente_id: Uuid,
    meses: Option<i32>,
) -> ApiResult<Parqueadero> {
    let ahora = Utc::now();
    let hasta = match meses {
        Some(m) if m > 0 => Some(ahora + chrono::Months::new(m as u32)),
        _ => None,
    };
    conn.transaction(|conn| {
        async move {
            let celda: Parqueadero = parqueaderos::table
                .filter(parqueaderos::id.eq(celda_id))
                .filter(parqueaderos::conjunto_id.eq(conjunto_id))
                .select(Parqueadero::as_select())
                .first(conn)
                .await
                .optional()?
                .ok_or_else(|| ApiError::NotFound("celda no encontrada".into()))?;

            if celda.usuario_id.is_some() && celda.estado == EstadoParqueadero::Ocupado {
                return Err(ApiError::Conflict(
                    "la celda ya está ocupada por otro residente".into(),
                ));
            }
            let numero = celda.numero.clone();

            let updated: Parqueadero = diesel::update(
                parqueaderos::table
                    .filter(parqueaderos::id.eq(celda_id))
                    .filter(parqueaderos::conjunto_id.eq(conjunto_id)),
            )
            .set((
                parqueaderos::usuario_id.eq(Some(residente_id)),
                parqueaderos::estado.eq(EstadoParqueadero::Ocupado),
                parqueaderos::asignado_en.eq(Some(ahora)),
                parqueaderos::asignado_hasta.eq(hasta),
            ))
            .returning(Parqueadero::as_returning())
            .get_result(conn)
            .await?;

            let detalle = match meses {
                Some(m) if m > 0 => format!("asignación permanente por {m} meses"),
                _ => "asignación permanente sin vencimiento".to_string(),
            };
            diesel::insert_into(registros_parqueadero::table)
                .values((
                    registros_parqueadero::conjunto_id.eq(conjunto_id),
                    registros_parqueadero::parqueadero_id.eq(celda_id),
                    registros_parqueadero::usuario_id.eq(actor.id),
                    registros_parqueadero::tipo.eq(TipoRegistroParqueadero::Verificacion),
                    registros_parqueadero::observacion.eq(&detalle),
                ))
                .execute(conn)
                .await?;

            log_ejecutada(
                conn,
                conjunto_id,
                Some(celda_id),
                &numero,
                AccionParqueadero::Asignar,
                &detalle,
                Some(serde_json::json!({ "residenteId": residente_id, "meses": meses })),
                &actor,
            )
            .await?;

            Ok::<_, ApiError>(updated)
        }
        .scope_boxed()
    })
    .await
}

/// Libera una celda: limpia ocupante y cláusula, estado=DISPONIBLE. Traza.
pub async fn liberar_celda(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    celda_id: Uuid,
    actor: Actor,
) -> ApiResult<Parqueadero> {
    conn.transaction(|conn| {
        async move {
            let celda: Parqueadero = parqueaderos::table
                .filter(parqueaderos::id.eq(celda_id))
                .filter(parqueaderos::conjunto_id.eq(conjunto_id))
                .select(Parqueadero::as_select())
                .first(conn)
                .await
                .optional()?
                .ok_or_else(|| ApiError::NotFound("celda no encontrada".into()))?;
            let numero = celda.numero.clone();

            let updated: Parqueadero = diesel::update(
                parqueaderos::table
                    .filter(parqueaderos::id.eq(celda_id))
                    .filter(parqueaderos::conjunto_id.eq(conjunto_id)),
            )
            .set((
                parqueaderos::usuario_id.eq(None::<Uuid>),
                parqueaderos::estado.eq(EstadoParqueadero::Disponible),
                parqueaderos::asignado_en.eq(None::<chrono::DateTime<Utc>>),
                parqueaderos::asignado_hasta.eq(None::<chrono::DateTime<Utc>>),
            ))
            .returning(Parqueadero::as_returning())
            .get_result(conn)
            .await?;

            diesel::insert_into(registros_parqueadero::table)
                .values((
                    registros_parqueadero::conjunto_id.eq(conjunto_id),
                    registros_parqueadero::parqueadero_id.eq(celda_id),
                    registros_parqueadero::usuario_id.eq(actor.id),
                    registros_parqueadero::tipo.eq(TipoRegistroParqueadero::Verificacion),
                    registros_parqueadero::observacion.eq("celda liberada".to_string()),
                ))
                .execute(conn)
                .await?;

            log_ejecutada(
                conn,
                conjunto_id,
                Some(celda_id),
                &numero,
                AccionParqueadero::Liberar,
                "celda liberada",
                None,
                &actor,
            )
            .await?;

            Ok::<_, ApiError>(updated)
        }
        .scope_boxed()
    })
    .await
}

pub async fn registros(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    solo_de_usuario: Option<Uuid>,
) -> ApiResult<
    Vec<(
        RegistroParqueadero,
        String,
        crate::db::enums::TipoCeldaParqueadero,
        String,
    )>,
> {
    let mut query = registros_parqueadero::table
        .inner_join(parqueaderos::table)
        .inner_join(usuarios::table)
        .filter(registros_parqueadero::conjunto_id.eq(conjunto_id))
        .into_boxed();
    if let Some(usuario_id) = solo_de_usuario {
        query = query.filter(registros_parqueadero::usuario_id.eq(usuario_id));
    }
    let rows = query
        .order(registros_parqueadero::fecha.desc())
        .limit(50)
        .select((
            RegistroParqueadero::as_select(),
            parqueaderos::numero,
            parqueaderos::tipo,
            usuarios::nombre,
        ))
        .load(conn)
        .await?;
    Ok(rows)
}

pub async fn ronda_de_hoy(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    usuario_id: Uuid,
) -> ApiResult<Option<RondaParqueadero>> {
    let (start, end) = today_utc_range();
    let row = rondas_parqueadero::table
        .filter(rondas_parqueadero::conjunto_id.eq(conjunto_id))
        .filter(rondas_parqueadero::usuario_id.eq(usuario_id))
        .filter(rondas_parqueadero::fecha.ge(start))
        .filter(rondas_parqueadero::fecha.lt(end))
        .order(rondas_parqueadero::fecha.desc())
        .select(RondaParqueadero::as_select())
        .first(conn)
        .await
        .optional()?;
    Ok(row)
}

pub async fn crear_ronda(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    usuario_id: Uuid,
    hallazgos: serde_json::Value,
    completada: bool,
) -> ApiResult<RondaParqueadero> {
    let row = diesel::insert_into(rondas_parqueadero::table)
        .values((
            rondas_parqueadero::conjunto_id.eq(conjunto_id),
            rondas_parqueadero::usuario_id.eq(usuario_id),
            rondas_parqueadero::hallazgos.eq(hallazgos),
            rondas_parqueadero::completada.eq(completada),
        ))
        .returning(RondaParqueadero::as_returning())
        .get_result(conn)
        .await?;
    Ok(row)
}

/// (total celdas, ocupadas).
pub async fn stats(conn: &mut DbConn, conjunto_id: Uuid) -> ApiResult<(i64, i64)> {
    let total: i64 = parqueaderos::table
        .filter(parqueaderos::conjunto_id.eq(conjunto_id))
        .count()
        .get_result(conn)
        .await?;
    let ocupados: i64 = parqueaderos::table
        .filter(parqueaderos::conjunto_id.eq(conjunto_id))
        .filter(parqueaderos::estado.eq(EstadoParqueadero::Ocupado))
        .count()
        .get_result(conn)
        .await?;
    Ok((total, ocupados))
}

// ─────────────────────────────────────────────────────────────────────────────
// Flujo de aprobación + log inmutable de movimientos sobre celdas de residente.
// ─────────────────────────────────────────────────────────────────────────────

/// Carga una celda del conjunto (o NotFound).
pub async fn obtener_celda(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    celda_id: Uuid,
) -> ApiResult<Parqueadero> {
    parqueaderos::table
        .filter(parqueaderos::id.eq(celda_id))
        .filter(parqueaderos::conjunto_id.eq(conjunto_id))
        .select(Parqueadero::as_select())
        .first(conn)
        .await
        .optional()?
        .ok_or_else(|| ApiError::NotFound("celda no encontrada".into()))
}

/// Crea una solicitud PENDIENTE (requiere aprobación del admin). No ejecuta nada.
pub async fn crear_solicitud_pendiente(
    conn: &mut DbConn,
    nueva: NuevaSolicitud,
) -> ApiResult<SolicitudParqueadero> {
    let row = diesel::insert_into(solicitudes_parqueadero::table)
        .values(nueva)
        .returning(SolicitudParqueadero::as_returning())
        .get_result(conn)
        .await?;
    Ok(row)
}

/// Lista el log completo (admin). Opcionalmente solo las PENDIENTES.
pub async fn listar_solicitudes(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    solo_pendientes: bool,
) -> ApiResult<Vec<SolicitudParqueadero>> {
    let mut q = solicitudes_parqueadero::table
        .filter(solicitudes_parqueadero::conjunto_id.eq(conjunto_id))
        .into_boxed();
    if solo_pendientes {
        q = q.filter(
            solicitudes_parqueadero::estado.eq(EstadoSolicitudParqueadero::Pendiente),
        );
    }
    let rows = q
        .order(solicitudes_parqueadero::creado_en.desc())
        .limit(200)
        .select(SolicitudParqueadero::as_select())
        .load(conn)
        .await?;
    Ok(rows)
}

/// Carga una solicitud puntual del conjunto.
pub async fn obtener_solicitud(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    solicitud_id: Uuid,
) -> ApiResult<SolicitudParqueadero> {
    solicitudes_parqueadero::table
        .filter(solicitudes_parqueadero::id.eq(solicitud_id))
        .filter(solicitudes_parqueadero::conjunto_id.eq(conjunto_id))
        .select(SolicitudParqueadero::as_select())
        .first(conn)
        .await
        .optional()?
        .ok_or_else(|| ApiError::NotFound("solicitud no encontrada".into()))
}

/// Aprueba una solicitud PENDIENTE: ejecuta el movimiento sobre la celda y marca
/// la solicitud como APROBADA (con aprobador y timestamp). Todo en una transacción.
pub async fn aprobar_solicitud(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    solicitud_id: Uuid,
    aprobador: Actor,
) -> ApiResult<SolicitudParqueadero> {
    conn.transaction(|conn| {
        async move {
            let sol = obtener_solicitud(conn, conjunto_id, solicitud_id).await?;
            if sol.estado != EstadoSolicitudParqueadero::Pendiente {
                return Err(ApiError::BadRequest(
                    "la solicitud ya fue resuelta".into(),
                ));
            }
            let celda_id = sol
                .parqueadero_id
                .ok_or_else(|| ApiError::BadRequest("solicitud sin celda asociada".into()))?;

            // Ejecuta el movimiento según la acción.
            let payload = sol.payload.clone().unwrap_or_default();
            match sol.accion {
                AccionParqueadero::Asignar => {
                    let residente_id: Uuid = payload
                        .get("residenteId")
                        .and_then(|v| v.as_str())
                        .and_then(|s| s.parse().ok())
                        .ok_or_else(|| ApiError::BadRequest("payload sin residenteId".into()))?;
                    let meses: Option<i32> =
                        payload.get("meses").and_then(|v| v.as_i64()).map(|n| n as i32);
                    let ahora = Utc::now();
                    let hasta = match meses {
                        Some(m) if m > 0 => Some(ahora + chrono::Months::new(m as u32)),
                        _ => None,
                    };
                    diesel::update(
                        parqueaderos::table
                            .filter(parqueaderos::id.eq(celda_id))
                            .filter(parqueaderos::conjunto_id.eq(conjunto_id)),
                    )
                    .set((
                        parqueaderos::usuario_id.eq(Some(residente_id)),
                        parqueaderos::estado.eq(EstadoParqueadero::Ocupado),
                        parqueaderos::asignado_en.eq(Some(ahora)),
                        parqueaderos::asignado_hasta.eq(hasta),
                    ))
                    .execute(conn)
                    .await?;
                }
                AccionParqueadero::Liberar => {
                    diesel::update(
                        parqueaderos::table
                            .filter(parqueaderos::id.eq(celda_id))
                            .filter(parqueaderos::conjunto_id.eq(conjunto_id)),
                    )
                    .set((
                        parqueaderos::usuario_id.eq(None::<Uuid>),
                        parqueaderos::estado.eq(EstadoParqueadero::Disponible),
                        parqueaderos::asignado_en.eq(None::<chrono::DateTime<Utc>>),
                        parqueaderos::asignado_hasta.eq(None::<chrono::DateTime<Utc>>),
                    ))
                    .execute(conn)
                    .await?;
                }
                AccionParqueadero::CambiarEstado => {
                    let nuevo: EstadoParqueadero = payload
                        .get("estado")
                        .and_then(|v| v.as_str())
                        .and_then(|s| s.parse().ok())
                        .ok_or_else(|| ApiError::BadRequest("payload sin estado".into()))?;
                    diesel::update(
                        parqueaderos::table
                            .filter(parqueaderos::id.eq(celda_id))
                            .filter(parqueaderos::conjunto_id.eq(conjunto_id)),
                    )
                    .set(parqueaderos::estado.eq(nuevo))
                    .execute(conn)
                    .await?;
                }
                AccionParqueadero::Crear => {}
            }

            // Traza en registros + marca la solicitud aprobada.
            diesel::insert_into(registros_parqueadero::table)
                .values((
                    registros_parqueadero::conjunto_id.eq(conjunto_id),
                    registros_parqueadero::parqueadero_id.eq(celda_id),
                    registros_parqueadero::usuario_id.eq(aprobador.id),
                    registros_parqueadero::tipo.eq(TipoRegistroParqueadero::Verificacion),
                    registros_parqueadero::observacion
                        .eq(format!("aprobado: {}", sol.detalle)),
                ))
                .execute(conn)
                .await?;

            let updated = diesel::update(
                solicitudes_parqueadero::table
                    .filter(solicitudes_parqueadero::id.eq(solicitud_id))
                    .filter(solicitudes_parqueadero::conjunto_id.eq(conjunto_id)),
            )
            .set((
                solicitudes_parqueadero::estado.eq(EstadoSolicitudParqueadero::Aprobada),
                solicitudes_parqueadero::aprobador_id.eq(Some(aprobador.id)),
                solicitudes_parqueadero::aprobador_nombre.eq(Some(aprobador.nombre.clone())),
                solicitudes_parqueadero::resuelto_en.eq(Some(Utc::now())),
            ))
            .returning(SolicitudParqueadero::as_returning())
            .get_result(conn)
            .await?;

            Ok::<_, ApiError>(updated)
        }
        .scope_boxed()
    })
    .await
}

/// Rechaza una solicitud PENDIENTE (no ejecuta nada). Queda en el log como RECHAZADA.
pub async fn rechazar_solicitud(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    solicitud_id: Uuid,
    aprobador: Actor,
) -> ApiResult<SolicitudParqueadero> {
    let sol = obtener_solicitud(conn, conjunto_id, solicitud_id).await?;
    if sol.estado != EstadoSolicitudParqueadero::Pendiente {
        return Err(ApiError::BadRequest("la solicitud ya fue resuelta".into()));
    }
    let updated = diesel::update(
        solicitudes_parqueadero::table
            .filter(solicitudes_parqueadero::id.eq(solicitud_id))
            .filter(solicitudes_parqueadero::conjunto_id.eq(conjunto_id)),
    )
    .set((
        solicitudes_parqueadero::estado.eq(EstadoSolicitudParqueadero::Rechazada),
        solicitudes_parqueadero::aprobador_id.eq(Some(aprobador.id)),
        solicitudes_parqueadero::aprobador_nombre.eq(Some(aprobador.nombre)),
        solicitudes_parqueadero::resuelto_en.eq(Some(Utc::now())),
    ))
    .returning(SolicitudParqueadero::as_returning())
    .get_result(conn)
    .await?;
    Ok(updated)
}

/// Edita el detalle de una entrada del log (SOLO super_admin).
pub async fn editar_solicitud(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    solicitud_id: Uuid,
    nuevo_detalle: String,
) -> ApiResult<SolicitudParqueadero> {
    let updated = diesel::update(
        solicitudes_parqueadero::table
            .filter(solicitudes_parqueadero::id.eq(solicitud_id))
            .filter(solicitudes_parqueadero::conjunto_id.eq(conjunto_id)),
    )
    .set(solicitudes_parqueadero::detalle.eq(nuevo_detalle))
    .returning(SolicitudParqueadero::as_returning())
    .get_result(conn)
    .await
    .optional()?
    .ok_or_else(|| ApiError::NotFound("solicitud no encontrada".into()))?;
    Ok(updated)
}

/// Borra una entrada del log (SOLO super_admin).
pub async fn borrar_solicitud(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    solicitud_id: Uuid,
) -> ApiResult<()> {
    let n = diesel::delete(
        solicitudes_parqueadero::table
            .filter(solicitudes_parqueadero::id.eq(solicitud_id))
            .filter(solicitudes_parqueadero::conjunto_id.eq(conjunto_id)),
    )
    .execute(conn)
    .await?;
    if n == 0 {
        return Err(ApiError::NotFound("solicitud no encontrada".into()));
    }
    Ok(())
}

/// Helper: ¿la celda está asignada permanentemente a un residente?
/// (tipo RESIDENTE o tiene ocupante permanente). Estos movimientos requieren
/// aprobación del administrador.
pub fn celda_requiere_aprobacion(celda: &Parqueadero) -> bool {
    celda.tipo == TipoCeldaParqueadero::Residente || celda.usuario_id.is_some()
}
