use axum::extract::{Path, State};
use axum::routing::{get, put};
use axum::{Json, Router};
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::auth::guard;
use crate::domains::conjuntos::dto::{
    sanitize_subdominio, ConjuntoDto, CreateConjuntoRequest, UpdateConjuntoRequest,
};
use crate::domains::conjuntos::repo::{self, ConjuntoChanges, NuevoConjunto};
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/superadmin/conjuntos",
            get(list_conjuntos).post(create_conjunto),
        )
        .route("/superadmin/conjuntos/{id}", put(update_conjunto))
}

#[utoipa::path(
    get,
    path = "/api/v1/superadmin/conjuntos",
    tag = "superadmin",
    responses(
        (status = 200, description = "All conjuntos", body = [ConjuntoDto]),
        (status = 403, description = "Requires SUPER_ADMIN")
    )
)]
pub async fn list_conjuntos(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<ConjuntoDto>>> {
    guard::require_superadmin(&user)?;
    let mut conn = state.pool.get().await?;
    let rows = repo::list_all(&mut conn).await?;
    Ok(Json(rows.into_iter().map(ConjuntoDto::from).collect()))
}

#[utoipa::path(
    post,
    path = "/api/v1/superadmin/conjuntos",
    tag = "superadmin",
    request_body = CreateConjuntoRequest,
    responses(
        (status = 200, description = "Created conjunto", body = ConjuntoDto),
        (status = 409, description = "Subdomain already taken")
    )
)]
pub async fn create_conjunto(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreateConjuntoRequest>,
) -> ApiResult<Json<ConjuntoDto>> {
    guard::require_superadmin(&user)?;
    let subdominio = sanitize_subdominio(&req.subdominio)
        .ok_or_else(|| ApiError::BadRequest("subdominio inválido".into()))?;
    if req.nombre.trim().is_empty() {
        return Err(ApiError::BadRequest("el nombre es obligatorio".into()));
    }

    let mut conn = state.pool.get().await?;
    let row = repo::create(
        &mut conn,
        NuevoConjunto {
            nombre: req.nombre.trim().to_string(),
            nit: req.nit,
            subdominio,
            direccion: req.direccion,
            ciudad: req.ciudad,
            logo_url: req.logo_url,
            color_primario: req.color_primario,
            plan: req.plan,
            representante_legal: req.representante_legal,
            notaria_escritura: req.notaria_escritura,
            numero_escritura: req.numero_escritura,
            fecha_escritura: req.fecha_escritura,
            matricula_inmobiliaria: req.matricula_inmobiliaria,
            total_unidades: req.total_unidades,
        },
    )
    .await?;
    Ok(Json(row.into()))
}

#[utoipa::path(
    put,
    path = "/api/v1/superadmin/conjuntos/{id}",
    tag = "superadmin",
    request_body = UpdateConjuntoRequest,
    responses(
        (status = 200, description = "Updated conjunto", body = ConjuntoDto),
        (status = 404, description = "Unknown conjunto")
    )
)]
pub async fn update_conjunto(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateConjuntoRequest>,
) -> ApiResult<Json<ConjuntoDto>> {
    guard::require_superadmin(&user)?;
    let mut conn = state.pool.get().await?;
    let row = repo::update(
        &mut conn,
        id,
        ConjuntoChanges {
            nombre: req.nombre,
            nit: req.nit,
            direccion: req.direccion,
            ciudad: req.ciudad,
            logo_url: req.logo_url,
            color_primario: req.color_primario,
            plan: req.plan,
            activo: req.activo,
            representante_legal: req.representante_legal,
            notaria_escritura: req.notaria_escritura,
            numero_escritura: req.numero_escritura,
            fecha_escritura: req.fecha_escritura,
            matricula_inmobiliaria: req.matricula_inmobiliaria,
            total_unidades: req.total_unidades,
        },
    )
    .await?;
    Ok(Json(row.into()))
}
