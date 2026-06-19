use axum::extract::{Path, State};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use chrono::Utc;
use rand::Rng;
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::auth::password;
use crate::auth::guard;
use crate::db::enums::{EstadoPaseTemporal, Rol};
use crate::domains::pases_temporales::dto::{
    CrearPaseTemporalRequest, PaseTemporalDto, PermisosDto, ValidacionPaseDto,
    VehiculoTemporalDto,
};
use crate::domains::pases_temporales::models::{
    NuevoPaseTemporal, NuevoVehiculoTemporal,
};
use crate::domains::pases_temporales::repo;
use crate::domains::pases_temporales::repo::upsert_usuario_huesped;
use crate::error::{ApiError, ApiResult};
use crate::services::ws_hub::WsEvent;
use crate::state::AppState;

const ROLES_PASE: &[Rol] = &[Rol::Propietario, Rol::Administrador];

/// Genera un código de acceso único de 8 caracteres alfanuméricos.
fn generar_codigo() -> String {
    let mut rng = rand::thread_rng();
    let chars: Vec<char> = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".chars().collect();
    (0..8).map(|_| chars[rng.gen_range(0..chars.len())]).collect()
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/pases-temporales", post(crear_pase))
        .route("/pases-temporales/mis-pases", get(mis_pases))
        .route("/pases-temporales/mi-pase", get(mi_pase))
        .route("/pases-temporales/validar/{codigo}", get(validar_pase))
        .route("/pases-temporales/{id}/revocar", put(revocar_pase))
}

/// POST /api/v1/pases-temporales — Emitir un nuevo pase temporal (solo PROPIETARIO).
#[utoipa::path(
    post,
    path = "/api/v1/pases-temporales",
    tag = "pases-temporales",
    request_body = CrearPaseTemporalRequest,
    responses(
        (status = 200, body = PaseTemporalDto),
        (status = 403),
        (status = 400)
    )
)]
async fn crear_pase(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CrearPaseTemporalRequest>,
) -> ApiResult<Json<PaseTemporalDto>> {
    guard::require(&user, ROLES_PASE)?;

    if body.fecha_fin <= body.fecha_inicio {
        return Err(ApiError::BadRequest(
            "La fecha de fin debe ser posterior a la fecha de inicio".into(),
        ));
    }

    let codigo = generar_codigo();

    // Clonar antes de mover a NuevoPaseTemporal
    let codigo_clone = codigo.clone();
    let email_clone = body.email_huesped.clone();
    let nombre_clone = body.nombre_huesped.clone();

    let mut conn = state.pool.get().await?;
    let pase = repo::crear_pase(
        &mut conn,
        NuevoPaseTemporal {
            conjunto_id: user.conjunto_id,
            propietario_id: user.id,
            unidad_id: body.unidad_id,
            nombre_anfitrion: body.nombre_anfitrion,
            nombre_huesped: body.nombre_huesped,
            email_huesped: body.email_huesped,
            telefono_huesped: body.telefono_huesped,
            codigo_acceso: codigo,
            fecha_inicio: body.fecha_inicio,
            fecha_fin: body.fecha_fin,
            permiso_gimnasio: body.permiso_gimnasio,
            permiso_piscina: body.permiso_piscina,
            permiso_entrada_salida: body.permiso_entrada_salida,
            permiso_vehiculo: body.permiso_vehiculo,
            permiso_asamblea: body.permiso_asamblea,
            usuario_id: None,
        },
    ).await?;

    // Si el pase tiene email del huésped, crear/activar usuario HUESPED_TEMPORAL
    let usuario_id = if let Some(ref email) = email_clone {
        let hash = password::hash_password_blocking(codigo_clone).await?;
        let usuario = upsert_usuario_huesped(
            &mut conn,
            user.conjunto_id,
            &nombre_clone,
            email,
            &hash,
            body.unidad_id,
        ).await?;
        repo::vincular_usuario(&mut conn, pase.id, usuario.id).await?;
        Some(usuario.id)
    } else {
        None
    };

    let mut vehiculos_dto = vec![];
    if let Some(vehiculos) = body.vehiculos {
        for v in vehiculos {
            let vt = repo::crear_vehiculo(
                &mut conn,
                NuevoVehiculoTemporal {
                    pase_id: pase.id,
                    placa: v.placa,
                    marca: v.marca,
                    modelo: v.modelo,
                    color: v.color,
                },
            ).await?;
            vehiculos_dto.push(VehiculoTemporalDto::from(vt));
        }
    }

    let mut dto = PaseTemporalDto::from(pase);
    dto.vehiculos = vehiculos_dto;

    // Broadcast por WebSocket
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "pase_temporal".into(),
                action: "creado".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;

    Ok(Json(dto))
}

/// GET /api/v1/pases-temporales/mis-pases — Lista los pases emitidos por el propietario autenticado.
#[utoipa::path(
    get,
    path = "/api/v1/pases-temporales/mis-pases",
    tag = "pases-temporales",
    responses((status = 200, body = Vec<PaseTemporalDto>))
)]
async fn mis_pases(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<PaseTemporalDto>>> {
    guard::require(&user, ROLES_PASE)?;

    let mut conn = state.pool.get().await?;
    let pases = repo::pases_por_propietario(&mut conn, user.id).await?;

    let mut result = vec![];
    for pase in pases {
        let vehiculos = repo::vehiculos_por_pase(&mut conn, pase.id).await?;
        let mut dto = PaseTemporalDto::from(pase);
        dto.vehiculos = vehiculos.into_iter().map(VehiculoTemporalDto::from).collect();
        result.push(dto);
    }

    Ok(Json(result))
}

/// GET /api/v1/pases-temporales/mi-pase — El huésped autenticado ve su pase activo.
#[utoipa::path(
    get,
    path = "/api/v1/pases-temporales/mi-pase",
    tag = "pases-temporales",
    responses((status = 200, body = PaseTemporalDto), (status = 404))
)]
async fn mi_pase(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<PaseTemporalDto>> {
    let mut conn = state.pool.get().await?;
    let pase = repo::pase_activo_por_usuario(&mut conn, user.id).await?
        .ok_or_else(|| ApiError::NotFound("No tienes un pase temporal activo".into()))?;

    let vehiculos = repo::vehiculos_por_pase(&mut conn, pase.id).await?;
    let mut dto = PaseTemporalDto::from(pase);
    dto.vehiculos = vehiculos.into_iter().map(VehiculoTemporalDto::from).collect();

    Ok(Json(dto))
}

/// GET /api/v1/pases-temporales/validar/{codigo} — Valida un código de acceso (uso en portería).
#[utoipa::path(
    get,
    path = "/api/v1/pases-temporales/validar/{codigo}",
    tag = "pases-temporales",
    params(("codigo" = String, Path)),
    responses((status = 200, body = ValidacionPaseDto))
)]
async fn validar_pase(
    State(state): State<AppState>,
    Path(codigo): Path<String>,
) -> ApiResult<Json<ValidacionPaseDto>> {
    let mut conn = state.pool.get().await?;
    let pase = repo::pase_por_codigo(&mut conn, &codigo).await?
        .ok_or_else(|| ApiError::NotFound("Código de acceso no encontrado".into()))?;

    let hoy = Utc::now().date_naive();
    let dias_restantes = (pase.fecha_fin - hoy).num_days().max(0);

    let expiro = hoy > pase.fecha_fin;
    let valido = pase.estado == EstadoPaseTemporal::Activo && !expiro;

    let motivo = if !valido {
        if pase.estado == EstadoPaseTemporal::Revocado {
            Some("Este pase ha sido revocado por el propietario.".into())
        } else if expiro {
            Some("Este pase ha expirado.".into())
        } else {
            Some("Este pase no está activo.".into())
        }
    } else {
        None
    };

    let vehiculos = repo::vehiculos_por_pase(&mut conn, pase.id).await?;

    Ok(Json(ValidacionPaseDto {
        valido,
        nombre_huesped: pase.nombre_huesped,
        unidad: format!(
            "Unidad del propietario {}",
            pase.nombre_anfitrion
        ),
        dias_restantes,
        permisos: PermisosDto {
            gimnasio: pase.permiso_gimnasio,
            piscina: pase.permiso_piscina,
            entrada_salida: pase.permiso_entrada_salida,
            vehiculo: pase.permiso_vehiculo,
            asamblea: pase.permiso_asamblea,
        },
        vehiculos: vehiculos.into_iter().map(VehiculoTemporalDto::from).collect(),
        motivo,
    }))
}

/// PUT /api/v1/pases-temporales/{id}/revocar — Revoca un pase temporal (solo el propietario que lo emitió).
#[utoipa::path(
    put,
    path = "/api/v1/pases-temporales/{id}/revocar",
    tag = "pases-temporales",
    responses((status = 200), (status = 403))
)]
async fn revocar_pase(
    State(state): State<AppState>,
    user: AuthUser,
    Path(pase_id): Path<Uuid>,
) -> ApiResult<Json<serde_json::Value>> {
    guard::require(&user, ROLES_PASE)?;

    let mut conn = state.pool.get().await?;
    let pase = repo::pase_por_id(&mut conn, pase_id).await?
        .ok_or_else(|| ApiError::NotFound("Pase no encontrado".into()))?;

    // Solo el propietario que emitió el pase puede revocarlo
    if pase.propietario_id != user.id {
        return Err(ApiError::Forbidden);
    }

    repo::revocar_pase(&mut conn, pase_id).await?;

    Ok(Json(serde_json::json!({"status": "ok"})))
}
