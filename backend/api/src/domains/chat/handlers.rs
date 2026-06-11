use axum::extract::{Path, State};
use axum::routing::get;
use axum::{Json, Router};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::auth::guard;
use crate::db::enums::Rol;
use crate::domains::chat::dto::{
    AdminChatRequest, AdminChatThreadDto, ChatConversacionDto, ChatMensajeDto, CreateChatRequest,
};
use crate::domains::chat::models::NuevoChatMessage;
use crate::domains::chat::repo;
use crate::error::{ApiError, ApiResult};
use crate::services::ws_hub::WsEvent;
use crate::state::AppState;

const ADMIN_ROLES: &[Rol] = &[Rol::Administrador, Rol::Concejo, Rol::SuperAdmin];

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/chat", get(list_messages).post(send_message))
        .route("/admin/chat", get(list_conversations))
        .route("/admin/chat/{usuario_id}", get(get_thread).post(admin_send))
}

/// Resident: list own chat messages (last 50).
#[utoipa::path(
    get,
    path = "/api/v1/chat",
    tag = "chat",
    responses(
        (status = 200, description = "Last 50 messages", body = [ChatMensajeDto]),
        (status = 401, description = "Not authenticated")
    )
)]
async fn list_messages(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<ChatMensajeDto>>> {
    let mut conn = state.pool.get().await?;
    let rows = repo::list_user_messages(&mut conn, user.conjunto_id, user.id).await?;
    Ok(Json(rows.into_iter().map(ChatMensajeDto::from).collect()))
}

/// Resident: send a chat message (optionally with audio).
#[utoipa::path(
    post,
    path = "/api/v1/chat",
    tag = "chat",
    request_body = CreateChatRequest,
    responses(
        (status = 200, description = "Message sent", body = ChatMensajeDto),
        (status = 400, description = "Empty message and no audio"),
        (status = 401, description = "Not authenticated")
    )
)]
async fn send_message(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreateChatRequest>,
) -> ApiResult<Json<ChatMensajeDto>> {
    let mensaje = req.mensaje.clone().unwrap_or_default();

    // Upload audio if provided as base64.
    let audio_url = match &req.audio_base64 {
        Some(b64) if !b64.is_empty() => {
            let data = STANDARD
                .decode(b64)
                .map_err(|e| ApiError::BadRequest(format!("audio_base64 inválido: {e}")))?;
            let path = format!("chat-voice/{}/{}.webm", user.conjunto_id, Uuid::new_v4());
            let url = state
                .storage
                .upload("audio", &path, &data, "audio/webm")
                .await
                .map_err(|e| ApiError::Upstream(format!("storage upload failed: {e}")))?;
            Some(url)
        }
        _ => None,
    };

    if mensaje.trim().is_empty() && audio_url.is_none() {
        return Err(ApiError::BadRequest(
            "debe enviar un mensaje o un audio".into(),
        ));
    }

    let nuevo = NuevoChatMessage {
        conjunto_id: user.conjunto_id,
        usuario_id: user.id,
        mensaje: if mensaje.trim().is_empty() {
            "[audio]".to_string()
        } else {
            mensaje
        },
        audio_url,
        transcripcion: req.transcripcion,
        es_de_admin: false,
    };
    let mut conn = state.pool.get().await?;
    let msg = repo::insert_message(&mut conn, nuevo).await?;
    let dto = ChatMensajeDto::from(msg);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "chat".into(),
                action: "message".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}

/// Admin: list all conversations (grouped by resident).
#[utoipa::path(
    get,
    path = "/api/v1/admin/chat",
    tag = "chat",
    responses(
        (status = 200, description = "Conversation list", body = [ChatConversacionDto]),
        (status = 403, description = "Requires admin role")
    )
)]
async fn list_conversations(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<ChatConversacionDto>>> {
    guard::require(&user, ADMIN_ROLES)?;
    let mut conn = state.pool.get().await?;
    let rows = repo::list_conversations(&mut conn, user.conjunto_id).await?;
    Ok(Json(rows))
}

/// Admin: view a single conversation thread + resident sidebar info.
#[utoipa::path(
    get,
    path = "/api/v1/admin/chat/{usuario_id}",
    tag = "chat",
    params(("usuario_id" = Uuid, Path, description = "Resident user id")),
    responses(
        (status = 200, description = "Thread with resident info", body = AdminChatThreadDto),
        (status = 403, description = "Requires admin role"),
        (status = 404, description = "Resident not in this conjunto")
    )
)]
async fn get_thread(
    State(state): State<AppState>,
    user: AuthUser,
    Path(usuario_id): Path<Uuid>,
) -> ApiResult<Json<AdminChatThreadDto>> {
    guard::require(&user, ADMIN_ROLES)?;
    let mut conn = state.pool.get().await?;

    // Validate resident belongs to the same conjunto.
    let resident_info = repo::get_resident_info(&mut conn, user.conjunto_id, usuario_id).await?;
    if resident_info.profile.is_none() {
        return Err(ApiError::NotFound(
            "residente no encontrado en este conjunto".into(),
        ));
    }

    let messages = repo::list_admin_thread(&mut conn, user.conjunto_id, usuario_id).await?;
    // Mark resident messages as read.
    repo::mark_read(&mut conn, user.conjunto_id, usuario_id).await?;

    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "chat".into(),
                action: "read".into(),
                payload: None,
                target_user_id: Some(usuario_id),
            },
        )
        .await;

    Ok(Json(AdminChatThreadDto {
        mensajes: messages.into_iter().map(ChatMensajeDto::from).collect(),
        resident_info,
    }))
}

/// Admin: send a reply in a resident's thread.
#[utoipa::path(
    post,
    path = "/api/v1/admin/chat/{usuario_id}",
    tag = "chat",
    params(("usuario_id" = Uuid, Path, description = "Resident user id")),
    request_body = AdminChatRequest,
    responses(
        (status = 200, description = "Message sent", body = ChatMensajeDto),
        (status = 400, description = "Empty message"),
        (status = 403, description = "Requires admin role"),
        (status = 404, description = "Resident not in this conjunto")
    )
)]
async fn admin_send(
    State(state): State<AppState>,
    user: AuthUser,
    Path(usuario_id): Path<Uuid>,
    Json(req): Json<AdminChatRequest>,
) -> ApiResult<Json<ChatMensajeDto>> {
    guard::require(&user, ADMIN_ROLES)?;
    let mensaje = req.mensaje.clone().unwrap_or_default();

    // Resolve audio URL: prefer an explicit URL, otherwise upload base64.
    let audio_url = if let Some(url) = req.audio_url.filter(|u| !u.is_empty()) {
        Some(url)
    } else if let Some(b64) = req.audio_base64.filter(|b| !b.is_empty()) {
        let data = STANDARD
            .decode(&b64)
            .map_err(|e| ApiError::BadRequest(format!("audio_base64 inválido: {e}")))?;
        let path = format!("chat-voice/{}/{}.webm", user.conjunto_id, Uuid::new_v4());
        let url = state
            .storage
            .upload("audio", &path, &data, "audio/webm")
            .await
            .map_err(|e| ApiError::Upstream(format!("storage upload failed: {e}")))?;
        Some(url)
    } else {
        None
    };

    if mensaje.trim().is_empty() && audio_url.is_none() {
        return Err(ApiError::BadRequest(
            "debe enviar un mensaje o un audio".into(),
        ));
    }

    let mut conn = state.pool.get().await?;

    // Validate the target resident belongs to the same conjunto.
    use crate::db::schema::usuarios;
    use diesel::prelude::*;
    use diesel_async::RunQueryDsl;
    let exists: bool = diesel::select(diesel::dsl::exists(
        usuarios::table
            .filter(usuarios::id.eq(usuario_id))
            .filter(usuarios::conjunto_id.eq(user.conjunto_id)),
    ))
    .get_result(&mut conn)
    .await?;
    if !exists {
        return Err(ApiError::NotFound(
            "residente no encontrado en este conjunto".into(),
        ));
    }

    let nuevo = NuevoChatMessage {
        conjunto_id: user.conjunto_id,
        usuario_id,
        mensaje: if mensaje.trim().is_empty() {
            "[audio]".to_string()
        } else {
            mensaje
        },
        audio_url,
        transcripcion: req.transcripcion,
        es_de_admin: true,
    };
    let msg = repo::insert_message(&mut conn, nuevo).await?;
    let dto = ChatMensajeDto::from(msg);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "chat".into(),
                action: "message".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: Some(usuario_id),
            },
        )
        .await;
    Ok(Json(dto))
}
