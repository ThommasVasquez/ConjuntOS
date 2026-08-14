use axum::{
    extract::{Path, State},
    routing::{get, post, put},
    Json, Router,
};
use chrono::Utc;
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::auth::guard;
use crate::db::enums::Rol;
use crate::db::schema::{notificaciones, usuarios};
use crate::db::DbConn;
use crate::error::{ApiError, ApiResult};
use crate::services::ws_hub::WsEvent;
use crate::state::AppState;

use super::dto::{
    ConfirmarAsistenciaReq, CrearReunionConcejoReq, ReunionConcejoResp, UpdateEstadoReunionReq,
};
use super::models::NewReunionConcejo;
use super::repo;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/reuniones-concejo", post(crear_reunion).get(listar_reuniones))
        .route("/reuniones-concejo/{id}/asistencia", put(confirmar_asistencia))
        .route("/reuniones-concejo/{id}/estado", put(actualizar_estado_reunion))
}

pub async fn crear_reunion(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CrearReunionConcejoReq>,
) -> ApiResult<Json<ReunionConcejoResp>> {
    // Strictly ONLY Administrators or SuperAdmins can summon council meetings!
    guard::require(&user, &[Rol::Administrador, Rol::SuperAdmin])?;

    let conjunto_id = user.conjunto_id;

    let mut conn = state.pool.get().await?;

    let orden_dia_json = serde_json::to_value(req.orden_dia.unwrap_or_default())
        .map_err(|e| ApiError::Internal(anyhow::anyhow!(e)))?;

    let id = Uuid::new_v4();
    let new_r = NewReunionConcejo {
        id,
        conjunto_id,
        creado_por: user.id,
        titulo: req.titulo.clone(),
        descripcion: req.descripcion.clone(),
        modalidad: req.modalidad.clone(),
        lugar: req.lugar.clone(),
        link_videollamada: req.link_videollamada.clone(),
        fecha_reunion: req.fecha_reunion,
        orden_dia: orden_dia_json,
        estado: "CONVOCADA".to_string(),
        asistencias: serde_json::json!([]),
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };

    let r = repo::create(&mut conn, new_r).await?;
    let mut dto = ReunionConcejoResp::from(r);
    dto.creado_por_nombre = Some(user.nombre.clone());

    // Send notifications ONLY to Council Members (rol = 'CONCEJO')
    if let Ok(council_members) = repo::get_council_members(&mut conn, conjunto_id).await {
        let notif_title = format!("🏛️ CITACIÓN REUNIÓN DE CONCEJO: {}", req.titulo);
        let mod_str = match req.modalidad.as_str() {
            "VIRTUAL" => "📹 Virtual",
            "HIBRIDA" => "🌐 Híbrida (Presencial y Virtual)",
            _ => "📍 Presencial",
        };
        let notif_msg = format!(
            "Se ha convocado reunión de concejo el {} (Modalidad {}). Por favor ingresa y confirma tu asistencia.",
            req.fecha_reunion.format("%d/%m/%Y %H:%M"),
            mod_str
        );

        for (member_id, _nombre, _email) in council_members {
            use diesel::prelude::*;
            use diesel_async::RunQueryDsl;

            let _ = diesel::insert_into(notificaciones::table)
                .values((
                    notificaciones::id.eq(Uuid::new_v4()),
                    notificaciones::conjunto_id.eq(conjunto_id),
                    notificaciones::usuario_id.eq(member_id),
                    notificaciones::tipo.eq("REUNION_CONCEJO_CONVOCADA"),
                    notificaciones::titulo.eq(&notif_title),
                    notificaciones::mensaje.eq(&notif_msg),
                    notificaciones::leida.eq(false),
                    notificaciones::created_at.eq(Utc::now()),
                ))
                .execute(&mut conn)
                .await;

            // Broadcast WsEvent targetting council member
            state
                .ws_hub
                .publish(
                    conjunto_id,
                    WsEvent {
                        domain: "reuniones_concejo".into(),
                        action: "convocada".into(),
                        payload: serde_json::to_value(&dto).ok(),
                        target_user_id: Some(member_id),
                    },
                )
                .await;
        }
    }

    Ok(Json(dto))
}

pub async fn listar_reuniones(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<ReunionConcejoResp>>> {
    // Only Council Members, Administrators or SuperAdmins can view Council Meetings
    guard::require(&user, &[Rol::Administrador, Rol::SuperAdmin, Rol::Concejo])?;

    let conjunto_id = user.conjunto_id;

    let mut conn = state.pool.get().await?;
    let items = repo::list_by_conjunto(&mut conn, conjunto_id).await?;

    let mut dtos = Vec::new();
    for r in items {
        let mut dto = ReunionConcejoResp::from(r);
        use diesel::prelude::*;
        use diesel_async::RunQueryDsl;
        if let Ok(adm_nombre) = usuarios::table
            .filter(usuarios::id.eq(dto.creado_por))
            .select(usuarios::nombre)
            .first::<String>(&mut conn)
            .await
        {
            dto.creado_por_nombre = Some(adm_nombre);
        }
        dtos.push(dto);
    }

    Ok(Json(dtos))
}

pub async fn confirmar_asistencia(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<ConfirmarAsistenciaReq>,
) -> ApiResult<Json<ReunionConcejoResp>> {
    // Council Members, Admins, SuperAdmins can respond
    guard::require(&user, &[Rol::Concejo, Rol::Administrador, Rol::SuperAdmin])?;

    let mut conn = state.pool.get().await?;
    let r = repo::update_asistencia(
        &mut conn,
        id,
        user.id,
        &user.nombre,
        &req.confirmacion,
        req.motivo_excusa,
    )
    .await?;

    let mut dto = ReunionConcejoResp::from(r);
    dto.creado_por_nombre = Some(user.nombre.clone());

    Ok(Json(dto))
}

pub async fn actualizar_estado_reunion(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateEstadoReunionReq>,
) -> ApiResult<Json<ReunionConcejoResp>> {
    guard::require(&user, &[Rol::Administrador, Rol::SuperAdmin])?;

    let mut conn = state.pool.get().await?;
    let r = repo::update_estado(&mut conn, id, &req.estado, req.acta_resumen).await?;

    let mut dto = ReunionConcejoResp::from(r);
    dto.creado_por_nombre = Some(user.nombre.clone());

    Ok(Json(dto))
}
