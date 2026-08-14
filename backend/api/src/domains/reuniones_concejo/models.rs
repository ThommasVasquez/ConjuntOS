use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::schema::reuniones_concejo;

#[derive(Debug, Queryable, Selectable, Serialize, Deserialize, Clone)]
#[diesel(table_name = reuniones_concejo)]
pub struct ReunionConcejo {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub creado_por: Uuid,
    pub titulo: String,
    pub descripcion: Option<String>,
    pub modalidad: String, // "PRESENCIAL" | "VIRTUAL" | "HIBRIDA"
    pub lugar: Option<String>,
    pub link_videollamada: Option<String>,
    pub fecha_reunion: DateTime<Utc>,
    pub orden_dia: serde_json::Value,
    pub estado: String, // "CONVOCADA" | "EN_CURSO" | "FINALIZADA" | "CANCELADA"
    pub asistencias: serde_json::Value,
    pub acta_resumen: Option<String>,
    pub votaciones: serde_json::Value,
    pub transcripcion_detallada: Option<String>,
    pub resumen_ia: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Insertable)]
#[diesel(table_name = reuniones_concejo)]
pub struct NewReunionConcejo {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub creado_por: Uuid,
    pub titulo: String,
    pub descripcion: Option<String>,
    pub modalidad: String,
    pub lugar: Option<String>,
    pub link_videollamada: Option<String>,
    pub fecha_reunion: DateTime<Utc>,
    pub orden_dia: serde_json::Value,
    pub estado: String,
    pub asistencias: serde_json::Value,
    pub votaciones: serde_json::Value,
    pub transcripcion_detallada: Option<String>,
    pub resumen_ia: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
