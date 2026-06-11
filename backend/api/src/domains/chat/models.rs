use chrono::{DateTime, Utc};
use diesel::prelude::*;
use uuid::Uuid;

use crate::db::schema::chat_admin;

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = chat_admin, check_for_backend(diesel::pg::Pg))]
pub struct ChatMessage {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub usuario_id: Uuid,
    pub mensaje: String,
    pub audio_url: Option<String>,
    pub transcripcion: Option<String>,
    pub es_de_admin: bool,
    pub leido: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = chat_admin)]
pub struct NuevoChatMessage {
    pub conjunto_id: Uuid,
    pub usuario_id: Uuid,
    pub mensaje: String,
    pub audio_url: Option<String>,
    pub transcripcion: Option<String>,
    pub es_de_admin: bool,
}
