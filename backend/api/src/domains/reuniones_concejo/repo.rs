use chrono::Utc;
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use uuid::Uuid;

use crate::db::schema::{reuniones_concejo, usuarios};
use crate::db::DbConn;

use super::dto::AsistenciaItemDto;
use super::models::{NewReunionConcejo, ReunionConcejo};

pub async fn create(conn: &mut DbConn, new_r: NewReunionConcejo) -> anyhow::Result<ReunionConcejo> {
    let r = diesel::insert_into(reuniones_concejo::table)
        .values(&new_r)
        .get_result::<ReunionConcejo>(conn)
        .await?;
    Ok(r)
}

pub async fn find_by_id(conn: &mut DbConn, id: Uuid) -> anyhow::Result<Option<ReunionConcejo>> {
    let r = reuniones_concejo::table
        .filter(reuniones_concejo::id.eq(id))
        .first::<ReunionConcejo>(conn)
        .await
        .optional()?;
    Ok(r)
}

pub async fn list_by_conjunto(
    conn: &mut DbConn,
    conjunto_id: Uuid,
) -> anyhow::Result<Vec<ReunionConcejo>> {
    let res = reuniones_concejo::table
        .filter(reuniones_concejo::conjunto_id.eq(conjunto_id))
        .order(reuniones_concejo::fecha_reunion.desc())
        .load::<ReunionConcejo>(conn)
        .await?;
    Ok(res)
}

pub async fn update_asistencia(
    conn: &mut DbConn,
    id: Uuid,
    user_id: Uuid,
    user_nombre: &str,
    confirmacion: &str,
    motivo_excusa: Option<String>,
) -> anyhow::Result<ReunionConcejo> {
    let r = find_by_id(conn, id).await?.ok_or_else(|| {
        anyhow::anyhow!("Reunión no encontrada")
    })?;

    let mut asistencias_vec: Vec<AsistenciaItemDto> =
        serde_json::from_value(r.asistencias.clone()).unwrap_or_default();

    let pos = asistencias_vec.iter().position(|a| a.usuario_id == user_id);

    let new_item = AsistenciaItemDto {
        usuario_id: user_id,
        usuario_nombre: user_nombre.to_string(),
        confirmacion: confirmacion.to_string(),
        motivo_excusa,
        asistio_real: None,
        updated_at: Utc::now(),
    };

    if let Some(idx) = pos {
        asistencias_vec[idx] = new_item;
    } else {
        asistencias_vec.push(new_item);
    }

    let json_val = serde_json::to_value(asistencias_vec)?;

    let updated = diesel::update(reuniones_concejo::table.filter(reuniones_concejo::id.eq(id)))
        .set((
            reuniones_concejo::asistencias.eq(json_val),
            reuniones_concejo::updated_at.eq(Utc::now()),
        ))
        .get_result::<ReunionConcejo>(conn)
        .await?;

    Ok(updated)
}

pub async fn update_estado(
    conn: &mut DbConn,
    id: Uuid,
    nuevo_estado: &str,
    acta_resumen: Option<String>,
) -> anyhow::Result<ReunionConcejo> {
    let updated = diesel::update(reuniones_concejo::table.filter(reuniones_concejo::id.eq(id)))
        .set((
            reuniones_concejo::estado.eq(nuevo_estado),
            reuniones_concejo::acta_resumen.eq(acta_resumen),
            reuniones_concejo::updated_at.eq(Utc::now()),
        ))
        .get_result::<ReunionConcejo>(conn)
        .await?;

    Ok(updated)
}

/// Helper: fetch all Council members (rol = 'CONCEJO') in copropiedad
pub async fn get_council_members(
    conn: &mut DbConn,
    conjunto_id: Uuid,
) -> anyhow::Result<Vec<(Uuid, String, String)>> {
    let res = usuarios::table
        .filter(usuarios::activo.eq(true))
        .filter(usuarios::rol.eq("CONCEJO"))
        .select((usuarios::id, usuarios::nombre, usuarios::email))
        .load::<(Uuid, String, String)>(conn)
        .await?;
    Ok(res)
}
