//! Panic / SOS emergency alerts (F1).
//!
//! A resident raises an SOS; on-shift security (VIGILANTE / SUPERVISOR_VIGILANCIA)
//! is notified instantly over WebSocket + web push, and works it through
//! ABIERTA → ATENDIDA → RESUELTA. A partial unique index caps each resident at one
//! active alert so a panicking user can't flood the queue.

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
use crate::db::enums::{EstadoSos, Rol, TipoSos};
use crate::db::schema::{push_subscriptions, sos_alertas, usuarios};
use crate::error::{ApiError, ApiResult};
use crate::services::push::PushSubscriptionInfo;
use crate::services::ws_hub::{ws_events, WsEvent};
use crate::state::AppState;

/// Who may raise an SOS — residents (incl. temporary guests, who may also have an
/// emergency). SUPER_ADMIN bypasses via `guard::require`.
const RESIDENT_ROLES: &[Rol] = &[Rol::Propietario, Rol::Arrendatario, Rol::HuespedTemporal];
/// Who may see and work alerts.
const SECURITY_ROLES: &[Rol] = &[
    Rol::Vigilante,
    Rol::SupervisorVigilancia,
    Rol::Administrador,
    Rol::Concejo,
];

// ── Model ────────────────────────────────────────────────────────────────────

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = sos_alertas, check_for_backend(diesel::pg::Pg))]
pub struct SosAlerta {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub usuario_id: Uuid,
    pub tipo: TipoSos,
    pub estado: EstadoSos,
    pub nota: Option<String>,
    pub ubicacion: Option<String>,
    pub atendida_por_id: Option<Uuid>,
    pub fecha_atendida: Option<DateTime<Utc>>,
    pub resuelta_por_id: Option<Uuid>,
    pub fecha_resuelta: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

// ── State machine (pure) ─────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug)]
pub enum SosAccion {
    Atender,
    Resolver,
    Cancelar,
}

/// Validate an SOS state transition. ABIERTA can be attended or resolved directly
/// (false alarm); an attended alert can only be resolved; resolved is terminal.
pub fn aplicar_transicion(actual: EstadoSos, accion: SosAccion) -> ApiResult<EstadoSos> {
    use EstadoSos::*;
    use SosAccion::*;
    match (actual, accion) {
        (Abierta, Atender) => Ok(Atendida),
        (Abierta, Resolver) => Ok(Resuelta),
        (Abierta, Cancelar) => Ok(Resuelta),
        (Atendida, Resolver) => Ok(Resuelta),
        _ => Err(ApiError::BadRequest("transición de SOS inválida".into())),
    }
}

// ── DTOs ─────────────────────────────────────────────────────────────────────

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CrearSosRequest {
    pub tipo: TipoSos,
    pub nota: Option<String>,
    pub ubicacion: Option<String>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SosDto {
    pub id: Uuid,
    pub usuario_id: Uuid,
    pub usuario_nombre: Option<String>,
    pub tipo: TipoSos,
    pub estado: EstadoSos,
    pub nota: Option<String>,
    pub ubicacion: Option<String>,
    pub atendida_por_id: Option<Uuid>,
    pub fecha_atendida: Option<DateTime<Utc>>,
    pub resuelta_por_id: Option<Uuid>,
    pub fecha_resuelta: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

impl SosDto {
    fn from_parts(a: SosAlerta, usuario_nombre: Option<String>) -> Self {
        Self {
            id: a.id,
            usuario_id: a.usuario_id,
            usuario_nombre,
            tipo: a.tipo,
            estado: a.estado,
            nota: a.nota,
            ubicacion: a.ubicacion,
            atendida_por_id: a.atendida_por_id,
            fecha_atendida: a.fecha_atendida,
            resuelta_por_id: a.resuelta_por_id,
            fecha_resuelta: a.fecha_resuelta,
            created_at: a.created_at,
        }
    }
}

// ── Router ───────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/sos", post(crear).get(listar))
        .route("/sos/activa", get(mi_activa))
        .route("/sos/{id}/atender", post(atender))
        .route("/sos/{id}/resolver", post(resolver))
        .route("/sos/{id}/cancelar", post(cancelar))
}

// ── Handlers ─────────────────────────────────────────────────────────────────

/// Resident raises an SOS → persisted, then security is alerted (WS + push) < 2s.
async fn crear(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CrearSosRequest>,
) -> ApiResult<Json<SosDto>> {
    guard::require(&user, RESIDENT_ROLES)?;
    let mut conn = state.pool.get().await?;

    // One active alert per resident (the unique index is the race-proof backstop).
    let activa: Option<Uuid> = sos_alertas::table
        .filter(sos_alertas::usuario_id.eq(user.id))
        .filter(sos_alertas::estado.eq_any(vec![EstadoSos::Abierta, EstadoSos::Atendida]))
        .select(sos_alertas::id)
        .first(&mut conn)
        .await
        .optional()?;
    if activa.is_some() {
        return Err(ApiError::Conflict("ya tienes una alerta SOS activa".into()));
    }

    let alerta: SosAlerta = diesel::insert_into(sos_alertas::table)
        .values((
            sos_alertas::conjunto_id.eq(user.conjunto_id),
            sos_alertas::usuario_id.eq(user.id),
            sos_alertas::tipo.eq(req.tipo),
            sos_alertas::nota.eq(req.nota.as_deref()),
            sos_alertas::ubicacion.eq(req.ubicacion.as_deref()),
        ))
        .returning(SosAlerta::as_returning())
        .get_result(&mut conn)
        .await?;

    let dto = SosDto::from_parts(alerta, Some(user.nombre.clone()));

    // Realtime: broadcast on the `sos` domain — only security screens subscribe.
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent::broadcast(
                ws_events::SOS,
                ws_events::action::CREATED,
                Some(serde_json::to_value(&dto).unwrap_or_default()),
            ),
        )
        .await;

    // Web push to every on-shift security device (best-effort).
    notificar_seguridad(&mut conn, &state, user.conjunto_id, &dto).await;

    Ok(Json(dto))
}

/// Security console: active alerts (ABIERTA/ATENDIDA), newest first, with reporter name.
async fn listar(State(state): State<AppState>, user: AuthUser) -> ApiResult<Json<Vec<SosDto>>> {
    guard::require(&user, SECURITY_ROLES)?;
    let mut conn = state.pool.get().await?;

    let rows: Vec<(SosAlerta, String)> = sos_alertas::table
        .inner_join(usuarios::table.on(usuarios::id.eq(sos_alertas::usuario_id)))
        .filter(sos_alertas::conjunto_id.eq(user.conjunto_id))
        .filter(sos_alertas::estado.eq_any(vec![EstadoSos::Abierta, EstadoSos::Atendida]))
        .order(sos_alertas::created_at.desc())
        .select((SosAlerta::as_select(), usuarios::nombre))
        .load(&mut conn)
        .await?;

    Ok(Json(
        rows.into_iter()
            .map(|(a, nombre)| SosDto::from_parts(a, Some(nombre)))
            .collect(),
    ))
}

/// Resident fetches their own active SOS (if any) — restore state on page reload.
async fn mi_activa(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Option<SosDto>>> {
    guard::require(&user, RESIDENT_ROLES)?;
    let mut conn = state.pool.get().await?;

    let alerta: Option<(SosAlerta, String)> = sos_alertas::table
        .inner_join(usuarios::table.on(usuarios::id.eq(sos_alertas::usuario_id)))
        .filter(sos_alertas::usuario_id.eq(user.id))
        .filter(sos_alertas::conjunto_id.eq(user.conjunto_id))
        .filter(sos_alertas::estado.eq_any(vec![EstadoSos::Abierta, EstadoSos::Atendida]))
        .select((SosAlerta::as_select(), usuarios::nombre))
        .first(&mut conn)
        .await
        .optional()?;

    Ok(Json(alerta.map(|(a, nombre)| SosDto::from_parts(a, Some(nombre)))))
}

async fn atender(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<SosDto>> {
    transicionar(state, user, id, SosAccion::Atender).await
}

async fn resolver(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<SosDto>> {
    transicionar(state, user, id, SosAccion::Resolver).await
}

async fn transicionar(
    state: AppState,
    user: AuthUser,
    id: Uuid,
    accion: SosAccion,
) -> ApiResult<Json<SosDto>> {
    guard::require(&user, SECURITY_ROLES)?;
    let mut conn = state.pool.get().await?;

    let alerta: SosAlerta = sos_alertas::table
        .find(id)
        .select(SosAlerta::as_select())
        .first(&mut conn)
        .await
        .optional()?
        .ok_or_else(|| ApiError::NotFound("alerta SOS no encontrada".into()))?;
    if alerta.conjunto_id != user.conjunto_id {
        return Err(ApiError::Forbidden);
    }

    let nuevo = aplicar_transicion(alerta.estado, accion)?;
    let now = Utc::now();
    let updated: SosAlerta = match accion {
        SosAccion::Cancelar => unreachable!("transicionar is only called for atender/resolver"),
        SosAccion::Atender => {
            diesel::update(sos_alertas::table.find(id))
                .set((
                    sos_alertas::estado.eq(nuevo),
                    sos_alertas::atendida_por_id.eq(user.id),
                    sos_alertas::fecha_atendida.eq(now),
                ))
                .returning(SosAlerta::as_returning())
                .get_result(&mut conn)
                .await?
        }
        SosAccion::Resolver => {
            diesel::update(sos_alertas::table.find(id))
                .set((
                    sos_alertas::estado.eq(nuevo),
                    sos_alertas::resuelta_por_id.eq(user.id),
                    sos_alertas::fecha_resuelta.eq(now),
                ))
                .returning(SosAlerta::as_returning())
                .get_result(&mut conn)
                .await?
        }
    };

    let dto = SosDto::from_parts(updated, None);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent::broadcast(
                ws_events::SOS,
                ws_events::action::UPDATED,
                Some(serde_json::to_value(&dto).unwrap_or_default()),
            ),
        )
        .await;
    Ok(Json(dto))
}

/// Resident cancels their own active SOS (ABIERTA → RESUELTA).
async fn cancelar(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<SosDto>> {
    guard::require(&user, RESIDENT_ROLES)?;
    let mut conn = state.pool.get().await?;

    let alerta: SosAlerta = sos_alertas::table
        .find(id)
        .select(SosAlerta::as_select())
        .first(&mut conn)
        .await
        .optional()?
        .ok_or_else(|| ApiError::NotFound("alerta SOS no encontrada".into()))?;

    if alerta.usuario_id != user.id {
        return Err(ApiError::Forbidden);
    }
    if alerta.conjunto_id != user.conjunto_id {
        return Err(ApiError::Forbidden);
    }

    aplicar_transicion(alerta.estado, SosAccion::Cancelar)?;

    let now = Utc::now();
    let updated: SosAlerta = diesel::update(sos_alertas::table.find(id))
        .set((
            sos_alertas::estado.eq(EstadoSos::Resuelta),
            sos_alertas::resuelta_por_id.eq(user.id),
            sos_alertas::fecha_resuelta.eq(now),
        ))
        .returning(SosAlerta::as_returning())
        .get_result(&mut conn)
        .await?;

    let dto = SosDto::from_parts(updated, None);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent::broadcast(
                ws_events::SOS,
                ws_events::action::UPDATED,
                Some(serde_json::to_value(&dto).unwrap_or_default()),
            ),
        )
        .await;
    Ok(Json(dto))
}

/// Best-effort web push to every registered device of an on-shift security user.
async fn notificar_seguridad(
    conn: &mut crate::db::DbConn,
    state: &AppState,
    conjunto_id: Uuid,
    dto: &SosDto,
) {
    let roles = [Rol::Vigilante.as_str(), Rol::SupervisorVigilancia.as_str()];
    let subs: Vec<(String, String, String)> = match push_subscriptions::table
        .inner_join(usuarios::table.on(usuarios::id.eq(push_subscriptions::usuario_id)))
        .filter(push_subscriptions::conjunto_id.eq(conjunto_id))
        .filter(usuarios::rol.eq_any(roles))
        .select((
            push_subscriptions::endpoint,
            push_subscriptions::p256dh,
            push_subscriptions::auth,
        ))
        .load(conn)
        .await
    {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!("sos: cargando suscripciones de seguridad: {e}");
            return;
        }
    };

    let quien = dto.usuario_nombre.as_deref().unwrap_or("Un residente");
    let donde = dto.ubicacion.as_deref().unwrap_or("");
    let payload = serde_json::json!({
        "title": format!("🚨 SOS — {}", dto.tipo.as_str()),
        "body": format!("{quien} solicita ayuda. {donde}").trim(),
        "data": { "url": "/vigilancia", "sosId": dto.id },
    });
    let bytes = serde_json::to_vec(&payload).unwrap_or_default();
    for (endpoint, p256dh, auth) in subs {
        let info = PushSubscriptionInfo {
            endpoint: endpoint.clone(),
            p256dh,
            auth,
        };
        if let Err(e) = state.push_sender.send(&info, &bytes).await {
            tracing::warn!(endpoint = %endpoint, error = ?e, "sos push failed");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_transitions_advance_state() {
        assert!(matches!(
            aplicar_transicion(EstadoSos::Abierta, SosAccion::Atender).unwrap(),
            EstadoSos::Atendida
        ));
        assert!(matches!(
            aplicar_transicion(EstadoSos::Abierta, SosAccion::Resolver).unwrap(),
            EstadoSos::Resuelta
        ));
        assert!(matches!(
            aplicar_transicion(EstadoSos::Atendida, SosAccion::Resolver).unwrap(),
            EstadoSos::Resuelta
        ));
    }

    #[test]
    fn cancelar_resolves_open_alert() {
        assert!(matches!(
            aplicar_transicion(EstadoSos::Abierta, SosAccion::Cancelar).unwrap(),
            EstadoSos::Resuelta
        ));
    }

    #[test]
    fn invalid_transitions_are_rejected() {
        // Re-attending an attended alert, or touching a resolved one, is invalid.
        assert!(aplicar_transicion(EstadoSos::Abierta, SosAccion::Atender).is_err());
        assert!(aplicar_transicion(EstadoSos::Resuelta, SosAccion::Atender).is_err());
        assert!(aplicar_transicion(EstadoSos::Resuelta, SosAccion::Resolver).is_err());
        assert!(aplicar_transicion(EstadoSos::Atendida, SosAccion::Cancelar).is_err());
        assert!(aplicar_transicion(EstadoSos::Resuelta, SosAccion::Cancelar).is_err());
    }
}
