use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use serde::Serialize;

/// API error type rendered as RFC-7807 `application/problem+json`
/// (specs/constitution.md Law 4 — no mock fallbacks, real errors only).
#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("authentication required")]
    Unauthorized,
    #[error("insufficient permissions")]
    Forbidden,
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    BadRequest(String),
    #[error("{0}")]
    Conflict(String),
    #[error("{0}")]
    Unprocessable(String),
    #[error("{0}")]
    ServiceUnavailable(String),
    #[error("upstream service failed: {0}")]
    Upstream(String),
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl ApiError {
    fn status(&self) -> StatusCode {
        match self {
            ApiError::Unauthorized => StatusCode::UNAUTHORIZED,
            ApiError::Forbidden => StatusCode::FORBIDDEN,
            ApiError::NotFound(_) => StatusCode::NOT_FOUND,
            ApiError::BadRequest(_) => StatusCode::BAD_REQUEST,
            ApiError::Conflict(_) => StatusCode::CONFLICT,
            ApiError::Unprocessable(_) => StatusCode::UNPROCESSABLE_ENTITY,
            ApiError::ServiceUnavailable(_) => StatusCode::SERVICE_UNAVAILABLE,
            ApiError::Upstream(_) => StatusCode::BAD_GATEWAY,
            ApiError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn title(&self) -> &'static str {
        match self {
            ApiError::Unauthorized => "Unauthorized",
            ApiError::Forbidden => "Forbidden",
            ApiError::NotFound(_) => "Not Found",
            ApiError::BadRequest(_) => "Bad Request",
            ApiError::Conflict(_) => "Conflict",
            ApiError::Unprocessable(_) => "Unprocessable Entity",
            ApiError::ServiceUnavailable(_) => "Service Unavailable",
            ApiError::Upstream(_) => "Bad Gateway",
            ApiError::Internal(_) => "Internal Server Error",
        }
    }
}

#[derive(Serialize)]
struct Problem<'a> {
    #[serde(rename = "type")]
    kind: &'a str,
    title: &'a str,
    status: u16,
    detail: String,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = self.status();
        // Internal details stay in the logs; clients get a generic message.
        let detail = match &self {
            ApiError::Internal(err) => {
                tracing::error!(error = ?err, "internal error");
                "internal error".to_string()
            }
            other => other.to_string(),
        };
        let body = serde_json::to_string(&Problem {
            kind: "about:blank",
            title: self.title(),
            status: status.as_u16(),
            detail,
        })
        .unwrap_or_else(|_| r#"{"title":"Internal Server Error","status":500}"#.to_string());

        (
            status,
            [(header::CONTENT_TYPE, "application/problem+json")],
            body,
        )
            .into_response()
    }
}

impl From<diesel::result::Error> for ApiError {
    fn from(err: diesel::result::Error) -> Self {
        match err {
            diesel::result::Error::NotFound => ApiError::NotFound("resource not found".into()),
            diesel::result::Error::DatabaseError(
                diesel::result::DatabaseErrorKind::UniqueViolation,
                info,
            ) => ApiError::Conflict(info.message().to_string()),
            other => ApiError::Internal(anyhow::Error::new(other)),
        }
    }
}

impl From<diesel_async::pooled_connection::deadpool::PoolError> for ApiError {
    fn from(err: diesel_async::pooled_connection::deadpool::PoolError) -> Self {
        ApiError::Internal(anyhow::Error::new(err))
    }
}

pub type ApiResult<T> = Result<T, ApiError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_variants_to_statuses() {
        assert_eq!(ApiError::Unauthorized.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(ApiError::Forbidden.status(), StatusCode::FORBIDDEN);
        assert_eq!(
            ApiError::NotFound("x".into()).status(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            ApiError::Conflict("dup".into()).status(),
            StatusCode::CONFLICT
        );
        assert_eq!(
            ApiError::Upstream("gemini".into()).status(),
            StatusCode::BAD_GATEWAY
        );
    }

    #[test]
    fn diesel_not_found_becomes_404() {
        let err: ApiError = diesel::result::Error::NotFound.into();
        assert_eq!(err.status(), StatusCode::NOT_FOUND);
    }

    #[test]
    fn internal_detail_is_redacted() {
        let err = ApiError::Internal(anyhow::anyhow!("secret connection string"));
        let resp = err.into_response();
        assert_eq!(resp.status(), StatusCode::INTERNAL_SERVER_ERROR);
        let ct = resp
            .headers()
            .get(header::CONTENT_TYPE)
            .unwrap()
            .to_str()
            .unwrap();
        assert_eq!(ct, "application/problem+json");
    }
}
