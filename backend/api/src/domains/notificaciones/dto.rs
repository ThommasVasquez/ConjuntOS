use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::domains::notificaciones::models::{NativePushToken, Notificacion, PushSubscription};

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct NotificacionDto {
    pub id: Uuid,
    pub tipo: String,
    pub titulo: String,
    pub mensaje: String,
    pub leida: bool,
    pub created_at: DateTime<Utc>,
}

impl From<Notificacion> for NotificacionDto {
    fn from(n: Notificacion) -> Self {
        Self {
            id: n.id,
            tipo: n.tipo,
            titulo: n.titulo,
            mensaje: n.mensaje,
            leida: n.leida,
            created_at: n.created_at,
        }
    }
}

/// Optional body for PUT /notificaciones/leidas. Without it (or without `ids`)
/// every unread notification of the caller is marked read.
#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MarkReadRequest {
    pub ids: Option<Vec<Uuid>>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MarkReadResponse {
    pub updated: usize,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PushKeysDto {
    pub p256dh: String,
    pub auth: String,
}

/// Web-push (VAPID) registration body. Unchanged web contract.
#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PushSubscribeRequest {
    pub endpoint: String,
    pub keys: PushKeysDto,
}

/// Native (mobile) push transport. Mirrors the Expo / FCM / APNs platforms.
#[derive(Deserialize, Serialize, ToSchema, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum NativePlatform {
    Expo,
    Fcm,
    Apns,
}

impl NativePlatform {
    pub fn as_str(self) -> &'static str {
        match self {
            NativePlatform::Expo => "expo",
            NativePlatform::Fcm => "fcm",
            NativePlatform::Apns => "apns",
        }
    }
}

/// Native (Expo / FCM / APNs) registration body. Additive sibling of the
/// web-push shape; upserted on `token`.
#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct NativeSubscribeRequest {
    pub platform: NativePlatform,
    pub token: String,
    /// Optional stable per-install id for dedupe across reinstalls.
    #[serde(default)]
    pub device_id: Option<String>,
}

/// Discriminated (untagged) registration body: the existing web-push shape
/// `{endpoint, keys:{p256dh, auth}}` OR the native shape `{platform, token,
/// deviceId?}`. serde tries each variant in order; `Web` first so the long-
/// standing web contract is matched before the native fallback.
#[derive(Deserialize, ToSchema)]
#[serde(untagged)]
pub enum PushSubscribeBody {
    Web(PushSubscribeRequest),
    Native(NativeSubscribeRequest),
}

/// Discriminated (untagged) removal body: `{endpoint}` (web) OR `{token}`
/// (native). Idempotent removal on logout / token rotation.
#[derive(Deserialize, ToSchema)]
#[serde(untagged)]
pub enum PushUnsubscribeBody {
    Web { endpoint: String },
    Native { token: String },
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PushSubscriptionDto {
    pub id: Uuid,
    pub endpoint: String,
    pub created_at: DateTime<Utc>,
}

impl From<PushSubscription> for PushSubscriptionDto {
    fn from(s: PushSubscription) -> Self {
        Self {
            id: s.id,
            endpoint: s.endpoint,
            created_at: s.created_at,
        }
    }
}

/// Response for a native registration. `endpoint` carries the device token so
/// the single endpoint can return a uniform shape for web and native callers.
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct NativePushTokenDto {
    pub id: Uuid,
    pub platform: String,
    pub token: String,
    pub created_at: DateTime<Utc>,
}

impl From<NativePushToken> for NativePushTokenDto {
    fn from(t: NativePushToken) -> Self {
        Self {
            id: t.id,
            platform: t.platform,
            token: t.token,
            created_at: t.created_at,
        }
    }
}

/// Uniform response for the discriminated subscribe endpoint.
#[derive(Serialize, ToSchema)]
#[serde(untagged)]
pub enum PushSubscribeResponse {
    Web(PushSubscriptionDto),
    Native(NativePushTokenDto),
}
