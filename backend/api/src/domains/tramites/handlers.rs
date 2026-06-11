use axum::extract::{Path, State};
use axum::routing::{get, put};
use axum::{Json, Router};
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::auth::guard;
use crate::db::enums::{EstadoTramite, Rol, TipoTramite};
use crate::domains::tramites::dto::{
    CreateTramiteRequest, DecisionTramite, MascotaPayload, ResolverTramiteRequest,
    TramiteConSolicitanteDto, TramiteDto, VehiculoPayload,
};
use crate::domains::tramites::models::NuevoTramite;
use crate::domains::tramites::repo;
use crate::error::{ApiError, ApiResult};
use crate::services::ws_hub::WsEvent;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/tramites", get(listar_tramites).post(crear_tramite))
        .route("/tramites/{id}/resolver", put(resolver_tramite))
}

#[utoipa::path(
    get,
    path = "/api/v1/tramites",
    tag = "tramites",
    responses(
        (status = 200, description = "Latest 50 trámites — residents see their own, ADMINISTRADOR/CONCEJO the whole conjunto", body = [TramiteConSolicitanteDto]),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn listar_tramites(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<TramiteConSolicitanteDto>>> {
    let solo_usuario = match user.rol {
        Rol::Administrador | Rol::Concejo => None,
        _ => Some(user.id),
    };
    let mut conn = state.pool.get().await?;
    let rows = repo::listar_tramites(&mut conn, user.conjunto_id, solo_usuario).await?;
    Ok(Json(
        rows.into_iter()
            .map(|(tramite, solicitante)| TramiteConSolicitanteDto {
                tramite: tramite.into(),
                solicitante: solicitante.into(),
            })
            .collect(),
    ))
}

#[utoipa::path(
    post,
    path = "/api/v1/tramites",
    tag = "tramites",
    request_body = CreateTramiteRequest,
    responses(
        (status = 200, description = "Trámite created (estado PENDIENTE); every ADMINISTRADOR of the conjunto gets a notification", body = TramiteDto),
        (status = 400, description = "payload must be a JSON object"),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn crear_tramite(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreateTramiteRequest>,
) -> ApiResult<Json<TramiteDto>> {
    if !req.payload.is_object() {
        return Err(ApiError::BadRequest(
            "payload debe ser un objeto JSON".into(),
        ));
    }
    let documentos = serde_json::to_value(req.documentos.unwrap_or_default())
        .map_err(|e| ApiError::BadRequest(format!("documentos inválidos: {e}")))?;
    let mut conn = state.pool.get().await?;
    let tramite = repo::crear_tramite_con_notificaciones(
        &mut conn,
        NuevoTramite {
            conjunto_id: user.conjunto_id,
            usuario_id: user.id,
            tipo: req.tipo,
            payload: req.payload,
            documentos,
        },
        &user.nombre,
    )
    .await?;
    let dto = TramiteDto::from(tramite);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "tramite".into(),
                action: "created".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}

#[utoipa::path(
    put,
    path = "/api/v1/tramites/{id}/resolver",
    tag = "tramites",
    params(("id" = Uuid, Path, description = "Trámite id")),
    request_body = ResolverTramiteRequest,
    responses(
        (status = 200, description = "Trámite resolved; on APROBADO the asset (vehículo/mascota) is created in the same transaction and the requester is notified", body = TramiteDto),
        (status = 403, description = "Requires ADMINISTRADOR role"),
        (status = 404, description = "Trámite not found in this conjunto"),
        (status = 409, description = "Trámite already resolved, or duplicate placa"),
        (status = 422, description = "Trámite payload does not match the typed shape for its tipo")
    )
)]
pub async fn resolver_tramite(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<ResolverTramiteRequest>,
) -> ApiResult<Json<TramiteDto>> {
    guard::require(&user, &[Rol::Administrador])?;
    let mut conn = state.pool.get().await?;
    let tramite = repo::find_tramite(&mut conn, user.conjunto_id, id)
        .await?
        .ok_or_else(|| ApiError::NotFound("trámite no encontrado".into()))?;
    if tramite.estado != EstadoTramite::Pendiente {
        return Err(ApiError::Conflict("el trámite ya fue procesado".into()));
    }

    let aprobado = req.decision == DecisionTramite::Aprobado;
    let mut vehiculo: Option<VehiculoPayload> = None;
    let mut mascota: Option<MascotaPayload> = None;
    if aprobado {
        match tramite.tipo {
            TipoTramite::Vehiculo => {
                vehiculo = Some(
                    serde_json::from_value(tramite.payload.clone()).map_err(|e| {
                        ApiError::Unprocessable(format!("payload de vehículo inválido: {e}"))
                    })?,
                );
            }
            TipoTramite::Mascota => {
                mascota = Some(
                    serde_json::from_value(tramite.payload.clone()).map_err(|e| {
                        ApiError::Unprocessable(format!("payload de mascota inválido: {e}"))
                    })?,
                );
            }
            _ => {}
        }
    }

    let resuelto = repo::resolver_tramite(
        &mut conn,
        user.conjunto_id,
        id,
        user.id,
        aprobado,
        req.observacion,
        vehiculo,
        mascota,
    )
    .await?;
    let dto = TramiteDto::from(resuelto);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "tramite".into(),
                action: "resolved".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}
