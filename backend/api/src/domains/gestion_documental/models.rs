use chrono::{DateTime, Utc};
use diesel::prelude::*;
use uuid::Uuid;

use crate::db::schema::documentos;

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = documentos, check_for_backend(diesel::pg::Pg))]
pub struct Documento {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub nombre: String,
    pub categoria: String,
    pub url: String,
    pub version: Option<String>,
    pub created_at: DateTime<Utc>,
    pub descripcion: String,
    pub subido_por: Option<Uuid>,
    pub fecha_publicacion: DateTime<Utc>,
    pub visible_residentes: bool,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = documentos)]
pub struct NuevoDocumento {
    pub conjunto_id: Uuid,
    pub nombre: String,
    pub categoria: String,
    pub url: String,
    pub version: Option<String>,
    pub descripcion: String,
    pub subido_por: Option<Uuid>,
    pub visible_residentes: bool,
}

#[derive(AsChangeset, Debug, Default)]
#[diesel(table_name = documentos)]
pub struct DocumentoCambios {
    pub nombre: Option<String>,
    pub categoria: Option<String>,
    pub url: Option<String>,
    pub version: Option<Option<String>>,
    pub descripcion: Option<String>,
    pub visible_residentes: Option<bool>,
}
