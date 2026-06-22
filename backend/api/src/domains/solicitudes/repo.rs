use chrono::Utc;
use diesel::prelude::*;
use diesel_async::scoped_futures::ScopedFutureExt;
use diesel_async::{AsyncConnection, RunQueryDsl};
use uuid::Uuid;

use crate::db::enums::{EstadoSolicitud, PrioridadTicket, Rol};
use crate::db::schema::{solicitudes_servicio, ticket_comentarios, ticket_transiciones, usuarios};
use crate::db::DbConn;
use crate::domains::notificaciones::repo::create_notificacion;
use crate::domains::solicitudes::models::{
    NuevaSolicitud, NuevaTransicion, NuevoComentario, Solicitud, TicketComentario, TicketTransicion,
};
use crate::domains::solicitudes::dto::TicketStats;
use crate::error::{ApiError, ApiResult};

// ── Listar / Crear ────────────────────────────────────────────────────────

pub async fn listar_solicitudes(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    solo_usuario: Option<Uuid>,
    estados: Option<Vec<EstadoSolicitud>>,
    asignado_a: Option<Uuid>,
) -> ApiResult<Vec<Solicitud>> {
    let mut query = solicitudes_servicio::table
        .filter(solicitudes_servicio::conjunto_id.eq(conjunto_id))
        .into_boxed();
    if let Some(usuario_id) = solo_usuario {
        query = query.filter(solicitudes_servicio::usuario_id.eq(usuario_id));
    }
    if let Some(ref est_list) = estados {
        if !est_list.is_empty() {
            query = query.filter(solicitudes_servicio::estado.eq_any(est_list));
        }
    }
    if let Some(uid) = asignado_a {
        query = query.filter(solicitudes_servicio::asignado_a_id.eq(uid));
    }
    query.order(solicitudes_servicio::created_at.desc())
        .limit(100)
        .select(Solicitud::as_select())
        .load(conn)
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("Error listando tickets: {e}")))
}

pub async fn crear_solicitud_con_notificaciones(
    conn: &mut DbConn,
    nueva: NuevaSolicitud,
    solicitante_nombre: &str,
) -> ApiResult<Solicitud> {
    let sla_vencimiento = if nueva.sla_horas > 0 {
        Some(Utc::now() + chrono::Duration::hours(nueva.sla_horas as i64))
    } else { None };

    conn.transaction(|conn| {
        async move {
            let solicitud: Solicitud = diesel::insert_into(solicitudes_servicio::table)
                .values(&nueva)
                .returning(Solicitud::as_returning())
                .get_result(conn)
                .await?;

            // Set SLA
            if let Some(venc) = sla_vencimiento {
                diesel::update(solicitudes_servicio::table)
                    .filter(solicitudes_servicio::id.eq(solicitud.id))
                    .set(solicitudes_servicio::sla_vencimiento.eq(venc))
                    .execute(conn)
                    .await?;
            }

            // Notify admins
            let admins: Vec<Uuid> = usuarios::table
                .filter(usuarios::conjunto_id.eq(solicitud.conjunto_id))
                .filter(usuarios::rol.eq_any([Rol::Administrador.as_str(), Rol::SuperAdmin.as_str()]))
                .select(usuarios::id)
                .load(conn)
                .await?;

            let mensaje = format!(
                "{solicitante_nombre} reporta {} ({}): {}",
                solicitud.tipo, solicitud.categoria, solicitud.descripcion
            );
            for admin_id in admins {
                create_notificacion(
                    conn, solicitud.conjunto_id, admin_id, "INFO",
                    "Nueva solicitud PQRS", &mensaje, None,
                ).await?;
            }

            Ok::<_, ApiError>(solicitud)
        }.scope_boxed()
    }).await
}

pub async fn solicitud_por_id(conn: &mut DbConn, id: Uuid) -> ApiResult<Option<Solicitud>> {
    solicitudes_servicio::table
        .filter(solicitudes_servicio::id.eq(id))
        .first(conn).await.optional()
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("{e}")))
}

// ── Actualizar ────────────────────────────────────────────────────────────

pub async fn actualizar_ticket(
    conn: &mut DbConn,
    ticket_id: Uuid,
    estado: Option<EstadoSolicitud>,
    proveedor_id: Option<Option<Uuid>>,
    asignado_a_id: Option<Option<Uuid>>,
    prioridad: Option<PrioridadTicket>,
) -> ApiResult<Solicitud> {
    let now = Utc::now();
    let mut sets = vec![];

    if let Some(e) = &estado {
        sets.push(format!("estado = '{}'", e.as_str()));
        match e {
            EstadoSolicitud::Asignada => sets.push(format!("fecha_asignacion = '{}'", now.format("%Y-%m-%d %H:%M:%S%.6f+00"))),
            EstadoSolicitud::Resuelta => sets.push(format!("fecha_resolucion = '{}'", now.format("%Y-%m-%d %H:%M:%S%.6f+00"))),
            EstadoSolicitud::Cerrada => sets.push(format!("fecha_cierre = '{}'", now.format("%Y-%m-%d %H:%M:%S%.6f+00"))),
            _ => {}
        }
    }
    if let Some(pid) = proveedor_id {
        sets.push(match pid {
            Some(v) => format!("proveedor_id = '{}'", v),
            None => "proveedor_id = NULL".into(),
        });
    }
    if let Some(aid) = asignado_a_id {
        sets.push(match aid {
            Some(v) => format!("asignado_a_id = '{}'", v),
            None => "asignado_a_id = NULL".into(),
        });
    }
    if let Some(p) = &prioridad {
        sets.push(format!("prioridad = '{}'", p.as_str()));
    }
    if sets.is_empty() {
        return Err(ApiError::BadRequest("nada que actualizar".into()));
    }
    let sql = format!("UPDATE solicitudes_servicio SET {} WHERE id = '{}' RETURNING *", sets.join(", "), ticket_id);
    diesel::sql_query(&sql).get_result(conn).await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("Error actualizando ticket: {e}")))
}

// ── Comentarios ────────────────────────────────────────────────────────────

pub async fn agregar_comentario(
    conn: &mut DbConn,
    nuevo: NuevoComentario,
) -> ApiResult<TicketComentario> {
    diesel::insert_into(ticket_comentarios::table)
        .values(&nuevo)
        .returning(TicketComentario::as_returning())
        .get_result(conn).await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("{e}")))
}

pub async fn comentarios_por_ticket(
    conn: &mut DbConn,
    ticket_id: Uuid,
) -> ApiResult<Vec<TicketComentario>> {
    ticket_comentarios::table
        .filter(ticket_comentarios::ticket_id.eq(ticket_id))
        .order(ticket_comentarios::created_at.asc())
        .load(conn).await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("{e}")))
}

// ── Transiciones ───────────────────────────────────────────────────────────

pub async fn registrar_transicion(
    conn: &mut DbConn,
    nueva: NuevaTransicion,
) -> ApiResult<TicketTransicion> {
    diesel::insert_into(ticket_transiciones::table)
        .values(&nueva)
        .returning(TicketTransicion::as_returning())
        .get_result(conn).await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("{e}")))
}

pub async fn transiciones_por_ticket(
    conn: &mut DbConn,
    ticket_id: Uuid,
) -> ApiResult<Vec<TicketTransicion>> {
    ticket_transiciones::table
        .filter(ticket_transiciones::ticket_id.eq(ticket_id))
        .order(ticket_transiciones::created_at.asc())
        .load(conn).await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("{e}")))
}

// ── Stats ─────────────────────────────────────────────────────────────────

pub async fn ticket_stats(conn: &mut DbConn, conjunto_id: Uuid) -> ApiResult<TicketStats> {
    use diesel::dsl::count;
    let base = solicitudes_servicio::table.filter(solicitudes_servicio::conjunto_id.eq(conjunto_id));
    let total = base.clone().count().get_result(conn).await.unwrap_or(0);
    let abiertos = base.clone().filter(solicitudes_servicio::estado.eq(EstadoSolicitud::Abierta.as_str())).count().get_result(conn).await.unwrap_or(0);
    let asignados = base.clone().filter(solicitudes_servicio::estado.eq(EstadoSolicitud::Asignada.as_str())).count().get_result(conn).await.unwrap_or(0);
    let en_progreso = base.clone().filter(solicitudes_servicio::estado.eq(EstadoSolicitud::EnProgreso.as_str())).count().get_result(conn).await.unwrap_or(0);
    let resueltos = base.clone().filter(solicitudes_servicio::estado.eq(EstadoSolicitud::Resuelta.as_str())).count().get_result(conn).await.unwrap_or(0);
    let cerrados = base.clone().filter(solicitudes_servicio::estado.eq(EstadoSolicitud::Cerrada.as_str())).count().get_result(conn).await.unwrap_or(0);
    let now = Utc::now();
    let sla_vencidos = base.clone()
        .filter(solicitudes_servicio::sla_vencimiento.is_not_null())
        .filter(solicitudes_servicio::sla_vencimiento.lt(now))
        .filter(solicitudes_servicio::estado.ne(EstadoSolicitud::Cerrada.as_str()))
        .filter(solicitudes_servicio::estado.ne(EstadoSolicitud::Resuelta.as_str()))
        .count().get_result(conn).await.unwrap_or(0);

    // AVG resolution time for resolved/closed tickets
    let tiempo_promedio: Option<f64> = {
        let resueltos_data: Vec<(Option<chrono::DateTime<Utc>>, chrono::DateTime<Utc>)> = solicitudes_servicio::table
            .filter(solicitudes_servicio::conjunto_id.eq(conjunto_id))
            .filter(solicitudes_servicio::fecha_resolucion.is_not_null())
            .select((solicitudes_servicio::fecha_resolucion, solicitudes_servicio::created_at))
            .load(conn).await.unwrap_or_default();
        if resueltos_data.is_empty() {
            None
        } else {
            let total_hours: f64 = resueltos_data.iter()
                .map(|(res, crea)| {
                    let r = res.unwrap_or(*crea);
                    (r - crea).num_minutes() as f64 / 60.0
                }).sum();
            Some(total_hours / resueltos_data.len() as f64)
        }
    };

    Ok(TicketStats {
        total, abiertos, asignados, en_progreso, resueltos, cerrados, sla_vencidos,
        tiempo_promedio_resolucion_horas: tiempo_promedio.unwrap_or(0.0),
    })
}
