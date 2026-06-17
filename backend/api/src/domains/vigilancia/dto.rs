use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::db::enums::{EstadoCorrespondencia, EstadoNovedad, EstadoPaquete, SeveridadNovedad, TipoCorrespondencia, TipoNovedad, TipoVehiculoVisita, TipoVisita};
use crate::domains::vigilancia::models::{Correspondencia, Novedad, Paquete, Visita};

/// Recipient summary joined from `usuarios` for gate views.
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ResidenteRefDto {
    pub nombre: String,
    pub torre: Option<String>,
    pub apto: Option<String>,
}

impl From<(String, Option<String>, Option<String>)> for ResidenteRefDto {
    fn from((nombre, torre, apto): (String, Option<String>, Option<String>)) -> Self {
        Self {
            nombre,
            torre,
            apto,
        }
    }
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct VisitaDto {
    pub id: Uuid,
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

impl From<Visita> for VisitaDto {
    fn from(v: Visita) -> Self {
        Self {
            id: v.id,
            usuario_id: v.usuario_id,
            nombre: v.nombre,
            tipo: v.tipo,
            vehiculo_tipo: v.vehiculo_tipo,
            placa: v.placa,
            fecha: v.fecha,
            tiene_parqueadero: v.tiene_parqueadero,
            observacion: v.observacion,
            created_at: v.created_at,
        }
    }
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct VisitaVigilanciaDto {
    #[serde(flatten)]
    pub visita: VisitaDto,
    pub residente: ResidenteRefDto,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateVisitaVigilanciaRequest {
    /// Resident the visitor is going to (must belong to the same conjunto).
    pub usuario_id: Uuid,
    pub nombre: String,
    pub tipo: TipoVisita,
    pub vehiculo_tipo: Option<TipoVehiculoVisita>,
    pub placa: Option<String>,
    pub tiene_parqueadero: Option<bool>,
    pub observacion: Option<String>,
    /// Defaults to now.
    pub fecha: Option<DateTime<Utc>>,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateVisitaResidenteRequest {
    pub nombre: String,
    pub tipo: TipoVisita,
    pub vehiculo_tipo: Option<TipoVehiculoVisita>,
    pub placa: Option<String>,
    pub tiene_parqueadero: Option<bool>,
    pub observacion: Option<String>,
    /// Defaults to now.
    pub fecha: Option<DateTime<Utc>>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PaqueteDto {
    pub id: Uuid,
    pub usuario_id: Uuid,
    pub descripcion: String,
    pub remitente: String,
    pub estado: EstadoPaquete,
    pub fecha_llegada: DateTime<Utc>,
    pub entregado_en: Option<DateTime<Utc>>,
}

impl From<Paquete> for PaqueteDto {
    fn from(p: Paquete) -> Self {
        Self {
            id: p.id,
            usuario_id: p.usuario_id,
            descripcion: p.descripcion,
            remitente: p.remitente,
            estado: p.estado,
            fecha_llegada: p.fecha_llegada,
            entregado_en: p.entregado_en,
        }
    }
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PaqueteVigilanciaDto {
    #[serde(flatten)]
    pub paquete: PaqueteDto,
    pub residente: ResidenteRefDto,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreatePaqueteRequest {
    /// Recipient resident (must belong to the same conjunto).
    pub usuario_id: Uuid,
    pub descripcion: String,
    pub remitente: String,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct VigilanciaStatsDto {
    pub visitas_hoy: i64,
    pub paquetes_pendientes: i64,
    pub total_residentes: i64,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ComunicacionesDto {
    pub visitas: Vec<VisitaDto>,
    pub paquetes: Vec<PaqueteDto>,
}

// ── Correspondencia ────────────────────────────────────────────────────

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CorrespondenciaDto {
    pub id: Uuid,
    pub usuario_id: Uuid,
    pub tipo: TipoCorrespondencia,
    pub remitente: String,
    pub descripcion: Option<String>,
    pub estado: EstadoCorrespondencia,
    pub fecha_llegada: DateTime<Utc>,
    pub entregado_en: Option<DateTime<Utc>>,
}

impl From<Correspondencia> for CorrespondenciaDto {
    fn from(c: Correspondencia) -> Self {
        Self {
            id: c.id,
            usuario_id: c.usuario_id,
            tipo: c.tipo,
            remitente: c.remitente,
            descripcion: c.descripcion,
            estado: c.estado,
            fecha_llegada: c.fecha_llegada,
            entregado_en: c.entregado_en,
        }
    }
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CorrespondenciaVigilanciaDto {
    #[serde(flatten)]
    pub correspondencia: CorrespondenciaDto,
    pub residente: ResidenteRefDto,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateCorrespondenciaRequest {
    pub usuario_id: Uuid,
    pub tipo: Option<TipoCorrespondencia>,
    pub remitente: String,
    pub descripcion: Option<String>,
}

// ── Novedades ──────────────────────────────────────────────────────────

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct NovedadDto {
    pub id: Uuid,
    pub usuario_id: Uuid,
    pub tipo: TipoNovedad,
    pub ubicacion: Option<String>,
    pub descripcion: String,
    pub severidad: SeveridadNovedad,
    pub estado: EstadoNovedad,
    pub resolucion: Option<String>,
    pub created_at: DateTime<Utc>,
    pub resuelto_en: Option<DateTime<Utc>>,
}

impl From<Novedad> for NovedadDto {
    fn from(n: Novedad) -> Self {
        Self {
            id: n.id,
            usuario_id: n.usuario_id,
            tipo: n.tipo,
            ubicacion: n.ubicacion,
            descripcion: n.descripcion,
            severidad: n.severidad,
            estado: n.estado,
            resolucion: n.resolucion,
            created_at: n.created_at,
            resuelto_en: n.resuelto_en,
        }
    }
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct NovedadVigilanciaDto {
    #[serde(flatten)]
    pub novedad: NovedadDto,
    pub reportado_por: ResidenteRefDto,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateNovedadRequest {
    pub tipo: TipoNovedad,
    pub ubicacion: Option<String>,
    pub descripcion: String,
    pub severidad: Option<SeveridadNovedad>,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ResolverNovedadRequest {
    pub resolucion: String,
}
