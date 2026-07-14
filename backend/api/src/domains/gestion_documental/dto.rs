use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::domains::gestion_documental::models::Documento;

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DocumentoDto {
    pub id: Uuid,
    pub nombre: String,
    pub descripcion: String,
    pub categoria: String,
    pub url: String,
    pub version: Option<String>,
    pub subido_por: Option<Uuid>,
    pub subido_por_nombre: Option<String>,
    pub visible_residentes: bool,
    pub fecha_publicacion: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

impl DocumentoDto {
    pub fn from_with_nombre(doc: Documento, subido_por_nombre: Option<String>) -> Self {
        Self {
            id: doc.id,
            nombre: doc.nombre,
            descripcion: doc.descripcion,
            categoria: doc.categoria,
            url: doc.url,
            version: doc.version,
            subido_por: doc.subido_por,
            subido_por_nombre,
            visible_residentes: doc.visible_residentes,
            fecha_publicacion: doc.fecha_publicacion,
            created_at: doc.created_at,
        }
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateDocumentoRequest {
    pub nombre: String,
    pub descripcion: Option<String>,
    pub categoria: String,
    pub url: String,
    pub version: Option<String>,
    pub visible_residentes: Option<bool>,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDocumentoRequest {
    pub nombre: Option<String>,
    pub descripcion: Option<String>,
    pub categoria: Option<String>,
    pub url: Option<String>,
    pub version: Option<Option<String>>,
    pub visible_residentes: Option<bool>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DeleteDocumentoResponse {
    pub deleted: usize,
}
