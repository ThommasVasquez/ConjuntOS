use axum::extract::State;
use axum::routing::{get, post, put};
use axum::{Json, Router};

use crate::auth::extract::AuthUser;
use crate::domains::notificaciones::dto::{
    MarkReadRequest, MarkReadResponse, NotificacionDto, PushSubscribeRequest, PushSubscriptionDto,
    PushUnsubscribeRequest,
};
use crate::domains::notificaciones::repo;
use crate::error::ApiResult;
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
    request_body = PushSubscribeRequest,
    responses(
        (status = 200, description = "Subscription stored (upsert on endpoint)", body = PushSubscriptionDto),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn subscribe_push(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<PushSubscribeRequest>,
) -> ApiResult<Json<PushSubscriptionDto>> {
    let mut conn = state.pool.get().await?;
    let row = repo::upsert_push_subscription(
        &mut conn,
        user.conjunto_id,
        user.id,
        &req.endpoint,
        &req.keys.p256dh,
        &req.keys.auth,
    )
    .await?;
    Ok(Json(row.into()))
}

#[utoipa::path(
    delete,
    path = "/api/v1/usuarios/me/push-subscriptions",
    tag = "notificaciones",
    request_body = PushUnsubscribeRequest,
    responses(
        (status = 200, description = "Subscription removed (idempotent)"),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn unsubscribe_push(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<PushUnsubscribeRequest>,
) -> ApiResult<Json<serde_json::Value>> {
    let mut conn = state.pool.get().await?;
    let deleted = repo::delete_push_subscription(&mut conn, user.id, &req.endpoint).await?;
    Ok(Json(serde_json::json!({ "ok": true, "deleted": deleted })))
}
