use bigdecimal::BigDecimal;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::db::enums::{EstadoPago, MetodoPago};
use crate::domains::pagos::models::{Pago, ReciboPublico};

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PagoDto {
    pub id: Uuid,
    pub unidad_id: Uuid,
    pub concepto: String,
    /// Money serialized as string (Law 6).
    #[schema(value_type = String)]
    pub monto: BigDecimal,
    pub estado: EstadoPago,
    pub metodo: Option<MetodoPago>,
    pub fecha_vencimiento: DateTime<Utc>,
    pub fecha_pago: Option<DateTime<Utc>>,
    pub comprobante: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl From<Pago> for PagoDto {
    fn from(p: Pago) -> Self {
        Self {
            id: p.id,
            unidad_id: p.unidad_id,
            concepto: p.concepto,
            monto: p.monto,
            estado: p.estado,
            metodo: p.metodo,
            fecha_vencimiento: p.fecha_vencimiento,
            fecha_pago: p.fecha_pago,
            comprobante: p.comprobante,
            created_at: p.created_at,
        }
    }
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReciboDto {
    pub id: Uuid,
    pub unidad_id: Uuid,
    pub servicio: String,
    pub empresa: String,
    pub periodo: String,
    /// Money serialized as string (Law 6).
    #[schema(value_type = String)]
    pub monto: BigDecimal,
    pub vencimiento: DateTime<Utc>,
    pub url_recibo: Option<String>,
    pub pagado: bool,
    pub fecha_pago: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

impl From<ReciboPublico> for ReciboDto {
    fn from(r: ReciboPublico) -> Self {
        Self {
            id: r.id,
            unidad_id: r.unidad_id,
            servicio: r.servicio,
            empresa: r.empresa,
            periodo: r.periodo,
            monto: r.monto,
            vencimiento: r.vencimiento,
            url_recibo: r.url_recibo,
            pagado: r.pagado,
            fecha_pago: r.fecha_pago,
            created_at: r.created_at,
        }
    }
}

/// Users without an assigned unit get empty lists (no mock data — Law 4).
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PagosResponse {
    pub pagos: Vec<PagoDto>,
    pub recibos: Vec<ReciboDto>,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PagarRequest {
    pub metodo: MetodoPago,
    /// Payer's Nequi phone (required when the live Nequi gateway is active).
    pub telefono: Option<String>,
}
