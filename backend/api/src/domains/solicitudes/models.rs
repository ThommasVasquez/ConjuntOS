use chrono::{DateTime, Utc};
use diesel::prelude::*;
use uuid::Uuid;

use crate::db::enums::{CatServicio, EstadoSolicitud, TipoPqr};
use crate::db::schema::solicitudes_servicio;

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = solicitudes_servicio, check_for_backend(diesel::pg::Pg))]
pub struct Solicitud {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub usuario_id: Uuid,
    pub categoria: CatServicio,
    pub tipo: TipoPqr,
    pub descripcion: String,
    pub urgente: bool,
    /// `Vec<String>` of image URLs validated at the boundary (Law 6).
    pub imagenes: serde_json::Value,
    pub estado: EstadoSolicitud,
    pub proveedor_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = solicitudes_servicio)]
pub struct NuevaSolicitud {
    pub conjunto_id: Uuid,
    pub usuario_id: Uuid,
    pub categoria: CatServicio,
    pub tipo: TipoPqr,
    pub descripcion: String,
    pub urgente: bool,
    pub imagenes: serde_json::Value,
}
