use chrono::{DateTime, Utc};
use diesel::prelude::*;
use uuid::Uuid;

use crate::db::enums::{CatServicio, EstadoSolicitud, PrioridadTicket, TipoPqr};
use crate::db::schema::{solicitudes_servicio, ticket_comentarios, ticket_transiciones};

#[derive(Queryable, Selectable, Identifiable, QueryableByName, Debug, Clone)]
#[diesel(table_name = solicitudes_servicio, check_for_backend(diesel::pg::Pg))]
pub struct Solicitud {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub usuario_id: Uuid,
    pub categoria: CatServicio,
    pub tipo: TipoPqr,
    pub descripcion: String,
    pub urgente: bool,
    pub imagenes: serde_json::Value,
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
}

#[derive(Insertable, Debug)]
#[diesel(table_name = solicitudes_servicio)]
pub struct NuevaSolicitud {
    pub conjunto_id: Uuid,
    pub usuario_id: Uuid,
    pub categoria: CatServicio,
    pub tipo: TipoPqr,
    pub descripcion: String,
    pub urgente: bool,
    pub imagenes: serde_json::Value,
    pub prioridad: PrioridadTicket,
    pub sla_horas: i32,
}

#[derive(Queryable, Selectable, Identifiable, Associations, Debug, Clone)]
#[diesel(belongs_to(Solicitud, foreign_key = ticket_id))]
#[diesel(table_name = ticket_comentarios, check_for_backend(diesel::pg::Pg))]
pub struct TicketComentario {
    pub id: Uuid,
    pub ticket_id: Uuid,
    pub usuario_id: Uuid,
    pub contenido: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = ticket_comentarios)]
pub struct NuevoComentario {
    pub ticket_id: Uuid,
    pub usuario_id: Uuid,
    pub contenido: String,
}

#[derive(Queryable, Selectable, Identifiable, Associations, Debug, Clone)]
#[diesel(belongs_to(Solicitud, foreign_key = ticket_id))]
#[diesel(table_name = ticket_transiciones, check_for_backend(diesel::pg::Pg))]
pub struct TicketTransicion {
    pub id: Uuid,
    pub ticket_id: Uuid,
    pub estado_anterior: String,
    pub estado_nuevo: String,
    pub usuario_id: Uuid,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = ticket_transiciones)]
pub struct NuevaTransicion {
    pub ticket_id: Uuid,
    pub estado_anterior: String,
    pub estado_nuevo: String,
    pub usuario_id: Uuid,
}
