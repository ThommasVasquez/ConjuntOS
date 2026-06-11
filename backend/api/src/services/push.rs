use std::sync::{Arc, Mutex};

use crate::config::Config;

/// Minimal subscription info needed to send a push notification.
#[derive(Debug, Clone)]
pub struct PushSubscriptionInfo {
    pub endpoint: String,
    pub p256dh: String,
    pub auth: String,
}

/// Trait for sending web-push notifications. Real VAPID implementation will
/// be added in a later milestone once the web-push approach is finalized.
pub trait PushSender: Send + Sync {
    fn send(
        &self,
        sub: &PushSubscriptionInfo,
        payload: &[u8],
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = anyhow::Result<()>> + Send + '_>>;
}

/// Production placeholder — logs the push attempt without actually sending.
pub struct LogOnlyPushSender;

impl PushSender for LogOnlyPushSender {
    fn send(
        &self,
        sub: &PushSubscriptionInfo,
        payload: &[u8],
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = anyhow::Result<()>> + Send + '_>> {
        let endpoint = sub.endpoint.clone();
        let len = payload.len();
        Box::pin(async move {
            tracing::info!(
                endpoint = %endpoint,
                payload_bytes = len,
                "push notification logged (VAPID not configured)"
            );
            Ok(())
        })
    }
}

/// Sent push records: `(endpoint, payload_bytes)`.
type PushRecord = Vec<(String, Vec<u8>)>;

/// Test double that records every push attempt for assertion.
#[derive(Default)]
pub struct RecordingPushSender {
    pub sent: Arc<Mutex<PushRecord>>,
}

impl RecordingPushSender {
    pub fn new() -> Self {
        Self::default()
    }
}

impl PushSender for RecordingPushSender {
    fn send(
        &self,
        sub: &PushSubscriptionInfo,
        payload: &[u8],
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = anyhow::Result<()>> + Send + '_>> {
        let endpoint = sub.endpoint.clone();
        let data = payload.to_vec();
        let sent = Arc::clone(&self.sent);
        Box::pin(async move {
            sent.lock().unwrap().push((endpoint, data));
            Ok(())
        })
    }
}

/// Factory: returns `LogOnlyPushSender` for now. A real VAPID sender will be
/// wired in once the web-push approach is finalized.
pub fn create_push_sender(_config: &Config) -> Arc<dyn PushSender> {
    Arc::new(LogOnlyPushSender)
}
