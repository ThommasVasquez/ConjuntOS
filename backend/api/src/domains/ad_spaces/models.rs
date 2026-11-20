use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::db::schema::{ad_events, ad_spaces};

// ── DB Models ───────────────────────────────────────────────────────────────

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
    pub campana_id: Option<Uuid>,
    pub hora_inicio: i32,
    pub hora_fin: i32,
    pub dias_semana: String,
    pub cta_texto: Option<String>,
    pub prioridad: i32,
    pub max_impresiones: Option<i32>,
    pub max_por_usuario_dia: Option<i32>,
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
    pub campana_id: Option<Uuid>,
    pub hora_inicio: i32,
    pub hora_fin: i32,
    pub dias_semana: String,
    pub cta_texto: Option<String>,
    pub prioridad: i32,
    pub max_impresiones: Option<i32>,
    pub max_por_usuario_dia: Option<i32>,
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
    pub hora_inicio: Option<i32>,
    pub hora_fin: Option<i32>,
    pub dias_semana: Option<String>,
    pub cta_texto: Option<Option<String>>,
    pub prioridad: Option<i32>,
    pub max_impresiones: Option<Option<i32>>,
    pub max_por_usuario_dia: Option<Option<i32>>,
}

#[derive(Insertable)]
#[diesel(table_name = ad_events)]
pub struct NuevoAdEvent {
    pub ad_space_id: Uuid,
    pub conjunto_id: Uuid,
    pub usuario_id: Option<Uuid>,
    pub tipo: String,
    pub hora_local: i32,
}

// ── DTOs ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdSpaceDto {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub campana_id: Option<Uuid>,
    pub nombre: String,
    pub posicion: String,
    pub imagen_url: Option<String>,
    pub link_url: Option<String>,
    pub cta_texto: Option<String>,
    pub activo: bool,
    pub empresa: Option<String>,
    pub inicio_en: DateTime<Utc>,
    pub fin_en: DateTime<Utc>,
    pub hora_inicio: i32,
    pub hora_fin: i32,
    pub dias_semana: String,
    pub prioridad: i32,
    pub max_impresiones: Option<i32>,
    pub max_por_usuario_dia: Option<i32>,
    pub impresiones: i32,
    pub clics: i32,
}

impl From<AdSpace> for AdSpaceDto {
    fn from(a: AdSpace) -> Self {
        Self {
            id: a.id,
            conjunto_id: a.conjunto_id,
            campana_id: a.campana_id,
            nombre: a.nombre,
            posicion: a.posicion,
            imagen_url: a.imagen_url,
            link_url: a.link_url,
            cta_texto: a.cta_texto,
            activo: a.activo,
            empresa: a.empresa,
            inicio_en: a.inicio_en,
            fin_en: a.fin_en,
            hora_inicio: a.hora_inicio,
            hora_fin: a.hora_fin,
            dias_semana: a.dias_semana,
            prioridad: a.prioridad,
            max_impresiones: a.max_impresiones,
            max_por_usuario_dia: a.max_por_usuario_dia,
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
    pub cta_texto: Option<String>,
    pub empresa: Option<String>,
    pub prioridad: i32,
}

impl From<AdSpace> for AdSpaceFeedDto {
    fn from(a: AdSpace) -> Self {
        Self {
            id: a.id,
            nombre: a.nombre,
            posicion: a.posicion,
            imagen_url: a.imagen_url,
            link_url: a.link_url,
            cta_texto: a.cta_texto,
            empresa: a.empresa,
            prioridad: a.prioridad,
        }
    }
}

// ── SuperAdmin Campaign DTOs ────────────────────────────────────────────────

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdCampaignSummaryDto {
    pub campana_id: Uuid,
    pub nombre: String,
    pub empresa: Option<String>,
    pub posicion: String,
    pub imagen_url: Option<String>,
    pub link_url: Option<String>,
    pub cta_texto: Option<String>,
    pub activo: bool,
    pub inicio_en: DateTime<Utc>,
    pub fin_en: DateTime<Utc>,
    pub hora_inicio: i32,
    pub hora_fin: i32,
    pub dias_semana: String,
    pub prioridad: i32,
    pub max_impresiones: Option<i32>,
    pub max_por_usuario_dia: Option<i32>,
    pub conjuntos_count: usize,
    pub conjuntos_nombres: Vec<String>,
    pub impresiones: i64,
    pub clics: i64,
    pub ctr: f64,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct HourlyAdMetricDto {
    pub hora: i32,
    pub impresiones: i64,
    pub clics: i64,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConjuntoAdMetricDto {
    pub conjunto_id: Uuid,
    pub conjunto_nombre: String,
    pub impresiones: i64,
    pub clics: i64,
    pub ctr: f64,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdCampaignMetricsDto {
    pub campana_id: Uuid,
    pub nombre: String,
    pub empresa: Option<String>,
    pub impresiones: i64,
    pub clics: i64,
    pub ctr: f64,
    pub usuarios_unicos: i64,
    pub hora_pico: Option<i32>,
    pub por_hora: Vec<HourlyAdMetricDto>,
    pub por_conjunto: Vec<ConjuntoAdMetricDto>,
}

// ── Request DTOs ────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateAdSpaceRequest {
    pub nombre: String,
    pub posicion: String,
    pub imagen_url: Option<String>,
    pub link_url: Option<String>,
    pub cta_texto: Option<String>,
    pub empresa: Option<String>,
    pub inicio_en: DateTime<Utc>,
    pub fin_en: DateTime<Utc>,
    pub hora_inicio: Option<i32>,
    pub hora_fin: Option<i32>,
    pub dias_semana: Option<String>,
    pub prioridad: Option<i32>,
    pub max_impresiones: Option<i32>,
    pub max_por_usuario_dia: Option<i32>,
    /// Optional subset of conjunto IDs (SuperAdmin only); omitted/empty = ALL conjuntos.
    pub conjunto_ids: Option<Vec<Uuid>>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAdSpaceRequest {
    pub nombre: Option<String>,
    pub posicion: Option<String>,
    pub imagen_url: Option<String>,
    pub link_url: Option<String>,
    pub cta_texto: Option<String>,
    pub activo: Option<bool>,
    pub empresa: Option<String>,
    pub inicio_en: Option<DateTime<Utc>>,
    pub fin_en: Option<DateTime<Utc>>,
    pub hora_inicio: Option<i32>,
    pub hora_fin: Option<i32>,
    pub dias_semana: Option<String>,
    pub prioridad: Option<i32>,
    pub max_impresiones: Option<i32>,
    pub max_por_usuario_dia: Option<i32>,
}
