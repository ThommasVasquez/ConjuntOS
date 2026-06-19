use crate::db::enums::EstadoPaseTemporal;
use crate::db::DbConn;
use crate::domains::pases_temporales::models::{
    NuevoPaseTemporal, NuevoVehiculoTemporal, PaseTemporal, VehiculoTemporal,
};
use crate::error::ApiResult;
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
    diesel::update(pases_temporales.filter(id.eq(pase_id)))
        .set(estado.eq(EstadoPaseTemporal::Revocado))
        .execute(conn)
        .await?;
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
