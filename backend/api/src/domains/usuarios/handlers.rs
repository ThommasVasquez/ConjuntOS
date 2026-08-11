use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use serde::Deserialize;

use crate::auth::extract::AuthUser;
use crate::auth::password::verify_password_blocking;
use crate::domains::usuarios::dto::{
    DeleteAccountRequest, DirectorioUsuarioDto, MascotaPerfilDto, ProfileResponse, UnidadDto,
    UpdateProfileRequest, UserDto, VehiculoPerfilDto,
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
        .route("/usuarios/me", axum::routing::delete(delete_account))
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

/// Self-service account deletion, required by Google Play for any app that lets
/// users create an account.
///
/// Personal data is erased and the account is deactivated; records the
/// copropiedad must legally retain (pagos, multas, votos de asamblea) survive
/// detached from any identity. See `repo::anonymize_account` for why this is not
/// a row delete.
#[utoipa::path(
    delete,
    path = "/api/v1/usuarios/me",
    tag = "usuarios",
    request_body = DeleteAccountRequest,
    responses(
        (status = 204, description = "Account deleted; every session is now invalid"),
        (status = 401, description = "Not authenticated, or wrong password"),
        (status = 409, description = "Caller is the conjunto's last administrator")
    )
)]
pub async fn delete_account(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<DeleteAccountRequest>,
) -> ApiResult<StatusCode> {
    let mut conn = state.pool.get().await?;
    let usuario = repo::find_by_id(&mut conn, user.id)
        .await?
        .ok_or(ApiError::Unauthorized)?;

    // Re-authenticate: a session token alone must not be able to destroy the
    // account. Same 401 as a bad login — no oracle for which part was wrong.
    if !verify_password_blocking(req.password, usuario.password_hash).await? {
        return Err(ApiError::Unauthorized);
    }

    repo::anonymize_account(&mut conn, user.id).await?;
    Ok(StatusCode::NO_CONTENT)
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
    // Fetch the conjunto name for display in the app header.
    let conjunto_nombre = crate::domains::conjuntos::repo::find_by_id(&mut conn, usuario.conjunto_id)
        .await
        .ok()
        .flatten()
        .map(|c| c.nombre);
    Ok(Json(ProfileResponse {
        user: UserDto::from(usuario),
        unidad,
        conjunto_nombre,
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
    let conjunto_nombre = crate::domains::conjuntos::repo::find_by_id(&mut conn, user.conjunto_id)
        .await?
        .map(|c| c.nombre);
    Ok(Json(ProfileResponse {
        user: UserDto::from(updated),
        unidad,
        conjunto_nombre,
        vehiculos,
        mascotas,
        tramites_solicitados,
    }))
}
