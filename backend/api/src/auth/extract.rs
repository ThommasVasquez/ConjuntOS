use axum::extract::FromRequestParts;
use axum::http::header;
use axum::http::request::Parts;
use axum_extra::extract::cookie::CookieJar;
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use uuid::Uuid;

use crate::auth::jwt::{self, SESSION_COOKIE};
use crate::db::enums::Rol;
use crate::db::schema::usuarios;
use crate::error::ApiError;
use crate::state::AppState;

/// Authenticated caller, extracted from `Authorization: Bearer` or the
/// `ec_session` cookie. Rejects with 401 problem+json.
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub rol: Rol,
    pub nombre: String,
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let token = bearer_token(parts)
            .or_else(|| cookie_token(parts))
            .ok_or(ApiError::Unauthorized)?;
        let claims = jwt::verify(&token, &state.config.jwt_secret)?;

        // Stateless-JWT revocation: reject any token issued before the user's last
        // password change (set on password change / unknown user → 401). One indexed
        // PK lookup per authenticated request.
        let mut conn = state.pool.get().await?;
        let changed_at: DateTime<Utc> = usuarios::table
            .find(claims.sub)
            .select(usuarios::password_changed_at)
            .first(&mut conn)
            .await
            .map_err(|_| ApiError::Unauthorized)?;
        if claims.iat < changed_at.timestamp() {
            return Err(ApiError::Unauthorized);
        }

        Ok(AuthUser {
            id: claims.sub,
            conjunto_id: claims.conjunto_id,
            rol: claims.rol,
            nombre: claims.nombre,
        })
    }
}

fn bearer_token(parts: &Parts) -> Option<String> {
    parts
        .headers
        .get(header::AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
        .map(str::to_string)
}

fn cookie_token(parts: &Parts) -> Option<String> {
    CookieJar::from_headers(&parts.headers)
        .get(SESSION_COOKIE)
        .map(|c| c.value().to_string())
}
