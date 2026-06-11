use chrono::{DateTime, Utc};
use diesel::prelude::*;
use uuid::Uuid;

use crate::db::schema::{asamblea_actas, asamblea_subtitulos};

// ── Actas ────────────────────────────────────────────────────────────────

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = asamblea_actas, check_for_backend(diesel::pg::Pg))]
pub struct AsambleaActa {
    pub id: Uuid,
    pub asamblea_id: Uuid,
    pub contenido: String,
    pub generado_por: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = asamblea_actas)]
pub struct NuevaActa {
    pub asamblea_id: Uuid,
    pub contenido: String,
    pub generado_por: String,
}

// ── Subtítulos ───────────────────────────────────────────────────────────

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = asamblea_subtitulos, check_for_backend(diesel::pg::Pg))]
pub struct AsambleaSubtitulo {
    pub id: Uuid,
    pub asamblea_id: Uuid,
    pub speaker: String,
    pub text: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = asamblea_subtitulos)]
pub struct NuevoSubtitulo {
    pub asamblea_id: Uuid,
    pub speaker: String,
    pub text: String,
}
