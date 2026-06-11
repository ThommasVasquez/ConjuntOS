use bigdecimal::BigDecimal;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::db::enums::{EstadoPairing, EstadoTurno, TipoAsistencia};
use crate::domains::asamblea::models::{
    Asamblea, AsambleaAsistencia, AsambleaOpinion, AsambleaPairing, AsambleaPoder, AsambleaTurno,
    AsambleaVotacion, AsambleaVoto,
};

// ── Session ──────────────────────────────────────────────────────────────

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AsambleaDto {
    pub id: Uuid,
    pub titulo: String,
    pub descripcion: Option<String>,
    pub fecha: DateTime<Utc>,
    pub activa: bool,
    pub orden_dia: serde_json::Value,
    pub item_activo_index: i32,
    pub session_state: serde_json::Value,
    pub version: i32,
}

impl From<Asamblea> for AsambleaDto {
    fn from(a: Asamblea) -> Self {
        Self {
            id: a.id,
            titulo: a.titulo,
            descripcion: a.descripcion,
            fecha: a.fecha,
            activa: a.activa,
            orden_dia: a.orden_dia,
            item_activo_index: a.item_activo_index,
            session_state: a.session_state,
            version: a.version,
        }
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SessionUpdateRequest {
    pub session_state: Option<serde_json::Value>,
    pub item_activo_index: Option<i32>,
    pub activa: Option<bool>,
    /// Optimistic-locking version — must match the current DB version or 409.
    pub version: i32,
}

// ── Pairing ──────────────────────────────────────────────────────────────

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PairingDto {
    pub id: Uuid,
    pub estado: EstadoPairing,
    pub usuario_id: Option<Uuid>,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

impl From<AsambleaPairing> for PairingDto {
    fn from(p: AsambleaPairing) -> Self {
        Self {
            id: p.id,
            estado: p.estado,
            usuario_id: p.usuario_id,
            expires_at: p.expires_at,
            created_at: p.created_at,
        }
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreatePairingRequest {
    pub pin: String,
    pub expires_minutes: Option<i64>,
}

/// Query params for GET /asambleas/pairing?pin=XXXXXX
#[derive(Deserialize)]
pub struct PairingQuery {
    pub pin: String,
}

// ── Votaciones ───────────────────────────────────────────────────────────

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct VotacionDto {
    pub id: Uuid,
    pub asamblea_id: Uuid,
    pub titulo: String,
    pub descripcion: Option<String>,
    pub opciones: Vec<String>,
    pub activa: bool,
    pub created_at: DateTime<Utc>,
}

impl From<AsambleaVotacion> for VotacionDto {
    fn from(v: AsambleaVotacion) -> Self {
        let opciones: Vec<String> = serde_json::from_value(v.opciones).unwrap_or_default();
        Self {
            id: v.id,
            asamblea_id: v.asamblea_id,
            titulo: v.titulo,
            descripcion: v.descripcion,
            opciones,
            activa: v.activa,
            created_at: v.created_at,
        }
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateVotacionRequest {
    pub titulo: String,
    pub descripcion: Option<String>,
    pub opciones: Option<Vec<String>>,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateVotacionRequest {
    pub activa: bool,
}

// ── Votos ────────────────────────────────────────────────────────────────

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct VotoDto {
    pub id: Uuid,
    pub votacion_id: Uuid,
    pub usuario_id: Uuid,
    pub unidad_id: Option<Uuid>,
    pub respuesta: String,
    #[schema(value_type = f64)]
    pub coeficiente: BigDecimal,
    pub es_virtual: bool,
    pub hash_firma: String,
    pub created_at: DateTime<Utc>,
}

impl From<AsambleaVoto> for VotoDto {
    fn from(v: AsambleaVoto) -> Self {
        Self {
            id: v.id,
            votacion_id: v.votacion_id,
            usuario_id: v.usuario_id,
            unidad_id: v.unidad_id,
            respuesta: v.respuesta,
            coeficiente: v.coeficiente,
            es_virtual: v.es_virtual,
            hash_firma: v.hash_firma,
            created_at: v.created_at,
        }
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateVotoRequest {
    pub respuesta: String,
    pub es_virtual: Option<bool>,
}

// ── Asistencias ──────────────────────────────────────────────────────────

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AsistenciaDto {
    pub id: Uuid,
    pub asamblea_id: Uuid,
    pub usuario_id: Uuid,
    pub tipo: TipoAsistencia,
    pub verificado: bool,
    pub ip: Option<String>,
    pub dispositivo: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl From<AsambleaAsistencia> for AsistenciaDto {
    fn from(a: AsambleaAsistencia) -> Self {
        Self {
            id: a.id,
            asamblea_id: a.asamblea_id,
            usuario_id: a.usuario_id,
            tipo: a.tipo,
            verificado: a.verificado,
            ip: a.ip,
            dispositivo: a.dispositivo,
            created_at: a.created_at,
        }
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateAsistenciaRequest {
    pub tipo: TipoAsistencia,
    pub ip: Option<String>,
    pub dispositivo: Option<String>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct QuorumDto {
    pub asistencias: Vec<AsistenciaDto>,
    #[schema(value_type = f64)]
    pub total_coeficiente: BigDecimal,
    #[schema(value_type = f64)]
    pub presente_coeficiente: BigDecimal,
    #[schema(value_type = f64)]
    pub quorum_porcentaje: BigDecimal,
}

// ── Opiniones ────────────────────────────────────────────────────────────

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct OpinionDto {
    pub id: Uuid,
    pub asamblea_id: Uuid,
    pub usuario_id: Uuid,
    pub nombre: String,
    pub apto: Option<String>,
    pub contenido: String,
    pub created_at: DateTime<Utc>,
}

impl From<AsambleaOpinion> for OpinionDto {
    fn from(o: AsambleaOpinion) -> Self {
        Self {
            id: o.id,
            asamblea_id: o.asamblea_id,
            usuario_id: o.usuario_id,
            nombre: o.nombre,
            apto: o.apto,
            contenido: o.contenido,
            created_at: o.created_at,
        }
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateOpinionRequest {
    pub contenido: String,
}

// ── Turnos ───────────────────────────────────────────────────────────────

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct TurnoDto {
    pub id: Uuid,
    pub asamblea_id: Uuid,
    pub usuario_id: Uuid,
    pub nombre: String,
    pub apto: Option<String>,
    pub estado: EstadoTurno,
    pub created_at: DateTime<Utc>,
}

impl From<AsambleaTurno> for TurnoDto {
    fn from(t: AsambleaTurno) -> Self {
        Self {
            id: t.id,
            asamblea_id: t.asamblea_id,
            usuario_id: t.usuario_id,
            nombre: t.nombre,
            apto: t.apto,
            estado: t.estado,
            created_at: t.created_at,
        }
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTurnoRequest {
    pub estado: EstadoTurno,
}

// ── Poderes ──────────────────────────────────────────────────────────────

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PoderDto {
    pub id: Uuid,
    pub asamblea_id: Uuid,
    pub otorgante_id: Uuid,
    pub apoderado_id: Uuid,
    pub documento_url: String,
    pub verificado: bool,
    pub created_at: DateTime<Utc>,
}

impl From<AsambleaPoder> for PoderDto {
    fn from(p: AsambleaPoder) -> Self {
        Self {
            id: p.id,
            asamblea_id: p.asamblea_id,
            otorgante_id: p.otorgante_id,
            apoderado_id: p.apoderado_id,
            documento_url: p.documento_url,
            verificado: p.verificado,
            created_at: p.created_at,
        }
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreatePoderRequest {
    pub otorgante_id: Uuid,
    pub apoderado_id: Uuid,
    pub documento_url: String,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePoderRequest {
    pub verificado: bool,
}

// ── LiveKit ─────────────────────────────────────────────────────────────

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LiveKitTokenDto {
    pub token: String,
    pub url: String,
}
