use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::db::enums::{
    EstadoParqueadero, TipoCeldaParqueadero, TipoRegistroParqueadero, TipoVehiculo,
};
use crate::domains::parqueadero::models::{Parqueadero, RondaParqueadero, Vehiculo};

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct VehiculoDto {
    pub id: Uuid,
    pub placa: String,
    pub marca: Option<String>,
    pub modelo: Option<String>,
    pub color: Option<String>,
    pub tipo: TipoVehiculo,
    pub created_at: DateTime<Utc>,
}

impl From<Vehiculo> for VehiculoDto {
    fn from(v: Vehiculo) -> Self {
        Self {
            id: v.id,
            placa: v.placa,
            marca: v.marca,
            modelo: v.modelo,
            color: v.color,
            tipo: v.tipo,
            created_at: v.created_at,
        }
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateVehiculoRequest {
    pub placa: String,
    pub marca: Option<String>,
    pub modelo: Option<String>,
    pub color: Option<String>,
    pub tipo: TipoVehiculo,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CeldaDto {
    pub id: Uuid,
    pub numero: String,
    pub torre: Option<String>,
    pub tipo: TipoCeldaParqueadero,
    pub estado: EstadoParqueadero,
    pub usuario_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
}

impl From<Parqueadero> for CeldaDto {
    fn from(p: Parqueadero) -> Self {
        Self {
            id: p.id,
            numero: p.numero,
            torre: p.torre,
            tipo: p.tipo,
            estado: p.estado,
            usuario_id: p.usuario_id,
            created_at: p.created_at,
        }
    }
}

/// Permanent occupant summary joined from `usuarios`.
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct OcupanteDto {
    pub nombre: String,
    pub torre: Option<String>,
    pub apto: Option<String>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CeldaMapaDto {
    #[serde(flatten)]
    pub celda: CeldaDto,
    pub ocupante: Option<OcupanteDto>,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCeldaRequest {
    pub estado: EstadoParqueadero,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ParqueaderoMioDto {
    pub vehiculos: Vec<VehiculoDto>,
    pub celdas: Vec<CeldaDto>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RegistroDto {
    pub id: Uuid,
    pub parqueadero_id: Uuid,
    pub usuario_id: Uuid,
    pub tipo: TipoRegistroParqueadero,
    pub placa: Option<String>,
    pub observacion: Option<String>,
    pub fecha: DateTime<Utc>,
    pub celda_numero: String,
    pub celda_tipo: TipoCeldaParqueadero,
    pub usuario_nombre: String,
}

#[derive(Serialize, Deserialize, ToSchema, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HallazgoDto {
    pub descripcion: String,
    pub celda: Option<String>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RondaDto {
    pub id: Uuid,
    pub usuario_id: Uuid,
    pub fecha: DateTime<Utc>,
    pub hallazgos: Vec<HallazgoDto>,
    pub completada: bool,
}

impl From<RondaParqueadero> for RondaDto {
    fn from(r: RondaParqueadero) -> Self {
        let hallazgos = r
            .hallazgos
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();
        Self {
            id: r.id,
            usuario_id: r.usuario_id,
            fecha: r.fecha,
            hallazgos,
            completada: r.completada,
        }
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateRondaRequest {
    #[serde(default)]
    pub hallazgos: Vec<HallazgoDto>,
    pub completada: bool,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ParqueaderoStatsDto {
    pub total: i64,
    pub ocupados: i64,
    pub libres: i64,
    /// 0-100, rounded.
    pub porcentaje_ocupacion: i64,
}
