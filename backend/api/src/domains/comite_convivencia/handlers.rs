use axum::extract::{Path, Query, State};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::auth::guard;
use crate::db::enums::{CalidadMiembro, EstadoCasoConvivencia, Rol};
use crate::domains::comite_convivencia::dto::{
    ActaConvivenciaDto, ActualizarCasoRequest, AgregarMiembroRequest, AsignarMiembroRequest,
    CasoConvivenciaDto, ComiteActualDto, ComiteHistoricoDto, CrearCasoRequest,
    CrearComiteRequest, FirmaActaDto, FirmarActaRequest, MiembroComiteDto,
    RegistrarMediacionRequest, StatsConvivencia,
};
use crate::domains::comite_convivencia::models::{
    NuevaActaConvivencia, NuevoCasoConvivencia, NuevoComiteHistorico, NuevoComiteMiembro,
    NuevaFirmaActa,
};
use crate::domains::comite_convivencia::repo;
use crate::error::{ApiError, ApiResult};
use crate::services::ws_hub::WsEvent;
use crate::state::AppState;

const ADMIN_CONVIVENCIA: &[Rol] = &[Rol::Administrador, Rol::SuperAdmin, Rol::Concejo];

#[derive(Deserialize)]
struct ListarQuery { estado: Option<String> }

pub fn router() -> Router<AppState> {
    Router::new()
        // Comité management
        .route("/convivencia/comite", get(comite_actual).post(crear_comite))
        .route("/convivencia/comite/historico", get(historico_comites))
        .route("/convivencia/comite/miembros", post(agregar_miembro))
        .route("/convivencia/comite/miembros/{id}", put(desactivar_miembro))
        // Casos
        .route("/convivencia/casos", get(listar_casos).post(crear_caso))
        .route("/convivencia/casos/stats", get(stats))
        .route("/convivencia/casos/{id}", put(actualizar_caso))
        .route("/convivencia/casos/{id}/asignar", put(asignar_miembro))
        .route("/convivencia/casos/{id}/mediacion", post(registrar_mediacion))
        // Actas
        .route("/convivencia/casos/{id}/acta", post(generar_acta))
        .route("/convivencia/actas/{id}/firmar", post(firmar_acta))
}

// ═══════════════════════════════════════════════════════════════════════════
// Comité
// ═══════════════════════════════════════════════════════════════════════════

/// GET /api/v1/convivencia/comite — comité actual con alerta de vencimiento
async fn comite_actual(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<ComiteActualDto>> {
    guard::require(&user, ADMIN_CONVIVENCIA)?;
    let mut conn = state.pool.get().await?;

    let comite = repo::comite_actual(&mut conn, user.conjunto_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("No hay comité de convivencia activo. Debe elegirse en Asamblea.".into()))?;

    let miembros_raw = repo::miembros_activos(&mut conn, comite.id).await?;
    let mut miembros = vec![];
    for m in miembros_raw {
        let usuario = repo::usuario_embed(&mut conn, m.usuario_id).await?;
        let unidad = repo::unidad_embed(&mut conn, m.unidad_id).await?;
        miembros.push(MiembroComiteDto::from_model(m, usuario, unidad));
    }

    let hoy = chrono::Utc::now().date_naive();
    let dias_restantes = (comite.periodo_fin - hoy).num_days().max(0);
    let alerta_vencimiento = dias_restantes <= 30; // Alerta 30 días antes

    let dto = ComiteHistoricoDto::from_model(comite, miembros);
    Ok(Json(ComiteActualDto { comite: dto, dias_restantes, alerta_vencimiento }))
}

/// GET /api/v1/convivencia/comite/historico — todos los comités pasados
async fn historico_comites(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<ComiteHistoricoDto>>> {
    guard::require(&user, ADMIN_CONVIVENCIA)?;
    let mut conn = state.pool.get().await?;
    let comites = repo::historico_comites(&mut conn, user.conjunto_id).await?;
    let mut dtos = vec![];
    for c in comites {
        let miembros_raw = repo::miembros_activos(&mut conn, c.id).await?;
        let mut miembros = vec![];
        for m in miembros_raw {
            let usuario = repo::usuario_embed(&mut conn, m.usuario_id).await?;
            let unidad = repo::unidad_embed(&mut conn, m.unidad_id).await?;
            miembros.push(MiembroComiteDto::from_model(m, usuario, unidad));
        }
        dtos.push(ComiteHistoricoDto::from_model(c, miembros));
    }
    Ok(Json(dtos))
}

/// POST /api/v1/convivencia/comite — crear nuevo período de comité
async fn crear_comite(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CrearComiteRequest>,
) -> ApiResult<Json<ComiteHistoricoDto>> {
    guard::require(&user, ADMIN_CONVIVENCIA)?;

    // Validar número impar ≥ 3
    if body.miembros.len() < 3 {
        return Err(ApiError::BadRequest("El comité debe tener al menos 3 miembros (Ley 675/2001)".into()));
    }
    if body.miembros.len() % 2 == 0 {
        return Err(ApiError::BadRequest("El comité debe tener un número impar de miembros (Ley 675/2001)".into()));
    }

    let mut conn = state.pool.get().await?;
    let comite = repo::crear_comite(&mut conn, NuevoComiteHistorico {
        conjunto_id: user.conjunto_id,
        periodo_inicio: body.periodo_inicio,
        periodo_fin: body.periodo_fin,
        elegido_en_asamblea_id: body.elegido_en_asamblea_id,
    }).await?;

    let mut miembros_dto = vec![];
    for m in body.miembros {
        let miembro = repo::agregar_miembro(&mut conn, NuevoComiteMiembro {
            conjunto_id: user.conjunto_id,
            comite_historico_id: comite.id,
            usuario_id: m.usuario_id,
            calidad: m.calidad,
            unidad_id: m.unidad_id,
        }).await?;
        let usuario = repo::usuario_embed(&mut conn, miembro.usuario_id).await?;
        let unidad = repo::unidad_embed(&mut conn, miembro.unidad_id).await?;
        miembros_dto.push(MiembroComiteDto::from_model(miembro, usuario, unidad));
    }

    let dto = ComiteHistoricoDto::from_model(comite, miembros_dto);
    state.ws_hub.publish(user.conjunto_id, WsEvent {
        domain: "convivencia".into(),
        action: "comite_creado".into(),
        payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
        target_user_id: None,
    }).await;
    Ok(Json(dto))
}

/// POST /api/v1/convivencia/comite/miembros — agregar miembro al comité actual
async fn agregar_miembro(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<AgregarMiembroRequest>,
) -> ApiResult<Json<MiembroComiteDto>> {
    guard::require(&user, ADMIN_CONVIVENCIA)?;
    let mut conn = state.pool.get().await?;

    let comite = repo::comite_actual(&mut conn, user.conjunto_id).await?
        .ok_or_else(|| ApiError::BadRequest("No hay comité activo".into()))?;

    let miembro = repo::agregar_miembro(&mut conn, NuevoComiteMiembro {
        conjunto_id: user.conjunto_id,
        comite_historico_id: comite.id,
        usuario_id: body.usuario_id,
        calidad: body.calidad,
        unidad_id: body.unidad_id,
    }).await?;

    // Validar número impar después de agregar
    let total = repo::contar_miembros_activos(&mut conn, comite.id).await?;
    if total % 2 == 0 {
        return Err(ApiError::BadRequest("El comité debe mantener número impar de miembros. Agregue o remueva uno más.".into()));
    }

    let usuario = repo::usuario_embed(&mut conn, miembro.usuario_id).await?;
    let unidad = repo::unidad_embed(&mut conn, miembro.unidad_id).await?;
    Ok(Json(MiembroComiteDto::from_model(miembro, usuario, unidad)))
}

/// PUT /api/v1/convivencia/comite/miembros/{id} — desactivar miembro
async fn desactivar_miembro(
    State(state): State<AppState>,
    user: AuthUser,
    Path(miembro_id): Path<Uuid>,
) -> ApiResult<Json<serde_json::Value>> {
    guard::require(&user, ADMIN_CONVIVENCIA)?;
    let mut conn = state.pool.get().await?;
    repo::desactivar_miembro(&mut conn, miembro_id).await?;
    Ok(Json(serde_json::json!({"status": "ok"})))
}

// ═══════════════════════════════════════════════════════════════════════════
// Casos
// ═══════════════════════════════════════════════════════════════════════════

/// GET /api/v1/convivencia/casos — listar casos
async fn listar_casos(
    State(state): State<AppState>,
    user: AuthUser,
    Query(params): Query<ListarQuery>,
) -> ApiResult<Json<Vec<CasoConvivenciaDto>>> {
    guard::require(&user, ADMIN_CONVIVENCIA)?;
    let estado = params.estado.and_then(|e| e.parse().ok());
    let mut conn = state.pool.get().await?;
    let casos = repo::listar_casos(&mut conn, user.conjunto_id, estado).await?;
    let mut dtos = vec![];
    for caso in casos {
        dtos.push(caso_to_dto(&mut conn, caso).await?);
    }
    Ok(Json(dtos))
}

/// POST /api/v1/convivencia/casos — crear caso (solo conflictos de convivencia)
async fn crear_caso(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CrearCasoRequest>,
) -> ApiResult<Json<CasoConvivenciaDto>> {
    guard::require(&user, ADMIN_CONVIVENCIA)?;
    if body.descripcion.trim().is_empty() {
        return Err(ApiError::BadRequest("La descripción es obligatoria".into()));
    }
    let mut conn = state.pool.get().await?;
    let caso = repo::crear_caso(&mut conn, NuevoCasoConvivencia {
        conjunto_id: user.conjunto_id,
        tipo: body.tipo,
        descripcion: body.descripcion,
        unidad_reporta_id: body.unidad_reporta_id,
        unidad_reportada_id: body.unidad_reportada_id,
        creado_por: user.id,
    }).await?;
    let dto = caso_to_dto(&mut conn, caso).await?;
    state.ws_hub.publish(user.conjunto_id, WsEvent {
        domain: "convivencia".into(),
        action: "caso_creado".into(),
        payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
        target_user_id: None,
    }).await;
    Ok(Json(dto))
}

/// PUT /api/v1/convivencia/casos/{id} — actualizar estado/resolución
async fn actualizar_caso(
    State(state): State<AppState>,
    user: AuthUser,
    Path(caso_id): Path<Uuid>,
    Json(body): Json<ActualizarCasoRequest>,
) -> ApiResult<Json<CasoConvivenciaDto>> {
    guard::require(&user, ADMIN_CONVIVENCIA)?;
    let mut conn = state.pool.get().await?;
    let existing = repo::caso_por_id(&mut conn, caso_id).await?
        .ok_or_else(|| ApiError::NotFound("Caso no encontrado".into()))?;
    if existing.conjunto_id != user.conjunto_id {
        return Err(ApiError::Forbidden);
    }
    let caso = repo::actualizar_caso(&mut conn, caso_id, body.estado, body.resolucion.map(|r| if r.is_empty() { None } else { Some(r) })).await?;
    let dto = caso_to_dto(&mut conn, caso).await?;
    state.ws_hub.publish(user.conjunto_id, WsEvent {
        domain: "convivencia".into(),
        action: "caso_actualizado".into(),
        payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
        target_user_id: None,
    }).await;
    Ok(Json(dto))
}

/// PUT /api/v1/convivencia/casos/{id}/asignar — asignar miembro del comité
async fn asignar_miembro(
    State(state): State<AppState>,
    user: AuthUser,
    Path(caso_id): Path<Uuid>,
    Json(body): Json<AsignarMiembroRequest>,
) -> ApiResult<Json<CasoConvivenciaDto>> {
    guard::require(&user, ADMIN_CONVIVENCIA)?;
    let mut conn = state.pool.get().await?;
    let existing = repo::caso_por_id(&mut conn, caso_id).await?
        .ok_or_else(|| ApiError::NotFound("Caso no encontrado".into()))?;
    if existing.conjunto_id != user.conjunto_id {
        return Err(ApiError::Forbidden);
    }
    let caso = repo::asignar_miembro(&mut conn, caso_id, body.miembro_id).await?;
    let dto = caso_to_dto(&mut conn, caso).await?;
    state.ws_hub.publish(user.conjunto_id, WsEvent {
        domain: "convivencia".into(),
        action: "miembro_asignado".into(),
        payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
        target_user_id: None,
    }).await;
    Ok(Json(dto))
}

/// POST /api/v1/convivencia/casos/{id}/mediacion — registrar sesión de mediación
async fn registrar_mediacion(
    State(state): State<AppState>,
    user: AuthUser,
    Path(caso_id): Path<Uuid>,
    Json(body): Json<RegistrarMediacionRequest>,
) -> ApiResult<Json<CasoConvivenciaDto>> {
    guard::require(&user, ADMIN_CONVIVENCIA)?;
    // Solo ACUERDO o SIN_ACUERDO como resultado
    if !matches!(body.resultado, EstadoCasoConvivencia::Acuerdo | EstadoCasoConvivencia::SinAcuerdo) {
        return Err(ApiError::BadRequest("El resultado debe ser ACUERDO o SIN_ACUERDO".into()));
    }
    let mut conn = state.pool.get().await?;
    let existing = repo::caso_por_id(&mut conn, caso_id).await?
        .ok_or_else(|| ApiError::NotFound("Caso no encontrado".into()))?;
    if existing.conjunto_id != user.conjunto_id {
        return Err(ApiError::Forbidden);
    }
    let caso = repo::registrar_mediacion(&mut conn, caso_id, body.fecha, body.notas, body.resultado).await?;
    let dto = caso_to_dto(&mut conn, caso).await?;
    state.ws_hub.publish(user.conjunto_id, WsEvent {
        domain: "convivencia".into(),
        action: "mediacion_registrada".into(),
        payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
        target_user_id: None,
    }).await;
    Ok(Json(dto))
}

/// GET /api/v1/convivencia/casos/stats — estadísticas
async fn stats(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<StatsConvivencia>> {
    guard::require(&user, ADMIN_CONVIVENCIA)?;
    let mut conn = state.pool.get().await?;
    repo::stats_convivencia(&mut conn, user.conjunto_id).await.map(Json)
}

// ═══════════════════════════════════════════════════════════════════════════
// Actas
// ═══════════════════════════════════════════════════════════════════════════

/// POST /api/v1/convivencia/casos/{id}/acta — generar acta de mediación
async fn generar_acta(
    State(state): State<AppState>,
    user: AuthUser,
    Path(caso_id): Path<Uuid>,
) -> ApiResult<Json<ActaConvivenciaDto>> {
    guard::require(&user, ADMIN_CONVIVENCIA)?;
    let mut conn = state.pool.get().await?;

    let caso = repo::caso_por_id(&mut conn, caso_id).await?
        .ok_or_else(|| ApiError::NotFound("Caso no encontrado".into()))?;
    if caso.conjunto_id != user.conjunto_id {
        return Err(ApiError::Forbidden);
    }
    if caso.sesion_mediacion_fecha.is_none() {
        return Err(ApiError::BadRequest("Debe registrar la mediación antes de generar el acta".into()));
    }

    let unidad_reporta = repo::unidad_embed(&mut conn, caso.unidad_reporta_id).await?;
    let unidad_reportada_label = if let Some(uid) = caso.unidad_reportada_id {
        let u = repo::unidad_embed(&mut conn, uid).await?;
        format!("Torre {} - {}", u.torre.unwrap_or_default(), u.numero)
    } else {
        "No especificada".into()
    };

    let contenido = format!(
        "**ACTA DE MEDIACIÓN — COMITÉ DE CONVIVENCIA**\n\
         **Conjunto Residencial ConjuntOS**\n\n\
         **Fecha de mediación:** {fecha}\n\
         **Tipo de conflicto:** {tipo}\n\n\
         **Unidad que reporta:** Torre {torre_r} - {numero_r}\n\
         **Unidad reportada:** {reportada}\n\n\
         **Descripción del conflicto:**\n\
         {descripcion}\n\n\
         **Notas de la sesión de mediación:**\n\
         {notas}\n\n\
         **Resultado:** {resultado}\n\n\
         ---\n\
         *Esta acta se firma en cumplimiento de la Ley 675 de 2001, Art. 58.*\n\
         *El original reposa en los archivos de la administración del conjunto.*",
        fecha = caso.sesion_mediacion_fecha.map(|d| d.to_string()).unwrap_or_default(),
        tipo = caso.tipo.as_str(),
        torre_r = unidad_reporta.torre.unwrap_or_default(),
        numero_r = unidad_reporta.numero,
        reportada = unidad_reportada_label,
        descripcion = caso.descripcion,
        notas = caso.sesion_mediacion_notas.unwrap_or_default(),
        resultado = caso.estado.as_str(),
    );

    let acta = repo::crear_acta(&mut conn, NuevaActaConvivencia {
        caso_id,
        contenido,
    }).await?;

    let firmas = repo::firmas_por_acta(&mut conn, acta.id).await?;
    let mut firmas_dto = vec![];
    for f in firmas {
        let u = repo::usuario_embed(&mut conn, f.usuario_id).await?;
        firmas_dto.push(FirmaActaDto::from_model(f, u));
    }

    let dto = ActaConvivenciaDto::from_model(acta, firmas_dto);
    state.ws_hub.publish(user.conjunto_id, WsEvent {
        domain: "convivencia".into(),
        action: "acta_generada".into(),
        payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
        target_user_id: None,
    }).await;
    Ok(Json(dto))
}

/// POST /api/v1/convivencia/actas/{id}/firmar — firmar acta
async fn firmar_acta(
    State(state): State<AppState>,
    user: AuthUser,
    Path(acta_id): Path<Uuid>,
    Json(body): Json<FirmarActaRequest>,
) -> ApiResult<Json<ActaConvivenciaDto>> {
    let mut conn = state.pool.get().await?;
    let acta = repo::acta_por_id(&mut conn, acta_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Acta no encontrada".into()))?;

    let firma = repo::firmar_acta(&mut conn, NuevaFirmaActa {
        acta_id,
        usuario_id: user.id,
        tipo: body.tipo,
    }).await?;

    // Verificar si todas las firmas requeridas están (4 tipos: reportante, reportada, comité, admin)
    let todas = repo::firmas_por_acta(&mut conn, acta_id).await?;
    let tipos_firmados: std::collections::HashSet<String> = todas.iter().map(|f| f.tipo.clone()).collect();
    if tipos_firmados.len() >= 4 {
        repo::marcar_acta_firmada(&mut conn, acta_id).await?;
    }

    let firmas = repo::firmas_por_acta(&mut conn, acta_id).await?;
    let mut firmas_dto = vec![];
    for f in firmas {
        let u = repo::usuario_embed(&mut conn, f.usuario_id).await?;
        firmas_dto.push(FirmaActaDto::from_model(f, u));
    }

    let dto = ActaConvivenciaDto {
        id: acta.id,
        caso_id: acta.caso_id,
        contenido: acta.contenido,
        pdf_url: acta.pdf_url,
        firmada: tipos_firmados.len() >= 4,
        firmas: firmas_dto,
        created_at: acta.created_at,
    };

    state.ws_hub.publish(user.conjunto_id, WsEvent {
        domain: "convivencia".into(),
        action: "acta_firmada".into(),
        payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
        target_user_id: None,
    }).await;
    Ok(Json(dto))
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

async fn caso_to_dto(
    conn: &mut crate::db::DbConn,
    caso: crate::domains::comite_convivencia::models::CasoConvivencia,
) -> ApiResult<CasoConvivenciaDto> {
    let unidad_reporta = repo::unidad_embed(conn, caso.unidad_reporta_id).await?;
    let unidad_reportada = if let Some(uid) = caso.unidad_reportada_id {
        Some(repo::unidad_embed(conn, uid).await?)
    } else { None };
    let creador = repo::usuario_embed(conn, caso.creado_por).await?;
    let miembro = if let Some(mid) = caso.miembro_asignado_id {
        Some(repo::usuario_embed(conn, mid).await?)
    } else { None };

    let acta = if let Some(a) = repo::acta_por_caso(conn, caso.id).await? {
        let firmas = repo::firmas_por_acta(conn, a.id).await?;
        let mut firmas_dto = vec![];
        for f in firmas {
            let u = repo::usuario_embed(conn, f.usuario_id).await?;
            firmas_dto.push(FirmaActaDto::from_model(f, u));
        }
        Some(ActaConvivenciaDto::from_model(a, firmas_dto))
    } else { None };

    Ok(CasoConvivenciaDto::from_model(caso, unidad_reporta, unidad_reportada, creador, miembro, acta))
}
