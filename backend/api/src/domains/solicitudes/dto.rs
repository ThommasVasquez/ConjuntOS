use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::db::enums::{CatServicio, EstadoSolicitud, PrioridadTicket, TipoPqr};
use crate::domains::solicitudes::models::{Solicitud, TicketComentario, TicketTransicion};

// ── Solicitud DTOs ────────────────────────────────────────────────────────

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SolicitudDto {
    pub id: Uuid,
    pub usuario_id: Uuid,
    pub categoria: CatServicio,
    pub tipo: TipoPqr,
    pub descripcion: String,
    pub urgente: bool,
    pub imagenes: Vec<String>,
    pub estado: EstadoSolicitud,
    pub proveedor_id: Option<Uuid>,
    pub prioridad: PrioridadTicket,
    pub sla_horas: i32,
    pub sla_vencimiento: Option<DateTime<Utc>>,
    pub asignado_a_id: Option<Uuid>,
    pub fecha_asignacion: Option<DateTime<Utc>>,
    pub fecha_resolucion: Option<DateTime<Utc>>,
    pub fecha_cierre: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub comentarios: Vec<TicketComentarioDto>,
    pub transiciones: Vec<TicketTransicionDto>,
}

impl SolicitudDto {
    pub fn from_model(
        s: Solicitud,
        comentarios: Vec<TicketComentarioDto>,
        transiciones: Vec<TicketTransicionDto>,
    ) -> Self {
        let imagenes = serde_json::from_value(s.imagenes).unwrap_or_default();
        Self {
            id: s.id,
            usuario_id: s.usuario_id,
            categoria: s.categoria,
            tipo: s.tipo,
            descripcion: s.descripcion,
            urgente: s.urgente,
            imagenes,
            estado: s.estado,
            proveedor_id: s.proveedor_id,
            prioridad: s.prioridad,
            sla_horas: s.sla_horas,
            sla_vencimiento: s.sla_vencimiento,
            asignado_a_id: s.asignado_a_id,
            fecha_asignacion: s.fecha_asignacion,
            fecha_resolucion: s.fecha_resolucion,
            fecha_cierre: s.fecha_cierre,
            created_at: s.created_at,
            comentarios,
            transiciones,
        }
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateSolicitudRequest {
    pub categoria: CatServicio,
    pub tipo: Option<TipoPqr>,
    pub descripcion: String,
    pub urgente: Option<bool>,
    pub imagenes: Option<Vec<String>>,
    pub prioridad: Option<PrioridadTicket>,
}

// ── Comentarios ────────────────────────────────────────────────────────────

#[derive(Serialize, ToSchema)]
pub struct TicketComentarioDto {
    pub id: Uuid,
    pub usuario_id: Uuid,
    pub contenido: String,
    pub created_at: DateTime<Utc>,
}

impl From<TicketComentario> for TicketComentarioDto {
    fn from(c: TicketComentario) -> Self {
        Self { id: c.id, usuario_id: c.usuario_id, contenido: c.contenido, created_at: c.created_at }
    }
}

#[derive(Deserialize, ToSchema)]
pub struct AgregarComentarioRequest {
    pub contenido: String,
}

// ── Transiciones ───────────────────────────────────────────────────────────

#[derive(Serialize, ToSchema)]
pub struct TicketTransicionDto {
    pub id: Uuid,
    pub estado_anterior: String,
    pub estado_nuevo: String,
    pub usuario_id: Uuid,
    pub created_at: DateTime<Utc>,
}

impl From<TicketTransicion> for TicketTransicionDto {
    fn from(t: TicketTransicion) -> Self {
        Self { id: t.id, estado_anterior: t.estado_anterior, estado_nuevo: t.estado_nuevo, usuario_id: t.usuario_id, created_at: t.created_at }
    }
}

// ── Update ─────────────────────────────────────────────────────────────────

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTicketRequest {
    pub estado: Option<EstadoSolicitud>,
    pub proveedor_id: Option<Uuid>,
    pub asignado_a_id: Option<Uuid>,
    pub prioridad: Option<PrioridadTicket>,
}

// ── Stats ──────────────────────────────────────────────────────────────────

#[derive(Serialize, ToSchema)]
pub struct TicketStats {
    pub total: i64,
    pub abiertos: i64,
    pub asignados: i64,
    pub en_progreso: i64,
    pub resueltos: i64,
    pub cerrados: i64,
    pub sla_vencidos: i64,
    pub tiempo_promedio_resolucion_horas: f64,
}
