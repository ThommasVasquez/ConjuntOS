use chrono::{DateTime, Utc};
use diesel::prelude::*;
use uuid::Uuid;

use crate::db::enums::{
    EstadoParqueadero, TipoCeldaParqueadero, TipoRegistroParqueadero, TipoVehiculo,
};
use crate::db::schema::{parqueaderos, registros_parqueadero, rondas_parqueadero, vehiculos};

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = vehiculos, check_for_backend(diesel::pg::Pg))]
pub struct Vehiculo {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub usuario_id: Uuid,
    pub placa: String,
    pub marca: Option<String>,
    pub modelo: Option<String>,
    pub color: Option<String>,
    pub tipo: TipoVehiculo,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = vehiculos)]
pub struct NuevoVehiculo {
    pub conjunto_id: Uuid,
    pub usuario_id: Uuid,
    pub placa: String,
    pub marca: Option<String>,
    pub modelo: Option<String>,
    pub color: Option<String>,
    pub tipo: TipoVehiculo,
}

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = parqueaderos, check_for_backend(diesel::pg::Pg))]
pub struct Parqueadero {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub numero: String,
    pub torre: Option<String>,
    pub tipo: TipoCeldaParqueadero,
    pub estado: EstadoParqueadero,
    pub usuario_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub asignado_en: Option<DateTime<Utc>>,
    pub asignado_hasta: Option<DateTime<Utc>>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = parqueaderos)]
pub struct NuevaCelda {
    pub conjunto_id: Uuid,
    pub numero: String,
    pub torre: Option<String>,
    pub tipo: TipoCeldaParqueadero,
    pub estado: EstadoParqueadero,
}

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = registros_parqueadero, check_for_backend(diesel::pg::Pg))]
pub struct RegistroParqueadero {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub parqueadero_id: Uuid,
    pub usuario_id: Uuid,
    pub tipo: TipoRegistroParqueadero,
    pub placa: Option<String>,
    pub observacion: Option<String>,
    pub fecha: DateTime<Utc>,
}

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = rondas_parqueadero, check_for_backend(diesel::pg::Pg))]
pub struct RondaParqueadero {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub usuario_id: Uuid,
    pub fecha: DateTime<Utc>,
    /// `Vec<HallazgoDto>` validated at the boundary (Law 6).
    pub hallazgos: Option<serde_json::Value>,
    pub completada: bool,
}
