use chrono::{DateTime, Utc};
use diesel::prelude::*;
use uuid::Uuid;

use crate::db::enums::{
    AccionParqueadero, CategoriaParqueadero, EstadoParqueadero, EstadoSolicitudParqueadero,
    TipoCeldaParqueadero, TipoRegistroParqueadero, TipoVehiculo,
};
use crate::db::schema::{
    parqueaderos, registros_parqueadero, rondas_parqueadero, sesiones_parqueadero,
    solicitudes_parqueadero, vehiculos,
};

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = vehiculos, check_for_backend(diesel::pg::Pg))]
pub struct Vehiculo {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub usuario_id: Uuid,
    pub placa: String,
    pub marca: Option<String>,
    pub modelo: Option<String>,
    pub color: Option<String>,
    pub tipo: TipoVehiculo,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = vehiculos)]
pub struct NuevoVehiculo {
    pub conjunto_id: Uuid,
    pub usuario_id: Uuid,
    pub placa: String,
    pub marca: Option<String>,
    pub modelo: Option<String>,
    pub color: Option<String>,
    pub tipo: TipoVehiculo,
}

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = parqueaderos, check_for_backend(diesel::pg::Pg))]
pub struct Parqueadero {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub numero: String,
    pub torre: Option<String>,
    pub tipo: TipoCeldaParqueadero,
    pub estado: EstadoParqueadero,
    pub usuario_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub asignado_en: Option<DateTime<Utc>>,
    pub asignado_hasta: Option<DateTime<Utc>>,
    pub categoria: CategoriaParqueadero,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = parqueaderos)]
pub struct NuevaCelda {
    pub conjunto_id: Uuid,
    pub numero: String,
    pub torre: Option<String>,
    pub tipo: TipoCeldaParqueadero,
    pub estado: EstadoParqueadero,
    pub categoria: CategoriaParqueadero,
}

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = registros_parqueadero, check_for_backend(diesel::pg::Pg))]
pub struct RegistroParqueadero {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub parqueadero_id: Uuid,
    pub usuario_id: Uuid,
    pub tipo: TipoRegistroParqueadero,
    pub placa: Option<String>,
    pub observacion: Option<String>,
    pub fecha: DateTime<Utc>,
}

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = rondas_parqueadero, check_for_backend(diesel::pg::Pg))]
pub struct RondaParqueadero {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub usuario_id: Uuid,
    pub fecha: DateTime<Utc>,
    /// `Vec<HallazgoDto>` validated at the boundary (Law 6).
    pub hallazgos: Option<serde_json::Value>,
    pub completada: bool,
}

/// Log inmutable de movimientos de celdas (auditoría + flujo de aprobación).
/// Solo ADMINISTRADOR puede verlo; solo SUPER_ADMIN editar/borrar.
#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = solicitudes_parqueadero, check_for_backend(diesel::pg::Pg))]
pub struct SolicitudParqueadero {
    pub id: Uuid,
    pub conjunto_id: Uuid,
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

#[derive(Insertable, Debug)]
#[diesel(table_name = solicitudes_parqueadero)]
pub struct NuevaSolicitud {
    pub conjunto_id: Uuid,
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
    pub destinatario_id: Option<Uuid>,
    pub destinatario_nombre: Option<String>,
}

/// Sesión de cobro de una celda de VISITANTE. Arranca al aprobar el inquilino;
/// 2h gratis y luego tarifa/hora prorrateada por minuto. Se congela al liberar.
#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = sesiones_parqueadero, check_for_backend(diesel::pg::Pg))]
pub struct SesionParqueadero {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub parqueadero_id: Option<Uuid>,
    pub celda_numero: String,
    pub solicitud_id: Option<Uuid>,
    pub residente_id: Uuid,
    pub residente_nombre: String,
    pub unidad_id: Option<Uuid>,
    pub placa: Option<String>,
    pub estimado_minutos: Option<i32>,
    pub inicio: DateTime<Utc>,
    pub minutos_gratis: i32,
    pub fin_gratis: DateTime<Utc>,
    pub tarifa_hora: bigdecimal::BigDecimal,
    pub aviso_20_enviado: bool,
    pub aviso_cobro_enviado: bool,
    pub estado: String,
    pub cerrado_en: Option<DateTime<Utc>>,
    pub minutos_cobrados: Option<i32>,
    pub monto: Option<bigdecimal::BigDecimal>,
    pub liquidacion: Option<String>,
    pub pago_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub cargo_resuelto_en: Option<DateTime<Utc>>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = sesiones_parqueadero)]
pub struct NuevaSesion {
    pub conjunto_id: Uuid,
    pub parqueadero_id: Option<Uuid>,
    pub celda_numero: String,
    pub solicitud_id: Option<Uuid>,
    pub residente_id: Uuid,
    pub residente_nombre: String,
    pub unidad_id: Option<Uuid>,
    pub placa: Option<String>,
    pub estimado_minutos: Option<i32>,
    pub inicio: DateTime<Utc>,
    pub minutos_gratis: i32,
    pub fin_gratis: DateTime<Utc>,
    pub tarifa_hora: bigdecimal::BigDecimal,
}
