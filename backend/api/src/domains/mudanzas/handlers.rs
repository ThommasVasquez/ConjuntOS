use axum::extract::{Path, State};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use rand::Rng;
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::auth::guard;
use crate::db::enums::Rol;
use crate::error::ApiResult;
use crate::state::AppState;

use super::dto::{
    AprobarMudanzaReq, CreateMudanzaReq, MudanzaResp, RechazarMudanzaReq, UpdateEstadoMudanzaReq,
};
use super::models::NewMudanza;
use super::repo;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/mudanzas", post(crear_mudanza).get(listar_mudanzas))
        .route("/mudanzas/{id}", get(obtener_mudanza))
        .route("/mudanzas/{id}/aprobar", put(aprobar_mudanza))
        .route("/mudanzas/{id}/rechazar", put(rechazar_mudanza))
        .route("/mudanzas/{id}/estado", put(actualizar_estado_mudanza))
}

pub async fn crear_mudanza(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreateMudanzaReq>,
) -> ApiResult<Json<MudanzaResp>> {
    let mut conn = state.pool.get().await?;

    let (u_nombre, u_email, u_torre, u_apto) =
        repo::get_user_info(&mut conn, user.id).await?.unwrap_or_default();

    let torre = req.torre.or(u_torre);
    let apto = req.apto.or(u_apto);

    let new_m = NewMudanza {
        conjunto_id: user.conjunto_id,
        usuario_id: user.id,
        torre,
        apto,
        tipo: req.tipo.to_uppercase(),
        fecha_mudanza: req.fecha_mudanza,
        hora_inicio: req.hora_inicio,
        hora_fin: req.hora_fin,
        tiene_vehiculo: req.tiene_vehiculo,
        vehiculo_placa: req.vehiculo_placa.map(|s| s.to_uppercase()),
        vehiculo_tipo: req.vehiculo_tipo,
        conductor_nombre: req.conductor_nombre,
        conductor_documento: req.conductor_documento,
        observaciones: req.observaciones,
        estado: "PENDIENTE_PAZ_Y_SALVO".to_string(),
    };

    let m = repo::create(&mut conn, new_m).await?;

    let mut resp = MudanzaResp::from(m);
    resp.usuario_nombre = Some(u_nombre);
    resp.usuario_email = Some(u_email);

    Ok(Json(resp))
}

pub async fn listar_mudanzas(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<MudanzaResp>>> {
    let mut conn = state.pool.get().await?;

    let is_staff = matches!(
        user.rol,
        Rol::Administrador
            | Rol::SuperAdmin
            | Rol::Vigilante
            | Rol::SupervisorVigilancia
            | Rol::EncargadoParqueadero
    );

    let mudanzas = if is_staff {
        repo::list_by_conjunto(&mut conn, user.conjunto_id).await?
    } else {
        repo::list_by_usuario(&mut conn, user.id).await?
    };

    let mut list = Vec::new();
    for m in mudanzas {
        let mut dto = MudanzaResp::from(m);
        if let Ok(Some((u_nombre, u_email, u_torre, u_apto))) = repo::get_user_info(&mut conn, dto.usuario_id).await {
            dto.usuario_nombre = Some(u_nombre);
            dto.usuario_email = Some(u_email);
            if dto.torre.is_none() { dto.torre = u_torre; }
            if dto.apto.is_none() { dto.apto = u_apto; }
        }
        if let Some(admin_uid) = dto.aprobado_por_usuario_id {
            if let Ok(Some((adm_nombre, _, _, _))) = repo::get_user_info(&mut conn, admin_uid).await {
                dto.aprobado_por_nombre = Some(adm_nombre);
            }
        }
        list.push(dto);
    }

    Ok(Json(list))
}

pub async fn obtener_mudanza(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    user: AuthUser,
) -> ApiResult<Json<MudanzaResp>> {
    let mut conn = state.pool.get().await?;
    let m = repo::find_by_id(&mut conn, id)
        .await?
        .ok_or_else(|| crate::error::ApiError::NotFound("Solicitud de mudanza no encontrada".to_string()))?;

    let mut dto = MudanzaResp::from(m);
    if let Ok(Some((u_nombre, u_email, u_torre, u_apto))) = repo::get_user_info(&mut conn, dto.usuario_id).await {
        dto.usuario_nombre = Some(u_nombre);
        dto.usuario_email = Some(u_email);
        if dto.torre.is_none() { dto.torre = u_torre; }
        if dto.apto.is_none() { dto.apto = u_apto; }
    }
    if let Some(admin_uid) = dto.aprobado_por_usuario_id {
        if let Ok(Some((adm_nombre, _, _, _))) = repo::get_user_info(&mut conn, admin_uid).await {
            dto.aprobado_por_nombre = Some(adm_nombre);
        }
    }

    Ok(Json(dto))
}

use crate::services::email::{self, PazYSalvoEmailParams};

pub async fn aprobar_mudanza(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    user: AuthUser,
    _req: Option<Json<AprobarMudanzaReq>>,
) -> ApiResult<Json<MudanzaResp>> {
    guard::require(&user, &[Rol::Administrador, Rol::SuperAdmin])?;

    let mut conn = state.pool.get().await?;

    let year = chrono::Utc::now().format("%Y");
    let random_num: u32 = rand::thread_rng().gen_range(1000..9999);
    let paz_y_salvo_code = format!("PZ-{year}-{random_num}");

    let m = repo::aprobar(&mut conn, id, &paz_y_salvo_code, user.id).await?;

    let mut dto = MudanzaResp::from(m);
    if let Ok(Some((u_nombre, u_email, u_torre, u_apto))) = repo::get_user_info(&mut conn, dto.usuario_id).await {
        dto.usuario_nombre = Some(u_nombre.clone());
        dto.usuario_email = Some(u_email.clone());
        if dto.torre.is_none() { dto.torre = u_torre; }
        if dto.apto.is_none() { dto.apto = u_apto; }

        let params = PazYSalvoEmailParams {
            to_email: u_email,
            nombre: u_nombre,
            conjunto_nombre: "ConjuntOS® Copropiedad".to_string(),
            paz_y_salvo_codigo: paz_y_salvo_code,
            tipo_mudanza: dto.tipo.clone(),
            fecha_mudanza: dto.fecha_mudanza.to_string(),
            hora_inicio: dto.hora_inicio.clone(),
            hora_fin: dto.hora_fin.clone(),
        };
        tokio::spawn(async move {
            email::send_paz_y_salvo_email(params).await;
        });
    }
    dto.aprobado_por_nombre = Some(user.nombre.clone());

    Ok(Json(dto))
}

pub async fn rechazar_mudanza(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    user: AuthUser,
    Json(req): Json<RechazarMudanzaReq>,
) -> ApiResult<Json<MudanzaResp>> {
    guard::require(&user, &[Rol::Administrador, Rol::SuperAdmin])?;

    let mut conn = state.pool.get().await?;
    let m = repo::rechazar(&mut conn, id, &req.motivo, user.id).await?;

    let mut dto = MudanzaResp::from(m);
    if let Ok(Some((u_nombre, u_email, u_torre, u_apto))) = repo::get_user_info(&mut conn, dto.usuario_id).await {
        dto.usuario_nombre = Some(u_nombre);
        dto.usuario_email = Some(u_email);
        if dto.torre.is_none() { dto.torre = u_torre; }
        if dto.apto.is_none() { dto.apto = u_apto; }
    }
    dto.aprobado_por_nombre = Some(user.nombre.clone());

    Ok(Json(dto))
}

pub async fn actualizar_estado_mudanza(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    user: AuthUser,
    Json(req): Json<UpdateEstadoMudanzaReq>,
) -> ApiResult<Json<MudanzaResp>> {
    guard::require(&user, &[
        Rol::Administrador,
        Rol::SuperAdmin,
        Rol::Vigilante,
        Rol::SupervisorVigilancia,
        Rol::EncargadoParqueadero,
    ])?;

    let mut conn = state.pool.get().await?;
    let m = repo::update_estado(&mut conn, id, &req.estado).await?;

    // Deactivate user account and unlink unit on outgoing move completion
    if req.estado == "FINALIZADO" && m.tipo == "SALIENTE" {
        let _ = repo::deactivate_user(&mut conn, m.usuario_id).await;
    }

    let mut dto = MudanzaResp::from(m);
    if let Ok(Some((u_nombre, u_email, u_torre, u_apto))) = repo::get_user_info(&mut conn, dto.usuario_id).await {
        dto.usuario_nombre = Some(u_nombre);
        dto.usuario_email = Some(u_email);
        if dto.torre.is_none() { dto.torre = u_torre; }
        if dto.apto.is_none() { dto.apto = u_apto; }
    }

    Ok(Json(dto))
}
