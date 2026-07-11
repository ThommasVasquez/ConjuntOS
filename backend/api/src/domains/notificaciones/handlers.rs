use axum::extract::State;
use axum::routing::{get, post, put};
use axum::{Json, Router};

use crate::auth::extract::AuthUser;
use crate::domains::notificaciones::dto::{
    MarkReadRequest, MarkReadResponse, NativePlatform, NotificacionDto, NativePushTokenDto,
    PushSubscribeBody, PushSubscribeResponse, PushSubscriptionDto, PushUnsubscribeBody,
};
use crate::domains::notificaciones::repo;
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/notificaciones", get(list_notificaciones))
        .route("/notificaciones/leidas", put(mark_leidas))
        .route(
            "/usuarios/me/push-subscriptions",
            post(subscribe_push).delete(unsubscribe_push),
        )
}

#[utoipa::path(
    get,
    path = "/api/v1/notificaciones",
    tag = "notificaciones",
    responses(
        (status = 200, description = "Latest 20 notifications of the caller", body = [NotificacionDto]),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn list_notificaciones(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<NotificacionDto>>> {
    let mut conn = state.pool.get().await?;
    let rows = repo::list_for_user(&mut conn, user.conjunto_id, user.id).await?;
    Ok(Json(rows.into_iter().map(NotificacionDto::from).collect()))
}

#[utoipa::path(
    put,
    path = "/api/v1/notificaciones/leidas",
    tag = "notificaciones",
    request_body(content = MarkReadRequest, description = "Optional; omit (or omit `ids`) to mark all unread as read"),
    responses(
        (status = 200, description = "Number of notifications marked read", body = MarkReadResponse),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn mark_leidas(
    State(state): State<AppState>,
    user: AuthUser,
    body: Option<Json<MarkReadRequest>>,
) -> ApiResult<Json<MarkReadResponse>> {
    let ids = body.and_then(|Json(req)| req.ids);
    let mut conn = state.pool.get().await?;
    let updated = repo::mark_read(&mut conn, user.conjunto_id, user.id, ids).await?;
    Ok(Json(MarkReadResponse { updated }))
}

#[utoipa::path(
    post,
    path = "/api/v1/usuarios/me/push-subscriptions",
    tag = "notificaciones",
    request_body = PushSubscribeBody,
    responses(
        (status = 200, description = "Subscription stored. Web-push upserts on endpoint; native upserts on token.", body = PushSubscribeResponse),
        (status = 400, description = "Unsupported native push platform (only 'expo' is routed)"),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn subscribe_push(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<PushSubscribeBody>,
) -> ApiResult<Json<PushSubscribeResponse>> {
    let mut conn = state.pool.get().await?;
    match body {
        PushSubscribeBody::Web(req) => {
            let row = repo::upsert_push_subscription(
                &mut conn,
                user.conjunto_id,
                user.id,
                &req.endpoint,
                &req.keys.p256dh,
                &req.keys.auth,
            )
            .await?;
            Ok(Json(PushSubscribeResponse::Web(PushSubscriptionDto::from(
                row,
            ))))
        }
        PushSubscribeBody::Native(req) => {
            // Only the Expo transport is actually routed by the native push
            // sender (FCM/APNs direct delivery is not implemented). Reject
            // unusable platforms here so we never store a token that could
            // never wake the device — better a 400 than a silent dead row.
            if req.platform != NativePlatform::Expo {
                return Err(ApiError::BadRequest(format!(
                    "plataforma de push '{}' no soportada (solo 'expo')",
                    req.platform.as_str()
                )));
            }
            let row = repo::upsert_native_push_token(
                &mut conn,
                user.conjunto_id,
                user.id,
                req.platform.as_str(),
                &req.token,
                req.device_id.as_deref(),
            )
            .await?;
            Ok(Json(PushSubscribeResponse::Native(NativePushTokenDto::from(
                row,
            ))))
        }
    }
}

#[utoipa::path(
    delete,
    path = "/api/v1/usuarios/me/push-subscriptions",
    tag = "notificaciones",
    request_body = PushUnsubscribeBody,
    responses(
        (status = 200, description = "Subscription removed (idempotent). Accepts {endpoint} (web) or {token} (native)."),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn unsubscribe_push(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<PushUnsubscribeBody>,
) -> ApiResult<Json<serde_json::Value>> {
    let mut conn = state.pool.get().await?;
    let deleted = match body {
        PushUnsubscribeBody::Web { endpoint } => {
            repo::delete_push_subscription(&mut conn, user.id, &endpoint).await?
        }
        PushUnsubscribeBody::Native { token } => {
            repo::delete_native_push_token(&mut conn, user.id, &token).await?
        }
    };
    Ok(Json(serde_json::json!({ "ok": true, "deleted": deleted })))
}
