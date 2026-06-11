use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use uuid::Uuid;

use crate::db::enums::{EstadoInmueble, TipoNegocio, TipoUnidad};
use crate::db::schema::inmuebles;
use crate::db::DbConn;
use crate::domains::inmuebles::models::{Inmueble, NuevoInmueble};
use crate::error::ApiResult;

/// Conjunto-scoped marketplace view: DISPONIBLE listings plus everything the
/// caller owns (so owners keep seeing their VENDIDO/ALQUILADO/OCULTO rows).
pub async fn listar_inmuebles(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    usuario_id: Uuid,
    tipo_negocio: Option<TipoNegocio>,
    tipo_unidad: Option<TipoUnidad>,
    habitaciones: Option<i32>,
) -> ApiResult<Vec<Inmueble>> {
    let mut query = inmuebles::table
        .filter(inmuebles::conjunto_id.eq(conjunto_id))
        .filter(
            inmuebles::estado
                .eq(EstadoInmueble::Disponible)
                .or(inmuebles::usuario_id.eq(usuario_id)),
        )
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
        .select(Inmueble::as_select())
        .load(conn)
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
