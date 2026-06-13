use axum::extract::{Path, State};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::auth::guard;
use crate::db::enums::Rol;
use crate::domains::parqueadero::dto::{
    AsignarCeldaRequest, CeldaDto, CeldaMapaDto, CreateRondaRequest, CreateVehiculoRequest,
    OcupanteDto, ParqueaderoMioDto, ParqueaderoStatsDto, RegistroDto, RondaDto, UpdateCeldaRequest,
    VehiculoDto,
};
use crate::domains::parqueadero::models::NuevoVehiculo;
use crate::domains::parqueadero::repo;
use crate::error::{ApiError, ApiResult};
use crate::services::ws_hub::WsEvent;
use crate::state::AppState;

/// Parking managers (legacy /api/parqueadero/* role list + supervisor).
const ROLES_PARQUEADERO: &[Rol] = &[
    Rol::EncargadoParqueadero,
    Rol::SupervisorVigilancia,
    Rol::Administrador,
];

/// Registros readers: managers plus VIGILANTE (own rows only).
const ROLES_REGISTROS: &[Rol] = &[
    Rol::EncargadoParqueadero,
    Rol::SupervisorVigilancia,
    Rol::Administrador,
    Rol::Vigilante,
];

/// Staff who walk rounds (legacy POST /api/parqueadero/rondas).
const ROLES_RONDAS: &[Rol] = &[
    Rol::EncargadoParqueadero,
    Rol::Vigilante,
    Rol::SupervisorVigilancia,
];

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/parqueadero/mio", get(parqueadero_mio))
        .route("/vehiculos", post(crear_vehiculo))
        .route("/parqueadero/mapa", get(mapa))
        .route("/parqueadero/celdas/{id}", put(actualizar_celda))
        .route("/parqueadero/celdas/{id}/asignar", post(asignar_celda))
        .route("/parqueadero/celdas/{id}/liberar", post(liberar_celda))
        .route("/parqueadero/registros", get(registros))
        .route("/parqueadero/rondas", get(ronda_de_hoy).post(crear_ronda))
        .route("/parqueadero/stats", get(parqueadero_stats))
}

#[utoipa::path(
    get,
    path = "/api/v1/parqueadero/mio",
    tag = "parqueadero",
    responses(
        (status = 200, description = "Own vehicles and permanently assigned cells", body = ParqueaderoMioDto),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn parqueadero_mio(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<ParqueaderoMioDto>> {
    let mut conn = state.pool.get().await?;
    let vehiculos = repo::vehiculos_propios(&mut conn, user.conjunto_id, user.id).await?;
    let celdas = repo::celdas_propias(&mut conn, user.conjunto_id, user.id).await?;
    Ok(Json(ParqueaderoMioDto {
        vehiculos: vehiculos.into_iter().map(VehiculoDto::from).collect(),
        celdas: celdas.into_iter().map(CeldaDto::from).collect(),
    }))
}

#[utoipa::path(
    post,
    path = "/api/v1/vehiculos",
    tag = "parqueadero",
    request_body = CreateVehiculoRequest,
    responses(
        (status = 200, description = "Vehicle registered", body = VehiculoDto),
        (status = 409, description = "Placa already registered")
    )
)]
pub async fn crear_vehiculo(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreateVehiculoRequest>,
) -> ApiResult<Json<VehiculoDto>> {
    let placa = req.placa.trim().to_uppercase();
    if placa.is_empty() {
        return Err(ApiError::BadRequest("la placa es obligatoria".into()));
    }
    let mut conn = state.pool.get().await?;
    let vehiculo = repo::crear_vehiculo(
        &mut conn,
        NuevoVehiculo {
            conjunto_id: user.conjunto_id,
            usuario_id: user.id,
            placa,
            marca: req.marca,
            modelo: req.modelo,
            color: req.color,
            tipo: req.tipo,
        },
    )
    .await?;
    let dto = VehiculoDto::from(vehiculo);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "vehiculo".into(),
                action: "created".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}

#[utoipa::path(
    get,
    path = "/api/v1/parqueadero/mapa",
    tag = "parqueadero",
    responses(
        (status = 200, description = "Every cell of the conjunto with occupant info", body = [CeldaMapaDto]),
        (status = 403, description = "Requires parking manager role")
    )
)]
pub async fn mapa(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<CeldaMapaDto>>> {
    guard::require(&user, ROLES_PARQUEADERO)?;
    let mut conn = state.pool.get().await?;
    let rows = repo::mapa(&mut conn, user.conjunto_id).await?;
    Ok(Json(
        rows.into_iter()
            .map(|(celda, ocupante)| CeldaMapaDto {
                celda: celda.into(),
                ocupante: ocupante.map(|(nombre, torre, apto)| OcupanteDto {
                    nombre,
                    torre,
                    apto,
                }),
            })
            .collect(),
    ))
}

#[utoipa::path(
    put,
    path = "/api/v1/parqueadero/celdas/{id}",
    tag = "parqueadero",
    params(("id" = Uuid, Path, description = "Cell id")),
    request_body = UpdateCeldaRequest,
    responses(
        (status = 200, description = "Cell state updated (audit row written)", body = CeldaDto),
        (status = 403, description = "Requires parking manager role"),
        (status = 404, description = "Cell not found in this conjunto")
    )
)]
pub async fn actualizar_celda(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateCeldaRequest>,
) -> ApiResult<Json<CeldaDto>> {
    guard::require(&user, ROLES_PARQUEADERO)?;
    let mut conn = state.pool.get().await?;
    let celda =
        repo::actualizar_celda(&mut conn, user.conjunto_id, id, user.id, req.estado).await?;
    let dto = CeldaDto::from(celda);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "parqueadero".into(),
                action: "celda_updated".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}

#[utoipa::path(
    post,
    path = "/api/v1/parqueadero/celdas/{id}/asignar",
    tag = "parqueadero",
    params(("id" = Uuid, Path, description = "Cell id")),
    request_body = AsignarCeldaRequest,
    responses(
        (status = 200, description = "Cell assigned to resident with optional time clause", body = CeldaDto),
        (status = 403, description = "Requires parking manager role"),
        (status = 404, description = "Cell not found in this conjunto"),
        (status = 409, description = "Cell already occupied")
    )
)]
pub async fn asignar_celda(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<AsignarCeldaRequest>,
) -> ApiResult<Json<CeldaDto>> {
    guard::require(&user, ROLES_PARQUEADERO)?;
    let mut conn = state.pool.get().await?;
    let celda = repo::asignar_celda(
        &mut conn,
        user.conjunto_id,
        id,
        user.id,
        req.usuario_id,
        req.meses,
    )
    .await?;
    let dto = CeldaDto::from(celda);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "parqueadero".into(),
                action: "celda_asignada".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}

#[utoipa::path(
    post,
    path = "/api/v1/parqueadero/celdas/{id}/liberar",
    tag = "parqueadero",
    params(("id" = Uuid, Path, description = "Cell id")),
    responses(
        (status = 200, description = "Cell released (now DISPONIBLE)", body = CeldaDto),
        (status = 403, description = "Requires parking manager role"),
        (status = 404, description = "Cell not found in this conjunto")
    )
)]
pub async fn liberar_celda(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<CeldaDto>> {
    guard::require(&user, ROLES_PARQUEADERO)?;
    let mut conn = state.pool.get().await?;
    let celda = repo::liberar_celda(&mut conn, user.conjunto_id, id, user.id).await?;
    let dto = CeldaDto::from(celda);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "parqueadero".into(),
                action: "celda_liberada".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}

#[utoipa::path(
    get,
    path = "/api/v1/parqueadero/registros",
    tag = "parqueadero",
    responses(
        (status = 200, description = "Latest 50 audit entries (VIGILANTE sees only own)", body = [RegistroDto]),
        (status = 403, description = "Requires parking/gate staff role")
    )
)]
pub async fn registros(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<RegistroDto>>> {
    guard::require(&user, ROLES_REGISTROS)?;
    let solo_de_usuario = (user.rol == Rol::Vigilante).then_some(user.id);
    let mut conn = state.pool.get().await?;
    let rows = repo::registros(&mut conn, user.conjunto_id, solo_de_usuario).await?;
    Ok(Json(
        rows.into_iter()
            .map(
                |(r, celda_numero, celda_tipo, usuario_nombre)| RegistroDto {
                    id: r.id,
                    parqueadero_id: r.parqueadero_id,
                    usuario_id: r.usuario_id,
                    tipo: r.tipo,
                    placa: r.placa,
                    observacion: r.observacion,
                    fecha: r.fecha,
                    celda_numero,
                    celda_tipo,
                    usuario_nombre,
                },
            )
            .collect(),
    ))
}

#[utoipa::path(
    get,
    path = "/api/v1/parqueadero/rondas",
    tag = "parqueadero",
    responses(
        (status = 200, description = "Today's latest own round, or null", body = Option<RondaDto>),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn ronda_de_hoy(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Option<RondaDto>>> {
    let mut conn = state.pool.get().await?;
    let ronda = repo::ronda_de_hoy(&mut conn, user.conjunto_id, user.id).await?;
    Ok(Json(ronda.map(RondaDto::from)))
}

#[utoipa::path(
    post,
    path = "/api/v1/parqueadero/rondas",
    tag = "parqueadero",
    request_body = CreateRondaRequest,
    responses(
        (status = 200, description = "Round recorded", body = RondaDto),
        (status = 403, description = "Requires parking/gate staff role")
    )
)]
pub async fn crear_ronda(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreateRondaRequest>,
) -> ApiResult<Json<RondaDto>> {
    guard::require(&user, ROLES_RONDAS)?;
    let hallazgos = serde_json::to_value(&req.hallazgos)
        .map_err(|e| ApiError::BadRequest(format!("hallazgos inválidos: {e}")))?;
    let mut conn = state.pool.get().await?;
    let ronda = repo::crear_ronda(
        &mut conn,
        user.conjunto_id,
        user.id,
        hallazgos,
        req.completada,
    )
    .await?;
    let dto = RondaDto::from(ronda);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "parqueadero".into(),
                action: "ronda_created".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}

#[utoipa::path(
    get,
    path = "/api/v1/parqueadero/stats",
    tag = "parqueadero",
    responses(
        (status = 200, description = "Cell occupancy counters", body = ParqueaderoStatsDto),
        (status = 403, description = "Requires parking manager role")
    )
)]
pub async fn parqueadero_stats(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<ParqueaderoStatsDto>> {
    guard::require(&user, ROLES_PARQUEADERO)?;
    let mut conn = state.pool.get().await?;
    let (total, ocupados) = repo::stats(&mut conn, user.conjunto_id).await?;
    let porcentaje_ocupacion = if total > 0 {
        (ocupados as f64 / total as f64 * 100.0).round() as i64
    } else {
        0
    };
    Ok(Json(ParqueaderoStatsDto {
        total,
        ocupados,
        libres: total - ocupados,
        porcentaje_ocupacion,
    }))
}
