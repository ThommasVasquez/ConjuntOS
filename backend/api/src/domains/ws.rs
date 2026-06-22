use std::time::Duration;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::auth::jwt;
use crate::services::ws_hub::WsHub;
use crate::state::AppState;

const PING_INTERVAL: Duration = Duration::from_secs(25);
const PONG_TIMEOUT: Duration = Duration::from_secs(10);

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

    // WS-2: reject full session tokens; only accept short-lived ws tickets
    if claims.aud.as_deref() != Some("ws") {
        return axum::http::StatusCode::UNAUTHORIZED.into_response();
    }

    let conjunto_id = claims.conjunto_id;
    let user_id = claims.sub;
    let hub = state.ws_hub.clone();

    ws.on_upgrade(move |socket| handle_socket(socket, hub, conjunto_id, user_id))
        .into_response()
}

async fn handle_socket(socket: WebSocket, hub: WsHub, conjunto_id: Uuid, user_id: Uuid) {
    let (mut sender, mut receiver) = socket.split();

    // WS-7: subscribe to both conjunto-wide and per-user channels
    let mut rx_conjunto = hub.subscribe(conjunto_id).await;
    let mut rx_user = hub.subscribe_user(conjunto_id, user_id).await;

    // Channel for recv_task to trigger a Ping on the send_task
    let (ping_tx, mut ping_rx) = mpsc::unbounded_channel();

    // Forward events + pings → WebSocket client
    let mut send_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                biased; // check pings first to keep them responsive

                _ = ping_rx.recv() => {
                    if sender.send(Message::Ping(axum::body::Bytes::new())).await.is_err() {
                        break;
                    }
                }

                result = rx_conjunto.recv() => {
                    match result {
                        Ok(event) => {
                            let json = match serde_json::to_string(&event) {
                                Ok(j) => j,
                                Err(_) => continue,
                            };
                            if sender.send(Message::Text(json.into())).await.is_err() {
                                break;
                            }
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                            tracing::warn!(
                                "WebSocket lagged by {n} messages for user {user_id} in conjunto {conjunto_id}"
                            );
                            continue;
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                    }
                }

                result = rx_user.recv() => {
                    match result {
                        Ok(event) => {
                            // Per-user events are already targeted at this user
                            let json = match serde_json::to_string(&event) {
                                Ok(j) => j,
                                Err(_) => continue,
                            };
                            if sender.send(Message::Text(json.into())).await.is_err() {
                                break;
                            }
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                            tracing::warn!(
                                "WebSocket user channel lagged by {n} for user {user_id} in conjunto {conjunto_id}"
                            );
                            continue;
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                    }
                }
            }
        }
    });

    // Receive messages + schedule keep-alive pings
    let mut recv_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                msg = receiver.next() => {
                    match msg {
                        Some(Ok(Message::Close(_))) => break,
                        Some(Ok(Message::Pong(_))) => {
                            // Client responded — keep-alive satisfied
                            continue;
                        }
                        Some(Ok(_)) => continue,
                        Some(Err(_)) => break,
                        None => break,
                    }
                }
                _ = tokio::time::sleep(PING_INTERVAL) => {
                    // Request a Ping from the send_task
                    if ping_tx.send(()).is_err() {
                        break; // send_task gone
                    }
                    // If we don't see any message (including Pong) within the timeout,
                    // the client is gone
                    tokio::select! {
                        msg = receiver.next() => {
                            match msg {
                                Some(Ok(Message::Pong(_))) => continue,
                                Some(Ok(Message::Close(_))) => break,
                                Some(Ok(_)) => continue,
                                Some(Err(_)) => break,
                                None => break,
                            }
                        }
                        _ = tokio::time::sleep(PONG_TIMEOUT) => {
                            break; // no Pong received, disconnect
                        }
                    }
                }
            }
        }
    });

    // Wait for either task to finish, then abort the other
    tokio::select! {
        _ = &mut send_task => { recv_task.abort(); }
        _ = &mut recv_task => { send_task.abort(); }
    }

    // WS-4: reap both channels if no more receivers
    let h = hub.clone();
    let cid = conjunto_id;
    let uid = user_id;
    tokio::spawn(async move {
        h.maybe_reap(cid).await;
        h.maybe_reap_user(cid, uid).await;
    });

    tracing::debug!("WebSocket closed for user {user_id} in conjunto {conjunto_id}");
}
