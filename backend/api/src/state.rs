use std::sync::Arc;

use crate::config::Config;
use crate::db::DbPool;
use crate::services::gemini::GeminiClient;
use crate::services::push::{NativePushSender, PushSender};
use crate::services::storage::StorageService;
use crate::services::ws_hub::WsHub;

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
        }
    }
}
