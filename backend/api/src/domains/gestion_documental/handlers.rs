use axum::extract::{Path, State};
use axum::routing::{get, put};
use axum::{Json, Router};
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::auth::guard;
use crate::db::enums::{CatDoc, Rol};
use crate::domains::gestion_documental::dto::{
    CreateDocumentoRequest, DeleteDocumentoResponse, DocumentoDto, UpdateDocumentoRequest,
};
use crate::domains::gestion_documental::models::{DocumentoCambios, NuevoDocumento};
use crate::domains::gestion_documental::repo;
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

const ROLES_ADMIN_DOC: &[Rol] = &[Rol::Administrador, Rol::SuperAdmin];

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/documentos", get(listar_documentos).post(crear_documento))
        .route(
            "/documentos/{id}",
            get(obtener_documento)
                .put(actualizar_documento)
                .delete(eliminar_documento),
        )
}

/// List documents. Admin sees all; residents see only `visible_residentes = true`.
#[utoipa::path(
    get,
    path = "/api/v1/documentos",
    tag = "gestion-documental",
    responses(
        (status = 200, description = "Listado de documentos del conjunto", body = [DocumentoDto]),
        (status = 401, description = "No autenticado")
    )
)]
async fn listar_documentos(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<DocumentoDto>>> {
    let mut conn = state.pool.get().await?;
    let is_admin = ROLES_ADMIN_DOC.contains(&user.rol);
    let rows = repo::listar_documentos(&mut conn, user.conjunto_id, !is_admin).await?;
    Ok(Json(
        rows.into_iter()
            .map(|(doc, nombre)| DocumentoDto::from_with_nombre(doc, nombre))
            .collect(),
    ))
}

/// Get a single document by ID.
#[utoipa::path(
    get,
    path = "/api/v1/documentos/{id}",
    tag = "gestion-documental",
    params(("id" = Uuid, Path, description = "ID del documento")),
    responses(
        (status = 200, description = "Documento encontrado", body = DocumentoDto),
        (status = 404, description = "Documento no encontrado")
    )
)]
async fn obtener_documento(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<DocumentoDto>> {
    let mut conn = state.pool.get().await?;
    let is_admin = ROLES_ADMIN_DOC.contains(&user.rol);
    let (doc, nombre) = repo::documento_por_id(&mut conn, user.conjunto_id, id)
        .await?
        .ok_or_else(|| ApiError::NotFound("documento no encontrado".into()))?;
    if !is_admin && !doc.visible_residentes {
        return Err(ApiError::Forbidden);
    }
    Ok(Json(DocumentoDto::from_with_nombre(doc, nombre)))
}

/// Create a new document (admin only).
#[utoipa::path(
    post,
    path = "/api/v1/documentos",
    tag = "gestion-documental",
    request_body = CreateDocumentoRequest,
    responses(
        (status = 200, description = "Documento creado", body = DocumentoDto),
        (status = 400, description = "Campos obligatorios faltantes"),
        (status = 403, description = "Requiere rol de administrador")
    )
)]
async fn crear_documento(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreateDocumentoRequest>,
) -> ApiResult<Json<DocumentoDto>> {
    guard::require(&user, ROLES_ADMIN_DOC)?;
    if req.nombre.trim().is_empty() {
        return Err(ApiError::BadRequest(
            "el nombre del documento es obligatorio".into(),
        ));
    }
    if req.url.trim().is_empty() {
        return Err(ApiError::BadRequest(
            "la URL del documento es obligatoria".into(),
        ));
    }
    // Validate category
    let _cat: CatDoc = req
        .categoria
        .parse()
        .map_err(|_| ApiError::BadRequest(format!("categoría inválida: {}", req.categoria)))?;

    let mut conn = state.pool.get().await?;
    let doc = repo::crear_documento(
        &mut conn,
        NuevoDocumento {
            conjunto_id: user.conjunto_id,
            nombre: req.nombre.trim().to_string(),
            categoria: req.categoria,
            url: req.url.trim().to_string(),
            version: req.version,
            descripcion: req.descripcion.unwrap_or_default(),
            subido_por: Some(user.id),
            visible_residentes: req.visible_residentes.unwrap_or(true),
        },
    )
    .await?;
    Ok(Json(DocumentoDto::from_with_nombre(doc, None)))
}

/// Update a document (admin only). Partial update — only provided fields change.
#[utoipa::path(
    put,
    path = "/api/v1/documentos/{id}",
    tag = "gestion-documental",
    params(("id" = Uuid, Path, description = "ID del documento")),
    request_body = UpdateDocumentoRequest,
    responses(
        (status = 200, description = "Documento actualizado", body = DocumentoDto),
        (status = 403, description = "Requiere rol de administrador"),
        (status = 404, description = "Documento no encontrado")
    )
)]
async fn actualizar_documento(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateDocumentoRequest>,
) -> ApiResult<Json<DocumentoDto>> {
    guard::require(&user, ROLES_ADMIN_DOC)?;

    if let Some(ref n) = req.nombre {
        if n.trim().is_empty() {
            return Err(ApiError::BadRequest(
                "el nombre no puede estar vacío".into(),
            ));
        }
    }
    if let Some(ref c) = req.categoria {
        let _cat: CatDoc = c
            .parse()
            .map_err(|_| ApiError::BadRequest(format!("categoría inválida: {c}")))?;
    }

    let cambios = DocumentoCambios {
        nombre: req.nombre.map(|n| n.trim().to_string()),
        categoria: req.categoria,
        url: req.url.map(|u| u.trim().to_string()),
        version: req.version,
        descripcion: req.descripcion,
        visible_residentes: req.visible_residentes,
    };

    let mut conn = state.pool.get().await?;
    let doc = repo::actualizar_documento(&mut conn, user.conjunto_id, id, cambios)
        .await?
        .ok_or_else(|| ApiError::NotFound("documento no encontrado".into()))?;
    Ok(Json(DocumentoDto::from_with_nombre(doc, None)))
}

/// Delete a document (admin only).
#[utoipa::path(
    delete,
    path = "/api/v1/documentos/{id}",
    tag = "gestion-documental",
    params(("id" = Uuid, Path, description = "ID del documento")),
    responses(
        (status = 200, description = "Documento eliminado", body = DeleteDocumentoResponse),
        (status = 403, description = "Requiere rol de administrador"),
        (status = 404, description = "Documento no encontrado")
    )
)]
async fn eliminar_documento(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<DeleteDocumentoResponse>> {
    guard::require(&user, ROLES_ADMIN_DOC)?;
    let mut conn = state.pool.get().await?;
    let deleted = repo::eliminar_documento(&mut conn, user.conjunto_id, id).await?;
    if deleted == 0 {
        return Err(ApiError::NotFound("documento no encontrado".into()));
    }
    Ok(Json(DeleteDocumentoResponse { deleted }))
}
