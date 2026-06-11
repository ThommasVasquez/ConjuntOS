use bigdecimal::BigDecimal;
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::db::enums::EstadoReserva;
use crate::domains::reservas::models::AreaComun;

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AreaComunDto {
    pub id: Uuid,
    pub nombre: String,
    pub descripcion: Option<String>,
    pub capacidad_max: i32,
    pub imagen_url: Option<String>,
    pub requiere_deposito: bool,
    /// Decimal serialized as string (Law 6).
    #[schema(value_type = Option<String>)]
    pub deposito_monto: Option<BigDecimal>,
    pub hora_apertura: String,
    pub hora_cierre: String,
    pub dias_disponibles: String,
    pub duracion_slot: i32,
    pub activa: bool,
}

impl From<AreaComun> for AreaComunDto {
    fn from(a: AreaComun) -> Self {
        Self {
            id: a.id,
            nombre: a.nombre,
            descripcion: a.descripcion,
            capacidad_max: a.capacidad_max,
            imagen_url: a.imagen_url,
            requiere_deposito: a.requiere_deposito,
            deposito_monto: a.deposito_monto,
            hora_apertura: a.hora_apertura,
            hora_cierre: a.hora_cierre,
            dias_disponibles: a.dias_disponibles,
            duracion_slot: a.duracion_slot,
            activa: a.activa,
        }
    }
}

#[derive(Deserialize, IntoParams)]
#[serde(rename_all = "camelCase")]
pub struct SlotsQuery {
    /// Day to inspect, YYYY-MM-DD (UTC).
    pub fecha: NaiveDate,
}

/// Occupied [start, end] pair of a non-cancelled reservation.
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SlotDto {
    pub fecha_inicio: DateTime<Utc>,
    pub fecha_fin: DateTime<Utc>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReservaDto {
    pub id: Uuid,
    pub area_id: Uuid,
    pub fecha_inicio: DateTime<Utc>,
    pub fecha_fin: DateTime<Utc>,
    pub estado: EstadoReserva,
    pub notas: Option<String>,
    pub created_at: DateTime<Utc>,
    pub area_nombre: String,
    pub area_imagen_url: Option<String>,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateReservaRequest {
    pub area_id: Uuid,
    pub fecha_inicio: DateTime<Utc>,
    pub fecha_fin: DateTime<Utc>,
    pub notas: Option<String>,
}
