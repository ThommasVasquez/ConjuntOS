use chrono::{DateTime, Utc};
use diesel::prelude::*;
use uuid::Uuid;

use crate::db::schema::{notificaciones, push_subscriptions};

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = notificaciones, check_for_backend(diesel::pg::Pg))]
pub struct Notificacion {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub usuario_id: Uuid,
    /// Open set in legacy ("APROBACION" | "SISTEMA" | "PAQUETE" | ...), kept as text.
    pub tipo: String,
    pub titulo: String,
    pub mensaje: String,
    pub leida: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = push_subscriptions, check_for_backend(diesel::pg::Pg))]
pub struct PushSubscription {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub usuario_id: Uuid,
    pub endpoint: String,
    pub p256dh: String,
    pub auth: String,
    pub created_at: DateTime<Utc>,
}
