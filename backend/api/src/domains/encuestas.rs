//! Resident surveys / polls (F4).
//!
//! Admin/concejo create a survey with N options; residents vote once (enforced by
//! a participation row); results tally live and broadcast over WS. Anonymous
//! surveys store no voter↔option linkage (votes keep `usuario_id` NULL).

use axum::extract::{Path, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel::OptionalExtension;
use diesel_async::RunQueryDsl;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::auth::guard;
use crate::db::enums::Rol;
use crate::db::schema::{encuesta_participacion, encuesta_votos, encuestas};
use crate::db::DbConn;
use crate::error::{ApiError, ApiResult};
use crate::services::ws_hub::{ws_events, WsEvent};
use crate::state::AppState;

const ADMIN_ROLES: &[Rol] = &[Rol::Administrador, Rol::Concejo];

// ── Model ────────────────────────────────────────────────────────────────────

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = encuestas, check_for_backend(diesel::pg::Pg))]
pub struct Encuesta {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub creado_por: Uuid,
    pub titulo: String,
    pub descripcion: Option<String>,
    pub opciones: serde_json::Value,
    pub multiple: bool,
    pub anonima: bool,
    pub cierra_at: Option<DateTime<Utc>>,
    pub cerrada: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Serialize, Deserialize, Clone, Debug, ToSchema)]
pub struct Opcion {
    pub id: String,
    pub texto: String,
}

/// Count votes per option. Pure — unit-tested.
pub fn tally(opciones: &[Opcion], votos: &[String]) -> Vec<(String, i64)> {
    opciones
        .iter()
        .map(|o| (o.id.clone(), votos.iter().filter(|v| **v == o.id).count() as i64))
        .collect()
}

// ── DTOs ─────────────────────────────────────────────────────────────────────

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CrearEncuestaRequest {
    pub titulo: String,
    pub descripcion: Option<String>,
    pub opciones: Vec<String>,
    pub multiple: Option<bool>,
    pub anonima: Option<bool>,
    pub cierra_at: Option<DateTime<Utc>>,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct VotarRequest {
    pub opciones: Vec<String>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConteoDto {
    pub opcion_id: String,
    pub texto: String,
    pub votos: i64,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EncuestaDto {
    pub id: Uuid,
    pub titulo: String,
    pub descripcion: Option<String>,
    pub opciones: Vec<Opcion>,
    pub multiple: bool,
    pub anonima: bool,
    pub cierra_at: Option<DateTime<Utc>>,
    pub cerrada: bool,
    pub created_at: DateTime<Utc>,
    pub ya_vote: bool,
    pub total: i64,
    pub resultados: Vec<ConteoDto>,
}

// ── Router ───────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/encuestas", get(listar).post(crear))
        .route("/encuestas/{id}/votar", post(votar))
        .route("/encuestas/{id}/cerrar", post(cerrar))
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async fn build_dto(conn: &mut DbConn, e: Encuesta, user_id: Uuid) -> ApiResult<EncuestaDto> {
    let opciones: Vec<Opcion> = serde_json::from_value(e.opciones.clone()).unwrap_or_default();
    let voto_ids: Vec<String> = encuesta_votos::table
        .filter(encuesta_votos::encuesta_id.eq(e.id))
        .select(encuesta_votos::opcion_id)
        .load(conn)
        .await?;
    let conteos = tally(&opciones, &voto_ids);
    let resultados = opciones
        .iter()
        .zip(conteos.iter())
        .map(|(o, (_id, votos))| ConteoDto {
            opcion_id: o.id.clone(),
            texto: o.texto.clone(),
            votos: *votos,
        })
        .collect();
    let participo: Option<Uuid> = encuesta_participacion::table
        .filter(encuesta_participacion::encuesta_id.eq(e.id))
        .filter(encuesta_participacion::usuario_id.eq(user_id))
        .select(encuesta_participacion::id)
        .first(conn)
        .await
        .optional()?;

    Ok(EncuestaDto {
        id: e.id,
        titulo: e.titulo,
        descripcion: e.descripcion,
        opciones,
        multiple: e.multiple,
        anonima: e.anonima,
        cierra_at: e.cierra_at,
        cerrada: e.cerrada,
        created_at: e.created_at,
        ya_vote: participo.is_some(),
        total: voto_ids.len() as i64,
        resultados,
    })
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async fn crear(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CrearEncuestaRequest>,
) -> ApiResult<Json<EncuestaDto>> {
    guard::require(&user, ADMIN_ROLES)?;
    if req.titulo.trim().is_empty() {
        return Err(ApiError::BadRequest("el título es obligatorio".into()));
    }
    let textos: Vec<String> = req
        .opciones
        .iter()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .collect();
    if textos.len() < 2 {
        return Err(ApiError::BadRequest("se requieren al menos 2 opciones".into()));
    }
    let opciones: Vec<Opcion> = textos
        .into_iter()
        .enumerate()
        .map(|(i, texto)| Opcion {
            id: format!("o{}", i + 1),
            texto,
        })
        .collect();
    let opciones_json = serde_json::to_value(&opciones).unwrap_or_default();

    let mut conn = state.pool.get().await?;
    let e: Encuesta = diesel::insert_into(encuestas::table)
        .values((
            encuestas::conjunto_id.eq(user.conjunto_id),
            encuestas::creado_por.eq(user.id),
            encuestas::titulo.eq(req.titulo.trim()),
            encuestas::descripcion.eq(req.descripcion.as_deref()),
            encuestas::opciones.eq(opciones_json),
            encuestas::multiple.eq(req.multiple.unwrap_or(false)),
            encuestas::anonima.eq(req.anonima.unwrap_or(false)),
            encuestas::cierra_at.eq(req.cierra_at),
        ))
        .returning(Encuesta::as_returning())
        .get_result(&mut conn)
        .await?;

    let dto = build_dto(&mut conn, e, user.id).await?;
    publish(&state, user.conjunto_id, ws_events::action::CREATED, &dto).await;
    Ok(Json(dto))
}

async fn listar(State(state): State<AppState>, user: AuthUser) -> ApiResult<Json<Vec<EncuestaDto>>> {
    let mut conn = state.pool.get().await?;
    let rows: Vec<Encuesta> = encuestas::table
        .filter(encuestas::conjunto_id.eq(user.conjunto_id))
        .order(encuestas::created_at.desc())
        .limit(50)
        .select(Encuesta::as_select())
        .load(&mut conn)
        .await?;
    let mut out = Vec::with_capacity(rows.len());
    for e in rows {
        out.push(build_dto(&mut conn, e, user.id).await?);
    }
    Ok(Json(out))
}

async fn votar(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<VotarRequest>,
) -> ApiResult<Json<EncuestaDto>> {
    let mut conn = state.pool.get().await?;
    let e: Encuesta = encuestas::table
        .find(id)
        .filter(encuestas::conjunto_id.eq(user.conjunto_id))
        .select(Encuesta::as_select())
        .first(&mut conn)
        .await
        .optional()?
        .ok_or_else(|| ApiError::NotFound("encuesta no encontrada".into()))?;

    let cerrada = e.cerrada || e.cierra_at.is_some_and(|c| c < Utc::now());
    if cerrada {
        return Err(ApiError::BadRequest("la encuesta está cerrada".into()));
    }

    let opciones: Vec<Opcion> = serde_json::from_value(e.opciones.clone()).unwrap_or_default();
    let validos: std::collections::HashSet<&str> = opciones.iter().map(|o| o.id.as_str()).collect();
    let seleccion: Vec<String> = req
        .opciones
        .into_iter()
        .filter(|o| validos.contains(o.as_str()))
        .collect();
    if seleccion.is_empty() {
        return Err(ApiError::BadRequest("selecciona una opción válida".into()));
    }
    if !e.multiple && seleccion.len() != 1 {
        return Err(ApiError::BadRequest("esta encuesta admite una sola opción".into()));
    }

    // One vote per resident — the unique participation row is the race-proof gate.
    diesel::insert_into(encuesta_participacion::table)
        .values((
            encuesta_participacion::encuesta_id.eq(e.id),
            encuesta_participacion::usuario_id.eq(user.id),
        ))
        .execute(&mut conn)
        .await
        .map_err(|err| match err {
            diesel::result::Error::DatabaseError(
                diesel::result::DatabaseErrorKind::UniqueViolation,
                _,
            ) => ApiError::Conflict("ya votaste en esta encuesta".into()),
            other => other.into(),
        })?;

    // Anonymous → no voter↔option linkage.
    let voter = if e.anonima { None } else { Some(user.id) };
    let filas: Vec<_> = seleccion
        .iter()
        .map(|opcion| {
            (
                encuesta_votos::encuesta_id.eq(e.id),
                encuesta_votos::opcion_id.eq(opcion.clone()),
                encuesta_votos::usuario_id.eq(voter),
            )
        })
        .collect();
    diesel::insert_into(encuesta_votos::table)
        .values(filas)
        .execute(&mut conn)
        .await?;

    let dto = build_dto(&mut conn, e, user.id).await?;
    publish(&state, user.conjunto_id, ws_events::action::UPDATED, &dto).await;
    Ok(Json(dto))
}

async fn cerrar(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<EncuestaDto>> {
    guard::require(&user, ADMIN_ROLES)?;
    let mut conn = state.pool.get().await?;
    let e: Encuesta = diesel::update(
        encuestas::table
            .find(id)
            .filter(encuestas::conjunto_id.eq(user.conjunto_id)),
    )
    .set(encuestas::cerrada.eq(true))
    .returning(Encuesta::as_returning())
    .get_result(&mut conn)
    .await
    .optional()?
    .ok_or_else(|| ApiError::NotFound("encuesta no encontrada".into()))?;

    let dto = build_dto(&mut conn, e, user.id).await?;
    publish(&state, user.conjunto_id, ws_events::action::UPDATED, &dto).await;
    Ok(Json(dto))
}

async fn publish(state: &AppState, conjunto_id: Uuid, action: &str, dto: &EncuestaDto) {
    state
        .ws_hub
        .publish(
            conjunto_id,
            WsEvent::broadcast(
                ws_events::ENCUESTA,
                action,
                Some(serde_json::to_value(dto).unwrap_or_default()),
            ),
        )
        .await;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ops() -> Vec<Opcion> {
        vec![
            Opcion { id: "o1".into(), texto: "Sí".into() },
            Opcion { id: "o2".into(), texto: "No".into() },
            Opcion { id: "o3".into(), texto: "Abstención".into() },
        ]
    }

    #[test]
    fn tally_counts_votes_per_option() {
        let votos = vec!["o1".to_string(), "o1".into(), "o2".into()];
        let result = tally(&ops(), &votos);
        assert_eq!(result, vec![("o1".into(), 2), ("o2".into(), 1), ("o3".into(), 0)]);
    }

    #[test]
    fn tally_ignores_unknown_option_ids() {
        let votos = vec!["o9".to_string()];
        let result = tally(&ops(), &votos);
        assert!(result.iter().all(|(_, n)| *n == 0));
    }
}
