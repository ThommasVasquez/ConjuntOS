use chrono::{NaiveDate, DateTime, Utc};
use bigdecimal::BigDecimal;
use diesel::prelude::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::schema::mudanzas;

#[derive(Debug, Clone, Queryable, Selectable, Identifiable, Serialize, Deserialize)]
#[diesel(table_name = mudanzas)]
pub struct Mudanza {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub usuario_id: Uuid,
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
    pub saldo_pendiente_monto: Option<BigDecimal>,
    pub aprobado_por_usuario_id: Option<Uuid>,
    pub aprobado_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Insertable)]
#[diesel(table_name = mudanzas)]
pub struct NewMudanza {
    pub conjunto_id: Uuid,
    pub usuario_id: Uuid,
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
}
