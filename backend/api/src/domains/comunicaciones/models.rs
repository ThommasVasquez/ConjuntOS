use chrono::{DateTime, Utc};
use diesel::prelude::*;
use uuid::Uuid;

use crate::db::enums::TipoAnuncio;
use crate::db::schema::anuncios;

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = anuncios, check_for_backend(diesel::pg::Pg))]
pub struct Anuncio {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub titulo: String,
    pub contenido: String,
    pub tipo: TipoAnuncio,
    pub imagen_url: Option<String>,
    /// `Vec<String>` validated at the boundary (Law 6).
    pub archivos_url: serde_json::Value,
    pub fijado: bool,
    pub publicado_en: DateTime<Utc>,
    pub expires_en: Option<DateTime<Utc>>,
    pub vistas: i32,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = anuncios)]
pub struct NuevoAnuncio {
    pub conjunto_id: Uuid,
    pub titulo: String,
    pub contenido: String,
    pub tipo: TipoAnuncio,
    pub imagen_url: Option<String>,
    pub archivos_url: serde_json::Value,
    pub fijado: bool,
    pub expires_en: Option<DateTime<Utc>>,
}
