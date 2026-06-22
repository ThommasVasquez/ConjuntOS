//! Vehicle document expiry (F6) + pet vaccine control (F7).
//!
//! Owners set SOAT / tecnomecánica expiry on their vehicles and record vaccines
//! for their pets. The reminder engine (services::reminders::gather_due) scans
//! these dates and notifies before they lapse.

use axum::extract::{Path, State};
use axum::routing::{delete, get, put};
use axum::{Json, Router};
use chrono::{DateTime, NaiveDate, Utc};
use diesel::prelude::*;
use diesel::OptionalExtension;
use diesel_async::RunQueryDsl;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::db::schema::{mascotas, mascotas_vacunas, vehiculos};
use crate::db::DbConn;
use crate::domains::parqueadero::models::Vehiculo;
use crate::domains::usuarios::dto::VehiculoPerfilDto;
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

// ── Model ────────────────────────────────────────────────────────────────────

#[derive(Queryable, Selectable, Identifiable, Debug, Clone, Serialize, ToSchema)]
#[diesel(table_name = mascotas_vacunas, check_for_backend(diesel::pg::Pg))]
#[serde(rename_all = "camelCase")]
pub struct Vacuna {
    pub id: Uuid,
    #[serde(skip)]
    pub conjunto_id: Uuid,
    pub mascota_id: Uuid,
    pub vacuna: String,
    pub fecha_aplicacion: Option<NaiveDate>,
    pub proxima: Option<NaiveDate>,
    pub certificado_url: Option<String>,
    #[serde(skip)]
    pub created_at: DateTime<Utc>,
}

// ── DTOs ─────────────────────────────────────────────────────────────────────

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DocsRequest {
    pub soat_vence: Option<NaiveDate>,
    pub tecnomecanica_vence: Option<NaiveDate>,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct NuevaVacunaRequest {
    pub vacuna: String,
    pub fecha_aplicacion: Option<NaiveDate>,
    pub proxima: Option<NaiveDate>,
    pub certificado_url: Option<String>,
}

// ── Router ───────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/vehiculos/{id}/documentos", put(actualizar_documentos))
        .route("/mascotas/{id}/vacunas", get(listar_vacunas).post(crear_vacuna))
        .route("/vacunas/{id}", delete(eliminar_vacuna))
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async fn actualizar_documentos(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<DocsRequest>,
) -> ApiResult<Json<VehiculoPerfilDto>> {
    let mut conn = state.pool.get().await?;
    let veh: Vehiculo = vehiculos::table
        .find(id)
        .filter(vehiculos::conjunto_id.eq(user.conjunto_id))
        .select(Vehiculo::as_select())
        .first(&mut conn)
        .await
        .optional()?
        .ok_or_else(|| ApiError::NotFound("vehículo no encontrado".into()))?;
    if veh.usuario_id != user.id {
        return Err(ApiError::Forbidden);
    }
    let updated: Vehiculo = diesel::update(vehiculos::table.find(id))
        .set((
            vehiculos::soat_vence.eq(req.soat_vence),
            vehiculos::tecnomecanica_vence.eq(req.tecnomecanica_vence),
        ))
        .returning(Vehiculo::as_returning())
        .get_result(&mut conn)
        .await?;
    Ok(Json(VehiculoPerfilDto::from(updated)))
}

async fn listar_vacunas(
    State(state): State<AppState>,
    user: AuthUser,
    Path(mascota_id): Path<Uuid>,
) -> ApiResult<Json<Vec<Vacuna>>> {
    let mut conn = state.pool.get().await?;
    verificar_mascota(&mut conn, mascota_id, &user).await?;
    let rows: Vec<Vacuna> = mascotas_vacunas::table
        .filter(mascotas_vacunas::mascota_id.eq(mascota_id))
        .order(mascotas_vacunas::proxima.asc())
        .select(Vacuna::as_select())
        .load(&mut conn)
        .await?;
    Ok(Json(rows))
}

async fn crear_vacuna(
    State(state): State<AppState>,
    user: AuthUser,
    Path(mascota_id): Path<Uuid>,
    Json(req): Json<NuevaVacunaRequest>,
) -> ApiResult<Json<Vacuna>> {
    if req.vacuna.trim().is_empty() {
        return Err(ApiError::BadRequest("el nombre de la vacuna es obligatorio".into()));
    }
    let mut conn = state.pool.get().await?;
    verificar_mascota(&mut conn, mascota_id, &user).await?;
    let row: Vacuna = diesel::insert_into(mascotas_vacunas::table)
        .values((
            mascotas_vacunas::conjunto_id.eq(user.conjunto_id),
            mascotas_vacunas::mascota_id.eq(mascota_id),
            mascotas_vacunas::vacuna.eq(req.vacuna.trim()),
            mascotas_vacunas::fecha_aplicacion.eq(req.fecha_aplicacion),
            mascotas_vacunas::proxima.eq(req.proxima),
            mascotas_vacunas::certificado_url.eq(req.certificado_url.as_deref()),
        ))
        .returning(Vacuna::as_returning())
        .get_result(&mut conn)
        .await?;
    Ok(Json(row))
}

async fn eliminar_vacuna(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<serde_json::Value>> {
    let mut conn = state.pool.get().await?;
    let vac: Vacuna = mascotas_vacunas::table
        .find(id)
        .select(Vacuna::as_select())
        .first(&mut conn)
        .await
        .optional()?
        .ok_or_else(|| ApiError::NotFound("vacuna no encontrada".into()))?;
    verificar_mascota(&mut conn, vac.mascota_id, &user).await?;
    diesel::delete(mascotas_vacunas::table.find(id))
        .execute(&mut conn)
        .await?;
    Ok(Json(serde_json::json!({ "status": "ok" })))
}

/// Ensure the pet belongs to the caller (and their conjunto).
async fn verificar_mascota(conn: &mut DbConn, mascota_id: Uuid, user: &AuthUser) -> ApiResult<()> {
    let dueno: Option<Uuid> = mascotas::table
        .find(mascota_id)
        .filter(mascotas::conjunto_id.eq(user.conjunto_id))
        .select(mascotas::usuario_id)
        .first(conn)
        .await
        .optional()?;
    match dueno {
        Some(uid) if uid == user.id => Ok(()),
        Some(_) => Err(ApiError::Forbidden),
        None => Err(ApiError::NotFound("mascota no encontrada".into())),
    }
}
