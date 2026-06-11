use chrono::{DateTime, Utc};
use diesel::prelude::*;
use uuid::Uuid;

use crate::db::enums::{Plan, TipoUnidad};
use crate::db::schema::{conjuntos, unidades};

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = conjuntos, check_for_backend(diesel::pg::Pg))]
pub struct Conjunto {
    pub id: Uuid,
    pub nombre: String,
    pub nit: Option<String>,
    pub subdominio: String,
    pub direccion: String,
    pub ciudad: String,
    pub logo_url: Option<String>,
    pub color_primario: String,
    pub plan: Plan,
    pub activo: bool,
    pub representante_legal: Option<String>,
    pub notaria_escritura: Option<String>,
    pub numero_escritura: Option<String>,
    pub fecha_escritura: Option<DateTime<Utc>>,
    pub matricula_inmobiliaria: Option<String>,
    pub total_unidades: Option<i32>,
    pub created_at: DateTime<Utc>,
}

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = unidades, check_for_backend(diesel::pg::Pg))]
pub struct Unidad {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub numero: String,
    pub torre: Option<String>,
    pub piso: Option<i32>,
    pub tipo: TipoUnidad,
    pub coeficiente: bigdecimal::BigDecimal,
}
