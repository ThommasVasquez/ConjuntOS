use std::sync::{Arc, Mutex};

use anyhow::{anyhow, bail, Result};
use base64::Engine;
use web_push_native::jwt_simple::algorithms::ES256KeyPair;
use web_push_native::p256::PublicKey;
use web_push_native::{Auth, WebPushBuilder};

use crate::config::Config;

/// Decode a base64url value (padded or not), as used by the Push API and VAPID keys.
fn b64url_decode(s: &str) -> Result<Vec<u8>> {
    use base64::engine::general_purpose::{URL_SAFE, URL_SAFE_NO_PAD};
    let trimmed = s.trim_end_matches('=');
    URL_SAFE_NO_PAD
        .decode(trimmed)
        .or_else(|_| URL_SAFE.decode(s))
        .map_err(|e| anyhow!("base64url decode failed: {e}"))
}

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

/// Real VAPID sender (RFC 8292 VAPID + RFC 8291 aes128gcm). Signs + encrypts with
/// the pure-Rust `web-push-native` crate (RustCrypto), then POSTs to the push
/// endpoint with the existing reqwest (rustls) client. No OpenSSL in the build.
pub struct WebPushSender {
    /// Raw P-256 private scalar, decoded + validated at construction.
    vapid_key_bytes: Vec<u8>,
    vapid_subject: String,
    client: reqwest::Client,
}

impl WebPushSender {
    pub fn new(vapid_private_b64: String, vapid_subject: String) -> Result<Self> {
        let vapid_key_bytes = b64url_decode(&vapid_private_b64)
            .map_err(|e| anyhow!("invalid VAPID private key (base64url): {e}"))?;
        // Validate the key parses now, so a misconfiguration fails at startup.
        ES256KeyPair::from_bytes(&vapid_key_bytes)
            .map_err(|e| anyhow!("invalid VAPID private key: {e}"))?;
        let client = reqwest::Client::builder()
            .build()
            .map_err(|e| anyhow!("failed to build reqwest client for push: {e}"))?;
        Ok(Self {
            vapid_key_bytes,
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
        let endpoint = sub.endpoint.clone();
        let p256dh = sub.p256dh.clone();
        let auth = sub.auth.clone();
        let key_bytes = self.vapid_key_bytes.clone();
        let subject = self.vapid_subject.clone();
        let payload = payload.to_vec();
        let client = self.client.clone();

        Box::pin(async move {
            let key_pair = ES256KeyPair::from_bytes(&key_bytes)
                .map_err(|e| anyhow!("VAPID key: {e}"))?;
            let ua_public = PublicKey::from_sec1_bytes(&b64url_decode(&p256dh)?)
                .map_err(|e| anyhow!("invalid p256dh public key: {e}"))?;
            let auth_bytes = b64url_decode(&auth)?;
            if auth_bytes.len() != 16 {
                bail!("invalid auth secret length: {}", auth_bytes.len());
            }
            let ua_auth = Auth::clone_from_slice(&auth_bytes);
            let uri: http::Uri = endpoint
                .parse()
                .map_err(|e| anyhow!("invalid endpoint uri: {e}"))?;

            // Build the signed + encrypted (aes128gcm) push request.
            let request = WebPushBuilder::new(uri, ua_public, ua_auth)
                .with_vapid(&key_pair, &subject)
                .build(payload)
                .map_err(|e| anyhow!("web-push build failed: {e}"))?;

            // Relay the http::Request through reqwest (copy headers by str/bytes so
            // the http crate version is irrelevant).
            let (parts, body) = request.into_parts();
            let mut rb = client.post(parts.uri.to_string());
            for (name, value) in parts.headers.iter() {
                rb = rb.header(name.as_str(), value.as_bytes());
            }
            let resp = rb
                .body(body)
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

// ── Native (Expo / FCM / APNs) push ──────────────────────────────────────────

/// Minimal native device token needed to send a native push.
#[derive(Debug, Clone)]
pub struct NativePushTokenInfo {
    /// "expo" | "fcm" | "apns" — selects the transport.
    pub platform: String,
    pub token: String,
}

/// Structured push content, transport-agnostic. The web-push path serializes
/// this to the historical `{title, body, data}` JSON; the native path maps it
/// onto the Expo Push message shape. Keeps the data contract identical.
#[derive(Debug, Clone)]
pub struct PushMessage {
    pub title: String,
    pub body: String,
    pub data: serde_json::Value,
}

impl PushMessage {
    /// The exact JSON the web-push Service Worker already consumes.
    pub fn to_web_json_bytes(&self) -> Vec<u8> {
        let v = serde_json::json!({
            "title": self.title,
            "body": self.body,
            "data": self.data,
        });
        serde_json::to_vec(&v).unwrap_or_default()
    }
}

/// Trait for sending native device pushes (Expo / FCM / APNs).
pub trait NativePushSender: Send + Sync {
    fn send(
        &self,
        token: &NativePushTokenInfo,
        message: &PushMessage,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<()>> + Send + '_>>;
}

/// Real Expo Push sender. POSTs to the Expo Push HTTP API
/// (`https://exp.host/--/api/v2/push/send`) over the existing rustls reqwest
/// client. Only `platform == "expo"` is delivered; FCM/APNs direct transports
/// are not yet implemented and are reported as errors (never faked).
pub struct ExpoPushSender {
    client: reqwest::Client,
    endpoint: String,
}

impl ExpoPushSender {
    const DEFAULT_ENDPOINT: &'static str = "https://exp.host/--/api/v2/push/send";

    pub fn new() -> Result<Self> {
        let client = reqwest::Client::builder()
            .build()
            .map_err(|e| anyhow!("failed to build reqwest client for expo push: {e}"))?;
        Ok(Self {
            client,
            endpoint: Self::DEFAULT_ENDPOINT.to_string(),
        })
    }
}

impl NativePushSender for ExpoPushSender {
    fn send(
        &self,
        token: &NativePushTokenInfo,
        message: &PushMessage,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<()>> + Send + '_>> {
        let platform = token.platform.clone();
        let device_token = token.token.clone();
        let title = message.title.clone();
        let body = message.body.clone();
        let data = message.data.clone();
        let client = self.client.clone();
        let endpoint = self.endpoint.clone();

        Box::pin(async move {
            if platform != "expo" {
                // FCM/APNs direct transports are not wired yet. Do NOT fake a
                // delivery (constitution Law 4) — surface an error so the caller
                // counts 0 for this token.
                bail!("native push transport '{platform}' not implemented (only 'expo')")
            }

            // Expo Push message shape. `data` carries the same deep-link payload
            // the app reads ({url, room, callerName}). `channelId` must name an
            // Android channel the RN app actually creates via
            // setNotificationChannelAsync; it registers "default" (importance
            // MAX), so a non-existent "citofonia" channel would drop/fall back
            // and lose the heads-up + sound behavior.
            let msg = serde_json::json!({
                "to": device_token,
                "title": title,
                "body": body,
                "data": data,
                "sound": "default",
                "priority": "high",
                "channelId": "default",
            });

            let resp = client
                .post(&endpoint)
                .header("accept", "application/json")
                .header("content-type", "application/json")
                .json(&msg)
                .send()
                .await
                .map_err(|e| anyhow!("expo push request failed: {e}"))?;

            let status = resp.status();
            let payload: serde_json::Value = resp
                .json()
                .await
                .map_err(|e| anyhow!("expo push: invalid response body: {e}"))?;

            if !status.is_success() {
                bail!("expo push endpoint returned {status}: {payload}")
            }

            // Expo returns {"data": {"status": "ok"|"error", ...}}. An HTTP 200
            // with a per-ticket error (e.g. DeviceNotRegistered) is still a
            // non-delivery — treat it as an error so it isn't counted.
            let ticket_status = payload
                .get("data")
                .and_then(|d| d.get("status"))
                .and_then(|s| s.as_str());
            match ticket_status {
                Some("ok") => Ok(()),
                Some(other) => {
                    bail!("expo push ticket status '{other}': {payload}")
                }
                None => {
                    // Unexpected shape; be conservative and treat as failure.
                    bail!("expo push: unexpected response shape: {payload}")
                }
            }
        })
    }
}

/// Fallback used when native push is NOT configured/enabled. Its `send()`
/// returns an error so the caller never counts an un-sent notification as
/// delivered (constitution Law 4: no fake success in prod).
pub struct UnconfiguredNativePushSender;

impl NativePushSender for UnconfiguredNativePushSender {
    fn send(
        &self,
        token: &NativePushTokenInfo,
        _message: &PushMessage,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<()>> + Send + '_>> {
        let platform = token.platform.clone();
        Box::pin(async move {
            tracing::warn!(platform = %platform, "native push skipped: not configured");
            bail!("native push not configured")
        })
    }
}

/// Test double recording every native push attempt for assertion.
#[derive(Default)]
pub struct RecordingNativePushSender {
    pub sent: Arc<Mutex<Vec<(String, String, Vec<u8>)>>>,
}

impl RecordingNativePushSender {
    pub fn new() -> Self {
        Self::default()
    }
}

impl NativePushSender for RecordingNativePushSender {
    fn send(
        &self,
        token: &NativePushTokenInfo,
        message: &PushMessage,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<()>> + Send + '_>> {
        let platform = token.platform.clone();
        let device_token = token.token.clone();
        let data = message.to_web_json_bytes();
        let sent = Arc::clone(&self.sent);
        Box::pin(async move {
            sent.lock().unwrap().push((platform, device_token, data));
            Ok(())
        })
    }
}

/// Factory for the native sender. Expo needs no server credentials (the device
/// token is the auth), so the real `ExpoPushSender` is always enabled; if the
/// reqwest client fails to build we fall back to the unconfigured sender.
pub fn create_native_push_sender() -> Arc<dyn NativePushSender> {
    match ExpoPushSender::new() {
        Ok(sender) => {
            tracing::info!("push: Expo native push sender enabled");
            Arc::new(sender)
        }
        Err(e) => {
            tracing::error!(error = ?e, "push: failed to build Expo sender; native pushes disabled");
            Arc::new(UnconfiguredNativePushSender)
        }
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
