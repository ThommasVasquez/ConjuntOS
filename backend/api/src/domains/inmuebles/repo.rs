use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use uuid::Uuid;

use crate::db::enums::{EstadoInmueble, TipoNegocio, TipoUnidad};
use crate::db::schema::{inmuebles, usuarios};
use crate::db::DbConn;
use crate::domains::inmuebles::dto::UpdateInmuebleRequest;
use crate::domains::inmuebles::models::{Inmueble, NuevoInmueble};
use crate::error::{ApiError, ApiResult};

/// Conjunto-scoped marketplace view: DISPONIBLE listings plus everything the
/// caller owns (so owners keep seeing their VENDIDO/ALQUILADO/OCULTO rows).
/// Returns (Inmueble, propietario_telefono) from a left join.
pub async fn listar_inmuebles(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    usuario_id: Uuid,
    tipo_negocio: Option<TipoNegocio>,
    tipo_unidad: Option<TipoUnidad>,
    habitaciones: Option<i32>,
) -> ApiResult<Vec<(Inmueble, Option<String>)>> {
    let mut query = inmuebles::table
        .filter(inmuebles::conjunto_id.eq(conjunto_id))
        .filter(
            inmuebles::estado
                .eq(EstadoInmueble::Disponible)
                .or(inmuebles::usuario_id.eq(usuario_id)),
        )
        .left_join(usuarios::table.on(inmuebles::usuario_id.eq(usuarios::id)))
        .into_boxed();
    if let Some(tipo_negocio) = tipo_negocio {
        query = query.filter(inmuebles::tipo_negocio.eq(tipo_negocio));
    }
    if let Some(tipo_unidad) = tipo_unidad {
        query = query.filter(inmuebles::tipo_unidad.eq(tipo_unidad));
    }
    if let Some(habitaciones) = habitaciones {
        query = query.filter(inmuebles::habitaciones.eq(habitaciones));
    }
    let rows = query
        .order(inmuebles::created_at.desc())
        .limit(50)
        .select((Inmueble::as_select(), usuarios::telefono.nullable()))
        .load::<(Inmueble, Option<String>)>(conn)
        .await?;
    Ok(rows)
}

pub async fn crear_inmueble(conn: &mut DbConn, nuevo: NuevoInmueble) -> ApiResult<Inmueble> {
    let row = diesel::insert_into(inmuebles::table)
        .values(&nuevo)
        .returning(Inmueble::as_returning())
        .get_result(conn)
        .await?;
    Ok(row)
}

pub async fn obtener_inmueble(conn: &mut DbConn, id: Uuid) -> ApiResult<Inmueble> {
    inmuebles::table
        .filter(inmuebles::id.eq(id))
        .select(Inmueble::as_select())
        .first(conn)
        .await
        .map_err(|e| match e {
            diesel::NotFound => ApiError::NotFound("Inmueble no encontrado".into()),
            other => ApiError::Internal(anyhow::anyhow!("{other}")),
        })
}

pub async fn actualizar_inmueble(
    conn: &mut DbConn,
    id: Uuid,
    req: UpdateInmuebleRequest,
) -> ApiResult<Inmueble> {
    use inmuebles::dsl;
    let target = dsl::inmuebles.filter(dsl::id.eq(id));
    // Only update fields that were provided
    if let Some(titulo) = &req.titulo {
        diesel::update(target).set(dsl::titulo.eq(titulo)).execute(conn).await?;
    }
    if let Some(descripcion) = &req.descripcion {
        let target = dsl::inmuebles.filter(dsl::id.eq(id));
        diesel::update(target).set(dsl::descripcion.eq(descripcion)).execute(conn).await?;
    }
    if let Some(precio) = &req.precio {
        let target = dsl::inmuebles.filter(dsl::id.eq(id));
        diesel::update(target).set(dsl::precio.eq(precio)).execute(conn).await?;
    }
    if let Some(tipo_negocio) = &req.tipo_negocio {
        let target = dsl::inmuebles.filter(dsl::id.eq(id));
        diesel::update(target).set(dsl::tipo_negocio.eq(tipo_negocio)).execute(conn).await?;
    }
    if let Some(tipo_unidad) = &req.tipo_unidad {
        let target = dsl::inmuebles.filter(dsl::id.eq(id));
        diesel::update(target).set(dsl::tipo_unidad.eq(tipo_unidad)).execute(conn).await?;
    }
    if let Some(habitaciones) = req.habitaciones {
        let target = dsl::inmuebles.filter(dsl::id.eq(id));
        diesel::update(target).set(dsl::habitaciones.eq(habitaciones)).execute(conn).await?;
    }
    if let Some(banos) = req.banos {
        let target = dsl::inmuebles.filter(dsl::id.eq(id));
        diesel::update(target).set(dsl::banos.eq(banos)).execute(conn).await?;
    }
    if let Some(area) = &req.area {
        let target = dsl::inmuebles.filter(dsl::id.eq(id));
        diesel::update(target).set(dsl::area.eq(area)).execute(conn).await?;
    }
    if let Some(moneda) = &req.moneda {
        let target = dsl::inmuebles.filter(dsl::id.eq(id));
        diesel::update(target).set(dsl::moneda.eq(moneda)).execute(conn).await?;
    }
    if let Some(imagenes) = &req.imagenes {
        let target = dsl::inmuebles.filter(dsl::id.eq(id));
        let imagenes_json = serde_json::to_value(imagenes)
            .map_err(|e| ApiError::BadRequest(format!("imagenes inválidas: {e}")))?;
        diesel::update(target).set(dsl::imagenes.eq(imagenes_json)).execute(conn).await?;
    }
    if let Some(caracteristicas) = &req.caracteristicas {
        let target = dsl::inmuebles.filter(dsl::id.eq(id));
        let caract_json = serde_json::to_value(caracteristicas)
            .map_err(|e| ApiError::BadRequest(format!("caracteristicas inválidas: {e}")))?;
        diesel::update(target).set(dsl::caracteristicas.eq(caract_json)).execute(conn).await?;
    }
    if let Some(estado) = &req.estado {
        let target = dsl::inmuebles.filter(dsl::id.eq(id));
        diesel::update(target).set(dsl::estado.eq(estado)).execute(conn).await?;
    }
    // Return updated row
    obtener_inmueble(conn, id).await
}
