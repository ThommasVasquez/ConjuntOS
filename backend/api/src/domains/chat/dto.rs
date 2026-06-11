use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::domains::chat::models::ChatMessage;

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ChatMensajeDto {
    pub id: Uuid,
    pub mensaje: String,
    pub audio_url: Option<String>,
    pub transcripcion: Option<String>,
    pub es_de_admin: bool,
    pub leido: bool,
    pub created_at: DateTime<Utc>,
}

impl From<ChatMessage> for ChatMensajeDto {
    fn from(m: ChatMessage) -> Self {
        Self {
            id: m.id,
            mensaje: m.mensaje,
            audio_url: m.audio_url,
            transcripcion: m.transcripcion,
            es_de_admin: m.es_de_admin,
            leido: m.leido,
            created_at: m.created_at,
        }
    }
}

/// Resident POST body.
#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateChatRequest {
    pub mensaje: Option<String>,
    /// Base64-encoded audio; if present, uploaded to Storage before insert.
    pub audio_base64: Option<String>,
    pub transcripcion: Option<String>,
}

/// Admin POST body — accepts either a ready URL or raw base64 audio.
#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdminChatRequest {
    pub mensaje: Option<String>,
    pub audio_url: Option<String>,
    /// Base64-encoded audio; if present the backend uploads it and stores the resulting URL.
    pub audio_base64: Option<String>,
    pub transcripcion: Option<String>,
}

/// Summary row for the admin conversation list.
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ChatConversacionDto {
    pub usuario_id: Uuid,
    pub ultimo_mensaje: String,
    pub ultimo_timestamp: DateTime<Utc>,
    pub no_leidos: i64,
    pub residente: ResidenteResumenDto,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ResidenteResumenDto {
    pub nombre: String,
    pub avatar: Option<String>,
    pub torre: Option<String>,
    pub apto: Option<String>,
}

/// Full thread response for admin GET /admin/chat/{usuario_id}.
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdminChatThreadDto {
    pub mensajes: Vec<ChatMensajeDto>,
    pub resident_info: ResidentInfoDto,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ResidentInfoDto {
    pub profile: Option<ResidenteProfileDto>,
    pub vehicles: Vec<VehiculoResumenDto>,
    pub pets: Vec<MascotaResumenDto>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ResidenteProfileDto {
    pub id: Uuid,
    pub nombre: String,
    pub email: String,
    pub avatar_url: Option<String>,
    pub torre: Option<String>,
    pub apto: Option<String>,
    pub telefono: Option<String>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct VehiculoResumenDto {
    pub placa: String,
    pub tipo: String,
    pub marca: Option<String>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MascotaResumenDto {
    pub nombre: String,
    pub tipo: String,
    pub raza: Option<String>,
}
