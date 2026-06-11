use chrono::{DateTime, Utc};
use diesel::prelude::*;
use uuid::Uuid;

use crate::db::enums::{EstadoPaquete, TipoVehiculoVisita, TipoVisita};
use crate::db::schema::{paquetes, visitas};

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = visitas, check_for_backend(diesel::pg::Pg))]
pub struct Visita {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub usuario_id: Uuid,
    pub nombre: String,
    pub tipo: TipoVisita,
    pub vehiculo_tipo: Option<TipoVehiculoVisita>,
    pub placa: Option<String>,
    pub fecha: DateTime<Utc>,
    pub tiene_parqueadero: bool,
    pub observacion: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = visitas)]
pub struct NuevaVisita {
    pub conjunto_id: Uuid,
    pub usuario_id: Uuid,
    pub nombre: String,
    pub tipo: TipoVisita,
    pub vehiculo_tipo: Option<TipoVehiculoVisita>,
    pub placa: Option<String>,
    pub fecha: DateTime<Utc>,
    pub tiene_parqueadero: bool,
    pub observacion: Option<String>,
}

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = paquetes, check_for_backend(diesel::pg::Pg))]
pub struct Paquete {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub usuario_id: Uuid,
    pub descripcion: String,
    pub remitente: String,
    pub estado: EstadoPaquete,
    pub fecha_llegada: DateTime<Utc>,
    pub entregado_en: Option<DateTime<Utc>>,
}
