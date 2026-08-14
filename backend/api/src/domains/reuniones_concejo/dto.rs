use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::models::ReunionConcejo;

#[derive(Debug, Deserialize)]
pub struct CrearReunionConcejoReq {
    pub titulo: String,
    pub descripcion: Option<String>,
    pub modalidad: String, // "PRESENCIAL" | "VIRTUAL" | "HIBRIDA"
    pub lugar: Option<String>,
    pub link_videollamada: Option<String>,
    pub fecha_reunion: DateTime<Utc>,
    pub orden_dia: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct ConfirmarAsistenciaReq {
    pub confirmacion: String, // "CONFIRMADO_PRESENCIAL" | "CONFIRMADO_VIRTUAL" | "EXCUSA_INASISTENCIA"
    pub motivo_excusa: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateEstadoReunionReq {
    pub estado: String, // "EN_CURSO" | "FINALIZADA" | "CANCELADA"
    pub acta_resumen: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AsistenciaItemDto {
    pub usuario_id: Uuid,
    pub usuario_nombre: String,
    pub confirmacion: String, // "CONFIRMADO_PRESENCIAL" | "CONFIRMADO_VIRTUAL" | "EXCUSA_INASISTENCIA" | "PENDIENTE"
    pub motivo_excusa: Option<String>,
    pub asistio_real: Option<bool>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct ReunionConcejoResp {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub creado_por: Uuid,
    pub creado_por_nombre: Option<String>,
    pub titulo: String,
    pub descripcion: Option<String>,
    pub modalidad: String,
    pub lugar: Option<String>,
    pub link_videollamada: Option<String>,
    pub fecha_reunion: DateTime<Utc>,
    pub orden_dia: Vec<String>,
    pub estado: String,
    pub asistencias: Vec<AsistenciaItemDto>,
    pub acta_resumen: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<ReunionConcejo> for ReunionConcejoResp {
    fn from(r: ReunionConcejo) -> Self {
        let orden_dia_vec: Vec<String> = serde_json::from_value(r.orden_dia).unwrap_or_default();
        let asistencias_vec: Vec<AsistenciaItemDto> = serde_json::from_value(r.asistencias).unwrap_or_default();

        Self {
            id: r.id,
            conjunto_id: r.conjunto_id,
            creado_por: r.creado_por,
            creado_por_nombre: None,
            titulo: r.titulo,
            descripcion: r.descripcion,
            modalidad: r.modalidad,
            lugar: r.lugar,
            link_videollamada: r.link_videollamada,
            fecha_reunion: r.fecha_reunion,
            orden_dia: orden_dia_vec,
            estado: r.estado,
            asistencias: asistencias_vec,
            acta_resumen: r.acta_resumen,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}
