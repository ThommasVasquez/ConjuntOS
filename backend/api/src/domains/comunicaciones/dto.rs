use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::db::enums::TipoAnuncio;
use crate::domains::comunicaciones::models::Anuncio;

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AnuncioDto {
    pub id: Uuid,
    pub titulo: String,
    pub contenido: String,
    pub tipo: TipoAnuncio,
    pub imagen_url: Option<String>,
    pub archivos_url: Vec<String>,
    pub fijado: bool,
    pub publicado_en: DateTime<Utc>,
    pub expires_en: Option<DateTime<Utc>>,
    pub vistas: i32,
}

impl From<Anuncio> for AnuncioDto {
    fn from(a: Anuncio) -> Self {
        let archivos_url = serde_json::from_value(a.archivos_url).unwrap_or_default();
        Self {
            id: a.id,
            titulo: a.titulo,
            contenido: a.contenido,
            tipo: a.tipo,
            imagen_url: a.imagen_url,
            archivos_url,
            fijado: a.fijado,
            publicado_en: a.publicado_en,
            expires_en: a.expires_en,
            vistas: a.vistas,
        }
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateAnuncioRequest {
    pub titulo: String,
    pub contenido: String,
    pub tipo: TipoAnuncio,
    pub imagen_url: Option<String>,
    pub archivos_url: Option<Vec<String>>,
    pub fijado: Option<bool>,
    pub expires_en: Option<DateTime<Utc>>,
}

/// Partial update of an existing announcement. Every field is optional; only
/// the provided ones are changed (PATCH-like semantics over PUT).
#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAnuncioRequest {
    pub titulo: Option<String>,
    pub contenido: Option<String>,
    pub tipo: Option<TipoAnuncio>,
    pub imagen_url: Option<String>,
    pub archivos_url: Option<Vec<String>>,
    pub fijado: Option<bool>,
    pub expires_en: Option<DateTime<Utc>>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DeleteAnuncioResponse {
    pub deleted: usize,
}

/// Habeas-Data-limited resident entry (no email/avatar; specs/008).
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DirectorioEntradaDto {
    pub id: Uuid,
    pub nombre: String,
    pub torre: Option<String>,
    pub apto: Option<String>,
    pub telefono: Option<String>,
}
