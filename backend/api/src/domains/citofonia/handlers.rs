use axum::extract::{Query, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::db::enums::Rol;
use crate::db::schema::{native_push_tokens, push_subscriptions, unidades, usuarios};
use crate::db::DbConn;
use crate::error::{ApiError, ApiResult};
use crate::services::push::{NativePushTokenInfo, PushMessage, PushSubscriptionInfo};
use crate::services::ws_hub::WsEvent;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/citofonia/call", post(call))
        .route("/citofonia/token", get(citofonia_token))
}

// ── DTOs ──

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CallRequest {
    pub target_peer_id: String,
    /// Optional human-friendly caller label for the push body; falls back to the
    /// authenticated user's name.
    #[serde(default)]
    pub caller_name: Option<String>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CallResponse {
    /// LiveKit room the caller joined and the callee must join.
    pub room: String,
    /// LiveKit access token for the caller.
    pub token: String,
    /// LiveKit server URL.
    pub url: String,
    /// Number of push notifications actually delivered.
    pub sent: i32,
}

#[derive(Deserialize, ToSchema)]
pub struct TokenQuery {
    pub room: String,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CitofoniaTokenDto {
    pub token: String,
    pub url: String,
}

// ── Peer-ID parsing ──

#[derive(Debug, PartialEq)]
pub enum PeerTarget {
    User(Uuid),
    /// Internal dial code, resolved within the caller's conjunto.
    Numero(String),
    Role(Uuid, Rol),
    Apto(Uuid, String, String),
    Invalid,
}

pub fn parse_peer_id(peer_id: &str) -> PeerTarget {
    // user-{uuid}
    if let Some(rest) = peer_id.strip_prefix("user-") {
        return match Uuid::parse_str(rest) {
            Ok(id) => PeerTarget::User(id),
            Err(_) => PeerTarget::Invalid,
        };
    }

    // numero-{code}: internal dial code (digits), resolved in the caller's conjunto.
    if let Some(rest) = peer_id.strip_prefix("numero-") {
        if !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit()) {
            return PeerTarget::Numero(rest.to_string());
        }
        return PeerTarget::Invalid;
    }

    // {conjuntoId}-APTO-{torre}-{numero}
    // {conjuntoId}-VIGILANTE
    // {conjuntoId}-ADMINISTRADOR
    // UUIDs are 36 chars (8-4-4-4-12), so extract the first 36 chars as UUID
    // and the rest after the separating dash as the suffix.
    if peer_id.len() < 38 {
        // 36 (uuid) + 1 (dash) + at least 1 char
        return PeerTarget::Invalid;
    }
    let (uuid_part, rest) = peer_id.split_at(36);
    let conjunto_id = match Uuid::parse_str(uuid_part) {
        Ok(id) => id,
        Err(_) => return PeerTarget::Invalid,
    };
    let suffix = match rest.strip_prefix('-') {
        Some(s) => s,
        None => return PeerTarget::Invalid,
    };

    if let Some(rest) = suffix.strip_prefix("APTO-") {
        let apto_parts: Vec<&str> = rest.splitn(2, '-').collect();
        if apto_parts.len() == 2 && !apto_parts[0].is_empty() && !apto_parts[1].is_empty() {
            return PeerTarget::Apto(
                conjunto_id,
                apto_parts[0].to_string(),
                apto_parts[1].to_string(),
            );
        }
        return PeerTarget::Invalid;
    }

    match suffix.parse::<Rol>() {
        Ok(rol) => PeerTarget::Role(conjunto_id, rol),
        Err(_) => PeerTarget::Invalid,
    }
}

// ── Resolver: PeerTarget -> Vec<user_id> ──

async fn resolve_targets(
    conn: &mut DbConn,
    target: &PeerTarget,
    caller_conjunto_id: Uuid,
) -> ApiResult<Vec<Uuid>> {
    match target {
        PeerTarget::User(id) => {
            let ids: Vec<Uuid> = usuarios::table
                .filter(usuarios::id.eq(id))
                .filter(usuarios::conjunto_id.eq(caller_conjunto_id))
                .filter(usuarios::activo.eq(true))
                .select(usuarios::id)
                .load(conn)
                .await?;
            Ok(ids)
        }
        PeerTarget::Numero(code) => {
            let ids: Vec<Uuid> = usuarios::table
                .filter(usuarios::conjunto_id.eq(caller_conjunto_id))
                .filter(usuarios::numero_interno.eq(code))
                .filter(usuarios::activo.eq(true))
                .select(usuarios::id)
                .load(conn)
                .await?;
            Ok(ids)
        }
        PeerTarget::Role(conjunto_id, rol) => {
            if *conjunto_id != caller_conjunto_id {
                return Ok(Vec::new());
            }
            let ids: Vec<Uuid> = usuarios::table
                .filter(usuarios::conjunto_id.eq(caller_conjunto_id))
                .filter(usuarios::rol.eq(rol))
                .filter(usuarios::activo.eq(true))
                .select(usuarios::id)
                .load(conn)
                .await?;
            Ok(ids)
        }
        PeerTarget::Apto(conjunto_id, torre, numero) => {
            if *conjunto_id != caller_conjunto_id {
                return Ok(Vec::new());
            }
            // Find the unidad, then users linked to it.
            let unidad_ids: Vec<Uuid> = unidades::table
                .filter(unidades::conjunto_id.eq(caller_conjunto_id))
                .filter(unidades::torre.eq(torre))
                .filter(unidades::numero.eq(numero))
                .select(unidades::id)
                .load(conn)
                .await?;
            if unidad_ids.is_empty() {
                return Ok(Vec::new());
            }
            let ids: Vec<Uuid> = usuarios::table
                .filter(usuarios::conjunto_id.eq(caller_conjunto_id))
                .filter(usuarios::unidad_id.eq_any(&unidad_ids))
                .filter(usuarios::activo.eq(true))
                .select(usuarios::id)
                .load(conn)
                .await?;
            Ok(ids)
        }
        PeerTarget::Invalid => Ok(Vec::new()),
    }
}

// ── Handlers ──

/// LiveKit `(api_key, api_secret, url)` or 503 if not configured.
fn livekit_creds(state: &AppState) -> ApiResult<(String, String, String)> {
    match (&state.config.livekit_api_key, &state.config.livekit_api_secret) {
        (Some(k), Some(s)) => {
            let url = state
                .config
                .livekit_url
                .clone()
                .unwrap_or_else(|| "ws://localhost:7880".to_string());
            Ok((k.clone(), s.clone(), url))
        }
        _ => Err(ApiError::ServiceUnavailable("LiveKit no configurado".into())),
    }
}

fn caller_label(user: &AuthUser, requested: Option<String>) -> String {
    requested
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| user.nombre.clone())
}

#[utoipa::path(
    post,
    path = "/api/v1/citofonia/call",
    tag = "citofonia",
    request_body = CallRequest,
    responses(
        (status = 200, description = "Call room created; caller token returned; push dispatched", body = CallResponse),
        (status = 401, description = "Not authenticated"),
        (status = 503, description = "LiveKit not configured")
    )
)]
async fn call(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CallRequest>,
) -> ApiResult<Json<CallResponse>> {
    let (api_key, api_secret, url) = livekit_creds(&state)?;

    let target = parse_peer_id(&req.target_peer_id);
    let mut conn = state.pool.get().await?;
    let user_ids = resolve_targets(&mut conn, &target, user.conjunto_id).await?;

    // Ephemeral per-call room; embeds conjunto_id so the callee's token request
    // can be verified against its tenant.
    let room = format!("citofonia-{}-{}", user.conjunto_id, Uuid::new_v4());
    let caller_name = caller_label(&user, req.caller_name);

    let metadata = serde_json::json!({
        "nombre": user.nombre,
        "rol": user.rol.as_str(),
    })
    .to_string();
    let token = crate::services::livekit::generate_token(
        &api_key,
        &api_secret,
        &room,
        &user.id.to_string(),
        true,
        &metadata,
    )
    .map_err(|e| ApiError::Internal(anyhow::anyhow!("token generation failed: {e}")))?;

    // Wake target users via push (best-effort; only real deliveries are counted).
    // Fans out per target to BOTH transports: web-push (VAPID) subscriptions and
    // native (Expo / FCM / APNs) device tokens. The data contract is identical
    // across both; `sent` counts successful deliveries across the union.
    let sent = if user_ids.is_empty() {
        0
    } else {
        let message = PushMessage {
            title: "Llamada Entrante".to_string(),
            body: format!("Llamada de citofonía desde {caller_name}"),
            data: serde_json::json!({
                "url": "/citofonia",
                "room": room,
                "callerName": caller_name,
            }),
        };

        let mut count: i32 = 0;

        // ── Web-push (VAPID) ──
        let subs: Vec<(String, String, String)> = push_subscriptions::table
            .filter(push_subscriptions::conjunto_id.eq(user.conjunto_id))
            .filter(push_subscriptions::usuario_id.eq_any(&user_ids))
            .select((
                push_subscriptions::endpoint,
                push_subscriptions::p256dh,
                push_subscriptions::auth,
            ))
            .load(&mut conn)
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
            .filter(native_push_tokens::conjunto_id.eq(user.conjunto_id))
            .filter(native_push_tokens::usuario_id.eq_any(&user_ids))
            .select((native_push_tokens::platform, native_push_tokens::token))
            .load(&mut conn)
            .await?;

        for (platform, token) in native_tokens {
            let info = NativePushTokenInfo {
                platform: platform.clone(),
                token: token.clone(),
            };
            match state.native_push_sender.send(&info, &message).await {
                Ok(()) => count += 1,
                Err(e) => {
                    tracing::warn!(platform = %platform, error = ?e, "native push send failed");
                }
            }
        }

        count
    };

    // Ring any OPEN tab of each target instantly over WebSocket. This is the
    // reliable foreground path — independent of Web Push, which only reaches the
    // browser that registered a subscription and is blocked/unreliable in some
    // browsers (e.g. Brave). Push above remains the fallback for a closed app.
    let ws_payload = serde_json::json!({ "room": room, "callerName": caller_name });
    for uid in &user_ids {
        state
            .ws_hub
            .publish(
                user.conjunto_id,
                WsEvent {
                    domain: "citofonia".to_string(),
                    action: "incoming_call".to_string(),
                    payload: Some(ws_payload.clone()),
                    target_user_id: Some(*uid),
                },
            )
            .await;
    }

    tracing::info!(
        caller = %user.id,
        targets = ?user_ids,
        ws_published = user_ids.len(),
        push_sent = sent,
        room = %room,
        "citofonia/call dispatched"
    );

    Ok(Json(CallResponse {
        room,
        token,
        url,
        sent,
    }))
}

#[utoipa::path(
    get,
    path = "/api/v1/citofonia/token",
    tag = "citofonia",
    params(("room" = String, Query, description = "Room name to join")),
    responses(
        (status = 200, description = "LiveKit token for the room", body = CitofoniaTokenDto),
        (status = 401, description = "Not authenticated"),
        (status = 403, description = "Room belongs to another tenant"),
        (status = 503, description = "LiveKit not configured")
    )
)]
async fn citofonia_token(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<TokenQuery>,
) -> ApiResult<Json<CitofoniaTokenDto>> {
    let (api_key, api_secret, url) = livekit_creds(&state)?;

    // Room format: citofonia-{conjuntoId}-{uuid}. Verify the embedded conjunto.
    let embedded = q
        .room
        .strip_prefix("citofonia-")
        .and_then(|rest| rest.get(0..36))
        .and_then(|id| Uuid::parse_str(id).ok());
    match embedded {
        Some(cid) if cid == user.conjunto_id => {}
        _ => return Err(ApiError::Forbidden),
    }

    let metadata = serde_json::json!({
        "nombre": user.nombre,
        "rol": user.rol.as_str(),
    })
    .to_string();
    let token = crate::services::livekit::generate_token(
        &api_key,
        &api_secret,
        &q.room,
        &user.id.to_string(),
        true,
        &metadata,
    )
    .map_err(|e| ApiError::Internal(anyhow::anyhow!("token generation failed: {e}")))?;

    Ok(Json(CitofoniaTokenDto { token, url }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_user_peer_id() {
        let id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        assert_eq!(
            parse_peer_id("user-550e8400-e29b-41d4-a716-446655440000"),
            PeerTarget::User(id),
        );
    }

    #[test]
    fn parse_role_vigilante() {
        let cid = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        assert_eq!(
            parse_peer_id("550e8400-e29b-41d4-a716-446655440000-VIGILANTE"),
            PeerTarget::Role(cid, Rol::Vigilante),
        );
    }

    #[test]
    fn parse_role_administrador() {
        let cid = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        assert_eq!(
            parse_peer_id("550e8400-e29b-41d4-a716-446655440000-ADMINISTRADOR"),
            PeerTarget::Role(cid, Rol::Administrador),
        );
    }

    #[test]
    fn parse_apto_peer_id() {
        let cid = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        assert_eq!(
            parse_peer_id("550e8400-e29b-41d4-a716-446655440000-APTO-A-101"),
            PeerTarget::Apto(cid, "A".into(), "101".into()),
        );
    }

    #[test]
    fn parse_invalid_peer_ids() {
        assert_eq!(parse_peer_id(""), PeerTarget::Invalid);
        assert_eq!(parse_peer_id("garbage"), PeerTarget::Invalid);
        assert_eq!(parse_peer_id("user-not-a-uuid"), PeerTarget::Invalid);
        assert_eq!(
            parse_peer_id("550e8400-e29b-41d4-a716-446655440000-UNKNOWN_ROLE"),
            PeerTarget::Invalid,
        );
    }

    #[test]
    fn parse_apto_missing_parts() {
        assert_eq!(
            parse_peer_id("550e8400-e29b-41d4-a716-446655440000-APTO-"),
            PeerTarget::Invalid,
        );
        assert_eq!(
            parse_peer_id("550e8400-e29b-41d4-a716-446655440000-APTO-A"),
            PeerTarget::Invalid,
        );
    }
}
