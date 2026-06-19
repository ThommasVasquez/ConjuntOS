use crate::db::enums::{CalidadMiembro, EstadoCasoConvivencia, TipoCasoConvivencia};
use crate::db::schema::{actas_convivencia, casos_convivencia, comite_historicos, comite_miembros, firmas_actas};
use chrono::{DateTime, NaiveDate, Utc};
use diesel::prelude::*;
use uuid::Uuid;

// ── Comité ────────────────────────────────────────────────────────────────

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = comite_historicos, check_for_backend(diesel::pg::Pg))]
pub struct ComiteHistorico {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub periodo_inicio: NaiveDate,
    pub periodo_fin: NaiveDate,
    pub elegido_en_asamblea_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = comite_historicos)]
pub struct NuevoComiteHistorico {
    pub conjunto_id: Uuid,
    pub periodo_inicio: NaiveDate,
    pub periodo_fin: NaiveDate,
    pub elegido_en_asamblea_id: Option<Uuid>,
}

#[derive(Queryable, Selectable, Identifiable, Associations, Debug, Clone)]
#[diesel(belongs_to(ComiteHistorico, foreign_key = comite_historico_id))]
#[diesel(table_name = comite_miembros, check_for_backend(diesel::pg::Pg))]
pub struct ComiteMiembro {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub comite_historico_id: Uuid,
    pub usuario_id: Uuid,
    pub calidad: CalidadMiembro,
    pub unidad_id: Uuid,
    pub activo: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = comite_miembros)]
pub struct NuevoComiteMiembro {
    pub conjunto_id: Uuid,
    pub comite_historico_id: Uuid,
    pub usuario_id: Uuid,
    pub calidad: CalidadMiembro,
    pub unidad_id: Uuid,
}

// ── Casos ──────────────────────────────────────────────────────────────────

#[derive(Queryable, Selectable, Identifiable, QueryableByName, Debug, Clone)]
#[diesel(table_name = casos_convivencia, check_for_backend(diesel::pg::Pg))]
pub struct CasoConvivencia {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub tipo: TipoCasoConvivencia,
    pub descripcion: String,
    pub unidad_reporta_id: Uuid,
    pub unidad_reportada_id: Option<Uuid>,
    pub creado_por: Uuid,
    pub miembro_asignado_id: Option<Uuid>,
    pub estado: EstadoCasoConvivencia,
    pub resolucion: Option<String>,
    pub sesion_mediacion_fecha: Option<NaiveDate>,
    pub sesion_mediacion_notas: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = casos_convivencia)]
pub struct NuevoCasoConvivencia {
    pub conjunto_id: Uuid,
    pub tipo: TipoCasoConvivencia,
    pub descripcion: String,
    pub unidad_reporta_id: Uuid,
    pub unidad_reportada_id: Option<Uuid>,
    pub creado_por: Uuid,
}

// ── Actas ──────────────────────────────────────────────────────────────────

#[derive(Queryable, Selectable, Identifiable, Associations, Debug, Clone)]
#[diesel(belongs_to(CasoConvivencia, foreign_key = caso_id))]
#[diesel(table_name = actas_convivencia, check_for_backend(diesel::pg::Pg))]
pub struct ActaConvivencia {
    pub id: Uuid,
    pub caso_id: Uuid,
    pub contenido: String,
    pub pdf_url: Option<String>,
    pub firmada: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = actas_convivencia)]
pub struct NuevaActaConvivencia {
    pub caso_id: Uuid,
    pub contenido: String,
}

// ── Firmas ─────────────────────────────────────────────────────────────────

#[derive(Queryable, Selectable, Identifiable, Associations, Debug, Clone)]
#[diesel(belongs_to(ActaConvivencia, foreign_key = acta_id))]
#[diesel(table_name = firmas_actas, check_for_backend(diesel::pg::Pg))]
pub struct FirmaActa {
    pub id: Uuid,
    pub acta_id: Uuid,
    pub usuario_id: Uuid,
    pub tipo: String,
    pub firmado_en: DateTime<Utc>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = firmas_actas)]
pub struct NuevaFirmaActa {
    pub acta_id: Uuid,
    pub usuario_id: Uuid,
    pub tipo: String,
}
