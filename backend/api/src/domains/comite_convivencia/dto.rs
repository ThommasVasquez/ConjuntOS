use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use super::models::{ActaConvivencia, CasoConvivencia, ComiteHistorico, ComiteMiembro, FirmaActa};
use crate::db::enums::{CalidadMiembro, EstadoCasoConvivencia, TipoCasoConvivencia};

// ── Embedded helpers ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct UnidadEmbed {
    pub id: Uuid,
    pub torre: Option<String>,
    pub numero: String,
    pub nombre_residente: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct UsuarioEmbed {
    pub id: Uuid,
    pub nombre: String,
    pub email: String,
    pub telefono: Option<String>,
}

// ── Comité ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ComiteHistoricoDto {
    pub id: Uuid,
    pub periodo_inicio: NaiveDate,
    pub periodo_fin: NaiveDate,
    pub elegido_en_asamblea_id: Option<Uuid>,
    pub miembros: Vec<MiembroComiteDto>,
    pub created_at: DateTime<Utc>,
}

impl ComiteHistoricoDto {
    pub fn from_model(historico: ComiteHistorico, miembros: Vec<MiembroComiteDto>) -> Self {
        Self {
            id: historico.id,
            periodo_inicio: historico.periodo_inicio,
            periodo_fin: historico.periodo_fin,
            elegido_en_asamblea_id: historico.elegido_en_asamblea_id,
            miembros,
            created_at: historico.created_at,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct MiembroComiteDto {
    pub id: Uuid,
    pub usuario_id: Uuid,
    pub usuario: UsuarioEmbed,
    pub calidad: CalidadMiembro,
    pub unidad: UnidadEmbed,
    pub activo: bool,
}

impl MiembroComiteDto {
    pub fn from_model(miembro: ComiteMiembro, usuario: UsuarioEmbed, unidad: UnidadEmbed) -> Self {
        Self {
            id: miembro.id,
            usuario_id: miembro.usuario_id,
            usuario,
            calidad: miembro.calidad,
            unidad,
            activo: miembro.activo,
        }
    }
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct CrearComiteRequest {
    pub periodo_inicio: NaiveDate,
    pub periodo_fin: NaiveDate,
    pub elegido_en_asamblea_id: Option<Uuid>,
    pub miembros: Vec<AgregarMiembroRequest>,
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct AgregarMiembroRequest {
    pub usuario_id: Uuid,
    pub calidad: CalidadMiembro,
    pub unidad_id: Uuid,
}

// ── Casos ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CasoConvivenciaDto {
    pub id: Uuid,
    pub tipo: TipoCasoConvivencia,
    pub descripcion: String,
    pub unidad_reporta: UnidadEmbed,
    pub unidad_reportada: Option<UnidadEmbed>,
    pub creado_por: UsuarioEmbed,
    pub miembro_asignado: Option<UsuarioEmbed>,
    pub estado: EstadoCasoConvivencia,
    pub resolucion: Option<String>,
    pub sesion_mediacion_fecha: Option<NaiveDate>,
    pub sesion_mediacion_notas: Option<String>,
    pub acta: Option<ActaConvivenciaDto>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl CasoConvivenciaDto {
    pub fn from_model(
        caso: CasoConvivencia,
        unidad_reporta: UnidadEmbed,
        unidad_reportada: Option<UnidadEmbed>,
        creador: UsuarioEmbed,
        miembro_asignado: Option<UsuarioEmbed>,
        acta: Option<ActaConvivenciaDto>,
    ) -> Self {
        Self {
            id: caso.id,
            tipo: caso.tipo,
            descripcion: caso.descripcion,
            unidad_reporta,
            unidad_reportada,
            creado_por: creador,
            miembro_asignado,
            estado: caso.estado,
            resolucion: caso.resolucion,
            sesion_mediacion_fecha: caso.sesion_mediacion_fecha,
            sesion_mediacion_notas: caso.sesion_mediacion_notas,
            acta,
            created_at: caso.created_at,
            updated_at: caso.updated_at,
        }
    }
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct CrearCasoRequest {
    pub tipo: TipoCasoConvivencia,
    pub descripcion: String,
    pub unidad_reporta_id: Uuid,
    pub unidad_reportada_id: Option<Uuid>,
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct ActualizarCasoRequest {
    pub estado: Option<EstadoCasoConvivencia>,
    pub resolucion: Option<String>,
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct AsignarMiembroRequest {
    pub miembro_id: Uuid,
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct RegistrarMediacionRequest {
    pub fecha: NaiveDate,
    pub notas: String,
    pub resultado: EstadoCasoConvivencia, // ACUERDO or SIN_ACUERDO
}

// ── Actas ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ActaConvivenciaDto {
    pub id: Uuid,
    pub caso_id: Uuid,
    pub contenido: String,
    pub pdf_url: Option<String>,
    pub firmada: bool,
    pub firmas: Vec<FirmaActaDto>,
    pub created_at: DateTime<Utc>,
}

impl ActaConvivenciaDto {
    pub fn from_model(acta: ActaConvivencia, firmas: Vec<FirmaActaDto>) -> Self {
        Self {
            id: acta.id,
            caso_id: acta.caso_id,
            contenido: acta.contenido,
            pdf_url: acta.pdf_url,
            firmada: acta.firmada,
            firmas,
            created_at: acta.created_at,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct FirmaActaDto {
    pub id: Uuid,
    pub usuario: UsuarioEmbed,
    pub tipo: String,
    pub firmado_en: DateTime<Utc>,
}

impl FirmaActaDto {
    pub fn from_model(firma: FirmaActa, usuario: UsuarioEmbed) -> Self {
        Self {
            id: firma.id,
            usuario,
            tipo: firma.tipo,
            firmado_en: firma.firmado_en,
        }
    }
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct FirmarActaRequest {
    pub tipo: String, // PARTE_REPORTANTE | PARTE_REPORTADA | MIEMBRO_COMITE | ADMINISTRADOR
}

// ── Stats ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct StatsConvivencia {
    pub total: i64,
    pub reportados: i64,
    pub asignados: i64,
    pub en_mediacion: i64,
    pub acuerdos: i64,
    pub sin_acuerdo: i64,
    pub escalados: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ComiteActualDto {
    pub comite: ComiteHistoricoDto,
    pub dias_restantes: i64,
    pub alerta_vencimiento: bool,
}
