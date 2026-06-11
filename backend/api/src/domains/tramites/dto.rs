use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::db::enums::{EstadoTramite, TipoMascota, TipoTramite, TipoVehiculo};
use crate::domains::tramites::models::Tramite;

/// Inline attachment (base64; bounded by the global request-body limit).
#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DocumentoAdjuntoDto {
    pub nombre: String,
    pub mime_type: String,
    pub base64: String,
}

/// Requester summary joined from `usuarios` for the admin view.
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SolicitanteRefDto {
    pub nombre: String,
    pub torre: Option<String>,
    pub apto: Option<String>,
}

impl From<(String, Option<String>, Option<String>)> for SolicitanteRefDto {
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
pub struct TramiteDto {
    pub id: Uuid,
    pub usuario_id: Uuid,
    pub tipo: TipoTramite,
    pub estado: EstadoTramite,
    #[schema(value_type = Object)]
    pub payload: serde_json::Value,
    pub documentos: Vec<DocumentoAdjuntoDto>,
    pub observacion_admin: Option<String>,
    pub aprobado_por_id: Option<Uuid>,
    pub fecha_respuesta: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<Tramite> for TramiteDto {
    fn from(t: Tramite) -> Self {
        let documentos = serde_json::from_value(t.documentos).unwrap_or_default();
        Self {
            id: t.id,
            usuario_id: t.usuario_id,
            tipo: t.tipo,
            estado: t.estado,
            payload: t.payload,
            documentos,
            observacion_admin: t.observacion_admin,
            aprobado_por_id: t.aprobado_por_id,
            fecha_respuesta: t.fecha_respuesta,
            created_at: t.created_at,
            updated_at: t.updated_at,
        }
    }
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct TramiteConSolicitanteDto {
    #[serde(flatten)]
    pub tramite: TramiteDto,
    pub solicitante: SolicitanteRefDto,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateTramiteRequest {
    pub tipo: TipoTramite,
    /// Arbitrary JSON object; validated against the typed payload on approval.
    #[schema(value_type = Object)]
    pub payload: serde_json::Value,
    pub documentos: Option<Vec<DocumentoAdjuntoDto>>,
}

#[derive(Deserialize, Clone, Copy, PartialEq, Eq, ToSchema)]
pub enum DecisionTramite {
    #[serde(rename = "APROBADO")]
    Aprobado,
    #[serde(rename = "RECHAZADO")]
    Rechazado,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ResolverTramiteRequest {
    pub decision: DecisionTramite,
    pub observacion: Option<String>,
}

/// Typed `tramites.payload` for tipo VEHICULO, validated on approval (422 on
/// unknown/missing fields).
#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VehiculoPayload {
    pub placa: String,
    pub marca: Option<String>,
    pub modelo: Option<String>,
    pub color: Option<String>,
    pub tipo: TipoVehiculo,
}

/// Typed `tramites.payload` for tipo MASCOTA, validated on approval (422 on
/// unknown/missing fields).
#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MascotaPayload {
    pub nombre: String,
    pub tipo: TipoMascota,
    pub raza: Option<String>,
}
