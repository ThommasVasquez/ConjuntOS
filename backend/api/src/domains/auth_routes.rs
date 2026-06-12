use std::sync::OnceLock;

use axum::extract::State;
use axum::routing::{get, post, put};
use axum::{Json, Router};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::auth::extract::AuthUser;
use crate::auth::{jwt, password};
use crate::config::Config;
use crate::domains::usuarios::dto::UserDto;
use crate::domains::usuarios::repo;
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/auth/login", post(login))
        .route("/auth/me", get(me))
        .route("/auth/logout", post(logout))
        .route("/auth/password", put(change_password))
        .route("/auth/ws-ticket", get(ws_ticket))
}

#[derive(Deserialize, ToSchema)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Serialize, ToSchema)]
pub struct LoginResponse {
    pub user: UserDto,
    /// Bearer fallback for clients where the cross-site cookie is blocked.
    pub token: String,
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/login",
    tag = "auth",
    request_body = LoginRequest,
    responses(
        (status = 200, description = "Session created (also sets ec_session cookie)", body = LoginResponse),
        (status = 401, description = "Invalid credentials"),
        (status = 403, description = "Account deactivated")
    )
)]
pub async fn login(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(req): Json<LoginRequest>,
) -> ApiResult<(CookieJar, Json<LoginResponse>)> {
    let email = req.email.trim().to_lowercase();
    let mut conn = state.pool.get().await?;

    let Some(user) = repo::find_by_email(&mut conn, &email).await? else {
        // Verify against a throwaway hash so unknown emails take as long as
        // wrong passwords (user-enumeration timing).
        let _ = password::verify_password_blocking(req.password, dummy_hash().clone()).await;
        return Err(ApiError::Unauthorized);
    };

    let ok = password::verify_password_blocking(req.password, user.password_hash.clone()).await?;
    if !ok {
        return Err(ApiError::Unauthorized);
    }
    if !user.activo {
        return Err(ApiError::Forbidden);
    }

    let token = jwt::issue(
        user.id,
        user.conjunto_id,
        user.rol,
        &user.nombre,
        &state.config.jwt_secret,
    )?;
    let cookie = session_cookie(token.clone(), &state.config);
    Ok((
        jar.add(cookie),
        Json(LoginResponse {
            user: user.into(),
            token,
        }),
    ))
}

#[utoipa::path(
    get,
    path = "/api/v1/auth/me",
    tag = "auth",
    responses(
        (status = 200, description = "Current user", body = UserDto),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn me(State(state): State<AppState>, user: AuthUser) -> ApiResult<Json<UserDto>> {
    let mut conn = state.pool.get().await?;
    let usuario = repo::find_by_id(&mut conn, user.id)
        .await?
        .ok_or(ApiError::Unauthorized)?;
    Ok(Json(usuario.into()))
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/logout",
    tag = "auth",
    responses((status = 200, description = "Session cookie cleared"))
)]
pub async fn logout(
    State(state): State<AppState>,
    jar: CookieJar,
) -> (CookieJar, Json<serde_json::Value>) {
    let mut removal = session_cookie(String::new(), &state.config);
    removal.make_removal();
    (jar.add(removal), Json(serde_json::json!({ "ok": true })))
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

#[utoipa::path(
    put,
    path = "/api/v1/auth/password",
    tag = "auth",
    request_body = ChangePasswordRequest,
    responses(
        (status = 200, description = "Password updated"),
        (status = 401, description = "Current password wrong")
    )
)]
pub async fn change_password(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<ChangePasswordRequest>,
) -> ApiResult<Json<serde_json::Value>> {
    if req.new_password.len() < 8 {
        return Err(ApiError::BadRequest(
            "la nueva contraseña debe tener al menos 8 caracteres".into(),
        ));
    }
    let mut conn = state.pool.get().await?;
    let usuario = repo::find_by_id(&mut conn, user.id)
        .await?
        .ok_or(ApiError::Unauthorized)?;

    let ok =
        password::verify_password_blocking(req.current_password, usuario.password_hash.clone())
            .await?;
    if !ok {
        return Err(ApiError::Unauthorized);
    }

    let new_hash = password::hash_password_blocking(req.new_password).await?;
    repo::update_password(&mut conn, user.id, &new_hash).await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

#[derive(Serialize, ToSchema)]
pub struct WsTicketResponse {
    /// Short-lived token to authenticate the WebSocket upgrade.
    pub ticket: String,
}

#[utoipa::path(
    get,
    path = "/api/v1/auth/ws-ticket",
    tag = "auth",
    responses(
        (status = 200, description = "Short-lived WebSocket auth ticket", body = WsTicketResponse),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn ws_ticket(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<WsTicketResponse>> {
    let ticket = jwt::issue_ws_ticket(
        user.id,
        user.conjunto_id,
        user.rol,
        &user.nombre,
        &state.config.jwt_secret,
    )?;
    Ok(Json(WsTicketResponse { ticket }))
}

fn session_cookie(token: String, config: &Config) -> Cookie<'static> {
    let mut cookie = Cookie::new(jwt::SESSION_COOKIE, token);
    cookie.set_path("/");
    cookie.set_http_only(true);
    cookie.set_max_age(time::Duration::seconds(jwt::session_max_age_seconds()));
    if let Some(domain) = &config.cookie_domain {
        // Shared parent domain (e.g. `.conjuntos.app`) so the cookie set by the
        // API host is also sent to the frontend host (app.conjuntos.app).
        cookie.set_domain(domain.clone());
    }
    if config.cookie_cross_site {
        // pages.dev frontend ↔ API host are cross-site until the shared domain lands.
        cookie.set_same_site(SameSite::None);
        cookie.set_secure(true);
    } else {
        cookie.set_same_site(SameSite::Lax);
    }
    cookie
}

fn dummy_hash() -> &'static String {
    static DUMMY: OnceLock<String> = OnceLock::new();
    DUMMY.get_or_init(|| {
        password::hash_password("dummy-timing-equalizer").expect("static hash succeeds")
    })
}
