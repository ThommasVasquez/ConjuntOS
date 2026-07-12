use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use uuid::Uuid;

use crate::db::schema::{native_push_tokens, notificaciones, push_subscriptions};
use crate::db::DbConn;
use crate::domains::notificaciones::models::{NativePushToken, Notificacion, PushSubscription};
use crate::error::ApiResult;
use crate::services::push::{NativePushTokenInfo, PushMessage, PushSubscriptionInfo};
use crate::services::ws_hub::{WsEvent, WsHub};
use crate::state::AppState;

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

/// Additive native (Expo / FCM / APNs) token registration. Upsert keyed on
/// `token` (mirrors the web-push `endpoint` upsert): re-registering the same
/// token re-binds it to the current user/platform/device.
pub async fn upsert_native_push_token(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    usuario_id: Uuid,
    platform: &str,
    token: &str,
    device_id: Option<&str>,
) -> ApiResult<NativePushToken> {
    let row = diesel::insert_into(native_push_tokens::table)
        .values((
            native_push_tokens::conjunto_id.eq(conjunto_id),
            native_push_tokens::usuario_id.eq(usuario_id),
            native_push_tokens::platform.eq(platform),
            native_push_tokens::token.eq(token),
            native_push_tokens::device_id.eq(device_id),
        ))
        .on_conflict(native_push_tokens::token)
        .do_update()
        .set((
            native_push_tokens::conjunto_id.eq(conjunto_id),
            native_push_tokens::usuario_id.eq(usuario_id),
            native_push_tokens::platform.eq(platform),
            native_push_tokens::device_id.eq(device_id),
        ))
        .returning(NativePushToken::as_returning())
        .get_result(conn)
        .await?;
    Ok(row)
}

/// Removes a native token by its value regardless of owner — used when the push
/// provider reports the device as no longer registered (dead token), where no
/// authenticated user is in scope.
pub async fn delete_native_push_token_by_value(
    conn: &mut DbConn,
    token: &str,
) -> ApiResult<usize> {
    let deleted =
        diesel::delete(native_push_tokens::table.filter(native_push_tokens::token.eq(token)))
            .execute(conn)
            .await?;
    Ok(deleted)
}

/// Dual-transport push fan-out to the target users, mirroring the citofonia
/// pattern: web-push (VAPID) subscriptions AND native (Expo / FCM / APNs)
/// device tokens. The data contract is identical across both transports.
/// Best-effort per device; returns the number of successful deliveries across
/// the union. Native tokens rejected as `DeviceNotRegistered` are purged so we
/// stop pushing to dead devices.
pub async fn send_push_to_users(
    conn: &mut DbConn,
    state: &AppState,
    conjunto_id: Uuid,
    usuario_ids: &[Uuid],
    message: &PushMessage,
) -> ApiResult<i32> {
    if usuario_ids.is_empty() {
        return Ok(0);
    }
    let mut count: i32 = 0;

    // ── Web-push (VAPID) ──
    let subs: Vec<(String, String, String)> = push_subscriptions::table
        .filter(push_subscriptions::conjunto_id.eq(conjunto_id))
        .filter(push_subscriptions::usuario_id.eq_any(usuario_ids))
        .select((
            push_subscriptions::endpoint,
            push_subscriptions::p256dh,
            push_subscriptions::auth,
        ))
        .load(conn)
        .await?;

    let web_payload_bytes = message.to_web_json_bytes();
    for (endpoint, p256dh, auth) in subs {
        let sub_info = PushSubscriptionInfo {
            endpoint: endpoint.clone(),
            p256dh,
            auth,
        };
        match state.push_sender.send(&sub_info, &web_payload_bytes).await {
            Ok(()) => count += 1,
            Err(e) => {
                tracing::warn!(endpoint = %endpoint, error = ?e, "web-push send failed");
            }
        }
    }

    // ── Native (Expo / FCM / APNs) ──
    let native_tokens: Vec<(String, String)> = native_push_tokens::table
        .filter(native_push_tokens::conjunto_id.eq(conjunto_id))
        .filter(native_push_tokens::usuario_id.eq_any(usuario_ids))
        .select((native_push_tokens::platform, native_push_tokens::token))
        .load(conn)
        .await?;

    for (platform, token) in native_tokens {
        let info = NativePushTokenInfo {
            platform: platform.clone(),
            token: token.clone(),
        };
        match state.native_push_sender.send(&info, message).await {
            Ok(()) => count += 1,
            Err(e) => {
                if crate::services::push::is_device_not_registered(&e) {
                    // Dead device token (app uninstalled / token rotated):
                    // delete the row so we stop pushing to it.
                    match delete_native_push_token_by_value(conn, &token).await {
                        Ok(n) => tracing::info!(
                            platform = %platform,
                            deleted = n,
                            "native push token no longer registered; row removed"
                        ),
                        Err(del_err) => tracing::warn!(
                            platform = %platform,
                            error = ?del_err,
                            "failed to delete dead native push token"
                        ),
                    }
                } else {
                    tracing::warn!(platform = %platform, error = ?e, "native push send failed");
                }
            }
        }
    }

    Ok(count)
}

/// Like [`create_notificacion`], but additionally wakes the user's devices over
/// BOTH push transports (web VAPID + native Expo), following citofonia's dual
/// fan-out. Push is best-effort: a delivery failure never fails the creation.
#[allow(clippy::too_many_arguments)]
pub async fn create_notificacion_with_push(
    conn: &mut DbConn,
    state: &AppState,
    conjunto_id: Uuid,
    usuario_id: Uuid,
    tipo: &str,
    titulo: &str,
    mensaje: &str,
    data: serde_json::Value,
) -> ApiResult<Notificacion> {
    let row = create_notificacion(
        conn,
        conjunto_id,
        usuario_id,
        tipo,
        titulo,
        mensaje,
        Some(&state.ws_hub),
    )
    .await?;

    let message = PushMessage {
        title: titulo.to_string(),
        body: mensaje.to_string(),
        data,
    };
    if let Err(e) = send_push_to_users(conn, state, conjunto_id, &[usuario_id], &message).await {
        tracing::warn!(error = ?e, "notificacion push fan-out failed");
    }

    Ok(row)
}

/// Idempotent removal of a native token by its token value (scoped to owner).
pub async fn delete_native_push_token(
    conn: &mut DbConn,
    usuario_id: Uuid,
    token: &str,
) -> ApiResult<usize> {
    let deleted = diesel::delete(
        native_push_tokens::table
            .filter(native_push_tokens::usuario_id.eq(usuario_id))
            .filter(native_push_tokens::token.eq(token)),
    )
    .execute(conn)
    .await?;
    Ok(deleted)
}
