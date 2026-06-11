use bigdecimal::BigDecimal;
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use uuid::Uuid;

use crate::db::enums::CatLocal;
use crate::db::schema::locales;

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = locales, check_for_backend(diesel::pg::Pg))]
pub struct Local {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub nombre: String,
    pub categoria: CatLocal,
    pub descripcion: Option<String>,
    pub precio: Option<BigDecimal>,
    pub imagen_url: Option<String>,
    pub activo: bool,
    pub telefono: Option<String>,
    pub whatsapp: Option<String>,
    pub propietario_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = locales)]
pub struct NuevoLocal {
    pub conjunto_id: Uuid,
    pub nombre: String,
    pub categoria: CatLocal,
    pub descripcion: Option<String>,
    pub precio: Option<BigDecimal>,
    pub imagen_url: Option<String>,
    pub telefono: Option<String>,
    pub whatsapp: Option<String>,
    pub propietario_id: Option<Uuid>,
}
