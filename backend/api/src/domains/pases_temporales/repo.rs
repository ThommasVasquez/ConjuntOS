use crate::db::enums::EstadoPaseTemporal;
use crate::db::schema::{pases_temporales, usuarios};
use crate::db::DbConn;
use crate::domains::pases_temporales::models::{
    NuevoPaseTemporal, NuevoVehiculoTemporal, PaseTemporal, PaseTemporalUsuario, VehiculoTemporal,
};
use crate::domains::usuarios::models::Usuario;
use crate::error::{ApiError, ApiResult};
use chrono::Utc;
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use uuid::Uuid;

pub async fn crear_pase(
    conn: &mut DbConn,
    data: NuevoPaseTemporal,
) -> ApiResult<PaseTemporal> {
    use crate::db::schema::pases_temporales::dsl::*;
    Ok(diesel::insert_into(pases_temporales)
        .values(&data)
        .returning(PaseTemporal::as_returning())
        .get_result(conn)
        .await?)
}

pub async fn pases_por_propietario(
    conn: &mut DbConn,
    propietario: Uuid,
) -> ApiResult<Vec<PaseTemporal>> {
    use crate::db::schema::pases_temporales::dsl::*;
    Ok(pases_temporales
        .filter(propietario_id.eq(propietario))
        .order(created_at.desc())
        .select(PaseTemporal::as_select())
        .load(conn)
        .await?)
}

pub async fn pase_por_codigo(
    conn: &mut DbConn,
    codigo: &str,
) -> ApiResult<Option<PaseTemporal>> {
    use crate::db::schema::pases_temporales::dsl::*;
    Ok(pases_temporales
        .filter(codigo_acceso.eq(codigo))
        .select(PaseTemporal::as_select())
        .first(conn)
        .await
        .optional()?)
}

pub async fn pase_por_id(
    conn: &mut DbConn,
    pase_id: Uuid,
) -> ApiResult<Option<PaseTemporal>> {
    use crate::db::schema::pases_temporales::dsl::*;
    Ok(pases_temporales
        .filter(id.eq(pase_id))
        .select(PaseTemporal::as_select())
        .first(conn)
        .await
        .optional()?)
}

pub async fn revocar_pase(conn: &mut DbConn, pase_id: Uuid) -> ApiResult<()> {
    use crate::db::schema::pases_temporales::dsl::*;

    // Buscar el usuario vinculado antes de revocar
    let pase: PaseTemporalUsuario = pases_temporales
        .filter(id.eq(pase_id))
        .select(PaseTemporalUsuario::as_select())
        .first(conn)
        .await?;

    diesel::update(pases_temporales.filter(id.eq(pase_id)))
        .set(estado.eq(EstadoPaseTemporal::Revocado))
        .execute(conn)
        .await?;

    // Desactivar el usuario huésped vinculado
    if let Some(uid) = pase.usuario_id {
        diesel::update(usuarios::table.filter(usuarios::id.eq(uid)))
            .set(usuarios::activo.eq(false))
            .execute(conn)
            .await?;
    }

    Ok(())
}

pub async fn vehiculos_por_pase(
    conn: &mut DbConn,
    pase: Uuid,
) -> ApiResult<Vec<VehiculoTemporal>> {
    use crate::db::schema::vehiculos_temporales::dsl::*;
    Ok(vehiculos_temporales
        .filter(pase_id.eq(pase))
        .select(VehiculoTemporal::as_select())
        .load(conn)
        .await?)
}

pub async fn crear_vehiculo(
    conn: &mut DbConn,
    data: NuevoVehiculoTemporal,
) -> ApiResult<VehiculoTemporal> {
    use crate::db::schema::vehiculos_temporales::dsl::*;
    Ok(diesel::insert_into(vehiculos_temporales)
        .values(&data)
        .returning(VehiculoTemporal::as_returning())
        .get_result(conn)
        .await?)
}

// ── Funciones de huésped temporal ──────────────────────────────────────

/// Crea o reactiva un usuario HUESPED_TEMPORAL vinculado a un pase.
/// Si el email ya existe, actualiza password y activa.
/// Si no, crea un usuario nuevo con rol HUESPED_TEMPORAL.
pub async fn upsert_usuario_huesped(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    nombre: &str,
    email: &str,
    password_hash: &str,
    unidad_id: Uuid,
) -> ApiResult<Usuario> {
    // Buscar existente por email en el mismo conjunto
    let existente = usuarios::table
        .filter(usuarios::email.eq(email))
        .filter(usuarios::conjunto_id.eq(conjunto_id))
        .select(Usuario::as_select())
        .first(conn)
        .await
        .optional()?;

    if let Some(user) = existente {
        // Reactivar: nueva contraseña + activo = true
        diesel::update(usuarios::table.filter(usuarios::id.eq(user.id)))
            .set((
                usuarios::password_hash.eq(password_hash),
                usuarios::activo.eq(true),
            ))
            .execute(conn)
            .await?;
        Ok(Usuario {
            activo: true,
            password_hash: password_hash.to_string(),
            ..user
        })
    } else {
        // Generar numero_interno autoincremental para el conjunto
        let max_num: Option<String> = usuarios::table
            .filter(usuarios::conjunto_id.eq(conjunto_id))
            .select(usuarios::numero_interno)
            .order(usuarios::numero_interno.desc())
            .first(conn)
            .await
            .optional()?;
        let next_num = match max_num {
            Some(s) => {
                let n: i32 = s.parse().unwrap_or(9999);
                format!("{:04}", (n + 1).min(9999))
            }
            None => "0001".to_string(),
        };

        // Crear nuevo usuario HUESPED_TEMPORAL
        diesel::insert_into(usuarios::table)
            .values((
                usuarios::conjunto_id.eq(conjunto_id),
                usuarios::nombre.eq(nombre),
                usuarios::email.eq(email),
                usuarios::password_hash.eq(password_hash),
                usuarios::rol.eq("HUESPED_TEMPORAL"),
                usuarios::unidad_id.eq(unidad_id),
                usuarios::activo.eq(true),
                usuarios::numero_interno.eq(&next_num),
            ))
            .returning(Usuario::as_returning())
            .get_result(conn)
            .await
            .map_err(|e| {
                if e.to_string().contains("unique") || e.to_string().contains("duplicate") {
                    ApiError::BadRequest("Ya existe un usuario con ese email".into())
                } else {
                    ApiError::from(e)
                }
            })
    }
}

/// Vincula un pase temporal a un usuario huésped.
pub async fn vincular_usuario(
    conn: &mut DbConn,
    pase_id: Uuid,
    usuario: Uuid,
) -> ApiResult<()> {
    use crate::db::schema::pases_temporales::dsl::*;
    diesel::update(pases_temporales.filter(id.eq(pase_id)))
        .set(usuario_id.eq(Some(usuario)))
        .execute(conn)
        .await?;
    Ok(())
}

/// Desactiva usuarios cuyos pases ya expiraron. Retorna el conteo.
pub async fn desactivar_usuarios_expirados(conn: &mut DbConn) -> ApiResult<u64> {
    use crate::db::schema::pases_temporales::dsl::*;

    let hoy = Utc::now().date_naive();

    // Buscar pases expirados que tienen usuario vinculado
    let usuarios_a_desactivar: Vec<Uuid> = pases_temporales
        .filter(fecha_fin.lt(hoy))
        .filter(estado.eq(EstadoPaseTemporal::Activo))
        .filter(usuario_id.is_not_null())
        .select(PaseTemporalUsuario::as_select())
        .load::<PaseTemporalUsuario>(conn)
        .await?
        .into_iter()
        .filter_map(|p| p.usuario_id)
        .collect();

    let count = usuarios_a_desactivar.len() as u64;

    // Marcar pases como expirados
    diesel::update(
        pases_temporales
            .filter(fecha_fin.lt(hoy))
            .filter(estado.eq(EstadoPaseTemporal::Activo)),
    )
    .set(estado.eq(EstadoPaseTemporal::Expirado))
    .execute(conn)
    .await?;

    // Desactivar usuarios
    for uid in &usuarios_a_desactivar {
        diesel::update(usuarios::table.filter(usuarios::id.eq(uid)))
            .set(usuarios::activo.eq(false))
            .execute(conn)
            .await?;
    }

    tracing::info!("desactivados {count} usuarios huésped por expiración");
    Ok(count)
}

/// Encuentra el pase activo vinculado a un usuario huésped.
pub async fn pase_activo_por_usuario(
    conn: &mut DbConn,
    usuario: Uuid,
) -> ApiResult<Option<PaseTemporal>> {
    use crate::db::schema::pases_temporales::dsl::*;
    let hoy = Utc::now().date_naive();
    Ok(pases_temporales
        .filter(usuario_id.eq(Some(usuario)))
        .filter(estado.eq(EstadoPaseTemporal::Activo))
        .filter(fecha_fin.ge(hoy))
        .select(PaseTemporal::as_select())
        .first(conn)
        .await
        .optional()?)
}

/// Actualiza un pase temporal con los campos recibidos (solo los presentes).
/// También reemplaza los vehículos si se incluyen.
pub async fn actualizar_pase(
    conn: &mut DbConn,
    pase_id: Uuid,
    nombre_anfitrion: Option<&str>,
    nombre_huesped: Option<&str>,
    email_huesped: Option<&str>,
    telefono_huesped: Option<&str>,
    fecha_inicio: Option<chrono::NaiveDate>,
    fecha_fin: Option<chrono::NaiveDate>,
    permiso_gimnasio: Option<bool>,
    permiso_piscina: Option<bool>,
    permiso_entrada_salida: Option<bool>,
    permiso_vehiculo: Option<bool>,
    permiso_asamblea: Option<bool>,
) -> ApiResult<PaseTemporal> {
    let mut sql = String::from(
        "UPDATE pases_temporales SET updated_at = now()"
    );
    if let Some(v) = nombre_anfitrion {
        sql.push_str(&format!(", nombre_anfitrion = '{}'", v.replace('\'', "''")));
    }
    if let Some(v) = nombre_huesped {
        sql.push_str(&format!(", nombre_huesped = '{}'", v.replace('\'', "''")));
    }
    if let Some(v) = email_huesped {
        sql.push_str(&format!(", email_huesped = '{}'", v.replace('\'', "''")));
    }
    if let Some(v) = telefono_huesped {
        sql.push_str(&format!(", telefono_huesped = '{}'", v.replace('\'', "''")));
    }
    if let Some(v) = fecha_inicio {
        sql.push_str(&format!(", fecha_inicio = '{}'", v));
    }
    if let Some(v) = fecha_fin {
        sql.push_str(&format!(", fecha_fin = '{}'", v));
    }
    if let Some(v) = permiso_gimnasio {
        sql.push_str(&format!(", permiso_gimnasio = {}", v));
    }
    if let Some(v) = permiso_piscina {
        sql.push_str(&format!(", permiso_piscina = {}", v));
    }
    if let Some(v) = permiso_entrada_salida {
        sql.push_str(&format!(", permiso_entrada_salida = {}", v));
    }
    if let Some(v) = permiso_vehiculo {
        sql.push_str(&format!(", permiso_vehiculo = {}", v));
    }
    if let Some(v) = permiso_asamblea {
        sql.push_str(&format!(", permiso_asamblea = {}", v));
    }
    sql.push_str(&format!(" WHERE id = '{}' RETURNING *", pase_id));

    let pase: PaseTemporal = diesel::sql_query(&sql).get_result(conn).await?;
    Ok(pase)
}

/// Elimina todos los vehículos de un pase y los reemplaza con los nuevos.
pub async fn reemplazar_vehiculos(
    conn: &mut DbConn,
    pase_id: Uuid,
    vehiculos: &[crate::domains::pases_temporales::models::NuevoVehiculoTemporal],
) -> ApiResult<Vec<VehiculoTemporal>> {
    use crate::db::schema::vehiculos_temporales::dsl::*;
    // Borrar existentes
    diesel::delete(vehiculos_temporales.filter(pase_id.eq(pase_id)))
        .execute(conn)
        .await?;
    // Insertar nuevos
    let mut result = vec![];
    for v in vehiculos {
        let vt = diesel::insert_into(vehiculos_temporales)
            .values(v)
            .returning(VehiculoTemporal::as_returning())
            .get_result(conn)
            .await?;
        result.push(vt);
    }
    Ok(result)
}
