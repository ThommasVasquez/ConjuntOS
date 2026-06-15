use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;
use bigdecimal::BigDecimal;

use crate::db::enums::{
    AccionParqueadero, CategoriaParqueadero, EstadoParqueadero, EstadoSolicitudParqueadero,
    TipoCeldaParqueadero, TipoRegistroParqueadero, TipoVehiculo,
};
use crate::domains::parqueadero::models::{
    Parqueadero, RondaParqueadero, SolicitudParqueadero, Vehiculo,
};

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct VehiculoDto {
    pub id: Uuid,
    pub placa: String,
    pub marca: Option<String>,
    pub modelo: Option<String>,
    pub color: Option<String>,
    pub tipo: TipoVehiculo,
    pub created_at: DateTime<Utc>,
}

impl From<Vehiculo> for VehiculoDto {
    fn from(v: Vehiculo) -> Self {
        Self {
            id: v.id,
            placa: v.placa,
            marca: v.marca,
            modelo: v.modelo,
            color: v.color,
            tipo: v.tipo,
            created_at: v.created_at,
        }
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateVehiculoRequest {
    pub placa: String,
    pub marca: Option<String>,
    pub modelo: Option<String>,
    pub color: Option<String>,
    pub tipo: TipoVehiculo,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CeldaDto {
    pub id: Uuid,
    pub numero: String,
    pub torre: Option<String>,
    pub tipo: TipoCeldaParqueadero,
    pub estado: EstadoParqueadero,
    pub categoria: CategoriaParqueadero,
    pub usuario_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub asignado_en: Option<DateTime<Utc>>,
    pub asignado_hasta: Option<DateTime<Utc>>,
}

impl From<Parqueadero> for CeldaDto {
    fn from(p: Parqueadero) -> Self {
        Self {
            id: p.id,
            numero: p.numero,
            torre: p.torre,
            tipo: p.tipo,
            estado: p.estado,
            categoria: p.categoria,
            usuario_id: p.usuario_id,
            created_at: p.created_at,
            asignado_en: p.asignado_en,
            asignado_hasta: p.asignado_hasta,
        }
    }
}

/// Asignación permanente de una celda a un residente con cláusula de tiempo.
/// `meses = None` o 0 → asignación sin fecha de vencimiento.
#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AsignarCeldaRequest {
    pub usuario_id: Uuid,
    pub meses: Option<i32>,
    /// Para celdas de VISITANTE: tiempo estimado en minutos (None = tiempo libre).
    pub estimado_minutos: Option<i32>,
    /// Placa del vehículo de la visita (opcional, informativo en la sesión).
    pub placa: Option<String>,
}

/// Crear una o varias celdas de parqueadero (admin/encargado).
/// Si se pasa `prefijo` + `cantidad`, genera celdas numeradas
/// (`prefijo`+1..=cantidad). Si se pasa `numero`, crea una sola.
#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateCeldaRequest {
    pub numero: Option<String>,
    pub torre: Option<String>,
    pub tipo: Option<TipoCeldaParqueadero>,
    pub categoria: Option<CategoriaParqueadero>,
    pub prefijo: Option<String>,
    pub cantidad: Option<i32>,
}

/// Permanent occupant summary joined from `usuarios`.
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct OcupanteDto {
    pub nombre: String,
    pub torre: Option<String>,
    pub apto: Option<String>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CeldaMapaDto {
    #[serde(flatten)]
    pub celda: CeldaDto,
    pub ocupante: Option<OcupanteDto>,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCeldaRequest {
    pub estado: EstadoParqueadero,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ParqueaderoMioDto {
    pub vehiculos: Vec<VehiculoDto>,
    pub celdas: Vec<CeldaDto>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RegistroDto {
    pub id: Uuid,
    pub parqueadero_id: Uuid,
    pub usuario_id: Uuid,
    pub tipo: TipoRegistroParqueadero,
    pub placa: Option<String>,
    pub observacion: Option<String>,
    pub fecha: DateTime<Utc>,
    pub celda_numero: String,
    pub celda_tipo: TipoCeldaParqueadero,
    pub usuario_nombre: String,
}

#[derive(Serialize, Deserialize, ToSchema, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HallazgoDto {
    pub descripcion: String,
    pub celda: Option<String>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RondaDto {
    pub id: Uuid,
    pub usuario_id: Uuid,
    pub fecha: DateTime<Utc>,
    pub hallazgos: Vec<HallazgoDto>,
    pub completada: bool,
}

impl From<RondaParqueadero> for RondaDto {
    fn from(r: RondaParqueadero) -> Self {
        let hallazgos = r
            .hallazgos
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();
        Self {
            id: r.id,
            usuario_id: r.usuario_id,
            fecha: r.fecha,
            hallazgos,
            completada: r.completada,
        }
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateRondaRequest {
    #[serde(default)]
    pub hallazgos: Vec<HallazgoDto>,
    pub completada: bool,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ParqueaderoStatsDto {
    pub total: i64,
    pub ocupados: i64,
    pub libres: i64,
    /// 0-100, rounded.
    pub porcentaje_ocupacion: i64,
}

/// Entrada del log inmutable de movimientos de celdas. Solo la ve el ADMIN.
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SolicitudDto {
    pub id: Uuid,
    pub parqueadero_id: Option<Uuid>,
    pub celda_numero: String,
    pub accion: AccionParqueadero,
    pub estado: EstadoSolicitudParqueadero,
    pub requiere_aprobacion: bool,
    pub detalle: String,
    pub payload: Option<serde_json::Value>,
    pub solicitante_id: Uuid,
    pub solicitante_nombre: String,
    pub solicitante_rol: String,
    pub creado_en: DateTime<Utc>,
    pub aprobador_id: Option<Uuid>,
    pub aprobador_nombre: Option<String>,
    pub resuelto_en: Option<DateTime<Utc>>,
    pub destinatario_id: Option<Uuid>,
    pub destinatario_nombre: Option<String>,
}

impl From<SolicitudParqueadero> for SolicitudDto {
    fn from(s: SolicitudParqueadero) -> Self {
        Self {
            id: s.id,
            parqueadero_id: s.parqueadero_id,
            celda_numero: s.celda_numero,
            accion: s.accion,
            estado: s.estado,
            requiere_aprobacion: s.requiere_aprobacion,
            detalle: s.detalle,
            payload: s.payload,
            solicitante_id: s.solicitante_id,
            solicitante_nombre: s.solicitante_nombre,
            solicitante_rol: s.solicitante_rol,
            creado_en: s.creado_en,
            aprobador_id: s.aprobador_id,
            aprobador_nombre: s.aprobador_nombre,
            resuelto_en: s.resuelto_en,
            destinatario_id: s.destinatario_id,
            destinatario_nombre: s.destinatario_nombre,
        }
    }
}

/// Editar el detalle de una entrada del log (solo super_admin).
#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EditarSolicitudRequest {
    pub detalle: String,
}

/// Respuesta de un movimiento de celda: o se ejecutó (celda devuelta) o quedó
/// pendiente de aprobación del admin (solicitud devuelta).
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MovimientoResultadoDto {
    /// true => quedó PENDIENTE de aprobación; false => se ejecutó de una.
    pub pendiente: bool,
    pub celda: Option<CeldaDto>,
    pub solicitud: Option<SolicitudDto>,
}

/// Sesión de cobro de una celda de visitante, con cálculo EN VIVO del tiempo
/// restante gratis y el monto acumulado (para el conteo regresivo en la app).
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SesionDto {
    pub id: Uuid,
    pub parqueadero_id: Option<Uuid>,
    pub celda_numero: String,
    pub residente_id: Uuid,
    pub residente_nombre: String,
    pub placa: Option<String>,
    pub estimado_minutos: Option<i32>,
    pub inicio: DateTime<Utc>,
    pub fin_gratis: DateTime<Utc>,
    pub minutos_gratis: i32,
    #[schema(value_type = String)]
    pub tarifa_hora: BigDecimal,
    pub estado: String,
    /// Segundos restantes de la ventana gratuita (0 si ya empezó el cobro).
    pub segundos_restantes_gratis: i64,
    /// true cuando ya pasó la ventana gratis y se está cobrando.
    pub en_cobro: bool,
    /// Minutos cobrables acumulados hasta ahora (0 durante la ventana gratis).
    pub minutos_cobrados: i32,
    /// Monto acumulado hasta ahora (prorrateado por minuto), en COP.
    #[schema(value_type = String)]
    pub monto_actual: BigDecimal,
    // Solo presentes si la sesión está CERRADA.
    pub cerrado_en: Option<DateTime<Utc>>,
    pub liquidacion: Option<String>,
    #[schema(value_type = Option<String>)]
    pub monto_final: Option<BigDecimal>,
}

/// Cómo se liquida una sesión al cerrarla (vehículo en portería).
#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CerrarSesionRequest {
    /// "VISITANTE_PAGO" (pagó en sitio) o "CARGADO_APTO" (pago al residente).
    pub liquidacion: String,
}

