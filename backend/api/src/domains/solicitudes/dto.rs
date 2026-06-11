use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::db::enums::{CatServicio, EstadoSolicitud, TipoPqr};
use crate::domains::solicitudes::models::Solicitud;

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SolicitudDto {
    pub id: Uuid,
    pub usuario_id: Uuid,
    pub categoria: CatServicio,
    pub tipo: TipoPqr,
    pub descripcion: String,
    pub urgente: bool,
    pub imagenes: Vec<String>,
    pub estado: EstadoSolicitud,
    pub proveedor_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
}

impl From<Solicitud> for SolicitudDto {
    fn from(s: Solicitud) -> Self {
        let imagenes = serde_json::from_value(s.imagenes).unwrap_or_default();
        Self {
            id: s.id,
            usuario_id: s.usuario_id,
            categoria: s.categoria,
            tipo: s.tipo,
            descripcion: s.descripcion,
            urgente: s.urgente,
            imagenes,
            estado: s.estado,
            proveedor_id: s.proveedor_id,
            created_at: s.created_at,
        }
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateSolicitudRequest {
    pub categoria: CatServicio,
    /// Defaults to MANTENIMIENTO.
    pub tipo: Option<TipoPqr>,
    pub descripcion: String,
    pub urgente: Option<bool>,
    pub imagenes: Option<Vec<String>>,
}
