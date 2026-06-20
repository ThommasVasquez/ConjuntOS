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
    Router::new()
        .route("/uploads/imagen", post(subir_imagen))
        .route("/uploads/archivo", post(subir_archivo))
}

// ── Image upload ──────────────────────────────────────────────────────────

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UploadImagenRequest {
    pub data: String,
    pub carpeta: Option<String>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UploadImagenResponse {
    pub url: String,
}

fn ext_imagen(content_type: &str) -> Option<&'static str> {
    match content_type {
        "image/png" => Some("png"),
        "image/jpeg" | "image/jpg" => Some("jpg"),
        "image/webp" => Some("webp"),
        "image/gif" => Some("gif"),
        "image/svg+xml" => Some("svg"),
        _ => None,
    }
}

#[utoipa::path(
    post,
    path = "/api/v1/uploads/imagen",
    tag = "uploads",
    request_body = UploadImagenRequest,
    responses(
        (status = 200, description = "Image stored", body = UploadImagenResponse),
        (status = 400, description = "Invalid image"),
        (status = 401, description = "Not authenticated"),
        (status = 502, description = "Storage upload failed")
    )
)]
pub async fn subir_imagen(
    axum::extract::State(state): axum::extract::State<AppState>,
    user: AuthUser,
    Json(req): Json<UploadImagenRequest>,
) -> ApiResult<Json<UploadImagenResponse>> {
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

    let ext = ext_imagen(&content_type).ok_or_else(|| {
        ApiError::BadRequest(format!("tipo de imagen no soportado: {content_type}"))
    })?;

    let data = STANDARD
        .decode(b64.trim())
        .map_err(|e| ApiError::BadRequest(format!("base64 inválido: {e}")))?;

    if data.is_empty() {
        return Err(ApiError::BadRequest("imagen vacía".into()));
    }

    let carpeta: String = req
        .carpeta
        .as_deref()
        .unwrap_or("imagenes")
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(40)
        .collect();
    let carpeta = if carpeta.is_empty() { "imagenes".to_string() } else { carpeta };

    let path = format!("{}/{}/{}.{}", carpeta, user.conjunto_id, Uuid::new_v4(), ext);
    let url = state
        .storage
        .upload("imagenes", &path, &data, &content_type)
        .await
        .map_err(|e| ApiError::Upstream(format!("storage upload failed: {e}")))?;

    Ok(Json(UploadImagenResponse { url }))
}

// ── Generic file upload ───────────────────────────────────────────────────

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UploadArchivoRequest {
    pub data: String,
    pub nombre: Option<String>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UploadArchivoResponse {
    pub url: String,
    pub content_type: String,
}

fn extension_for(content_type: &str, nombre: Option<&str>) -> &'static str {
    // Intentar por content type
    let ct_ext = match content_type {
        "application/pdf" => Some("pdf"),
        "application/msword" => Some("doc"),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" => Some("docx"),
        "application/vnd.ms-excel" => Some("xls"),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" => Some("xlsx"),
        "text/plain" => Some("txt"),
        "text/csv" => Some("csv"),
        "application/zip" => Some("zip"),
        "application/json" => Some("json"),
        "image/png" => Some("png"),
        "image/jpeg" | "image/jpg" => Some("jpg"),
        "image/webp" => Some("webp"),
        "image/gif" => Some("gif"),
        "image/svg+xml" => Some("svg"),
        "audio/webm" => Some("webm"),
        "audio/mp4" | "audio/mp4a-latm" => Some("m4a"),
        "audio/mpeg" => Some("mp3"),
        "audio/ogg" => Some("ogg"),
        "video/webm" => Some("webm"),
        "video/mp4" => Some("mp4"),
        _ => None,
    };
    if let Some(ext) = ct_ext {
        return ext;
    }
    if let Some(name) = nombre {
        if let Some(pos) = name.rfind('.') {
            return match name[pos + 1..].to_lowercase().as_str() {
                "pdf" => "pdf", "doc" => "doc", "docx" => "docx",
                "xls" => "xls", "xlsx" => "xlsx", "txt" => "txt",
                "csv" => "csv", "zip" => "zip", "rar" => "rar",
                "json" => "json", "xml" => "xml",
                "png" => "png", "jpg" | "jpeg" => "jpg",
                "webp" => "webp", "gif" => "gif", "svg" => "svg",
                "webm" => "webm", "m4a" => "m4a", "mp3" => "mp3",
                "ogg" => "ogg", "mp4" => "mp4",
                _ => "bin",
            };
        }
    }
    "bin"
}

#[utoipa::path(
    post,
    path = "/api/v1/uploads/archivo",
    tag = "uploads",
    request_body = UploadArchivoRequest,
    responses(
        (status = 200, description = "File stored", body = UploadArchivoResponse),
        (status = 400, description = "Invalid request"),
        (status = 401, description = "Not authenticated"),
        (status = 502, description = "Storage upload failed")
    )
)]
pub async fn subir_archivo(
    axum::extract::State(state): axum::extract::State<AppState>,
    user: AuthUser,
    Json(req): Json<UploadArchivoRequest>,
) -> ApiResult<Json<UploadArchivoResponse>> {
    let (content_type, b64) = match req.data.strip_prefix("data:") {
        Some(rest) => {
            let (meta, payload) = rest
                .split_once(",")
                .ok_or_else(|| ApiError::BadRequest("data URL mal formado".into()))?;
            let ct = meta.split(';').next().unwrap_or("application/octet-stream").to_string();
            (ct, payload.to_string())
        }
        None => ("application/octet-stream".to_string(), req.data.clone()),
    };

    let data = STANDARD
        .decode(b64.trim())
        .map_err(|e| ApiError::BadRequest(format!("base64 inválido: {e}")))?;

    if data.is_empty() {
        return Err(ApiError::BadRequest("archivo vacío".into()));
    }

    if data.len() > 16 * 1024 * 1024 {
        return Err(ApiError::BadRequest("archivo demasiado grande (máx 16 MiB)".into()));
    }

    let ext = extension_for(&content_type, req.nombre.as_deref());
    let path = format!("archivos/{}/{}.{}", user.conjunto_id, Uuid::new_v4(), ext);
    let url = state
        .storage
        .upload("archivos", &path, &data, &content_type)
        .await
        .map_err(|e| ApiError::Upstream(format!("storage upload failed: {e}")))?;

    Ok(Json(UploadArchivoResponse { url, content_type }))
}
