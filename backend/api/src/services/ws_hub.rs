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

impl WsEvent {
    /// Build a conjunto-wide broadcast event (no specific target user).
    pub fn broadcast(domain: &str, action: &str, payload: Option<serde_json::Value>) -> Self {
        Self {
            domain: domain.to_owned(),
            action: action.to_owned(),
            payload,
            target_user_id: None,
        }
    }

    /// Build an event addressed to a single user within the conjunto.
    pub fn to_user(
        target_user_id: Uuid,
        domain: &str,
        action: &str,
        payload: Option<serde_json::Value>,
    ) -> Self {
        Self {
            domain: domain.to_owned(),
            action: action.to_owned(),
            payload,
            target_user_id: Some(target_user_id),
        }
    }
}

/// Canonical names for real-time event domains and actions.
///
/// Publishers (Rust) and subscribers (`useWsSubscription('<domain>', ...)` on the
/// web client) must agree on these exact strings. Existing domains stay as plain
/// string literals at their call sites; new feature work references these constants
/// to avoid typo-drift between backend and frontend.
pub mod ws_events {
    /// Panic / SOS emergency alerts (F1).
    pub const SOS: &str = "sos";
    /// Resident surveys / polls (F4).
    pub const ENCUESTA: &str = "encuesta";
    /// Monetary fines from the comité de convivencia (F5).
    pub const MULTA: &str = "multa";
    /// Expiry reminders: vehicle docs, pet vaccines, dues (F6/F7).
    pub const RECORDATORIO: &str = "recordatorio";

    /// Common action verbs shared across domains.
    pub mod action {
        pub const CREATED: &str = "created";
        pub const UPDATED: &str = "updated";
        pub const RESOLVED: &str = "resolved";
    }
}

/// Per-tenant broadcast hub.  Thread-safe, cheap to clone.
#[derive(Clone, Default)]
pub struct WsHub {
    channels: Arc<RwLock<HashMap<Uuid, broadcast::Sender<WsEvent>>>>,
    /// WS-7: per-user channels for private events (targeted at a single user).
    user_channels: Arc<RwLock<HashMap<(Uuid, Uuid), broadcast::Sender<WsEvent>>>>,
}

impl WsHub {
    pub fn new() -> Self {
        Self::default()
    }

    /// Get or create a broadcast sender for a conjunto.
    pub async fn get_sender(&self, conjunto_id: Uuid) -> broadcast::Sender<WsEvent> {
        {
            let channels = self.channels.read().await;
            if let Some(tx) = channels.get(&conjunto_id) {
                return tx.clone();
            }
        }
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

    /// WS-7: subscribe to a user's private event channel.
    pub async fn subscribe_user(&self, conjunto_id: Uuid, user_id: Uuid) -> broadcast::Receiver<WsEvent> {
        let key = (conjunto_id, user_id);
        {
            let channels = self.user_channels.read().await;
            if let Some(tx) = channels.get(&key) {
                return tx.subscribe();
            }
        }
        let mut channels = self.user_channels.write().await;
        channels
            .entry(key)
            .or_insert_with(|| broadcast::channel(CHANNEL_CAPACITY).0)
            .subscribe()
    }

    /// WS-7: publish routes to per-user channel if targeted, else conjunto broadcast.
    /// Silently ignores if no one is listening.
    pub async fn publish(&self, conjunto_id: Uuid, event: WsEvent) {
        if let Some(user_id) = event.target_user_id {
            // Private event — use per-user channel (WS-7)
            let key = (conjunto_id, user_id);
            let tx = {
                let channels = self.user_channels.read().await;
                channels.get(&key).cloned()
            };
            if let Some(tx) = tx {
                let _ = tx.send(event);
            }
            // No channel = user not connected, drop silently
        } else {
            // Broadcast event — use conjunto channel
            let tx = self.get_sender(conjunto_id).await;
            let _ = tx.send(event);
        }
    }

    /// WS-4: remove the conjunto channel entry if no receivers remain.
    pub async fn maybe_reap(&self, conjunto_id: Uuid) {
        let reap = {
            let channels = self.channels.read().await;
            channels.get(&conjunto_id).map_or(false, |tx| tx.receiver_count() == 0)
        };
        if reap {
            let mut channels = self.channels.write().await;
            if let Some(tx) = channels.get(&conjunto_id) {
                if tx.receiver_count() == 0 {
                    channels.remove(&conjunto_id);
                }
            }
        }
    }

    /// WS-7: remove the per-user channel entry if no receivers remain.
    pub async fn maybe_reap_user(&self, conjunto_id: Uuid, user_id: Uuid) {
        let key = (conjunto_id, user_id);
        let reap = {
            let channels = self.user_channels.read().await;
            channels.get(&key).map_or(false, |tx| tx.receiver_count() == 0)
        };
        if reap {
            let mut channels = self.user_channels.write().await;
            if let Some(tx) = channels.get(&key) {
                if tx.receiver_count() == 0 {
                    channels.remove(&key);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn new_domain_constants_have_stable_names() {
        // Subscribers on the web (useWsSubscription('sos', ...)) and the Rust
        // publishers must agree on these exact strings, so pin them.
        assert_eq!(ws_events::SOS, "sos");
        assert_eq!(ws_events::ENCUESTA, "encuesta");
        assert_eq!(ws_events::MULTA, "multa");
        assert_eq!(ws_events::RECORDATORIO, "recordatorio");
    }

    #[test]
    fn broadcast_event_serializes_without_target_user() {
        let event = WsEvent::broadcast(
            ws_events::SOS,
            ws_events::action::CREATED,
            Some(json!({ "id": "abc", "tipo": "seguridad" })),
        );
        let v: serde_json::Value = serde_json::to_value(&event).unwrap();

        assert_eq!(v["domain"], "sos");
        assert_eq!(v["action"], "created");
        assert_eq!(v["payload"]["tipo"], "seguridad");
        // camelCase + skip-if-none: a broadcast event must not carry targetUserId.
        assert!(v.get("targetUserId").is_none());
    }

    #[test]
    fn targeted_event_serializes_with_camelcase_target_user() {
        let uid = Uuid::nil();
        let event = WsEvent::to_user(
            uid,
            ws_events::RECORDATORIO,
            ws_events::action::CREATED,
            None,
        );
        let v: serde_json::Value = serde_json::to_value(&event).unwrap();

        assert_eq!(v["domain"], "recordatorio");
        assert_eq!(v["targetUserId"], uid.to_string());
        // payload None must be omitted, not serialized as null.
        assert!(v.get("payload").is_none());
    }
}
