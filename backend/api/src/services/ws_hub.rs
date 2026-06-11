use std::collections::HashMap;
use std::sync::Arc;

use serde::Serialize;
use tokio::sync::{broadcast, RwLock};
use uuid::Uuid;

/// Max events buffered per channel before slow receivers are dropped.
const CHANNEL_CAPACITY: usize = 256;

/// A real-time event broadcast to all connected clients in a conjunto.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WsEvent {
    /// The domain that produced the event.
    pub domain: String,
    /// The action that occurred.
    pub action: String,
    /// Optional payload (the created/updated entity as JSON).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<serde_json::Value>,
    /// Optional target user ID (for user-specific events like chat).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_user_id: Option<Uuid>,
}

/// Per-tenant broadcast hub.  Thread-safe, cheap to clone.
#[derive(Clone, Default)]
pub struct WsHub {
    channels: Arc<RwLock<HashMap<Uuid, broadcast::Sender<WsEvent>>>>,
}

impl WsHub {
    pub fn new() -> Self {
        Self::default()
    }

    /// Get or create a broadcast sender for a conjunto.
    pub async fn get_sender(&self, conjunto_id: Uuid) -> broadcast::Sender<WsEvent> {
        // Fast path: read lock
        {
            let channels = self.channels.read().await;
            if let Some(tx) = channels.get(&conjunto_id) {
                return tx.clone();
            }
        }
        // Slow path: write lock to insert
        let mut channels = self.channels.write().await;
        channels
            .entry(conjunto_id)
            .or_insert_with(|| broadcast::channel(CHANNEL_CAPACITY).0)
            .clone()
    }

    /// Subscribe to a conjunto's events.
    pub async fn subscribe(&self, conjunto_id: Uuid) -> broadcast::Receiver<WsEvent> {
        self.get_sender(conjunto_id).await.subscribe()
    }

    /// Publish an event to all subscribers in a conjunto.
    /// Silently ignores if no one is listening.
    pub async fn publish(&self, conjunto_id: Uuid, event: WsEvent) {
        let tx = self.get_sender(conjunto_id).await;
        let _ = tx.send(event);
    }
}
