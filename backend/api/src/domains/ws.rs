use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::jwt;
use crate::services::ws_hub::WsHub;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct WsQuery {
    /// JWT token passed as query param (WebSocket can't send custom headers).
    token: String,
}

/// `GET /api/v1/ws?token=<jwt>`
///
/// Upgrades to WebSocket.  The token authenticates the caller and determines
/// the conjunto scope for broadcast events.
pub async fn ws_handler(
    State(state): State<AppState>,
    Query(query): Query<WsQuery>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    let claims = match jwt::verify(&query.token, &state.config.jwt_secret) {
        Ok(c) => c,
        Err(_) => return axum::http::StatusCode::UNAUTHORIZED.into_response(),
    };

    let conjunto_id = claims.conjunto_id;
    let user_id = claims.sub;
    let hub = state.ws_hub.clone();

    ws.on_upgrade(move |socket| handle_socket(socket, hub, conjunto_id, user_id))
        .into_response()
}

async fn handle_socket(socket: WebSocket, hub: WsHub, conjunto_id: Uuid, user_id: Uuid) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = hub.subscribe(conjunto_id).await;

    // Forward broadcast events → WebSocket client
    let mut send_task = tokio::spawn(async move {
        while let Ok(event) = rx.recv().await {
            // If event has a target_user_id, only send to that user
            if let Some(target) = event.target_user_id {
                if target != user_id {
                    continue;
                }
            }
            let json = match serde_json::to_string(&event) {
                Ok(j) => j,
                Err(_) => continue,
            };
            if sender.send(Message::Text(json.into())).await.is_err() {
                break; // client disconnected
            }
        }
    });

    // Receive pings / close from client (keep-alive)
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if matches!(msg, Message::Close(_)) {
                break;
            }
        }
    });

    // Wait for either task to finish, then abort the other
    tokio::select! {
        _ = &mut send_task => { recv_task.abort(); }
        _ = &mut recv_task => { send_task.abort(); }
    }

    tracing::debug!("WebSocket closed for user {user_id} in conjunto {conjunto_id}");
}
