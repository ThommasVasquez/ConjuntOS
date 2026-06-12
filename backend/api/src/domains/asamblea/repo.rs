use bigdecimal::BigDecimal;
use chrono::Utc;
use diesel::prelude::*;
use diesel_async::scoped_futures::ScopedFutureExt;
use diesel_async::{AsyncConnection, RunQueryDsl};
use uuid::Uuid;

use crate::db::enums::{EstadoPairing, EstadoTurno};
use crate::db::schema::{
    asamblea_asistencias, asamblea_opiniones, asamblea_pairings, asamblea_poderes, asamblea_turnos,
    asamblea_votaciones, asamblea_votos, asambleas, unidades, usuarios,
};
use crate::db::DbConn;
use crate::domains::asamblea::models::{
    Asamblea, AsambleaAsistencia, AsambleaOpinion, AsambleaPairing, AsambleaPoder, AsambleaTurno,
    AsambleaVotacion, AsambleaVoto, NuevaAsistencia, NuevaOpinion, NuevaVotacion, NuevoPairing,
    NuevoPoder, NuevoTurno, NuevoVoto,
};
use crate::error::{ApiError, ApiResult};

// ── Helpers ──────────────────────────────────────────────────────────────

/// Tenant-isolation check: returns the asamblea only if it belongs to the
/// caller's conjunto (Law 2).
pub async fn verify_asamblea_tenant(
    conn: &mut DbConn,
    asamblea_id: Uuid,
    conjunto_id: Uuid,
) -> ApiResult<Asamblea> {
    asambleas::table
        .filter(asambleas::id.eq(asamblea_id))
        .filter(asambleas::conjunto_id.eq(conjunto_id))
        .select(Asamblea::as_select())
        .first(conn)
        .await
        .map_err(Into::into)
}

/// True if `user_id` exists and belongs to `conjunto_id` (Law 2 membership check,
/// used to reject cross-tenant references in poder creation).
pub async fn user_in_conjunto(
    conn: &mut DbConn,
    user_id: Uuid,
    conjunto_id: Uuid,
) -> ApiResult<bool> {
    let n: i64 = usuarios::table
        .filter(usuarios::id.eq(user_id))
        .filter(usuarios::conjunto_id.eq(conjunto_id))
        .count()
        .get_result(conn)
        .await?;
    Ok(n > 0)
}

/// True if a verified poder names `otorgante_id` as grantor in this asamblea — i.e.
/// their apoderado casts the vote, so the otorgante must not also vote (double-count).
pub async fn otorgante_has_verified_poder(
    conn: &mut DbConn,
    asamblea_id: Uuid,
    otorgante_id: Uuid,
) -> ApiResult<bool> {
    let n: i64 = asamblea_poderes::table
        .filter(asamblea_poderes::asamblea_id.eq(asamblea_id))
        .filter(asamblea_poderes::verificado.eq(true))
        .filter(asamblea_poderes::otorgante_id.eq(otorgante_id))
        .count()
        .get_result(conn)
        .await?;
    Ok(n > 0)
}

/// Returns (nombre, torre, apto) for denormalised opinion/turno fields.
pub async fn get_user_info(
    conn: &mut DbConn,
    user_id: Uuid,
) -> ApiResult<(String, Option<String>, Option<String>)> {
    usuarios::table
        .filter(usuarios::id.eq(user_id))
        .select((usuarios::nombre, usuarios::torre, usuarios::apto))
        .first(conn)
        .await
        .map_err(Into::into)
}

// ── Session ──────────────────────────────────────────────────────────────

pub async fn get_active_session(conn: &mut DbConn, conjunto_id: Uuid) -> ApiResult<Asamblea> {
    asambleas::table
        .filter(asambleas::conjunto_id.eq(conjunto_id))
        .filter(asambleas::activa.eq(true))
        .select(Asamblea::as_select())
        .first(conn)
        .await
        .map_err(Into::into)
}

/// Like `get_active_session` but returns `None` instead of erroring when there
/// is no active assembly. Used by the GET endpoint so "no hay asamblea activa"
/// is a normal 200 (null) response rather than a 404 (which the browser logs
/// as a console error even when handled gracefully).
pub async fn get_active_session_opt(
    conn: &mut DbConn,
    conjunto_id: Uuid,
) -> ApiResult<Option<Asamblea>> {
    asambleas::table
        .filter(asambleas::conjunto_id.eq(conjunto_id))
        .filter(asambleas::activa.eq(true))
        .select(Asamblea::as_select())
        .first(conn)
        .await
        .optional()
        .map_err(Into::into)
}

/// CAS update — returns the number of rows affected (0 if version mismatch).
pub async fn update_session(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    asamblea_id: Uuid,
    session_state: serde_json::Value,
    item_activo_index: i32,
    activa: bool,
    expected_version: i32,
) -> ApiResult<usize> {
    let rows = diesel::update(
        asambleas::table
            .filter(asambleas::id.eq(asamblea_id))
            .filter(asambleas::conjunto_id.eq(conjunto_id))
            .filter(asambleas::version.eq(expected_version)),
    )
    .set((
        asambleas::session_state.eq(session_state),
        asambleas::item_activo_index.eq(item_activo_index),
        asambleas::activa.eq(activa),
        asambleas::version.eq(expected_version + 1),
    ))
    .execute(conn)
    .await?;
    Ok(rows)
}

// ── Pairing ──────────────────────────────────────────────────────────────

pub async fn create_pairing(conn: &mut DbConn, nuevo: NuevoPairing) -> ApiResult<AsambleaPairing> {
    diesel::insert_into(asamblea_pairings::table)
        .values(&nuevo)
        .returning(AsambleaPairing::as_returning())
        .get_result(conn)
        .await
        .map_err(Into::into)
}

/// Returns all PENDIENTE pairings for the conjunto that have not expired.
pub async fn find_pending_pairings(
    conn: &mut DbConn,
    conjunto_id: Uuid,
) -> ApiResult<Vec<AsambleaPairing>> {
    let now = Utc::now();
    asamblea_pairings::table
        .filter(asamblea_pairings::conjunto_id.eq(conjunto_id))
        .filter(asamblea_pairings::estado.eq(EstadoPairing::Pendiente))
        .filter(asamblea_pairings::expires_at.gt(now))
        .select(AsambleaPairing::as_select())
        .load(conn)
        .await
        .map_err(Into::into)
}

/// CAS link: only succeeds if the pairing is still PENDIENTE.
pub async fn link_pairing(
    conn: &mut DbConn,
    pairing_id: Uuid,
    usuario_id: Uuid,
) -> ApiResult<AsambleaPairing> {
    diesel::update(
        asamblea_pairings::table
            .filter(asamblea_pairings::id.eq(pairing_id))
            .filter(asamblea_pairings::estado.eq(EstadoPairing::Pendiente)),
    )
    .set((
        asamblea_pairings::estado.eq(EstadoPairing::Vinculado),
        asamblea_pairings::usuario_id.eq(usuario_id),
    ))
    .returning(AsambleaPairing::as_returning())
    .get_result(conn)
    .await
    .map_err(Into::into)
}

// ── Votaciones ───────────────────────────────────────────────────────────

pub async fn list_votaciones(
    conn: &mut DbConn,
    asamblea_id: Uuid,
) -> ApiResult<Vec<AsambleaVotacion>> {
    asamblea_votaciones::table
        .filter(asamblea_votaciones::asamblea_id.eq(asamblea_id))
        .order(asamblea_votaciones::created_at.asc())
        .select(AsambleaVotacion::as_select())
        .load(conn)
        .await
        .map_err(Into::into)
}

pub async fn create_votacion(
    conn: &mut DbConn,
    nueva: NuevaVotacion,
) -> ApiResult<AsambleaVotacion> {
    diesel::insert_into(asamblea_votaciones::table)
        .values(&nueva)
        .returning(AsambleaVotacion::as_returning())
        .get_result(conn)
        .await
        .map_err(Into::into)
}

/// When activating, deactivates all siblings first (single active votación).
pub async fn update_votacion(
    conn: &mut DbConn,
    asamblea_id: Uuid,
    votacion_id: Uuid,
    activa: bool,
) -> ApiResult<AsambleaVotacion> {
    conn.transaction(|conn| {
        async move {
            if activa {
                diesel::update(
                    asamblea_votaciones::table
                        .filter(asamblea_votaciones::asamblea_id.eq(asamblea_id)),
                )
                .set(asamblea_votaciones::activa.eq(false))
                .execute(conn)
                .await?;
            }

            let votacion = diesel::update(
                asamblea_votaciones::table
                    .filter(asamblea_votaciones::id.eq(votacion_id))
                    .filter(asamblea_votaciones::asamblea_id.eq(asamblea_id)),
            )
            .set(asamblea_votaciones::activa.eq(activa))
            .returning(AsambleaVotacion::as_returning())
            .get_result(conn)
            .await?;

            Ok::<_, ApiError>(votacion)
        }
        .scope_boxed()
    })
    .await
}

// ── Votos ────────────────────────────────────────────────────────────────

/// Tenant-checked votación lookup through the asamblea FK.
pub async fn get_votacion_with_tenant_check(
    conn: &mut DbConn,
    votacion_id: Uuid,
    conjunto_id: Uuid,
) -> ApiResult<AsambleaVotacion> {
    asamblea_votaciones::table
        .inner_join(asambleas::table)
        .filter(asamblea_votaciones::id.eq(votacion_id))
        .filter(asambleas::conjunto_id.eq(conjunto_id))
        .select(AsambleaVotacion::as_select())
        .first(conn)
        .await
        .map_err(Into::into)
}

pub async fn list_votos(conn: &mut DbConn, votacion_id: Uuid) -> ApiResult<Vec<AsambleaVoto>> {
    asamblea_votos::table
        .filter(asamblea_votos::votacion_id.eq(votacion_id))
        .order(asamblea_votos::created_at.asc())
        .select(AsambleaVoto::as_select())
        .load(conn)
        .await
        .map_err(Into::into)
}

/// Inserts a voto; unique constraint on (votacion_id, unidad_id) maps to 409.
pub async fn cast_voto(conn: &mut DbConn, nuevo: NuevoVoto) -> ApiResult<AsambleaVoto> {
    diesel::insert_into(asamblea_votos::table)
        .values(&nuevo)
        .returning(AsambleaVoto::as_returning())
        .get_result(conn)
        .await
        .map_err(Into::into)
}

/// Returns (user_unidad_id, effective coeficiente) including verified poderes.
/// Every usuario/unidad lookup is scoped to `conjunto_id` (Law 2) so a poder that
/// references a foreign-tenant otorgante can never contribute vote weight.
pub async fn compute_effective_coeficiente(
    conn: &mut DbConn,
    asamblea_id: Uuid,
    conjunto_id: Uuid,
    user_id: Uuid,
) -> ApiResult<(Option<Uuid>, BigDecimal)> {
    // 1. User's own unidad_id (scoped to the conjunto)
    let user_unidad_id: Option<Uuid> = usuarios::table
        .filter(usuarios::id.eq(user_id))
        .filter(usuarios::conjunto_id.eq(conjunto_id))
        .select(usuarios::unidad_id)
        .first(conn)
        .await?;

    // 2. User's own unit coeficiente
    let base: BigDecimal = match user_unidad_id {
        Some(uid) => unidades::table
            .filter(unidades::id.eq(uid))
            .filter(unidades::conjunto_id.eq(conjunto_id))
            .select(unidades::coeficiente)
            .first::<BigDecimal>(conn)
            .await
            .unwrap_or_default(),
        None => BigDecimal::default(),
    };

    // 3. Verified poderes where this user is apoderado → otorgante unit coefs
    let otorgante_ids: Vec<Uuid> = asamblea_poderes::table
        .filter(asamblea_poderes::asamblea_id.eq(asamblea_id))
        .filter(asamblea_poderes::verificado.eq(true))
        .filter(asamblea_poderes::apoderado_id.eq(user_id))
        .select(asamblea_poderes::otorgante_id)
        .load(conn)
        .await?;

    let poder_coef = if otorgante_ids.is_empty() {
        BigDecimal::default()
    } else {
        let otorgante_unit_ids: Vec<Uuid> = usuarios::table
            .filter(usuarios::id.eq_any(&otorgante_ids))
            .filter(usuarios::conjunto_id.eq(conjunto_id))
            .filter(usuarios::unidad_id.is_not_null())
            .select(usuarios::unidad_id)
            .load::<Option<Uuid>>(conn)
            .await?
            .into_iter()
            .flatten()
            .collect();

        if otorgante_unit_ids.is_empty() {
            BigDecimal::default()
        } else {
            unidades::table
                .filter(unidades::id.eq_any(&otorgante_unit_ids))
                .filter(unidades::conjunto_id.eq(conjunto_id))
                .select(diesel::dsl::sum(unidades::coeficiente))
                .first::<Option<BigDecimal>>(conn)
                .await?
                .unwrap_or_default()
        }
    };

    Ok((user_unidad_id, base + poder_coef))
}

// ── Asistencias ──────────────────────────────────────────────────────────

pub async fn list_asistencias(
    conn: &mut DbConn,
    asamblea_id: Uuid,
) -> ApiResult<Vec<AsambleaAsistencia>> {
    asamblea_asistencias::table
        .filter(asamblea_asistencias::asamblea_id.eq(asamblea_id))
        .order(asamblea_asistencias::created_at.asc())
        .select(AsambleaAsistencia::as_select())
        .load(conn)
        .await
        .map_err(Into::into)
}

/// Unique constraint on (asamblea_id, usuario_id) maps to 409.
pub async fn register_asistencia(
    conn: &mut DbConn,
    nueva: NuevaAsistencia,
) -> ApiResult<AsambleaAsistencia> {
    diesel::insert_into(asamblea_asistencias::table)
        .values(&nueva)
        .returning(AsambleaAsistencia::as_returning())
        .get_result(conn)
        .await
        .map_err(Into::into)
}

/// Returns (total_coeficiente, present_coeficiente, quorum_percentage).
pub async fn get_quorum(
    conn: &mut DbConn,
    asamblea_id: Uuid,
    conjunto_id: Uuid,
) -> ApiResult<(BigDecimal, BigDecimal, BigDecimal)> {
    // Total coeficiente of every unit in the conjunto
    let total: BigDecimal = unidades::table
        .filter(unidades::conjunto_id.eq(conjunto_id))
        .select(diesel::dsl::sum(unidades::coeficiente))
        .first::<Option<BigDecimal>>(conn)
        .await?
        .unwrap_or_default();

    // Attendee user IDs
    let attendee_ids: Vec<Uuid> = asamblea_asistencias::table
        .filter(asamblea_asistencias::asamblea_id.eq(asamblea_id))
        .select(asamblea_asistencias::usuario_id)
        .load(conn)
        .await?;

    if attendee_ids.is_empty() {
        return Ok((total, BigDecimal::default(), BigDecimal::default()));
    }

    // Their unit IDs
    let mut present_unit_ids: Vec<Uuid> = usuarios::table
        .filter(usuarios::id.eq_any(&attendee_ids))
        .filter(usuarios::conjunto_id.eq(conjunto_id))
        .filter(usuarios::unidad_id.is_not_null())
        .select(usuarios::unidad_id)
        .load::<Option<Uuid>>(conn)
        .await?
        .into_iter()
        .flatten()
        .collect();

    // Add units from verified poderes whose apoderado is an attendee
    let otorgante_ids: Vec<Uuid> = asamblea_poderes::table
        .filter(asamblea_poderes::asamblea_id.eq(asamblea_id))
        .filter(asamblea_poderes::verificado.eq(true))
        .filter(asamblea_poderes::apoderado_id.eq_any(&attendee_ids))
        .select(asamblea_poderes::otorgante_id)
        .load(conn)
        .await?;

    if !otorgante_ids.is_empty() {
        let poder_unit_ids: Vec<Uuid> = usuarios::table
            .filter(usuarios::id.eq_any(&otorgante_ids))
            .filter(usuarios::conjunto_id.eq(conjunto_id))
            .filter(usuarios::unidad_id.is_not_null())
            .select(usuarios::unidad_id)
            .load::<Option<Uuid>>(conn)
            .await?
            .into_iter()
            .flatten()
            .collect();
        present_unit_ids.extend(poder_unit_ids);
    }

    present_unit_ids.sort();
    present_unit_ids.dedup();

    let presente: BigDecimal = if present_unit_ids.is_empty() {
        BigDecimal::default()
    } else {
        unidades::table
            .filter(unidades::id.eq_any(&present_unit_ids))
            .filter(unidades::conjunto_id.eq(conjunto_id))
            .select(diesel::dsl::sum(unidades::coeficiente))
            .first::<Option<BigDecimal>>(conn)
            .await?
            .unwrap_or_default()
    };

    let percentage = if total == BigDecimal::default() {
        BigDecimal::default()
    } else {
        presente.clone() * BigDecimal::from(100) / total.clone()
    };

    Ok((total, presente, percentage))
}

// ── Opiniones ────────────────────────────────────────────────────────────

pub async fn list_opiniones(
    conn: &mut DbConn,
    asamblea_id: Uuid,
) -> ApiResult<Vec<AsambleaOpinion>> {
    asamblea_opiniones::table
        .filter(asamblea_opiniones::asamblea_id.eq(asamblea_id))
        .order(asamblea_opiniones::created_at.asc())
        .limit(100)
        .select(AsambleaOpinion::as_select())
        .load(conn)
        .await
        .map_err(Into::into)
}

pub async fn create_opinion(conn: &mut DbConn, nueva: NuevaOpinion) -> ApiResult<AsambleaOpinion> {
    diesel::insert_into(asamblea_opiniones::table)
        .values(&nueva)
        .returning(AsambleaOpinion::as_returning())
        .get_result(conn)
        .await
        .map_err(Into::into)
}

// ── Turnos ───────────────────────────────────────────────────────────────

pub async fn list_turnos(conn: &mut DbConn, asamblea_id: Uuid) -> ApiResult<Vec<AsambleaTurno>> {
    asamblea_turnos::table
        .filter(asamblea_turnos::asamblea_id.eq(asamblea_id))
        .order(asamblea_turnos::created_at.asc())
        .select(AsambleaTurno::as_select())
        .load(conn)
        .await
        .map_err(Into::into)
}

pub async fn create_turno(conn: &mut DbConn, nuevo: NuevoTurno) -> ApiResult<AsambleaTurno> {
    diesel::insert_into(asamblea_turnos::table)
        .values(&nuevo)
        .returning(AsambleaTurno::as_returning())
        .get_result(conn)
        .await
        .map_err(Into::into)
}

/// When setting HABLANDO, all existing HABLANDO turns are completed first.
pub async fn update_turno(
    conn: &mut DbConn,
    asamblea_id: Uuid,
    turno_id: Uuid,
    estado: EstadoTurno,
) -> ApiResult<AsambleaTurno> {
    conn.transaction(|conn| {
        async move {
            if estado == EstadoTurno::Hablando {
                diesel::update(
                    asamblea_turnos::table
                        .filter(asamblea_turnos::asamblea_id.eq(asamblea_id))
                        .filter(asamblea_turnos::estado.eq(EstadoTurno::Hablando)),
                )
                .set(asamblea_turnos::estado.eq(EstadoTurno::Completado))
                .execute(conn)
                .await?;
            }

            let turno = diesel::update(
                asamblea_turnos::table
                    .filter(asamblea_turnos::id.eq(turno_id))
                    .filter(asamblea_turnos::asamblea_id.eq(asamblea_id)),
            )
            .set(asamblea_turnos::estado.eq(estado))
            .returning(AsambleaTurno::as_returning())
            .get_result(conn)
            .await?;

            Ok::<_, ApiError>(turno)
        }
        .scope_boxed()
    })
    .await
}

// ── Poderes ──────────────────────────────────────────────────────────────

pub async fn list_poderes(conn: &mut DbConn, asamblea_id: Uuid) -> ApiResult<Vec<AsambleaPoder>> {
    asamblea_poderes::table
        .filter(asamblea_poderes::asamblea_id.eq(asamblea_id))
        .order(asamblea_poderes::created_at.asc())
        .select(AsambleaPoder::as_select())
        .load(conn)
        .await
        .map_err(Into::into)
}

pub async fn create_poder(conn: &mut DbConn, nuevo: NuevoPoder) -> ApiResult<AsambleaPoder> {
    diesel::insert_into(asamblea_poderes::table)
        .values(&nuevo)
        .returning(AsambleaPoder::as_returning())
        .get_result(conn)
        .await
        .map_err(Into::into)
}

pub async fn update_poder(
    conn: &mut DbConn,
    asamblea_id: Uuid,
    poder_id: Uuid,
    verificado: bool,
) -> ApiResult<AsambleaPoder> {
    diesel::update(
        asamblea_poderes::table
            .filter(asamblea_poderes::id.eq(poder_id))
            .filter(asamblea_poderes::asamblea_id.eq(asamblea_id)),
    )
    .set(asamblea_poderes::verificado.eq(verificado))
    .returning(AsambleaPoder::as_returning())
    .get_result(conn)
    .await
    .map_err(Into::into)
}
