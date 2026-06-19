use chrono::NaiveDate;
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use uuid::Uuid;

use super::dto::{StatsConvivencia, UnidadEmbed, UsuarioEmbed};
use super::models::{
    ActaConvivencia, CasoConvivencia, ComiteHistorico, ComiteMiembro, FirmaActa,
    NuevaActaConvivencia, NuevoCasoConvivencia, NuevoComiteHistorico, NuevoComiteMiembro,
    NuevaFirmaActa,
};
use crate::db::enums::{CalidadMiembro, EstadoCasoConvivencia};
use crate::db::schema::{
    actas_convivencia, casos_convivencia, comite_historicos, comite_miembros, firmas_actas,
    unidades, usuarios,
};
use crate::db::DbConn;
use crate::error::{ApiError, ApiResult};

// ═══════════════════════════════════════════════════════════════════════════
// Comité
// ═══════════════════════════════════════════════════════════════════════════

pub async fn crear_comite(
    conn: &mut DbConn,
    nuevo: NuevoComiteHistorico,
) -> ApiResult<ComiteHistorico> {
    diesel::insert_into(comite_historicos::table)
        .values(&nuevo)
        .returning(ComiteHistorico::as_returning())
        .get_result(conn)
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("Error creando comité: {e}")))
}

pub async fn comite_actual(
    conn: &mut DbConn,
    conjunto_id: Uuid,
) -> ApiResult<Option<ComiteHistorico>> {
    let hoy = chrono::Utc::now().date_naive();
    comite_historicos::table
        .filter(comite_historicos::conjunto_id.eq(conjunto_id))
        .filter(comite_historicos::periodo_inicio.le(hoy))
        .filter(comite_historicos::periodo_fin.ge(hoy))
        .first(conn)
        .await
        .optional()
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("Error buscando comité actual: {e}")))
}

pub async fn miembros_activos(
    conn: &mut DbConn,
    comite_historico_id: Uuid,
) -> ApiResult<Vec<ComiteMiembro>> {
    comite_miembros::table
        .filter(comite_miembros::comite_historico_id.eq(comite_historico_id))
        .filter(comite_miembros::activo.eq(true))
        .load(conn)
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("Error listando miembros: {e}")))
}

pub async fn contar_miembros_activos(
    conn: &mut DbConn,
    comite_historico_id: Uuid,
) -> ApiResult<i64> {
    use diesel::dsl::count;
    comite_miembros::table
        .filter(comite_miembros::comite_historico_id.eq(comite_historico_id))
        .filter(comite_miembros::activo.eq(true))
        .count()
        .get_result(conn)
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("Error contando miembros: {e}")))
}

pub async fn agregar_miembro(
    conn: &mut DbConn,
    nuevo: NuevoComiteMiembro,
) -> ApiResult<ComiteMiembro> {
    diesel::insert_into(comite_miembros::table)
        .values(&nuevo)
        .returning(ComiteMiembro::as_returning())
        .get_result(conn)
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("Error agregando miembro: {e}")))
}

pub async fn desactivar_miembro(
    conn: &mut DbConn,
    miembro_id: Uuid,
) -> ApiResult<()> {
    diesel::update(comite_miembros::table.filter(comite_miembros::id.eq(miembro_id)))
        .set(comite_miembros::activo.eq(false))
        .execute(conn)
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("Error desactivando miembro: {e}")))?;
    Ok(())
}

pub async fn historico_comites(
    conn: &mut DbConn,
    conjunto_id: Uuid,
) -> ApiResult<Vec<ComiteHistorico>> {
    comite_historicos::table
        .filter(comite_historicos::conjunto_id.eq(conjunto_id))
        .order(comite_historicos::periodo_inicio.desc())
        .load(conn)
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("Error listando comités: {e}")))
}

// ═══════════════════════════════════════════════════════════════════════════
// Casos
// ═══════════════════════════════════════════════════════════════════════════

pub async fn crear_caso(
    conn: &mut DbConn,
    nuevo: NuevoCasoConvivencia,
) -> ApiResult<CasoConvivencia> {
    diesel::insert_into(casos_convivencia::table)
        .values(&nuevo)
        .returning(CasoConvivencia::as_returning())
        .get_result(conn)
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("Error creando caso: {e}")))
}

pub async fn listar_casos(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    estado: Option<EstadoCasoConvivencia>,
) -> ApiResult<Vec<CasoConvivencia>> {
    let mut query = casos_convivencia::table
        .filter(casos_convivencia::conjunto_id.eq(conjunto_id))
        .order(casos_convivencia::created_at.desc())
        .into_boxed();
    if let Some(e) = estado {
        query = query.filter(casos_convivencia::estado.eq(e));
    }
    query
        .load(conn)
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("Error listando casos: {e}")))
}

pub async fn caso_por_id(
    conn: &mut DbConn,
    caso_id: Uuid,
) -> ApiResult<Option<CasoConvivencia>> {
    casos_convivencia::table
        .filter(casos_convivencia::id.eq(caso_id))
        .first(conn)
        .await
        .optional()
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("Error buscando caso: {e}")))
}

pub async fn asignar_miembro(
    conn: &mut DbConn,
    caso_id: Uuid,
    miembro_id: Uuid,
) -> ApiResult<CasoConvivencia> {
    diesel::update(casos_convivencia::table.filter(casos_convivencia::id.eq(caso_id)))
        .set((
            casos_convivencia::miembro_asignado_id.eq(Some(miembro_id)),
            casos_convivencia::estado.eq(EstadoCasoConvivencia::Asignado),
            casos_convivencia::updated_at.eq(diesel::dsl::now),
        ))
        .returning(CasoConvivencia::as_returning())
        .get_result(conn)
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("Error asignando miembro: {e}")))
}

pub async fn actualizar_caso(
    conn: &mut DbConn,
    caso_id: Uuid,
    estado: Option<EstadoCasoConvivencia>,
    resolucion: Option<Option<String>>,
) -> ApiResult<CasoConvivencia> {
    use diesel::dsl::now;
    // Build update via raw diesel to support optional fields cleanly
    let mut sql = String::from("UPDATE casos_convivencia SET updated_at = now()");
    if let Some(ref e) = estado {
        sql.push_str(&format!(", estado = '{}'", e.as_str()));
    }
    if let Some(ref r) = resolucion {
        sql.push_str(", resolucion = ");
        if let Some(val) = r {
            sql.push_str(&format!("'{}'", val.replace('\'', "''")));
        } else {
            sql.push_str("NULL");
        }
    }
    sql.push_str(&format!(" WHERE id = '{}' RETURNING *", caso_id));
    let caso: CasoConvivencia = diesel::sql_query(&sql)
        .get_result(conn)
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("Error actualizando caso: {e}")))?;
    Ok(caso)
}

pub async fn registrar_mediacion(
    conn: &mut DbConn,
    caso_id: Uuid,
    fecha: NaiveDate,
    notas: String,
    nuevo_estado: EstadoCasoConvivencia,
) -> ApiResult<CasoConvivencia> {
    diesel::update(casos_convivencia::table.filter(casos_convivencia::id.eq(caso_id)))
        .set((
            casos_convivencia::sesion_mediacion_fecha.eq(Some(fecha)),
            casos_convivencia::sesion_mediacion_notas.eq(Some(notas)),
            casos_convivencia::estado.eq(nuevo_estado),
            casos_convivencia::updated_at.eq(diesel::dsl::now),
        ))
        .returning(CasoConvivencia::as_returning())
        .get_result(conn)
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("Error registrando mediación: {e}")))
}

// ═══════════════════════════════════════════════════════════════════════════
// Actas
// ═══════════════════════════════════════════════════════════════════════════

pub async fn crear_acta(
    conn: &mut DbConn,
    nueva: NuevaActaConvivencia,
) -> ApiResult<ActaConvivencia> {
    diesel::insert_into(actas_convivencia::table)
        .values(&nueva)
        .returning(ActaConvivencia::as_returning())
        .get_result(conn)
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("Error creando acta: {e}")))
}

pub async fn acta_por_id(
    conn: &mut DbConn,
    acta_id: Uuid,
) -> ApiResult<Option<ActaConvivencia>> {
    actas_convivencia::table
        .filter(actas_convivencia::id.eq(acta_id))
        .first(conn)
        .await
        .optional()
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("Error buscando acta: {e}")))
}

pub async fn acta_por_caso(
    conn: &mut DbConn,
    caso_id: Uuid,
) -> ApiResult<Option<ActaConvivencia>> {
    actas_convivencia::table
        .filter(actas_convivencia::caso_id.eq(caso_id))
        .order(actas_convivencia::created_at.desc())
        .first(conn)
        .await
        .optional()
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("Error buscando acta: {e}")))
}

pub async fn firmar_acta(
    conn: &mut DbConn,
    nueva: NuevaFirmaActa,
) -> ApiResult<FirmaActa> {
    diesel::insert_into(firmas_actas::table)
        .values(&nueva)
        .returning(FirmaActa::as_returning())
        .get_result(conn)
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("Error firmando acta: {e}")))
}

pub async fn firmas_por_acta(
    conn: &mut DbConn,
    acta_id: Uuid,
) -> ApiResult<Vec<FirmaActa>> {
    firmas_actas::table
        .filter(firmas_actas::acta_id.eq(acta_id))
        .order(firmas_actas::firmado_en.asc())
        .load(conn)
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("Error listando firmas: {e}")))
}

pub async fn marcar_acta_firmada(
    conn: &mut DbConn,
    acta_id: Uuid,
) -> ApiResult<()> {
    diesel::update(actas_convivencia::table.filter(actas_convivencia::id.eq(acta_id)))
        .set(actas_convivencia::firmada.eq(true))
        .execute(conn)
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("Error marcando acta firmada: {e}")))?;
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════
// Stats
// ═══════════════════════════════════════════════════════════════════════════

pub async fn stats_convivencia(
    conn: &mut DbConn,
    conjunto_id: Uuid,
) -> ApiResult<StatsConvivencia> {
    use diesel::dsl::count;
    let base = casos_convivencia::table.filter(casos_convivencia::conjunto_id.eq(conjunto_id));

    let total = base.clone().count().get_result(conn).await.unwrap_or(0);
    let reportados = base.clone().filter(casos_convivencia::estado.eq(EstadoCasoConvivencia::Reportado.as_str())).count().get_result(conn).await.unwrap_or(0);
    let asignados = base.clone().filter(casos_convivencia::estado.eq(EstadoCasoConvivencia::Asignado.as_str())).count().get_result(conn).await.unwrap_or(0);
    let en_mediacion = base.clone().filter(casos_convivencia::estado.eq(EstadoCasoConvivencia::EnMediacion.as_str())).count().get_result(conn).await.unwrap_or(0);
    let acuerdos = base.clone().filter(casos_convivencia::estado.eq(EstadoCasoConvivencia::Acuerdo.as_str())).count().get_result(conn).await.unwrap_or(0);
    let sin_acuerdo = base.clone().filter(casos_convivencia::estado.eq(EstadoCasoConvivencia::SinAcuerdo.as_str())).count().get_result(conn).await.unwrap_or(0);
    let escalados = base.filter(casos_convivencia::estado.eq(EstadoCasoConvivencia::Escalado.as_str())).count().get_result(conn).await.unwrap_or(0);

    Ok(StatsConvivencia { total, reportados, asignados, en_mediacion, acuerdos, sin_acuerdo, escalados })
}

// ═══════════════════════════════════════════════════════════════════════════
// Embed helpers
// ═══════════════════════════════════════════════════════════════════════════

pub async fn unidad_embed(conn: &mut DbConn, unidad_id: Uuid) -> ApiResult<UnidadEmbed> {
    let (id, torre, numero): (Uuid, Option<String>, String) = unidades::table
        .filter(unidades::id.eq(unidad_id))
        .select((unidades::id, unidades::torre, unidades::numero))
        .first(conn)
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("Error buscando unidad: {e}")))?;
    let nombre_residente = usuarios::table
        .filter(usuarios::unidad_id.eq(unidad_id))
        .filter(usuarios::rol.eq_any(["PROPIETARIO", "ARRENDATARIO"]))
        .select(usuarios::nombre)
        .first(conn)
        .await
        .optional()
        .unwrap_or(None);
    Ok(UnidadEmbed { id, torre, numero, nombre_residente })
}

pub async fn usuario_embed(conn: &mut DbConn, usuario_id: Uuid) -> ApiResult<UsuarioEmbed> {
    let (id, nombre, email, telefono): (Uuid, String, String, Option<String>) = usuarios::table
        .filter(usuarios::id.eq(usuario_id))
        .select((usuarios::id, usuarios::nombre, usuarios::email, usuarios::telefono))
        .first(conn)
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("Error buscando usuario: {e}")))?;
    Ok(UsuarioEmbed { id, nombre, email, telefono })
}

/// List all unidades in a conjunto with resident info (for dropdowns).
pub async fn listar_unidades_convivencia(
    conn: &mut DbConn,
    conjunto_id: Uuid,
) -> ApiResult<Vec<UnidadEmbed>> {
    use crate::db::schema::unidades as u;
    let rows: Vec<(Uuid, Option<String>, String)> = u::table
        .filter(u::conjunto_id.eq(conjunto_id))
        .select((u::id, u::torre, u::numero))
        .order_by(u::numero.asc())
        .load(conn)
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("Error listando unidades: {e}")))?;
    let mut result = vec![];
    for (id, torre, numero) in rows {
        let nombre_residente = usuarios::table
            .filter(usuarios::unidad_id.eq(id))
            .filter(usuarios::rol.eq_any(["PROPIETARIO", "ARRENDATARIO"]))
            .select(usuarios::nombre)
            .first(conn)
            .await
            .optional()
            .unwrap_or(None);
        result.push(UnidadEmbed { id, torre, numero, nombre_residente });
    }
    Ok(result)
}
