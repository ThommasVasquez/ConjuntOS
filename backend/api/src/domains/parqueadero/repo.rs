use chrono::Utc;
use diesel::prelude::*;
use diesel_async::scoped_futures::ScopedFutureExt;
use diesel_async::{AsyncConnection, RunQueryDsl};
use uuid::Uuid;

use crate::db::enums::{EstadoParqueadero, TipoRegistroParqueadero};
use crate::db::schema::{
    parqueaderos, registros_parqueadero, rondas_parqueadero, usuarios, vehiculos,
};
use crate::db::DbConn;
use crate::domains::parqueadero::models::{
    NuevoVehiculo, Parqueadero, RegistroParqueadero, RondaParqueadero, Vehiculo,
};
use crate::domains::vigilancia::repo::today_utc_range;
use crate::error::{ApiError, ApiResult};

type OcupanteRef = (String, Option<String>, Option<String>);

pub async fn vehiculos_propios(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    usuario_id: Uuid,
) -> ApiResult<Vec<Vehiculo>> {
    let rows = vehiculos::table
        .filter(vehiculos::conjunto_id.eq(conjunto_id))
        .filter(vehiculos::usuario_id.eq(usuario_id))
        .order(vehiculos::created_at.desc())
        .select(Vehiculo::as_select())
        .load(conn)
        .await?;
    Ok(rows)
}

pub async fn celdas_propias(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    usuario_id: Uuid,
) -> ApiResult<Vec<Parqueadero>> {
    let rows = parqueaderos::table
        .filter(parqueaderos::conjunto_id.eq(conjunto_id))
        .filter(parqueaderos::usuario_id.eq(usuario_id))
        .order(parqueaderos::numero.asc())
        .select(Parqueadero::as_select())
        .load(conn)
        .await?;
    Ok(rows)
}

/// Duplicate placa surfaces as 409 via the unique-violation → Conflict mapping.
pub async fn crear_vehiculo(conn: &mut DbConn, nuevo: NuevoVehiculo) -> ApiResult<Vehiculo> {
    let row = diesel::insert_into(vehiculos::table)
        .values(nuevo)
        .returning(Vehiculo::as_returning())
        .get_result(conn)
        .await?;
    Ok(row)
}

pub async fn mapa(
    conn: &mut DbConn,
    conjunto_id: Uuid,
) -> ApiResult<Vec<(Parqueadero, Option<OcupanteRef>)>> {
    let rows = parqueaderos::table
        .left_join(usuarios::table)
        .filter(parqueaderos::conjunto_id.eq(conjunto_id))
        .order(parqueaderos::numero.asc())
        .select((
            Parqueadero::as_select(),
            (usuarios::nombre, usuarios::torre, usuarios::apto).nullable(),
        ))
        .load(conn)
        .await?;
    Ok(rows)
}

/// State change + VERIFICACION audit row in one transaction (spec 005:
/// every mapa mutation leaves a registros_parqueadero trace).
pub async fn actualizar_celda(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    celda_id: Uuid,
    staff_id: Uuid,
    nuevo_estado: EstadoParqueadero,
) -> ApiResult<Parqueadero> {
    conn.transaction(|conn| {
        async move {
            let celda: Parqueadero = parqueaderos::table
                .filter(parqueaderos::id.eq(celda_id))
                .filter(parqueaderos::conjunto_id.eq(conjunto_id))
                .select(Parqueadero::as_select())
                .first(conn)
                .await
                .optional()?
                .ok_or_else(|| ApiError::NotFound("celda no encontrada".into()))?;

            let anterior = celda.estado;
            let updated: Parqueadero = diesel::update(
                parqueaderos::table
                    .filter(parqueaderos::id.eq(celda_id))
                    .filter(parqueaderos::conjunto_id.eq(conjunto_id)),
            )
            .set(parqueaderos::estado.eq(nuevo_estado))
            .returning(Parqueadero::as_returning())
            .get_result(conn)
            .await?;

            diesel::insert_into(registros_parqueadero::table)
                .values((
                    registros_parqueadero::conjunto_id.eq(conjunto_id),
                    registros_parqueadero::parqueadero_id.eq(celda_id),
                    registros_parqueadero::usuario_id.eq(staff_id),
                    registros_parqueadero::tipo.eq(TipoRegistroParqueadero::Verificacion),
                    registros_parqueadero::observacion
                        .eq(format!("cambio estado {anterior}->{nuevo_estado}")),
                ))
                .execute(conn)
                .await?;

            Ok::<_, ApiError>(updated)
        }
        .scope_boxed()
    })
    .await
}

/// Asignación permanente de una celda a un residente con cláusula temporal.
/// Setea usuario_id, estado=OCUPADO, asignado_en=now, asignado_hasta=now+meses
/// (NULL si meses es None/0). Deja traza VERIFICACION. Una transacción.
pub async fn asignar_celda(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    celda_id: Uuid,
    staff_id: Uuid,
    residente_id: Uuid,
    meses: Option<i32>,
) -> ApiResult<Parqueadero> {
    let ahora = Utc::now();
    let hasta = match meses {
        Some(m) if m > 0 => Some(ahora + chrono::Months::new(m as u32)),
        _ => None,
    };
    conn.transaction(|conn| {
        async move {
            let celda: Parqueadero = parqueaderos::table
                .filter(parqueaderos::id.eq(celda_id))
                .filter(parqueaderos::conjunto_id.eq(conjunto_id))
                .select(Parqueadero::as_select())
                .first(conn)
                .await
                .optional()?
                .ok_or_else(|| ApiError::NotFound("celda no encontrada".into()))?;

            if celda.usuario_id.is_some() && celda.estado == EstadoParqueadero::Ocupado {
                return Err(ApiError::Conflict(
                    "la celda ya está ocupada por otro residente".into(),
                ));
            }

            let updated: Parqueadero = diesel::update(
                parqueaderos::table
                    .filter(parqueaderos::id.eq(celda_id))
                    .filter(parqueaderos::conjunto_id.eq(conjunto_id)),
            )
            .set((
                parqueaderos::usuario_id.eq(Some(residente_id)),
                parqueaderos::estado.eq(EstadoParqueadero::Ocupado),
                parqueaderos::asignado_en.eq(Some(ahora)),
                parqueaderos::asignado_hasta.eq(hasta),
            ))
            .returning(Parqueadero::as_returning())
            .get_result(conn)
            .await?;

            let detalle = match meses {
                Some(m) if m > 0 => format!("asignación permanente por {m} meses"),
                _ => "asignación permanente sin vencimiento".to_string(),
            };
            diesel::insert_into(registros_parqueadero::table)
                .values((
                    registros_parqueadero::conjunto_id.eq(conjunto_id),
                    registros_parqueadero::parqueadero_id.eq(celda_id),
                    registros_parqueadero::usuario_id.eq(staff_id),
                    registros_parqueadero::tipo.eq(TipoRegistroParqueadero::Verificacion),
                    registros_parqueadero::observacion.eq(detalle),
                ))
                .execute(conn)
                .await?;

            Ok::<_, ApiError>(updated)
        }
        .scope_boxed()
    })
    .await
}

/// Libera una celda: limpia ocupante y cláusula, estado=DISPONIBLE. Traza.
pub async fn liberar_celda(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    celda_id: Uuid,
    staff_id: Uuid,
) -> ApiResult<Parqueadero> {
    conn.transaction(|conn| {
        async move {
            let _celda: Parqueadero = parqueaderos::table
                .filter(parqueaderos::id.eq(celda_id))
                .filter(parqueaderos::conjunto_id.eq(conjunto_id))
                .select(Parqueadero::as_select())
                .first(conn)
                .await
                .optional()?
                .ok_or_else(|| ApiError::NotFound("celda no encontrada".into()))?;

            let updated: Parqueadero = diesel::update(
                parqueaderos::table
                    .filter(parqueaderos::id.eq(celda_id))
                    .filter(parqueaderos::conjunto_id.eq(conjunto_id)),
            )
            .set((
                parqueaderos::usuario_id.eq(None::<Uuid>),
                parqueaderos::estado.eq(EstadoParqueadero::Disponible),
                parqueaderos::asignado_en.eq(None::<chrono::DateTime<Utc>>),
                parqueaderos::asignado_hasta.eq(None::<chrono::DateTime<Utc>>),
            ))
            .returning(Parqueadero::as_returning())
            .get_result(conn)
            .await?;

            diesel::insert_into(registros_parqueadero::table)
                .values((
                    registros_parqueadero::conjunto_id.eq(conjunto_id),
                    registros_parqueadero::parqueadero_id.eq(celda_id),
                    registros_parqueadero::usuario_id.eq(staff_id),
                    registros_parqueadero::tipo.eq(TipoRegistroParqueadero::Verificacion),
                    registros_parqueadero::observacion.eq("celda liberada".to_string()),
                ))
                .execute(conn)
                .await?;

            Ok::<_, ApiError>(updated)
        }
        .scope_boxed()
    })
    .await
}

pub async fn registros(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    solo_de_usuario: Option<Uuid>,
) -> ApiResult<
    Vec<(
        RegistroParqueadero,
        String,
        crate::db::enums::TipoCeldaParqueadero,
        String,
    )>,
> {
    let mut query = registros_parqueadero::table
        .inner_join(parqueaderos::table)
        .inner_join(usuarios::table)
        .filter(registros_parqueadero::conjunto_id.eq(conjunto_id))
        .into_boxed();
    if let Some(usuario_id) = solo_de_usuario {
        query = query.filter(registros_parqueadero::usuario_id.eq(usuario_id));
    }
    let rows = query
        .order(registros_parqueadero::fecha.desc())
        .limit(50)
        .select((
            RegistroParqueadero::as_select(),
            parqueaderos::numero,
            parqueaderos::tipo,
            usuarios::nombre,
        ))
        .load(conn)
        .await?;
    Ok(rows)
}

pub async fn ronda_de_hoy(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    usuario_id: Uuid,
) -> ApiResult<Option<RondaParqueadero>> {
    let (start, end) = today_utc_range();
    let row = rondas_parqueadero::table
        .filter(rondas_parqueadero::conjunto_id.eq(conjunto_id))
        .filter(rondas_parqueadero::usuario_id.eq(usuario_id))
        .filter(rondas_parqueadero::fecha.ge(start))
        .filter(rondas_parqueadero::fecha.lt(end))
        .order(rondas_parqueadero::fecha.desc())
        .select(RondaParqueadero::as_select())
        .first(conn)
        .await
        .optional()?;
    Ok(row)
}

pub async fn crear_ronda(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    usuario_id: Uuid,
    hallazgos: serde_json::Value,
    completada: bool,
) -> ApiResult<RondaParqueadero> {
    let row = diesel::insert_into(rondas_parqueadero::table)
        .values((
            rondas_parqueadero::conjunto_id.eq(conjunto_id),
            rondas_parqueadero::usuario_id.eq(usuario_id),
            rondas_parqueadero::hallazgos.eq(hallazgos),
            rondas_parqueadero::completada.eq(completada),
        ))
        .returning(RondaParqueadero::as_returning())
        .get_result(conn)
        .await?;
    Ok(row)
}

/// (total celdas, ocupadas).
pub async fn stats(conn: &mut DbConn, conjunto_id: Uuid) -> ApiResult<(i64, i64)> {
    let total: i64 = parqueaderos::table
        .filter(parqueaderos::conjunto_id.eq(conjunto_id))
        .count()
        .get_result(conn)
        .await?;
    let ocupados: i64 = parqueaderos::table
        .filter(parqueaderos::conjunto_id.eq(conjunto_id))
        .filter(parqueaderos::estado.eq(EstadoParqueadero::Ocupado))
        .count()
        .get_result(conn)
        .await?;
    Ok((total, ocupados))
}
