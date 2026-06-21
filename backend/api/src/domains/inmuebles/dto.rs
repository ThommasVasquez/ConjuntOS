use bigdecimal::BigDecimal;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::db::enums::{EstadoInmueble, Moneda, TipoNegocio, TipoUnidad};
use crate::domains::inmuebles::models::Inmueble;

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct InmuebleDto {
    pub id: Uuid,
    pub usuario_id: Uuid,
    pub titulo: String,
    pub descripcion: String,
    /// Money serialized as string (Law 6).
    #[schema(value_type = String)]
    pub precio: BigDecimal,
    pub tipo_negocio: TipoNegocio,
    pub tipo_unidad: TipoUnidad,
    pub habitaciones: i32,
    pub banos: i32,
    /// m², serialized as string (Law 6).
    #[schema(value_type = Option<String>)]
    pub area: Option<BigDecimal>,
    pub moneda: Moneda,
    pub imagenes: Vec<String>,
    pub caracteristicas: Vec<String>,
    pub estado: EstadoInmueble,
    pub destacado: bool,
    /// WhatsApp-capable phone of the listing owner (null if not set).
    pub telefono_contacto: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<Inmueble> for InmuebleDto {
    fn from(i: Inmueble) -> Self {
        (i, None).into()
    }
}

impl From<(Inmueble, Option<String>)> for InmuebleDto {
    fn from((i, telefono): (Inmueble, Option<String>)) -> Self {
        let imagenes = serde_json::from_value(i.imagenes).unwrap_or_default();
        let caracteristicas = serde_json::from_value(i.caracteristicas).unwrap_or_default();
        Self {
            id: i.id,
            usuario_id: i.usuario_id,
            titulo: i.titulo,
            descripcion: i.descripcion,
            precio: i.precio,
            tipo_negocio: i.tipo_negocio,
            tipo_unidad: i.tipo_unidad,
            habitaciones: i.habitaciones,
            banos: i.banos,
            area: i.area,
            moneda: i.moneda,
            imagenes,
            caracteristicas,
            estado: i.estado,
            destacado: i.destacado,
            telefono_contacto: telefono,
            created_at: i.created_at,
            updated_at: i.updated_at,
        }
    }
}

#[derive(Deserialize, IntoParams)]
#[serde(rename_all = "camelCase")]
pub struct InmueblesQuery {
    pub tipo_negocio: Option<TipoNegocio>,
    pub tipo_unidad: Option<TipoUnidad>,
    pub habitaciones: Option<i32>,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateInmuebleRequest {
    pub titulo: String,
    pub descripcion: String,
    /// Money as string-decimal (Law 6).
    #[schema(value_type = String)]
    pub precio: BigDecimal,
    pub tipo_negocio: TipoNegocio,
    pub tipo_unidad: TipoUnidad,
    pub habitaciones: Option<i32>,
    pub banos: Option<i32>,
    /// m² as string-decimal (Law 6).
    #[schema(value_type = Option<String>)]
    pub area: Option<BigDecimal>,
    pub moneda: Option<Moneda>,
    pub imagenes: Option<Vec<String>>,
    pub caracteristicas: Option<Vec<String>>,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInmuebleRequest {
    pub titulo: Option<String>,
    pub descripcion: Option<String>,
    #[schema(value_type = Option<String>)]
    pub precio: Option<BigDecimal>,
    pub tipo_negocio: Option<TipoNegocio>,
    pub tipo_unidad: Option<TipoUnidad>,
    pub habitaciones: Option<i32>,
    pub banos: Option<i32>,
    #[schema(value_type = Option<String>)]
    pub area: Option<BigDecimal>,
    pub moneda: Option<Moneda>,
    pub imagenes: Option<Vec<String>>,
    pub caracteristicas: Option<Vec<String>>,
    pub estado: Option<EstadoInmueble>,
}
