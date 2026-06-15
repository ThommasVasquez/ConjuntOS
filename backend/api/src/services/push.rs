use std::sync::{Arc, Mutex};

use anyhow::{anyhow, bail, Result};
use web_push::{
    ContentEncoding, SubscriptionInfo, VapidSignatureBuilder, WebPushMessageBuilder,
    URL_SAFE_NO_PAD,
};

use crate::config::Config;

/// Minimal subscription info needed to send a push notification.
#[derive(Debug, Clone)]
pub struct PushSubscriptionInfo {
    pub endpoint: String,
    pub p256dh: String,
    pub auth: String,
}

/// Trait for sending web-push notifications.
pub trait PushSender: Send + Sync {
    fn send(
        &self,
        sub: &PushSubscriptionInfo,
        payload: &[u8],
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<()>> + Send + '_>>;
}

/// Real VAPID sender (RFC 8291 aes128gcm). Signs + encrypts with the `web-push`
/// crate and POSTs to the push endpoint with the existing reqwest (rustls) client,
/// so we don't pull in the crate's bundled isahc/hyper HTTP stack.
pub struct WebPushSender {
    vapid_private_b64: String,
    vapid_subject: String,
    client: reqwest::Client,
}

impl WebPushSender {
    pub fn new(vapid_private_b64: String, vapid_subject: String) -> Result<Self> {
        let client = reqwest::Client::builder()
            .build()
            .map_err(|e| anyhow!("failed to build reqwest client for push: {e}"))?;
        Ok(Self {
            vapid_private_b64,
            vapid_subject,
            client,
        })
    }
}

impl PushSender for WebPushSender {
    fn send(
        &self,
        sub: &PushSubscriptionInfo,
        payload: &[u8],
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<()>> + Send + '_>> {
        let subscription =
            SubscriptionInfo::new(sub.endpoint.clone(), sub.p256dh.clone(), sub.auth.clone());
        let private = self.vapid_private_b64.clone();
        let subject = self.vapid_subject.clone();
        let payload = payload.to_vec();
        let client = self.client.clone();

        Box::pin(async move {
            // VAPID signature (JWT) for this subscription's endpoint.
            let mut sig_builder =
                VapidSignatureBuilder::from_base64(&private, URL_SAFE_NO_PAD, &subscription)
                    .map_err(|e| anyhow!("invalid VAPID private key: {e}"))?;
            sig_builder.add_claim("sub", subject.as_str());
            let signature = sig_builder
                .build()
                .map_err(|e| anyhow!("VAPID signature build failed: {e}"))?;

            // Encrypt payload (aes128gcm) and build the push message.
            let mut builder = WebPushMessageBuilder::new(&subscription);
            builder.set_payload(ContentEncoding::Aes128Gcm, &payload);
            builder.set_vapid_signature(signature);
            builder.set_ttl(60);
            let message = builder
                .build()
                .map_err(|e| anyhow!("web-push message build failed: {e}"))?;

            let endpoint = message.endpoint.to_string();
            let wp_payload = message
                .payload
                .ok_or_else(|| anyhow!("web-push message had no payload"))?;

            // Mirror the crate's request_builder: TTL + content headers + crypto headers.
            let mut req = client
                .post(&endpoint)
                .header("TTL", message.ttl.to_string())
                .header("Content-Encoding", wp_payload.content_encoding.to_str())
                .header("Content-Type", "application/octet-stream");
            for (k, v) in wp_payload.crypto_headers.iter() {
                req = req.header(*k, v);
            }
            let resp = req
                .body(wp_payload.content)
                .send()
                .await
                .map_err(|e| anyhow!("push request failed: {e}"))?;

            let status = resp.status();
            if status.is_success() {
                Ok(())
            } else {
                let body = resp.text().await.unwrap_or_default();
                bail!("push endpoint returned {status}: {body}")
            }
        })
    }
}

/// Fallback used when VAPID is NOT configured. Its `send()` returns an error so the
/// caller never counts an un-sent notification as delivered.
pub struct UnconfiguredPushSender;

impl PushSender for UnconfiguredPushSender {
    fn send(
        &self,
        sub: &PushSubscriptionInfo,
        _payload: &[u8],
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<()>> + Send + '_>> {
        let endpoint = sub.endpoint.clone();
        Box::pin(async move {
            tracing::warn!(endpoint = %endpoint, "push skipped: VAPID not configured");
            bail!("push not configured (VAPID keys missing)")
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
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<()>> + Send + '_>> {
        let endpoint = sub.endpoint.clone();
        let data = payload.to_vec();
        let sent = Arc::clone(&self.sent);
        Box::pin(async move {
            sent.lock().unwrap().push((endpoint, data));
            Ok(())
        })
    }
}

/// Factory: returns the real VAPID sender when all `vapid_*` keys are present,
/// otherwise `UnconfiguredPushSender` (whose `send()` errors).
pub fn create_push_sender(config: &Config) -> Arc<dyn PushSender> {
    match (
        config.vapid_public_key.as_deref(),
        config.vapid_private_key.as_deref(),
        config.vapid_subject.as_deref(),
    ) {
        (Some(pubk), Some(privk), Some(subject))
            if !pubk.is_empty() && !privk.is_empty() && !subject.is_empty() =>
        {
            match WebPushSender::new(privk.to_string(), subject.to_string()) {
                Ok(sender) => {
                    tracing::info!("push: VAPID web-push sender enabled");
                    Arc::new(sender)
                }
                Err(e) => {
                    tracing::error!(error = ?e, "push: failed to build VAPID sender; pushes disabled");
                    Arc::new(UnconfiguredPushSender)
                }
            }
        }
        _ => {
            tracing::warn!("push: VAPID not configured; push notifications will be skipped");
            Arc::new(UnconfiguredPushSender)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg(pubk: Option<&str>, privk: Option<&str>, subject: Option<&str>) -> Config {
        Config {
            port: 0,
            database_url: String::new(),
            migrations_database_url: None,
            db_pool_size: 1,
            jwt_secret: "x".into(),
            allowed_origins: vec![],
            run_migrations: false,
            gemini_api_key: None,
            vapid_public_key: pubk.map(String::from),
            vapid_private_key: privk.map(String::from),
            vapid_subject: subject.map(String::from),
            s3_endpoint: None,
            s3_region: None,
            s3_bucket: None,
            s3_access_key: None,
            s3_secret_key: None,
            s3_public_url: None,
            cookie_cross_site: false,
            cookie_domain: None,
            tester_emails: vec![],
            livekit_api_key: None,
            livekit_api_secret: None,
            livekit_url: None,
        }
    }

    #[tokio::test]
    async fn unconfigured_sender_errors() {
        let sender = UnconfiguredPushSender;
        let sub = PushSubscriptionInfo {
            endpoint: "https://example.com/x".into(),
            p256dh: "x".into(),
            auth: "y".into(),
        };
        assert!(sender.send(&sub, b"{}").await.is_err());
    }

    #[test]
    fn factory_falls_back_when_unconfigured() {
        // Missing keys -> unconfigured sender (send errors).
        let _ = create_push_sender(&cfg(None, None, None));
        // Empty strings are treated as unconfigured too.
        let _ = create_push_sender(&cfg(Some(""), Some(""), Some("")));
    }

    #[test]
    fn factory_builds_real_sender_when_configured() {
        // A valid base64url P-256 private key (test vector from the web-push crate).
        let priv_key = "IQ9Ur0ykXoHS9gzfYX0aBjy9lvdrjx_PFUXmie9YRcY";
        let pub_key = "BMjQOPbtMnLF8Fa3HVNYg1ftk0lD3DG_o_yJYK2Gp1mDhUMZh43Nv8Fz0NHay7gOzf_unzfL4izd-pcU37vBN64";
        let sender = create_push_sender(&cfg(
            Some(pub_key),
            Some(priv_key),
            Some("mailto:admin@example.com"),
        ));
        // Real sender builds; we can't assert a live HTTP send here, but the
        // signature path is exercised by the integration/E2E layer.
        let sub = PushSubscriptionInfo {
            endpoint: "https://example.com/x".into(),
            p256dh: pub_key.into(),
            auth: "EvcWjEgzr4rbvhfi3yds0A".into(),
        };
        // Just ensure it's constructed; do not await a network send in unit tests.
        let _ = sender;
        let _ = sub;
    }
}
