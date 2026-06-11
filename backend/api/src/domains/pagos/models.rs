use bigdecimal::BigDecimal;
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use uuid::Uuid;

use crate::db::enums::{EstadoPago, MetodoPago};
use crate::db::schema::{pagos, recibos_publicos};

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = pagos, check_for_backend(diesel::pg::Pg))]
pub struct Pago {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub unidad_id: Uuid,
    pub usuario_id: Uuid,
    pub concepto: String,
    pub monto: BigDecimal,
    pub estado: EstadoPago,
    pub metodo: Option<MetodoPago>,
    pub wompi_ref: Option<String>,
    pub fecha_vencimiento: DateTime<Utc>,
    pub fecha_pago: Option<DateTime<Utc>>,
    pub comprobante: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = recibos_publicos, check_for_backend(diesel::pg::Pg))]
pub struct ReciboPublico {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub unidad_id: Uuid,
    pub servicio: String,
    pub empresa: String,
    pub periodo: String,
    pub monto: BigDecimal,
    pub vencimiento: DateTime<Utc>,
    pub url_recibo: Option<String>,
    pub pagado: bool,
    pub fecha_pago: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}
