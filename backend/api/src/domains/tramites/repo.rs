use chrono::Utc;
use diesel::prelude::*;
use diesel_async::scoped_futures::ScopedFutureExt;
use diesel_async::{AsyncConnection, RunQueryDsl};
use uuid::Uuid;

use crate::db::enums::{EstadoParqueadero, EstadoTramite, Rol, TipoTramite};
use crate::db::schema::{mascotas, parqueaderos, tramites, usuarios, vehiculos};
use crate::db::DbConn;
use crate::domains::notificaciones::repo::create_notificacion;
use crate::domains::tramites::dto::{MascotaPayload, VehiculoPayload};
use crate::domains::tramites::models::{NuevoTramite, Tramite};
use crate::error::{ApiError, ApiResult};

type SolicitanteRef = (String, Option<String>, Option<String>);

/// `solo_usuario = Some(id)` restricts the list to that requester's own
/// trámites (residents); `None` returns the whole conjunto (admins).
/// Explicit join: `tramites` references `usuarios` twice (requester/approver).
pub async fn listar_tramites(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    solo_usuario: Option<Uuid>,
) -> ApiResult<Vec<(Tramite, SolicitanteRef)>> {
    let mut query = tramites::table
        .inner_join(usuarios::table.on(usuarios::id.eq(tramites::usuario_id)))
        .filter(tramites::conjunto_id.eq(conjunto_id))
        .into_boxed();
    if let Some(usuario_id) = solo_usuario {
        query = query.filter(tramites::usuario_id.eq(usuario_id));
    }
    let rows = query
        .order(tramites::created_at.desc())
        .limit(50)
        .select((
            Tramite::as_select(),
            (usuarios::nombre, usuarios::torre, usuarios::apto),
        ))
        .load(conn)
        .await?;
    Ok(rows)
}

pub async fn find_tramite(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    tramite_id: Uuid,
) -> ApiResult<Option<Tramite>> {
    let row = tramites::table
        .filter(tramites::id.eq(tramite_id))
        .filter(tramites::conjunto_id.eq(conjunto_id))
        .select(Tramite::as_select())
        .first(conn)
        .await
        .optional()?;
    Ok(row)
}

/// Trámite creation + admin notification fan-out in one transaction.
pub async fn crear_tramite_con_notificaciones(
    conn: &mut DbConn,
    nuevo: NuevoTramite,
    solicitante_nombre: &str,
) -> ApiResult<Tramite> {
    conn.transaction(|conn| {
        async move {
            let tramite: Tramite = diesel::insert_into(tramites::table)
                .values(&nuevo)
                .returning(Tramite::as_returning())
                .get_result(conn)
                .await?;

            let admins: Vec<Uuid> = usuarios::table
                .filter(usuarios::conjunto_id.eq(tramite.conjunto_id))
                .filter(usuarios::rol.eq(Rol::Administrador))
                .select(usuarios::id)
                .load(conn)
                .await?;

            let titulo = format!("Nuevo trámite: {}", tramite.tipo);
            let mensaje = format!(
                "{solicitante_nombre} ha enviado una solicitud de {} para revisión.",
                tramite.tipo
            );
            for admin_id in admins {
                create_notificacion(
                    conn,
                    tramite.conjunto_id,
                    admin_id,
                    "INFO",
                    &titulo,
                    &mensaje,
                    None,
                )
                .await?;
            }

            Ok::<_, ApiError>(tramite)
        }
        .scope_boxed()
    })
    .await
}

/// Resolves a PENDIENTE trámite in one transaction: state update, side-effect
/// insert (vehiculos/mascotas on approval) and requester notification all
/// commit or roll back together — e.g. a duplicate placa aborts everything
/// with 409 and the trámite stays PENDIENTE.
#[allow(clippy::too_many_arguments)]
pub async fn resolver_tramite(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    tramite_id: Uuid,
    admin_id: Uuid,
    aprobado: bool,
    observacion: Option<String>,
    vehiculo: Option<VehiculoPayload>,
    mascota: Option<MascotaPayload>,
    parqueadero_id: Option<Uuid>,
    meses: Option<i32>,
) -> ApiResult<Tramite> {
    let nuevo_estado = if aprobado {
        EstadoTramite::Aprobado
    } else {
        EstadoTramite::Rechazado
    };
    // Cláusula temporal de la asignación de celda (si aplica).
    let asignado_hasta = match meses {
        Some(m) if m > 0 => Some(Utc::now() + chrono::Months::new(m as u32)),
        _ => None,
    };
    conn.transaction(|conn| {
        async move {
            // The PENDIENTE filter makes the state transition atomic: a
            // concurrent resolver loses the race and gets 409.
            let tramite: Tramite = diesel::update(
                tramites::table
                    .filter(tramites::id.eq(tramite_id))
                    .filter(tramites::conjunto_id.eq(conjunto_id))
                    .filter(tramites::estado.eq(EstadoTramite::Pendiente)),
            )
            .set((
                tramites::estado.eq(nuevo_estado),
                tramites::observacion_admin.eq(observacion.as_deref()),
                tramites::aprobado_por_id.eq(admin_id),
                tramites::fecha_respuesta.eq(Utc::now()),
                tramites::updated_at.eq(Utc::now()),
            ))
            .returning(Tramite::as_returning())
            .get_result(conn)
            .await
            .optional()?
            .ok_or_else(|| ApiError::Conflict("el trámite ya fue procesado".into()))?;

            if aprobado {
                match tramite.tipo {
                    TipoTramite::Vehiculo => {
                        let v = vehiculo.ok_or_else(|| {
                            ApiError::Internal(anyhow::anyhow!("payload VEHICULO no parseado"))
                        })?;
                        diesel::insert_into(vehiculos::table)
                            .values((
                                vehiculos::conjunto_id.eq(tramite.conjunto_id),
                                vehiculos::usuario_id.eq(tramite.usuario_id),
                                vehiculos::placa.eq(v.placa.trim().to_uppercase()),
                                vehiculos::marca.eq(v.marca),
                                vehiculos::modelo.eq(v.modelo),
                                vehiculos::color.eq(v.color),
                                vehiculos::tipo.eq(v.tipo),
                            ))
                            .execute(conn)
                            .await?;

                        // Asignación permanente de celda (opcional) con cláusula
                        // temporal, en la misma transacción que la aprobación.
                        if let Some(celda_id) = parqueadero_id {
                            let celda_libre: Option<EstadoParqueadero> = parqueaderos::table
                                .filter(parqueaderos::id.eq(celda_id))
                                .filter(parqueaderos::conjunto_id.eq(tramite.conjunto_id))
                                .select(parqueaderos::estado)
                                .first(conn)
                                .await
                                .optional()?;
                            match celda_libre {
                                None => {
                                    return Err(ApiError::NotFound(
                                        "la celda seleccionada no existe".into(),
                                    ));
                                }
                                Some(EstadoParqueadero::Ocupado) => {
                                    return Err(ApiError::Conflict(
                                        "la celda seleccionada ya está ocupada".into(),
                                    ));
                                }
                                _ => {}
                            }
                            diesel::update(
                                parqueaderos::table
                                    .filter(parqueaderos::id.eq(celda_id))
                                    .filter(parqueaderos::conjunto_id.eq(tramite.conjunto_id)),
                            )
                            .set((
                                parqueaderos::usuario_id.eq(Some(tramite.usuario_id)),
                                parqueaderos::estado.eq(EstadoParqueadero::Ocupado),
                                parqueaderos::asignado_en.eq(Some(Utc::now())),
                                parqueaderos::asignado_hasta.eq(asignado_hasta),
                            ))
                            .execute(conn)
                            .await?;
                        }
                    }
                    TipoTramite::Mascota => {
                        let m = mascota.ok_or_else(|| {
                            ApiError::Internal(anyhow::anyhow!("payload MASCOTA no parseado"))
                        })?;
                        diesel::insert_into(mascotas::table)
                            .values((
                                mascotas::conjunto_id.eq(tramite.conjunto_id),
                                mascotas::usuario_id.eq(tramite.usuario_id),
                                mascotas::nombre.eq(m.nombre.trim()),
                                mascotas::tipo.eq(m.tipo),
                                mascotas::raza.eq(m.raza),
                            ))
                            .execute(conn)
                            .await?;
                    }
                    _ => {}
                }
                create_notificacion(
                    conn,
                    tramite.conjunto_id,
                    tramite.usuario_id,
                    "APROBACION",
                    "Tu solicitud ha sido aprobada",
                    &format!(
                        "Tu trámite de {} ha sido procesado exitosamente.",
                        tramite.tipo
                    ),
                    None,
                )
                .await?;
            } else {
                let motivo = observacion.as_deref().unwrap_or("sin observación");
                create_notificacion(
                    conn,
                    tramite.conjunto_id,
                    tramite.usuario_id,
                    "SISTEMA",
                    "Trámite rechazado",
                    &format!("Tu solicitud ha sido negada por la administración. Motivo: {motivo}"),
                    None,
                )
                .await?;
            }

            Ok::<_, ApiError>(tramite)
        }
        .scope_boxed()
    })
    .await
}
