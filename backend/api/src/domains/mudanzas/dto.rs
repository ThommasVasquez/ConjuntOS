use chrono::{NaiveDate, DateTime, Utc};
use bigdecimal::BigDecimal;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::models::Mudanza;

#[derive(Debug, Deserialize)]
pub struct CreateMudanzaReq {
    pub tipo: String, // "ENTRANTE" | "SALIENTE"
    pub fecha_mudanza: NaiveDate,
    pub hora_inicio: String, // "08:00 AM"
    pub hora_fin: String, // "02:00 PM"
    pub tiene_vehiculo: bool,
    pub vehiculo_placa: Option<String>,
    pub vehiculo_tipo: Option<String>,
    pub conductor_nombre: Option<String>,
    pub conductor_documento: Option<String>,
    pub observaciones: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AprobarMudanzaReq {
    pub saldo_pendiente: Option<f64>,
    pub observaciones_admin: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RechazarMudanzaReq {
    pub motivo: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateEstadoMudanzaReq {
    pub estado: String, // "EN_PROCESO" | "FINALIZADO"
}

#[derive(Debug, Serialize)]
pub struct MudanzaResp {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub usuario_id: Uuid,
    pub usuario_nombre: Option<String>,
    pub usuario_email: Option<String>,
    pub torre: Option<String>,
    pub apto: Option<String>,
    pub tipo: String,
    pub fecha_mudanza: NaiveDate,
    pub hora_inicio: String,
    pub hora_fin: String,
    pub tiene_vehiculo: bool,
    pub vehiculo_placa: Option<String>,
    pub vehiculo_tipo: Option<String>,
    pub conductor_nombre: Option<String>,
    pub conductor_documento: Option<String>,
    pub observaciones: Option<String>,
    pub estado: String,
    pub paz_y_salvo_codigo: Option<String>,
    pub motivo_rechazo: Option<String>,
    pub saldo_pendiente_monto: Option<f64>,
    pub aprobado_por_usuario_id: Option<Uuid>,
    pub aprobado_por_nombre: Option<String>,
    pub aprobado_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deuda_estimada_sistema: Option<f64>,
}

impl From<Mudanza> for MudanzaResp {
    fn from(m: Mudanza) -> Self {
        let saldo_f64 = m.saldo_pendiente_monto.as_ref().and_then(|b| {
            use std::str::FromStr;
            f64::from_str(&b.to_string()).ok()
        });

        Self {
            id: m.id,
            conjunto_id: m.conjunto_id,
            usuario_id: m.usuario_id,
            usuario_nombre: None,
            usuario_email: None,
            torre: m.torre,
            apto: m.apto,
            tipo: m.tipo,
            fecha_mudanza: m.fecha_mudanza,
            hora_inicio: m.hora_inicio,
            hora_fin: m.hora_fin,
            tiene_vehiculo: m.tiene_vehiculo,
            vehiculo_placa: m.vehiculo_placa,
            vehiculo_tipo: m.vehiculo_tipo,
            conductor_nombre: m.conductor_nombre,
            conductor_documento: m.conductor_documento,
            observaciones: m.observaciones,
            estado: m.estado,
            paz_y_salvo_codigo: m.paz_y_salvo_codigo,
            motivo_rechazo: m.motivo_rechazo,
            saldo_pendiente_monto: saldo_f64,
            aprobado_por_usuario_id: m.aprobado_por_usuario_id,
            aprobado_por_nombre: None,
            aprobado_at: m.aprobado_at,
            created_at: m.created_at,
            updated_at: m.updated_at,
            deuda_estimada_sistema: None,
        }
    }
}
