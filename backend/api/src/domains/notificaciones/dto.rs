use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::domains::notificaciones::models::{Notificacion, PushSubscription};

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

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PushSubscribeRequest {
    pub endpoint: String,
    pub keys: PushKeysDto,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PushUnsubscribeRequest {
    pub endpoint: String,
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
