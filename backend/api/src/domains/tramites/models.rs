use chrono::{DateTime, Utc};
use diesel::prelude::*;
use uuid::Uuid;

use crate::db::enums::{EstadoTramite, TipoTramite};
use crate::db::schema::tramites;

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = tramites, check_for_backend(diesel::pg::Pg))]
pub struct Tramite {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub usuario_id: Uuid,
    pub tipo: TipoTramite,
    pub estado: EstadoTramite,
    /// Typed per `tipo` at resolution time (specs/009).
    pub payload: serde_json::Value,
    /// `Vec<DocumentoAdjuntoDto>` validated at the boundary (Law 6).
    pub documentos: serde_json::Value,
    pub observacion_admin: Option<String>,
    pub aprobado_por_id: Option<Uuid>,
    pub fecha_respuesta: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = tramites)]
pub struct NuevoTramite {
    pub conjunto_id: Uuid,
    pub usuario_id: Uuid,
    pub tipo: TipoTramite,
    pub payload: serde_json::Value,
    pub documentos: serde_json::Value,
}
