use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::domains::pases_temporales::models::{PaseTemporal, VehiculoTemporal};

#[derive(Debug, Serialize, ToSchema)]
pub struct PaseTemporalDto {
    pub id: Uuid,
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
    pub estado: String,
    pub created_at: String,
    pub usuario_id: Option<Uuid>,
    pub vehiculos: Vec<VehiculoTemporalDto>,
}

impl From<PaseTemporal> for PaseTemporalDto {
    fn from(p: PaseTemporal) -> Self {
        Self {
            id: p.id,
            nombre_anfitrion: p.nombre_anfitrion,
            nombre_huesped: p.nombre_huesped,
            email_huesped: p.email_huesped,
            telefono_huesped: p.telefono_huesped,
            codigo_acceso: p.codigo_acceso,
            fecha_inicio: p.fecha_inicio,
            fecha_fin: p.fecha_fin,
            permiso_gimnasio: p.permiso_gimnasio,
            permiso_piscina: p.permiso_piscina,
            permiso_entrada_salida: p.permiso_entrada_salida,
            permiso_vehiculo: p.permiso_vehiculo,
            permiso_asamblea: p.permiso_asamblea,
            estado: p.estado.to_string(),
            created_at: p.created_at.to_rfc3339(),
            usuario_id: p.usuario_id,
            vehiculos: vec![],
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct VehiculoTemporalDto {
    pub id: Uuid,
    pub placa: String,
    pub marca: Option<String>,
    pub modelo: Option<String>,
    pub color: Option<String>,
}

impl From<VehiculoTemporal> for VehiculoTemporalDto {
    fn from(v: VehiculoTemporal) -> Self {
        Self {
            id: v.id,
            placa: v.placa,
            marca: v.marca,
            modelo: v.modelo,
            color: v.color,
        }
    }
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CrearPaseTemporalRequest {
    pub unidad_id: Uuid,
    pub nombre_anfitrion: String,
    pub nombre_huesped: String,
    pub email_huesped: Option<String>,
    pub telefono_huesped: Option<String>,
    #[schema(value_type = String, format = "date")]
    pub fecha_inicio: NaiveDate,
    #[schema(value_type = String, format = "date")]
    pub fecha_fin: NaiveDate,
    pub permiso_gimnasio: bool,
    pub permiso_piscina: bool,
    pub permiso_entrada_salida: bool,
    pub permiso_vehiculo: bool,
    pub permiso_asamblea: bool,
    pub vehiculos: Option<Vec<VehiculoTemporalInput>>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct VehiculoTemporalInput {
    pub placa: String,
    pub marca: Option<String>,
    pub modelo: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ValidacionPaseDto {
    pub valido: bool,
    pub nombre_huesped: String,
    pub unidad: String,
    pub dias_restantes: i64,
    pub permisos: PermisosDto,
    pub vehiculos: Vec<VehiculoTemporalDto>,
    pub motivo: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct PermisosDto {
    pub gimnasio: bool,
    pub piscina: bool,
    pub entrada_salida: bool,
    pub vehiculo: bool,
    pub asamblea: bool,
}
