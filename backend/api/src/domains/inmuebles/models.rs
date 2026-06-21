use bigdecimal::BigDecimal;
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use uuid::Uuid;

use crate::db::enums::{EstadoInmueble, Moneda, TipoNegocio, TipoUnidad};
use crate::db::schema::inmuebles;

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = inmuebles, check_for_backend(diesel::pg::Pg))]
pub struct Inmueble {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub usuario_id: Uuid,
    pub titulo: String,
    pub descripcion: String,
    pub precio: BigDecimal,
    pub tipo_negocio: TipoNegocio,
    pub tipo_unidad: TipoUnidad,
    pub habitaciones: i32,
    pub banos: i32,
    pub area: Option<BigDecimal>,
    pub moneda: Moneda,
    pub telefono_contacto: Option<String>,
    pub whatsapp_contacto: Option<String>,
    /// `Vec<String>` of image URLs validated at the boundary (Law 6).
    pub imagenes: serde_json::Value,
    /// `Vec<String>` of feature labels validated at the boundary (Law 6).
    pub caracteristicas: serde_json::Value,
    pub estado: EstadoInmueble,
    pub destacado: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = inmuebles)]
pub struct NuevoInmueble {
    pub conjunto_id: Uuid,
    pub usuario_id: Uuid,
    pub titulo: String,
    pub descripcion: String,
    pub precio: BigDecimal,
    pub tipo_negocio: TipoNegocio,
    pub tipo_unidad: TipoUnidad,
    pub habitaciones: i32,
    pub banos: i32,
    pub area: Option<BigDecimal>,
    pub moneda: Moneda,
    pub telefono_contacto: Option<String>,
    pub whatsapp_contacto: Option<String>,
    pub imagenes: serde_json::Value,
    pub caracteristicas: serde_json::Value,
}
