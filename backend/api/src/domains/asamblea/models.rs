use bigdecimal::BigDecimal;
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use uuid::Uuid;

use crate::db::enums::{EstadoPairing, EstadoTurno, TipoAsistencia};
use crate::db::schema::{
    asamblea_asistencias, asamblea_opiniones, asamblea_pairings, asamblea_poderes, asamblea_turnos,
    asamblea_votaciones, asamblea_votos, asambleas,
};

// ── Asambleas ────────────────────────────────────────────────────────────

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = asambleas, check_for_backend(diesel::pg::Pg))]
pub struct Asamblea {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub titulo: String,
    pub descripcion: Option<String>,
    pub fecha: DateTime<Utc>,
    pub activa: bool,
    pub orden_dia: serde_json::Value,
    pub item_activo_index: i32,
    pub session_state: serde_json::Value,
    pub version: i32,
}

// ── Pairings ─────────────────────────────────────────────────────────────

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = asamblea_pairings, check_for_backend(diesel::pg::Pg))]
pub struct AsambleaPairing {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub usuario_id: Option<Uuid>,
    pub pin_hash: String,
    pub estado: EstadoPairing,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = asamblea_pairings)]
pub struct NuevoPairing {
    pub conjunto_id: Uuid,
    pub pin_hash: String,
    pub estado: EstadoPairing,
    pub expires_at: DateTime<Utc>,
}

// ── Votaciones ───────────────────────────────────────────────────────────

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = asamblea_votaciones, check_for_backend(diesel::pg::Pg))]
pub struct AsambleaVotacion {
    pub id: Uuid,
    pub asamblea_id: Uuid,
    pub titulo: String,
    pub descripcion: Option<String>,
    pub opciones: serde_json::Value,
    pub activa: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = asamblea_votaciones)]
pub struct NuevaVotacion {
    pub asamblea_id: Uuid,
    pub titulo: String,
    pub descripcion: Option<String>,
    pub opciones: serde_json::Value,
}

// ── Votos ────────────────────────────────────────────────────────────────

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = asamblea_votos, check_for_backend(diesel::pg::Pg))]
pub struct AsambleaVoto {
    pub id: Uuid,
    pub votacion_id: Uuid,
    pub usuario_id: Uuid,
    pub unidad_id: Option<Uuid>,
    pub respuesta: String,
    pub coeficiente: BigDecimal,
    pub es_virtual: bool,
    pub hash_firma: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = asamblea_votos)]
pub struct NuevoVoto {
    pub votacion_id: Uuid,
    pub usuario_id: Uuid,
    pub unidad_id: Option<Uuid>,
    pub respuesta: String,
    pub coeficiente: BigDecimal,
    pub es_virtual: bool,
    pub hash_firma: String,
}

// ── Asistencias ──────────────────────────────────────────────────────────

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = asamblea_asistencias, check_for_backend(diesel::pg::Pg))]
pub struct AsambleaAsistencia {
    pub id: Uuid,
    pub asamblea_id: Uuid,
    pub usuario_id: Uuid,
    pub tipo: TipoAsistencia,
    pub verificado: bool,
    pub ip: Option<String>,
    pub dispositivo: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = asamblea_asistencias)]
pub struct NuevaAsistencia {
    pub asamblea_id: Uuid,
    pub usuario_id: Uuid,
    pub tipo: TipoAsistencia,
    pub verificado: bool,
    pub ip: Option<String>,
    pub dispositivo: Option<String>,
}

// ── Opiniones ────────────────────────────────────────────────────────────

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = asamblea_opiniones, check_for_backend(diesel::pg::Pg))]
pub struct AsambleaOpinion {
    pub id: Uuid,
    pub asamblea_id: Uuid,
    pub usuario_id: Uuid,
    pub nombre: String,
    pub apto: Option<String>,
    pub contenido: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = asamblea_opiniones)]
pub struct NuevaOpinion {
    pub asamblea_id: Uuid,
    pub usuario_id: Uuid,
    pub nombre: String,
    pub apto: Option<String>,
    pub contenido: String,
}

// ── Turnos ───────────────────────────────────────────────────────────────

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = asamblea_turnos, check_for_backend(diesel::pg::Pg))]
pub struct AsambleaTurno {
    pub id: Uuid,
    pub asamblea_id: Uuid,
    pub usuario_id: Uuid,
    pub nombre: String,
    pub apto: Option<String>,
    pub estado: EstadoTurno,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = asamblea_turnos)]
pub struct NuevoTurno {
    pub asamblea_id: Uuid,
    pub usuario_id: Uuid,
    pub nombre: String,
    pub apto: Option<String>,
    pub estado: EstadoTurno,
}

// ── Poderes ──────────────────────────────────────────────────────────────

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = asamblea_poderes, check_for_backend(diesel::pg::Pg))]
pub struct AsambleaPoder {
    pub id: Uuid,
    pub asamblea_id: Uuid,
    pub otorgante_id: Uuid,
    pub apoderado_id: Uuid,
    pub documento_url: String,
    pub verificado: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = asamblea_poderes)]
pub struct NuevoPoder {
    pub asamblea_id: Uuid,
    pub otorgante_id: Uuid,
    pub apoderado_id: Uuid,
    pub documento_url: String,
}
