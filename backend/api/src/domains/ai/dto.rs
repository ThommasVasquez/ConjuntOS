use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::domains::ai::models::{AsambleaActa, AsambleaSubtitulo};

// ── Copilot ─────────────────────────────────────────────────────────────

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CopilotRequest {
    pub pregunta: String,
    pub contexto: Option<String>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CopilotResponse {
    pub respuesta: String,
}

// ── Translate ───────────────────────────────────────────────────────────

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct TranslateRequest {
    pub texto: String,
    pub idioma_destino: String,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct TranslateResponse {
    pub traduccion: String,
}

// ── Consensuar ──────────────────────────────────────────────────────────

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConsensuarRequest {
    pub opiniones: Vec<String>,
    pub tema: Option<String>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConsensuarResponse {
    pub sintesis: String,
}

// ── Acta ────────────────────────────────────────────────────────────────

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GenerateActaRequest {
    pub puntos: Vec<String>,
    pub decisiones: Vec<String>,
    pub asistentes: i32,
    pub quorum: Option<String>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ActaDto {
    pub id: Uuid,
    pub contenido: String,
    pub generado_por: String,
    pub created_at: DateTime<Utc>,
}

impl From<AsambleaActa> for ActaDto {
    fn from(a: AsambleaActa) -> Self {
        Self {
            id: a.id,
            contenido: a.contenido,
            generado_por: a.generado_por,
            created_at: a.created_at,
        }
    }
}

// ── Search ──────────────────────────────────────────────────────────────

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SearchRequest {
    pub query: String,
    pub contexto: Option<String>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub respuesta: String,
    pub fuentes: Vec<String>,
}

// ── Subtítulos ──────────────────────────────────────────────────────────

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateSubtituloRequest {
    pub speaker: String,
    pub text: String,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SubtituloDto {
    pub id: Uuid,
    pub asamblea_id: Uuid,
    pub speaker: String,
    pub text: String,
    pub created_at: DateTime<Utc>,
}

impl From<AsambleaSubtitulo> for SubtituloDto {
    fn from(s: AsambleaSubtitulo) -> Self {
        Self {
            id: s.id,
            asamblea_id: s.asamblea_id,
            speaker: s.speaker,
            text: s.text,
            created_at: s.created_at,
        }
    }
}
