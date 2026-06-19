use crate::db::enums::EstadoPaseTemporal;
use crate::db::schema::{pases_temporales, vehiculos_temporales};
use chrono::{DateTime, NaiveDate, Utc};
use diesel::prelude::*;
use uuid::Uuid;

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = pases_temporales, check_for_backend(diesel::pg::Pg))]
pub struct PaseTemporal {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub propietario_id: Uuid,
    pub unidad_id: Uuid,
    pub nombre_anfitrion: String,
    pub nombre_huesped: String,
    pub email_huesped: Option<String>,
    pub telefono_huesped: Option<String>,
    pub codigo_acceso: String,
    pub fecha_inicio: NaiveDate,
    pub fecha_fin: NaiveDate,
    pub permiso_gimnasio: bool,
    pub permiso_piscina: bool,
    pub permiso_entrada_salida: bool,
    pub permiso_vehiculo: bool,
    pub permiso_asamblea: bool,
    pub estado: EstadoPaseTemporal,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = pases_temporales)]
pub struct NuevoPaseTemporal {
    pub conjunto_id: Uuid,
    pub propietario_id: Uuid,
    pub unidad_id: Uuid,
    pub nombre_anfitrion: String,
    pub nombre_huesped: String,
    pub email_huesped: Option<String>,
    pub telefono_huesped: Option<String>,
    pub codigo_acceso: String,
    pub fecha_inicio: NaiveDate,
    pub fecha_fin: NaiveDate,
    pub permiso_gimnasio: bool,
    pub permiso_piscina: bool,
    pub permiso_entrada_salida: bool,
    pub permiso_vehiculo: bool,
    pub permiso_asamblea: bool,
}

#[derive(Queryable, Selectable, Identifiable, Associations, Debug, Clone)]
#[diesel(belongs_to(PaseTemporal, foreign_key = pase_id))]
#[diesel(table_name = vehiculos_temporales, check_for_backend(diesel::pg::Pg))]
pub struct VehiculoTemporal {
    pub id: Uuid,
    pub pase_id: Uuid,
    pub placa: String,
    pub marca: Option<String>,
    pub modelo: Option<String>,
    pub color: Option<String>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = vehiculos_temporales)]
pub struct NuevoVehiculoTemporal {
    pub pase_id: Uuid,
    pub placa: String,
    pub marca: Option<String>,
    pub modelo: Option<String>,
    pub color: Option<String>,
}
