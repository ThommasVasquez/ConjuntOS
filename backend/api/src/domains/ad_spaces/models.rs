use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::db::schema::ad_spaces;

// ── DB Model ────────────────────────────────────────────────────────────────

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = ad_spaces)]
pub struct AdSpace {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub nombre: String,
    pub posicion: String,
    pub imagen_url: Option<String>,
    pub link_url: Option<String>,
    pub activo: bool,
    pub empresa: Option<String>,
    pub inicio_en: DateTime<Utc>,
    pub fin_en: DateTime<Utc>,
    pub impresiones: i32,
    pub clics: i32,
}

#[derive(Insertable)]
#[diesel(table_name = ad_spaces)]
pub struct NuevoAdSpace {
    pub conjunto_id: Uuid,
    pub nombre: String,
    pub posicion: String,
    pub imagen_url: Option<String>,
    pub link_url: Option<String>,
    pub activo: bool,
    pub empresa: Option<String>,
    pub inicio_en: DateTime<Utc>,
    pub fin_en: DateTime<Utc>,
}

#[derive(AsChangeset)]
#[diesel(table_name = ad_spaces)]
pub struct AdSpaceChangeset {
    pub nombre: Option<String>,
    pub posicion: Option<String>,
    pub imagen_url: Option<Option<String>>,
    pub link_url: Option<Option<String>>,
    pub activo: Option<bool>,
    pub empresa: Option<Option<String>>,
    pub inicio_en: Option<DateTime<Utc>>,
    pub fin_en: Option<DateTime<Utc>>,
}

// ── DTOs ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdSpaceDto {
    pub id: Uuid,
    pub nombre: String,
    pub posicion: String,
    pub imagen_url: Option<String>,
    pub link_url: Option<String>,
    pub activo: bool,
    pub empresa: Option<String>,
    pub inicio_en: DateTime<Utc>,
    pub fin_en: DateTime<Utc>,
    pub impresiones: i32,
    pub clics: i32,
}

impl From<AdSpace> for AdSpaceDto {
    fn from(a: AdSpace) -> Self {
        Self {
            id: a.id,
            nombre: a.nombre,
            posicion: a.posicion,
            imagen_url: a.imagen_url,
            link_url: a.link_url,
            activo: a.activo,
            empresa: a.empresa,
            inicio_en: a.inicio_en,
            fin_en: a.fin_en,
            impresiones: a.impresiones,
            clics: a.clics,
        }
    }
}

/// Versión ligera para el feed (sin contadores ni fechas internas).
#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdSpaceFeedDto {
    pub id: Uuid,
    pub nombre: String,
    pub posicion: String,
    pub imagen_url: Option<String>,
    pub link_url: Option<String>,
    pub empresa: Option<String>,
}

impl From<AdSpace> for AdSpaceFeedDto {
    fn from(a: AdSpace) -> Self {
        Self {
            id: a.id,
            nombre: a.nombre,
            posicion: a.posicion,
            imagen_url: a.imagen_url,
            link_url: a.link_url,
            empresa: a.empresa,
        }
    }
}

// ── Request DTOs ────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateAdSpaceRequest {
    pub nombre: String,
    pub posicion: String,
    pub imagen_url: Option<String>,
    pub link_url: Option<String>,
    pub empresa: Option<String>,
    pub inicio_en: DateTime<Utc>,
    pub fin_en: DateTime<Utc>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAdSpaceRequest {
    pub nombre: Option<String>,
    pub posicion: Option<String>,
    pub imagen_url: Option<String>,
    pub link_url: Option<String>,
    pub activo: Option<bool>,
    pub empresa: Option<String>,
    pub inicio_en: Option<DateTime<Utc>>,
    pub fin_en: Option<DateTime<Utc>>,
}
