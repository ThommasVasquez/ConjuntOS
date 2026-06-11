use bigdecimal::BigDecimal;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::db::enums::CatLocal;
use crate::domains::clasificados::models::Local;

/// Seller contact joined from `usuarios` (classifieds are resident-to-resident).
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PropietarioRefDto {
    pub nombre: String,
    pub telefono: Option<String>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClasificadoDto {
    pub id: Uuid,
    pub nombre: String,
    pub categoria: CatLocal,
    pub descripcion: Option<String>,
    /// Money serialized as string (Law 6).
    #[schema(value_type = Option<String>)]
    pub precio: Option<BigDecimal>,
    pub imagen_url: Option<String>,
    pub activo: bool,
    pub telefono: Option<String>,
    pub whatsapp: Option<String>,
    pub propietario_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub propietario: Option<PropietarioRefDto>,
}

impl ClasificadoDto {
    pub fn from_row((local, propietario): (Local, Option<(String, Option<String>)>)) -> Self {
        Self {
            id: local.id,
            nombre: local.nombre,
            categoria: local.categoria,
            descripcion: local.descripcion,
            precio: local.precio,
            imagen_url: local.imagen_url,
            activo: local.activo,
            telefono: local.telefono,
            whatsapp: local.whatsapp,
            propietario_id: local.propietario_id,
            created_at: local.created_at,
            propietario: propietario
                .map(|(nombre, telefono)| PropietarioRefDto { nombre, telefono }),
        }
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateClasificadoRequest {
    pub nombre: String,
    pub categoria: CatLocal,
    pub descripcion: Option<String>,
    /// Money as string-decimal (Law 6).
    #[schema(value_type = Option<String>)]
    pub precio: Option<BigDecimal>,
    pub imagen_url: Option<String>,
    pub telefono: Option<String>,
    pub whatsapp: Option<String>,
}
