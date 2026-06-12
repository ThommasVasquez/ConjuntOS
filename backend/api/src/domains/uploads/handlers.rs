use axum::routing::post;
use axum::{Json, Router};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/uploads/imagen", post(subir_imagen))
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UploadImagenRequest {
    /// Image as a data URL ("data:image/png;base64,....") or a bare base64 string.
    pub data: String,
    /// Optional logical folder inside the bucket (e.g. "anuncios", "avatares").
    pub carpeta: Option<String>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UploadImagenResponse {
    /// Public URL of the stored object (this is what callers persist).
    pub url: String,
}

/// Allowed image content types and their file extensions.
fn ext_for(content_type: &str) -> Option<&'static str> {
    match content_type {
        "image/png" => Some("png"),
        "image/jpeg" | "image/jpg" => Some("jpg"),
        "image/webp" => Some("webp"),
        "image/gif" => Some("gif"),
        "image/svg+xml" => Some("svg"),
        _ => None,
    }
}

/// Upload an image to object storage (MinIO/S3) and return its public URL.
///
/// Any authenticated user may upload. The heavy bytes travel here ONCE and are
/// offloaded to MinIO; callers then persist only the short URL — so request
/// bodies and DB rows stay small (no base64 blobs inflating the JSON or the
/// `anuncios` table, which was hitting the request-body size cap).
#[utoipa::path(
    post,
    path = "/api/v1/uploads/imagen",
    tag = "uploads",
    request_body = UploadImagenRequest,
    responses(
        (status = 200, description = "Image stored", body = UploadImagenResponse),
        (status = 400, description = "Invalid or unsupported image"),
        (status = 401, description = "Not authenticated"),
        (status = 502, description = "Storage upload failed")
    )
)]
pub async fn subir_imagen(
    axum::extract::State(state): axum::extract::State<AppState>,
    user: AuthUser,
    Json(req): Json<UploadImagenRequest>,
) -> ApiResult<Json<UploadImagenResponse>> {
    // Split an optional data-URL prefix ("data:image/png;base64,...") to learn
    // the content type; default to png when only raw base64 is sent.
    let (content_type, b64) = match req.data.strip_prefix("data:") {
        Some(rest) => {
            let (meta, payload) = rest
                .split_once(",")
                .ok_or_else(|| ApiError::BadRequest("data URL mal formado".into()))?;
            let ct = meta.split(';').next().unwrap_or("image/png").to_string();
            (ct, payload.to_string())
        }
        None => ("image/png".to_string(), req.data.clone()),
    };

    let ext = ext_for(&content_type).ok_or_else(|| {
        ApiError::BadRequest(format!("tipo de imagen no soportado: {content_type}"))
    })?;

    let data = STANDARD
        .decode(b64.trim())
        .map_err(|e| ApiError::BadRequest(format!("base64 inválido: {e}")))?;

    if data.is_empty() {
        return Err(ApiError::BadRequest("imagen vacía".into()));
    }

    // Sanitize the folder name to a simple slug to avoid path traversal.
    let carpeta: String = req
        .carpeta
        .as_deref()
        .unwrap_or("imagenes")
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(40)
        .collect();
    let carpeta = if carpeta.is_empty() {
        "imagenes".to_string()
    } else {
        carpeta
    };

    let path = format!("{}/{}/{}.{}", carpeta, user.conjunto_id, Uuid::new_v4(), ext);

    let url = state
        .storage
        .upload("imagenes", &path, &data, &content_type)
        .await
        .map_err(|e| ApiError::Upstream(format!("storage upload failed: {e}")))?;

    Ok(Json(UploadImagenResponse { url }))
}
