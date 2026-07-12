use axum::extract::{Path, State};
use axum::routing::{get, put};
use axum::{Json, Router};
use diesel_async::scoped_futures::ScopedFutureExt;
use diesel_async::AsyncConnection;
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::db::enums::Rol;
use crate::domains::pagos::dto::{PagarRequest, PagoDto, PagosResponse, ReciboDto};
use crate::domains::pagos::repo;
use crate::error::{ApiError, ApiResult};
use crate::services::ws_hub::WsEvent;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/pagos", get(listar_pagos))
        .route("/pagos/{id}/pagar", put(pagar))
        .route("/pagos/{id}/estado", get(estado_pago))
}

/// Deny-list gate (not an allowlist: every resident-shaped role may pay).
/// A HUESPED_TEMPORAL account is created WITH the host's `unidad_id`
/// (pases_temporales), and every handler here scopes by that unidad — without
/// this check a temporary guest could read the host unit's full debt/recibos
/// and drive the pagar flow.
fn deny_huesped(user: &AuthUser) -> ApiResult<()> {
    if user.rol == Rol::HuespedTemporal {
        return Err(ApiError::Forbidden);
    }
    Ok(())
}

#[utoipa::path(
    get,
    path = "/api/v1/pagos",
    tag = "pagos",
    responses(
        (status = 200, description = "Own unit's fees (latest 24) and utility bills (latest 12); empty without a unit", body = PagosResponse),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn listar_pagos(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<PagosResponse>> {
    deny_huesped(&user)?;
    let mut conn = state.pool.get().await?;
    let Some(unidad_id) = repo::unidad_de_usuario(&mut conn, user.conjunto_id, user.id).await?
    else {
        return Ok(Json(PagosResponse {
            pagos: vec![],
            recibos: vec![],
        }));
    };
    let pagos = repo::pagos_de_unidad(&mut conn, user.conjunto_id, unidad_id).await?;
    let recibos = repo::recibos_de_unidad(&mut conn, user.conjunto_id, unidad_id).await?;
    Ok(Json(PagosResponse {
        pagos: pagos.into_iter().map(PagoDto::from).collect(),
        recibos: recibos.into_iter().map(ReciboDto::from).collect(),
    }))
}

#[utoipa::path(
    put,
    path = "/api/v1/pagos/{id}/pagar",
    tag = "pagos",
    params(("id" = Uuid, Path, description = "Pago id")),
    request_body = PagarRequest,
    responses(
        (status = 200, description = "Payment simulated and persisted", body = PagoDto),
        (status = 404, description = "Pago not found or not owned by the caller")
    )
)]
pub async fn pagar(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<PagarRequest>,
) -> ApiResult<Json<PagoDto>> {
    deny_huesped(&user)?;
    let mut conn = state.pool.get().await?;
    let gateway = state.payment_gateway.clone();
    // Charge atomically: take a FOR UPDATE lock on the pago, re-check it is still
    // PENDIENTE, charge, and persist — all in one transaction. This serializes
    // concurrent charges of the same pago so it can never be charged twice
    // (the TOCTOU double-charge race). Pending gateway flows (Nequi) are
    // reconciled via estado_pago, not by re-charging.
    let updated = conn
        .transaction(|conn| {
            async move {
                let pago = repo::pago_por_id_locked(conn, user.conjunto_id, user.id, id)
                    .await?
                    .ok_or_else(|| ApiError::NotFound("pago no encontrado".into()))?;

                if pago.estado != crate::db::enums::EstadoPago::Pendiente {
                    return Err(ApiError::BadRequest("el pago no está pendiente".into()));
                }

                let result = gateway
                    .cobrar(req.telefono.as_deref(), &pago.monto, &pago.id.to_string())
                    .await
                    .map_err(|e| ApiError::ServiceUnavailable(format!("pasarela de pago: {e}")))?;

                let updated = repo::aplicar_estado_pago(
                    conn,
                    user.conjunto_id,
                    user.id,
                    id,
                    result.estado.to_estado(),
                    req.metodo,
                    &result.referencia,
                )
                .await?
                .ok_or_else(|| ApiError::NotFound("pago no encontrado".into()))?;
                Ok::<_, ApiError>(updated)
            }
            .scope_boxed()
        })
        .await?;

    let dto = PagoDto::from(updated);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "pago".into(),
                action: "updated".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}

/// Poll the gateway for a pending payment's outcome and reconcile it. Idempotent:
/// an already-paid pago stays paid; a still-pending one is left untouched.
#[utoipa::path(
    get,
    path = "/api/v1/pagos/{id}/estado",
    tag = "pagos",
    params(("id" = Uuid, Path, description = "Pago id")),
    responses(
        (status = 200, description = "Reconciled pago after polling the gateway", body = PagoDto),
        (status = 404, description = "Pago not found or not owned by the caller"),
        (status = 503, description = "Payment gateway unavailable")
    )
)]
pub async fn estado_pago(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<PagoDto>> {
    deny_huesped(&user)?;
    let mut conn = state.pool.get().await?;
    let pago = repo::pago_por_id(&mut conn, user.conjunto_id, user.id, id)
        .await?
        .ok_or_else(|| ApiError::NotFound("pago no encontrado".into()))?;

    // Only reconcile a pending pago that carries a provider reference.
    let referencia = match (&pago.estado, &pago.wompi_ref) {
        (crate::db::enums::EstadoPago::Pendiente, Some(r)) => r.clone(),
        _ => return Ok(Json(PagoDto::from(pago))),
    };

    let outcome = state
        .payment_gateway
        .estado(&referencia)
        .await
        .map_err(|e| ApiError::ServiceUnavailable(format!("pasarela de pago: {e}")))?;
    let nuevo = outcome.to_estado();
    if nuevo == pago.estado {
        return Ok(Json(PagoDto::from(pago)));
    }

    let metodo = pago.metodo.unwrap_or(crate::db::enums::MetodoPago::Nequi);
    let updated = repo::aplicar_estado_pago(
        &mut conn,
        user.conjunto_id,
        user.id,
        id,
        nuevo,
        metodo,
        &referencia,
    )
    .await?
    .ok_or_else(|| ApiError::NotFound("pago no encontrado".into()))?;

    let dto = PagoDto::from(updated);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "pago".into(),
                action: "updated".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}
