use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::config::Config;
use crate::db::DbPool;
use crate::services::gemini::GeminiClient;
use crate::services::payments::PaymentGateway;
use crate::services::push::{NativePushSender, PushSender};
use crate::services::storage::StorageService;
use crate::services::ws_hub::WsHub;

pub type ActiveRingingCalls = Arc<Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>>;

#[derive(Clone)]
pub struct AppState {
    pub pool: DbPool,
    pub config: Arc<Config>,
    pub push_sender: Arc<dyn PushSender>,
    /// Native (Expo / FCM / APNs) push sender, sibling of `push_sender` (web-push).
    pub native_push_sender: Arc<dyn NativePushSender>,
    pub storage: Arc<dyn StorageService>,
    pub gemini: Option<GeminiClient>,
    pub ws_hub: WsHub,
    pub payment_gateway: PaymentGateway,
    /// Tracks active ringing citofonía calls so follow-up push pulses stop the
    /// instant the call is answered or cancelled.
    pub active_ringing_calls: ActiveRingingCalls,
}

impl AppState {
    pub fn new(config: Config, pool: DbPool) -> Self {
        let push_sender = crate::services::push::create_push_sender(&config);
        let native_push_sender = crate::services::push::create_native_push_sender();
        let storage = crate::services::storage::create_storage_service(&config);
        let gemini = config
            .gemini_api_key
            .as_ref()
            .map(|key| GeminiClient::new(key.clone()));
        Self {
            pool,
            config: Arc::new(config),
            push_sender,
            native_push_sender,
            storage,
            gemini,
            ws_hub: WsHub::new(),
            payment_gateway: crate::services::payments::PaymentGateway::from_env(),
            active_ringing_calls: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Register a ringing call room and return a receiver that fires when the
    /// call is answered or cancelled.
    pub fn register_ringing_call(&self, room: String) -> tokio::sync::oneshot::Receiver<()> {
        let (tx, rx) = tokio::sync::oneshot::channel();
        if let Ok(mut map) = self.active_ringing_calls.lock() {
            if let Some(prev) = map.insert(room, tx) {
                let _ = prev.send(());
            }
        }
        rx
    }

    /// Signal and remove an active ringing call (e.g. answered or cancelled).
    pub fn stop_ringing_call(&self, room: &str) {
        if let Ok(mut map) = self.active_ringing_calls.lock() {
            if let Some(tx) = map.remove(room) {
                let _ = tx.send(());
            }
        }
    }
}
