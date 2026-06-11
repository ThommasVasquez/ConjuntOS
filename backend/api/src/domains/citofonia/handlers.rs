use axum::extract::State;
use axum::routing::post;
use axum::{Json, Router};
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::db::enums::Rol;
use crate::db::schema::{push_subscriptions, unidades, usuarios};
use crate::db::DbConn;
use crate::error::ApiResult;
use crate::services::push::PushSubscriptionInfo;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/citofonia/call-push", post(call_push))
}

// ── DTOs ──

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CallPushRequest {
    pub target_peer_id: String,
    pub caller_name: String,
    pub caller_peer_id: String,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CallPushResponse {
    pub sent: i32,
}

// ── Peer-ID parsing ──

#[derive(Debug, PartialEq)]
pub enum PeerTarget {
    User(Uuid),
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

// ── Handler ──

#[utoipa::path(
    post,
    path = "/api/v1/citofonia/call-push",
    tag = "citofonia",
    request_body = CallPushRequest,
    responses(
        (status = 200, description = "Push notifications dispatched", body = CallPushResponse),
        (status = 401, description = "Not authenticated")
    )
)]
async fn call_push(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CallPushRequest>,
) -> ApiResult<Json<CallPushResponse>> {
    let target = parse_peer_id(&req.target_peer_id);
    let mut conn = state.pool.get().await?;

    let user_ids = resolve_targets(&mut conn, &target, user.conjunto_id).await?;
    if user_ids.is_empty() {
        return Ok(Json(CallPushResponse { sent: 0 }));
    }

    // Fetch push subscriptions for the resolved users.
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

    // Build push payload.
    let payload = serde_json::json!({
        "title": "Llamada Entrante",
        "body": format!("Llamada de citofonia desde {}", req.caller_name),
        "data": {
            "url": "/citofonia",
            "callerName": req.caller_name,
            "callerPeerId": req.caller_peer_id,
        }
    });
    let payload_bytes = serde_json::to_vec(&payload).unwrap_or_default();

    let mut sent: i32 = 0;
    for (endpoint, p256dh, auth) in subs {
        let sub_info = PushSubscriptionInfo {
            endpoint: endpoint.clone(),
            p256dh,
            auth,
        };
        match state.push_sender.send(&sub_info, &payload_bytes).await {
            Ok(()) => sent += 1,
            Err(e) => {
                tracing::warn!(endpoint = %endpoint, error = ?e, "push send failed");
            }
        }
    }

    Ok(Json(CallPushResponse { sent }))
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
