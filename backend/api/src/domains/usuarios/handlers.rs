use axum::extract::{Query, State};
use axum::routing::get;
use axum::{Json, Router};
use serde::Deserialize;

use crate::auth::extract::AuthUser;
use crate::domains::usuarios::dto::{
    DirectorioUsuarioDto, MascotaPerfilDto, ProfileResponse, UnidadDto, UpdateProfileRequest,
    UserDto, VehiculoPerfilDto,
};
use crate::domains::usuarios::repo::{self, ProfileChanges};
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

/// Legacy /api/user/profile-save skipped avatars over 150 KB; we reject instead
/// of silently dropping (Constitution Law 4).
const MAX_AVATAR_BYTES: usize = 150 * 1024;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/usuarios/me/profile", get(get_profile).put(update_profile))
        .route("/usuarios/directorio", get(directorio))
}

#[derive(Deserialize)]
pub struct DirectorioQuery {
    #[serde(default)]
    pub q: Option<String>,
}

/// Citofonía directory: active users in the caller's conjunto (excluding self),
/// optionally filtered by name or internal number. Powers the search picker.
#[utoipa::path(
    get,
    path = "/api/v1/usuarios/directorio",
    tag = "usuarios",
    params(("q" = Option<String>, Query, description = "Filter by name or internal number")),
    responses(
        (status = 200, description = "Directory entries", body = [DirectorioUsuarioDto]),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn directorio(
    State(state): State<AppState>,
    user: AuthUser,
    Query(query): Query<DirectorioQuery>,
) -> ApiResult<Json<Vec<DirectorioUsuarioDto>>> {
    let mut conn = state.pool.get().await?;
    let rows = repo::directorio(&mut conn, user.conjunto_id, user.id, query.q.as_deref()).await?;
    let out = rows
        .into_iter()
        .map(
            |(id, nombre, numero_interno, rol, torre, apto)| DirectorioUsuarioDto {
                id,
                nombre,
                numero_interno,
                rol,
                torre,
                apto,
            },
        )
        .collect();
    Ok(Json(out))
}

#[utoipa::path(
    get,
    path = "/api/v1/usuarios/me/profile",
    tag = "usuarios",
    responses(
        (status = 200, description = "Own profile with unit", body = ProfileResponse),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn get_profile(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<ProfileResponse>> {
    let mut conn = state.pool.get().await?;
    let usuario = repo::find_by_id(&mut conn, user.id)
        .await?
        .ok_or(ApiError::Unauthorized)?;
    let unidad = match usuario.unidad_id {
        Some(id) => repo::find_unidad(&mut conn, id).await?.map(UnidadDto::from),
        None => None,
    };
    let vehiculos = repo::vehiculos_de(&mut conn, user.id)
        .await?
        .into_iter()
        .map(VehiculoPerfilDto::from)
        .collect();
    let mascotas = repo::mascotas_de(&mut conn, user.id)
        .await?
        .into_iter()
        .map(MascotaPerfilDto::from)
        .collect();
    let tramites_solicitados = repo::tramites_de(&mut conn, user.id)
        .await?
        .into_iter()
        .map(crate::domains::tramites::dto::TramiteDto::from)
        .collect();
    Ok(Json(ProfileResponse {
        user: UserDto::from(usuario),
        unidad,
        vehiculos,
        mascotas,
        tramites_solicitados,
    }))
}

#[utoipa::path(
    put,
    path = "/api/v1/usuarios/me/profile",
    tag = "usuarios",
    request_body = UpdateProfileRequest,
    responses(
        (status = 200, description = "Updated profile", body = ProfileResponse),
        (status = 400, description = "Avatar too large or invalid fields")
    )
)]
pub async fn update_profile(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<UpdateProfileRequest>,
) -> ApiResult<Json<ProfileResponse>> {
    if let Some(avatar) = &req.avatar {
        if avatar.len() > MAX_AVATAR_BYTES {
            return Err(ApiError::BadRequest(format!(
                "el avatar supera el límite de {} KB",
                MAX_AVATAR_BYTES / 1024
            )));
        }
    }
    if let Some(nombre) = &req.nombre {
        if nombre.trim().is_empty() {
            return Err(ApiError::BadRequest(
                "el nombre no puede estar vacío".into(),
            ));
        }
    }

    let mut conn = state.pool.get().await?;
    let usuario = repo::find_by_id(&mut conn, user.id)
        .await?
        .ok_or(ApiError::Unauthorized)?;

    // Resident filled in their unit before administration registered one.
    let bootstrapped_unidad = match (&req.apto, usuario.unidad_id) {
        (Some(apto), None) if !apto.trim().is_empty() => Some(
            repo::bootstrap_unidad(
                &mut conn,
                user.conjunto_id,
                req.torre.as_deref(),
                apto.trim(),
            )
            .await?,
        ),
        _ => None,
    };

    let changes = ProfileChanges {
        nombre: req.nombre,
        telefono: req.telefono,
        genero: req.genero,
        avatar: req.avatar,
        torre: req.torre,
        apto: req.apto,
        unidad_id: bootstrapped_unidad.as_ref().map(|u| u.id),
    };
    let updated = repo::update_profile(&mut conn, user.id, changes).await?;

    let unidad = match updated.unidad_id {
        Some(id) => repo::find_unidad(&mut conn, id).await?.map(UnidadDto::from),
        None => None,
    };
    let vehiculos = repo::vehiculos_de(&mut conn, user.id)
        .await?
        .into_iter()
        .map(VehiculoPerfilDto::from)
        .collect();
    let mascotas = repo::mascotas_de(&mut conn, user.id)
        .await?
        .into_iter()
        .map(MascotaPerfilDto::from)
        .collect();
    let tramites_solicitados = repo::tramites_de(&mut conn, user.id)
        .await?
        .into_iter()
        .map(crate::domains::tramites::dto::TramiteDto::from)
        .collect();
    Ok(Json(ProfileResponse {
        user: UserDto::from(updated),
        unidad,
        vehiculos,
        mascotas,
        tramites_solicitados,
    }))
}
