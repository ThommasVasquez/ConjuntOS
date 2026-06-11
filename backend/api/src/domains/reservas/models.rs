use bigdecimal::BigDecimal;
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use uuid::Uuid;

use crate::db::enums::EstadoReserva;
use crate::db::schema::{areas_comunes, reservas};

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = areas_comunes, check_for_backend(diesel::pg::Pg))]
pub struct AreaComun {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub nombre: String,
    pub descripcion: Option<String>,
    pub capacidad_max: i32,
    pub imagen_url: Option<String>,
    pub requiere_deposito: bool,
    pub deposito_monto: Option<BigDecimal>,
    pub hora_apertura: String,
    pub hora_cierre: String,
    pub dias_disponibles: String,
    pub duracion_slot: i32,
    pub activa: bool,
}

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = reservas, check_for_backend(diesel::pg::Pg))]
pub struct Reserva {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub usuario_id: Uuid,
    pub area_id: Uuid,
    pub fecha_inicio: DateTime<Utc>,
    pub fecha_fin: DateTime<Utc>,
    pub estado: EstadoReserva,
    pub notas: Option<String>,
    pub pago_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
}
