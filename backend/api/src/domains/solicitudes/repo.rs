use diesel::prelude::*;
use diesel_async::scoped_futures::ScopedFutureExt;
use diesel_async::{AsyncConnection, RunQueryDsl};
use uuid::Uuid;

use crate::db::enums::Rol;
use crate::db::schema::{solicitudes_servicio, usuarios};
use crate::db::DbConn;
use crate::domains::notificaciones::repo::create_notificacion;
use crate::domains::solicitudes::models::{NuevaSolicitud, Solicitud};
use crate::error::{ApiError, ApiResult};

/// `solo_usuario = Some(id)` restricts the list to that requester's own
/// solicitudes (residents); `None` returns the whole conjunto (admins).
pub async fn listar_solicitudes(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    solo_usuario: Option<Uuid>,
) -> ApiResult<Vec<Solicitud>> {
    let mut query = solicitudes_servicio::table
        .filter(solicitudes_servicio::conjunto_id.eq(conjunto_id))
        .into_boxed();
    if let Some(usuario_id) = solo_usuario {
        query = query.filter(solicitudes_servicio::usuario_id.eq(usuario_id));
    }
    let rows = query
        .order(solicitudes_servicio::created_at.desc())
        .limit(50)
        .select(Solicitud::as_select())
        .load(conn)
        .await?;
    Ok(rows)
}

/// PQRS creation + admin notification fan-out in one transaction.
pub async fn crear_solicitud_con_notificaciones(
    conn: &mut DbConn,
    nueva: NuevaSolicitud,
    solicitante_nombre: &str,
) -> ApiResult<Solicitud> {
    conn.transaction(|conn| {
        async move {
            let solicitud: Solicitud = diesel::insert_into(solicitudes_servicio::table)
                .values(&nueva)
                .returning(Solicitud::as_returning())
                .get_result(conn)
                .await?;

            let admins: Vec<Uuid> = usuarios::table
                .filter(usuarios::conjunto_id.eq(solicitud.conjunto_id))
                .filter(usuarios::rol.eq(Rol::Administrador))
                .select(usuarios::id)
                .load(conn)
                .await?;

            let mensaje = format!(
                "{solicitante_nombre} reporta {} ({}): {}",
                solicitud.tipo, solicitud.categoria, solicitud.descripcion
            );
            for admin_id in admins {
                create_notificacion(
                    conn,
                    solicitud.conjunto_id,
                    admin_id,
                    "INFO",
                    "Nueva solicitud PQRS",
                    &mensaje,
                    None,
                )
                .await?;
            }

            Ok::<_, ApiError>(solicitud)
        }
        .scope_boxed()
    })
    .await
}
