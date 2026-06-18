use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use uuid::Uuid;

use crate::db::schema::{notificaciones, push_subscriptions};
use crate::db::DbConn;
use crate::domains::notificaciones::models::{Notificacion, PushSubscription};
use crate::error::ApiResult;
use crate::services::ws_hub::{WsEvent, WsHub};

pub async fn list_for_user(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    usuario_id: Uuid,
) -> ApiResult<Vec<Notificacion>> {
    let rows = notificaciones::table
        .filter(notificaciones::conjunto_id.eq(conjunto_id))
        .filter(notificaciones::usuario_id.eq(usuario_id))
        .order(notificaciones::created_at.desc())
        .limit(20)
        .select(Notificacion::as_select())
        .load(conn)
        .await?;
    Ok(rows)
}

/// Marks notifications read. With `ids` only those (still scoped to the owner);
/// without, every unread notification of the user.
pub async fn mark_read(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    usuario_id: Uuid,
    ids: Option<Vec<Uuid>>,
) -> ApiResult<usize> {
    let updated = match ids {
        Some(ids) => {
            diesel::update(
                notificaciones::table
                    .filter(notificaciones::conjunto_id.eq(conjunto_id))
                    .filter(notificaciones::usuario_id.eq(usuario_id))
                    .filter(notificaciones::id.eq_any(ids)),
            )
            .set(notificaciones::leida.eq(true))
            .execute(conn)
            .await?
        }
        None => {
            diesel::update(
                notificaciones::table
                    .filter(notificaciones::conjunto_id.eq(conjunto_id))
                    .filter(notificaciones::usuario_id.eq(usuario_id))
                    .filter(notificaciones::leida.eq(false)),
            )
            .set(notificaciones::leida.eq(true))
            .execute(conn)
            .await?
        }
    };
    Ok(updated)
}

/// Shared helper: other domains (paquetes, tramites, anuncios, ...) create
/// in-app notifications through this single entry point.
///
/// When `ws_hub` is provided, also broadcasts a real-time `notification.created`
/// event so connected frontends can refetch without polling.
pub async fn create_notificacion(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    usuario_id: Uuid,
    tipo: &str,
    titulo: &str,
    mensaje: &str,
    ws_hub: Option<&WsHub>,
) -> ApiResult<Notificacion> {
    let row = diesel::insert_into(notificaciones::table)
        .values((
            notificaciones::conjunto_id.eq(conjunto_id),
            notificaciones::usuario_id.eq(usuario_id),
            notificaciones::tipo.eq(tipo),
            notificaciones::titulo.eq(titulo),
            notificaciones::mensaje.eq(mensaje),
        ))
        .returning(Notificacion::as_returning())
        .get_result(conn)
        .await?;

    if let Some(hub) = ws_hub {
        hub.publish(
            conjunto_id,
            WsEvent {
                domain: "notification".into(),
                action: "created".into(),
                payload: None,
                target_user_id: Some(usuario_id),
            },
        )
        .await;
    }

    Ok(row)
}

/// Multi-device web-push: one row per endpoint, re-subscribing the same
/// endpoint re-binds it to the current user/keys.
pub async fn upsert_push_subscription(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    usuario_id: Uuid,
    endpoint: &str,
    p256dh: &str,
    auth: &str,
) -> ApiResult<PushSubscription> {
    let row = diesel::insert_into(push_subscriptions::table)
        .values((
            push_subscriptions::conjunto_id.eq(conjunto_id),
            push_subscriptions::usuario_id.eq(usuario_id),
            push_subscriptions::endpoint.eq(endpoint),
            push_subscriptions::p256dh.eq(p256dh),
            push_subscriptions::auth.eq(auth),
        ))
        .on_conflict(push_subscriptions::endpoint)
        .do_update()
        .set((
            push_subscriptions::conjunto_id.eq(conjunto_id),
            push_subscriptions::usuario_id.eq(usuario_id),
            push_subscriptions::p256dh.eq(p256dh),
            push_subscriptions::auth.eq(auth),
        ))
        .returning(PushSubscription::as_returning())
        .get_result(conn)
        .await?;
    Ok(row)
}

pub async fn delete_push_subscription(
    conn: &mut DbConn,
    usuario_id: Uuid,
    endpoint: &str,
) -> ApiResult<usize> {
    let deleted = diesel::delete(
        push_subscriptions::table
            .filter(push_subscriptions::usuario_id.eq(usuario_id))
            .filter(push_subscriptions::endpoint.eq(endpoint)),
    )
    .execute(conn)
    .await?;
    Ok(deleted)
}
