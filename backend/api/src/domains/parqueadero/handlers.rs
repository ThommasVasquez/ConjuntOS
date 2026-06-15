use axum::extract::{Path, State};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::auth::guard;
use crate::db::enums::{
    AccionParqueadero, CategoriaParqueadero, EstadoParqueadero, EstadoSolicitudParqueadero, Rol,
    TipoCeldaParqueadero,
};
use crate::domains::parqueadero::dto::{
    AsignarCeldaRequest, CeldaDto, CeldaMapaDto, CerrarSesionRequest, CreateCeldaRequest,
    CreateRondaRequest, CreateVehiculoRequest, EditarSolicitudRequest, MovimientoResultadoDto,
    OcupanteDto, ParqueaderoMioDto, ParqueaderoStatsDto, RegistroDto, RondaDto, SesionDto,
    SolicitudDto, UpdateCeldaRequest, VehiculoDto,
};
use crate::domains::parqueadero::models::{NuevaCelda, NuevaSolicitud, NuevoVehiculo};
use crate::domains::parqueadero::repo::{self, Actor};
use crate::domains::parqueadero::sesiones;
use crate::error::{ApiError, ApiResult};
use crate::services::ws_hub::WsEvent;
use crate::state::AppState;

/// Construye el Actor (para el log inmutable) desde el usuario autenticado.
fn actor_de(user: &AuthUser) -> Actor {
    Actor {
        id: user.id,
        nombre: user.nombre.clone(),
        rol: user.rol.to_string(),
    }
}

/// ¿El usuario puede ejecutar movimientos sobre celdas de residente SIN
/// aprobación? Solo el administrador (y super_admin). El resto genera solicitud.
fn puede_mover_residente_directo(user: &AuthUser) -> bool {
    matches!(user.rol, Rol::Administrador | Rol::SuperAdmin)
}

/// Publica un evento WS de parqueadero (helper para reducir repetición).
async fn notificar(
    state: &AppState,
    conjunto_id: Uuid,
    action: &str,
    payload: Option<serde_json::Value>,
) {
    state
        .ws_hub
        .publish(
            conjunto_id,
            WsEvent {
                domain: "parqueadero".into(),
                action: action.into(),
                payload,
                target_user_id: None,
            },
        )
        .await;
}

/// Parking managers (legacy /api/parqueadero/* role list + supervisor).
const ROLES_PARQUEADERO: &[Rol] = &[
    Rol::EncargadoParqueadero,
    Rol::SupervisorVigilancia,
    Rol::Administrador,
];

/// Quién puede ver el mapa y mover celdas (incluye VIGILANTE, que solo gestiona
/// celdas de visitante; las de residente le generan una solicitud de aprobación).
const ROLES_GESTION_CELDAS: &[Rol] = &[
    Rol::EncargadoParqueadero,
    Rol::SupervisorVigilancia,
    Rol::Administrador,
    Rol::Vigilante,
];

/// Registros readers: managers plus VIGILANTE (own rows only).
const ROLES_REGISTROS: &[Rol] = &[
    Rol::EncargadoParqueadero,
    Rol::SupervisorVigilancia,
    Rol::Administrador,
    Rol::Vigilante,
];

/// Staff who walk rounds (legacy POST /api/parqueadero/rondas).
const ROLES_RONDAS: &[Rol] = &[
    Rol::EncargadoParqueadero,
    Rol::Vigilante,
    Rol::SupervisorVigilancia,
];

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/parqueadero/mio", get(parqueadero_mio))
        .route("/vehiculos", post(crear_vehiculo))
        .route("/parqueadero/mapa", get(mapa))
        .route("/parqueadero/celdas", post(crear_celdas))
        .route("/parqueadero/celdas/{id}", put(actualizar_celda))
        .route("/parqueadero/celdas/{id}/asignar", post(asignar_celda))
        .route("/parqueadero/celdas/{id}/liberar", post(liberar_celda))
        .route("/parqueadero/registros", get(registros))
        .route("/parqueadero/rondas", get(ronda_de_hoy).post(crear_ronda))
        .route("/parqueadero/stats", get(parqueadero_stats))
        // Log inmutable de movimientos + flujo de aprobación.
        .route("/parqueadero/solicitudes", get(listar_solicitudes))
        // Bandeja del inquilino: solicitudes de visitante que él debe aprobar.
        .route("/parqueadero/solicitudes/mias", get(mis_solicitudes_inquilino))
        .route(
            "/parqueadero/solicitudes/{id}/inquilino/aprobar",
            post(inquilino_aprobar),
        )
        .route(
            "/parqueadero/solicitudes/{id}/inquilino/rechazar",
            post(inquilino_rechazar),
        )
        .route(
            "/parqueadero/solicitudes/{id}/aprobar",
            post(aprobar_solicitud),
        )
        .route(
            "/parqueadero/solicitudes/{id}/rechazar",
            post(rechazar_solicitud),
        )
        .route(
            "/parqueadero/solicitudes/{id}",
            put(editar_solicitud).delete(borrar_solicitud),
        )
        // Sesiones de cobro de visitante (conteo regresivo + liquidación).
        .route("/parqueadero/sesiones/mias", get(mis_sesiones))
        .route("/parqueadero/sesiones/celda/{id}", get(sesion_de_celda))
        .route("/parqueadero/sesiones/{id}/cerrar", post(cerrar_sesion))
        // Cargos al apto PENDIENTES de aprobación del residente (informa el monto).
        .route("/parqueadero/cargos/mios", get(mis_cargos_pendientes))
        .route("/parqueadero/cargos/{id}/aprobar", post(cargo_aprobar))
        .route("/parqueadero/cargos/{id}/rechazar", post(cargo_rechazar))
}

#[utoipa::path(
    get,
    path = "/api/v1/parqueadero/mio",
    tag = "parqueadero",
    responses(
        (status = 200, description = "Own vehicles and permanently assigned cells", body = ParqueaderoMioDto),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn parqueadero_mio(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<ParqueaderoMioDto>> {
    let mut conn = state.pool.get().await?;
    let vehiculos = repo::vehiculos_propios(&mut conn, user.conjunto_id, user.id).await?;
    let celdas = repo::celdas_propias(&mut conn, user.conjunto_id, user.id).await?;
    Ok(Json(ParqueaderoMioDto {
        vehiculos: vehiculos.into_iter().map(VehiculoDto::from).collect(),
        celdas: celdas.into_iter().map(CeldaDto::from).collect(),
    }))
}

#[utoipa::path(
    post,
    path = "/api/v1/vehiculos",
    tag = "parqueadero",
    request_body = CreateVehiculoRequest,
    responses(
        (status = 200, description = "Vehicle registered", body = VehiculoDto),
        (status = 409, description = "Placa already registered")
    )
)]
pub async fn crear_vehiculo(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreateVehiculoRequest>,
) -> ApiResult<Json<VehiculoDto>> {
    let placa = req.placa.trim().to_uppercase();
    if placa.is_empty() {
        return Err(ApiError::BadRequest("la placa es obligatoria".into()));
    }
    let mut conn = state.pool.get().await?;
    let vehiculo = repo::crear_vehiculo(
        &mut conn,
        NuevoVehiculo {
            conjunto_id: user.conjunto_id,
            usuario_id: user.id,
            placa,
            marca: req.marca,
            modelo: req.modelo,
            color: req.color,
            tipo: req.tipo,
        },
    )
    .await?;
    let dto = VehiculoDto::from(vehiculo);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "vehiculo".into(),
                action: "created".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}

#[utoipa::path(
    post,
    path = "/api/v1/parqueadero/celdas",
    tag = "parqueadero",
    request_body = CreateCeldaRequest,
    responses(
        (status = 200, description = "Cells created", body = [CeldaDto]),
        (status = 403, description = "Requires parking manager role")
    )
)]
pub async fn crear_celdas(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreateCeldaRequest>,
) -> ApiResult<Json<Vec<CeldaDto>>> {
    guard::require(&user, ROLES_PARQUEADERO)?;
    let tipo = req.tipo.unwrap_or(TipoCeldaParqueadero::Residente);
    let categoria = req.categoria.unwrap_or(CategoriaParqueadero::Carro);
    let torre = req
        .torre
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty());

    // Determina la lista de números a crear: lote (prefijo+cantidad) o uno solo (numero).
    let numeros: Vec<String> = if let Some(cant) = req.cantidad.filter(|c| *c > 0) {
        if cant > 500 {
            return Err(ApiError::BadRequest(
                "no se pueden crear más de 500 celdas a la vez".into(),
            ));
        }
        let prefijo = req.prefijo.unwrap_or_default();
        let prefijo = prefijo.trim();
        (1..=cant).map(|i| format!("{prefijo}{i}")).collect()
    } else if let Some(n) = req.numero {
        let n = n.trim().to_string();
        if n.is_empty() {
            return Err(ApiError::BadRequest("el número de celda es obligatorio".into()));
        }
        vec![n]
    } else {
        return Err(ApiError::BadRequest(
            "indica 'numero' o 'prefijo'+'cantidad'".into(),
        ));
    };

    let nuevas: Vec<NuevaCelda> = numeros
        .into_iter()
        .map(|numero| NuevaCelda {
            conjunto_id: user.conjunto_id,
            numero,
            torre: torre.clone(),
            tipo,
            estado: EstadoParqueadero::Disponible,
            categoria,
        })
        .collect();

    let mut conn = state.pool.get().await?;
    let creadas = repo::crear_celdas(&mut conn, nuevas).await?;
    let dtos: Vec<CeldaDto> = creadas.into_iter().map(CeldaDto::from).collect();
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "parqueadero".into(),
                action: "celdas_creadas".into(),
                payload: None,
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dtos))
}

#[utoipa::path(
    get,
    path = "/api/v1/parqueadero/mapa",
    tag = "parqueadero",
    responses(
        (status = 200, description = "Every cell of the conjunto with occupant info", body = [CeldaMapaDto]),
        (status = 403, description = "Requires parking manager role")
    )
)]
pub async fn mapa(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<CeldaMapaDto>>> {
    guard::require(&user, ROLES_GESTION_CELDAS)?;
    let mut conn = state.pool.get().await?;
    let rows = repo::mapa(&mut conn, user.conjunto_id).await?;
    Ok(Json(
        rows.into_iter()
            .map(|(celda, ocupante)| CeldaMapaDto {
                celda: celda.into(),
                ocupante: ocupante.map(|(nombre, torre, apto)| OcupanteDto {
                    nombre,
                    torre,
                    apto,
                }),
            })
            .collect(),
    ))
}

#[utoipa::path(
    put,
    path = "/api/v1/parqueadero/celdas/{id}",
    tag = "parqueadero",
    params(("id" = Uuid, Path, description = "Cell id")),
    request_body = UpdateCeldaRequest,
    responses(
        (status = 200, description = "Cell state updated or approval requested", body = MovimientoResultadoDto),
        (status = 403, description = "Requires parking manager role"),
        (status = 404, description = "Cell not found in this conjunto")
    )
)]
pub async fn actualizar_celda(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateCeldaRequest>,
) -> ApiResult<Json<MovimientoResultadoDto>> {
    guard::require(&user, ROLES_GESTION_CELDAS)?;
    let mut conn = state.pool.get().await?;
    let celda = repo::obtener_celda(&mut conn, user.conjunto_id, id).await?;

    // Celda de residente (asignación permanente): requiere aprobación del admin,
    // salvo que el actor sea admin/super_admin.
    if repo::celda_requiere_aprobacion(&celda) && !puede_mover_residente_directo(&user) {
        let detalle = format!(
            "cambiar estado de celda {} ({}) a {}",
            celda.numero, celda.tipo, req.estado
        );
        let sol = repo::crear_solicitud_pendiente(
            &mut conn,
            NuevaSolicitud {
                conjunto_id: user.conjunto_id,
                parqueadero_id: Some(id),
                celda_numero: celda.numero.clone(),
                accion: AccionParqueadero::CambiarEstado,
                estado: EstadoSolicitudParqueadero::Pendiente,
                requiere_aprobacion: true,
                detalle,
                payload: Some(serde_json::json!({ "estado": req.estado })),
                solicitante_id: user.id,
                solicitante_nombre: user.nombre.clone(),
                solicitante_rol: user.rol.to_string(),
                destinatario_id: None,
                destinatario_nombre: None,
            },
        )
        .await?;
        notificar(&state, user.conjunto_id, "solicitud_creada", None).await;
        return Ok(Json(MovimientoResultadoDto {
            pendiente: true,
            celda: None,
            solicitud: Some(SolicitudDto::from(sol)),
        }));
    }

    let celda = repo::actualizar_celda(
        &mut conn,
        user.conjunto_id,
        id,
        actor_de(&user),
        req.estado,
    )
    .await?;
    let dto = CeldaDto::from(celda);
    notificar(
        &state,
        user.conjunto_id,
        "celda_updated",
        Some(serde_json::to_value(&dto).unwrap_or_default()),
    )
    .await;
    Ok(Json(MovimientoResultadoDto {
        pendiente: false,
        celda: Some(dto),
        solicitud: None,
    }))
}

#[utoipa::path(
    post,
    path = "/api/v1/parqueadero/celdas/{id}/asignar",
    tag = "parqueadero",
    params(("id" = Uuid, Path, description = "Cell id")),
    request_body = AsignarCeldaRequest,
    responses(
        (status = 200, description = "Cell assigned to resident with optional time clause", body = CeldaDto),
        (status = 403, description = "Requires parking manager role"),
        (status = 404, description = "Cell not found in this conjunto"),
        (status = 409, description = "Cell already occupied")
    )
)]
pub async fn asignar_celda(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<AsignarCeldaRequest>,
) -> ApiResult<Json<MovimientoResultadoDto>> {
    guard::require(&user, ROLES_GESTION_CELDAS)?;
    let mut conn = state.pool.get().await?;
    let celda = repo::obtener_celda(&mut conn, user.conjunto_id, id).await?;

    // ── Celda de VISITANTE ───────────────────────────────────────────────
    // La asignación la aprueba ÚNICAMENTE el inquilino que recibe la visita
    // (consentimiento expreso), no el administrador. Queda en el log del admin
    // como lectura. Se exige indicar a qué residente/apto se asigna.
    if celda.tipo == TipoCeldaParqueadero::Visitante {
        let residente_id = req.usuario_id;
        let residente = repo::obtener_usuario(&mut conn, user.conjunto_id, residente_id)
            .await?
            .ok_or_else(|| {
                ApiError::BadRequest("debes indicar el residente que recibe la visita".into())
            })?;
        let (residente_nombre, torre, apto) = residente;
        let ubic = match (torre.as_deref(), apto.as_deref()) {
            (Some(t), Some(a)) => format!(" (Torre {t} Apto {a})"),
            (None, Some(a)) => format!(" (Apto {a})"),
            _ => String::new(),
        };
        let detalle = format!(
            "asignar parqueadero de visitante {} a visita de {}{}",
            celda.numero, residente_nombre, ubic
        );
        let sol = repo::crear_solicitud_pendiente(
            &mut conn,
            NuevaSolicitud {
                conjunto_id: user.conjunto_id,
                parqueadero_id: Some(id),
                celda_numero: celda.numero.clone(),
                accion: AccionParqueadero::Asignar,
                estado: EstadoSolicitudParqueadero::PendienteInquilino,
                requiere_aprobacion: true,
                detalle: detalle.clone(),
                payload: Some(serde_json::json!({
                    "residenteId": residente_id,
                    "meses": req.meses,
                    "estimadoMinutos": req.estimado_minutos,
                    "placa": req.placa,
                })),
                solicitante_id: user.id,
                solicitante_nombre: user.nombre.clone(),
                solicitante_rol: user.rol.to_string(),
                destinatario_id: Some(residente_id),
                destinatario_nombre: Some(residente_nombre.clone()),
            },
        )
        .await?;
        // Notifica al inquilino para que apruebe/rechace en su app.
        repo::notificar_inquilino(
            &mut conn,
            user.conjunto_id,
            residente_id,
            &format!("Parqueadero de visitante {}", celda.numero),
            &format!(
                "{} solicita asignarte el parqueadero de visitante {}. Aprueba o rechaza desde Parqueadero.",
                user.nombre, celda.numero
            ),
        )
        .await?;
        notificar(&state, user.conjunto_id, "solicitud_creada", None).await;
        return Ok(Json(MovimientoResultadoDto {
            pendiente: true,
            celda: None,
            solicitud: Some(SolicitudDto::from(sol)),
        }));
    }

    // ── Celda de RESIDENTE (asignación permanente) ───────────────────────
    // Requiere aprobación del administrador, salvo que el actor sea admin.
    if !puede_mover_residente_directo(&user) {
        let detalle = match req.meses {
            Some(m) if m > 0 => format!(
                "asignar celda {} a residente por {} meses",
                celda.numero, m
            ),
            _ => format!(
                "asignar celda {} a residente (sin vencimiento)",
                celda.numero
            ),
        };
        let sol = repo::crear_solicitud_pendiente(
            &mut conn,
            NuevaSolicitud {
                conjunto_id: user.conjunto_id,
                parqueadero_id: Some(id),
                celda_numero: celda.numero.clone(),
                accion: AccionParqueadero::Asignar,
                estado: EstadoSolicitudParqueadero::Pendiente,
                requiere_aprobacion: true,
                detalle,
                payload: Some(
                    serde_json::json!({ "residenteId": req.usuario_id, "meses": req.meses }),
                ),
                solicitante_id: user.id,
                solicitante_nombre: user.nombre.clone(),
                solicitante_rol: user.rol.to_string(),
                destinatario_id: None,
                destinatario_nombre: None,
            },
        )
        .await?;
        notificar(&state, user.conjunto_id, "solicitud_creada", None).await;
        return Ok(Json(MovimientoResultadoDto {
            pendiente: true,
            celda: None,
            solicitud: Some(SolicitudDto::from(sol)),
        }));
    }

    let celda = repo::asignar_celda(
        &mut conn,
        user.conjunto_id,
        id,
        actor_de(&user),
        req.usuario_id,
        req.meses,
    )
    .await?;
    let dto = CeldaDto::from(celda);
    notificar(
        &state,
        user.conjunto_id,
        "celda_asignada",
        Some(serde_json::to_value(&dto).unwrap_or_default()),
    )
    .await;
    Ok(Json(MovimientoResultadoDto {
        pendiente: false,
        celda: Some(dto),
        solicitud: None,
    }))
}

#[utoipa::path(
    post,
    path = "/api/v1/parqueadero/celdas/{id}/liberar",
    tag = "parqueadero",
    params(("id" = Uuid, Path, description = "Cell id")),
    responses(
        (status = 200, description = "Cell released or approval requested", body = MovimientoResultadoDto),
        (status = 403, description = "Requires parking manager role"),
        (status = 404, description = "Cell not found in this conjunto")
    )
)]
pub async fn liberar_celda(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<MovimientoResultadoDto>> {
    guard::require(&user, ROLES_GESTION_CELDAS)?;
    let mut conn = state.pool.get().await?;
    let celda = repo::obtener_celda(&mut conn, user.conjunto_id, id).await?;

    // Liberar una celda de residente (permanente) requiere aprobación si el actor
    // no es admin. Liberar una de visitante la puede hacer el vigilante directo.
    if repo::celda_requiere_aprobacion(&celda) && !puede_mover_residente_directo(&user) {
        let detalle = format!("liberar celda {} ({})", celda.numero, celda.tipo);
        let sol = repo::crear_solicitud_pendiente(
            &mut conn,
            NuevaSolicitud {
                conjunto_id: user.conjunto_id,
                parqueadero_id: Some(id),
                celda_numero: celda.numero.clone(),
                accion: AccionParqueadero::Liberar,
                estado: EstadoSolicitudParqueadero::Pendiente,
                requiere_aprobacion: true,
                detalle,
                payload: None,
                solicitante_id: user.id,
                solicitante_nombre: user.nombre.clone(),
                solicitante_rol: user.rol.to_string(),
                destinatario_id: None,
                destinatario_nombre: None,
            },
        )
        .await?;
        notificar(&state, user.conjunto_id, "solicitud_creada", None).await;
        return Ok(Json(MovimientoResultadoDto {
            pendiente: true,
            celda: None,
            solicitud: Some(SolicitudDto::from(sol)),
        }));
    }

    let celda = repo::liberar_celda(&mut conn, user.conjunto_id, id, actor_de(&user)).await?;
    // Si la celda de visitante tenía una sesión de cobro activa y se libera sin
    // pasar por la liquidación, se cierra como "visitante pagó" (default seguro).
    let _ = sesiones::cerrar_sesion_de_celda(&mut conn, user.conjunto_id, id, None).await?;
    let dto = CeldaDto::from(celda);
    notificar(
        &state,
        user.conjunto_id,
        "celda_liberada",
        Some(serde_json::to_value(&dto).unwrap_or_default()),
    )
    .await;
    Ok(Json(MovimientoResultadoDto {
        pendiente: false,
        celda: Some(dto),
        solicitud: None,
    }))
}

#[utoipa::path(
    get,
    path = "/api/v1/parqueadero/registros",
    tag = "parqueadero",
    responses(
        (status = 200, description = "Latest 50 audit entries (VIGILANTE sees only own)", body = [RegistroDto]),
        (status = 403, description = "Requires parking/gate staff role")
    )
)]
pub async fn registros(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<RegistroDto>>> {
    guard::require(&user, ROLES_REGISTROS)?;
    let solo_de_usuario = (user.rol == Rol::Vigilante).then_some(user.id);
    let mut conn = state.pool.get().await?;
    let rows = repo::registros(&mut conn, user.conjunto_id, solo_de_usuario).await?;
    Ok(Json(
        rows.into_iter()
            .map(
                |(r, celda_numero, celda_tipo, usuario_nombre)| RegistroDto {
                    id: r.id,
                    parqueadero_id: r.parqueadero_id,
                    usuario_id: r.usuario_id,
                    tipo: r.tipo,
                    placa: r.placa,
                    observacion: r.observacion,
                    fecha: r.fecha,
                    celda_numero,
                    celda_tipo,
                    usuario_nombre,
                },
            )
            .collect(),
    ))
}

#[utoipa::path(
    get,
    path = "/api/v1/parqueadero/rondas",
    tag = "parqueadero",
    responses(
        (status = 200, description = "Today's latest own round, or null", body = Option<RondaDto>),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn ronda_de_hoy(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Option<RondaDto>>> {
    let mut conn = state.pool.get().await?;
    let ronda = repo::ronda_de_hoy(&mut conn, user.conjunto_id, user.id).await?;
    Ok(Json(ronda.map(RondaDto::from)))
}

#[utoipa::path(
    post,
    path = "/api/v1/parqueadero/rondas",
    tag = "parqueadero",
    request_body = CreateRondaRequest,
    responses(
        (status = 200, description = "Round recorded", body = RondaDto),
        (status = 403, description = "Requires parking/gate staff role")
    )
)]
pub async fn crear_ronda(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreateRondaRequest>,
) -> ApiResult<Json<RondaDto>> {
    guard::require(&user, ROLES_RONDAS)?;
    let hallazgos = serde_json::to_value(&req.hallazgos)
        .map_err(|e| ApiError::BadRequest(format!("hallazgos inválidos: {e}")))?;
    let mut conn = state.pool.get().await?;
    let ronda = repo::crear_ronda(
        &mut conn,
        user.conjunto_id,
        user.id,
        hallazgos,
        req.completada,
    )
    .await?;
    let dto = RondaDto::from(ronda);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "parqueadero".into(),
                action: "ronda_created".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}

#[utoipa::path(
    get,
    path = "/api/v1/parqueadero/stats",
    tag = "parqueadero",
    responses(
        (status = 200, description = "Cell occupancy counters", body = ParqueaderoStatsDto),
        (status = 403, description = "Requires parking manager role")
    )
)]
pub async fn parqueadero_stats(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<ParqueaderoStatsDto>> {
    guard::require(&user, ROLES_PARQUEADERO)?;
    let mut conn = state.pool.get().await?;
    let (total, ocupados) = repo::stats(&mut conn, user.conjunto_id).await?;
    let porcentaje_ocupacion = if total > 0 {
        (ocupados as f64 / total as f64 * 100.0).round() as i64
    } else {
        0
    };
    Ok(Json(ParqueaderoStatsDto {
        total,
        ocupados,
        libres: total - ocupados,
        porcentaje_ocupacion,
    }))
}

/// Solo el ADMINISTRADOR ve el log (super_admin bypassa siempre via guard).
const ROLES_LOG: &[Rol] = &[Rol::Administrador];

#[utoipa::path(
    get,
    path = "/api/v1/parqueadero/solicitudes",
    tag = "parqueadero",
    responses(
        (status = 200, description = "Immutable movement log (admin only)", body = [SolicitudDto]),
        (status = 403, description = "Requires administrator role")
    )
)]
pub async fn listar_solicitudes(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<SolicitudDto>>> {
    guard::require(&user, ROLES_LOG)?;
    let mut conn = state.pool.get().await?;
    let rows = repo::listar_solicitudes(&mut conn, user.conjunto_id, false).await?;
    Ok(Json(rows.into_iter().map(SolicitudDto::from).collect()))
}

#[utoipa::path(
    post,
    path = "/api/v1/parqueadero/solicitudes/{id}/aprobar",
    tag = "parqueadero",
    params(("id" = Uuid, Path, description = "Solicitud id")),
    responses(
        (status = 200, description = "Approved and executed", body = SolicitudDto),
        (status = 403, description = "Requires administrator role")
    )
)]
pub async fn aprobar_solicitud(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<SolicitudDto>> {
    guard::require(&user, ROLES_LOG)?;
    let mut conn = state.pool.get().await?;
    let sol = repo::aprobar_solicitud(&mut conn, user.conjunto_id, id, actor_de(&user)).await?;
    notificar(&state, user.conjunto_id, "celda_updated", None).await;
    notificar(&state, user.conjunto_id, "solicitud_resuelta", None).await;
    Ok(Json(SolicitudDto::from(sol)))
}

#[utoipa::path(
    post,
    path = "/api/v1/parqueadero/solicitudes/{id}/rechazar",
    tag = "parqueadero",
    params(("id" = Uuid, Path, description = "Solicitud id")),
    responses(
        (status = 200, description = "Rejected (no change applied)", body = SolicitudDto),
        (status = 403, description = "Requires administrator role")
    )
)]
pub async fn rechazar_solicitud(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<SolicitudDto>> {
    guard::require(&user, ROLES_LOG)?;
    let mut conn = state.pool.get().await?;
    let sol = repo::rechazar_solicitud(&mut conn, user.conjunto_id, id, actor_de(&user)).await?;
    notificar(&state, user.conjunto_id, "solicitud_resuelta", None).await;
    Ok(Json(SolicitudDto::from(sol)))
}

#[utoipa::path(
    put,
    path = "/api/v1/parqueadero/solicitudes/{id}",
    tag = "parqueadero",
    params(("id" = Uuid, Path, description = "Solicitud id")),
    request_body = EditarSolicitudRequest,
    responses(
        (status = 200, description = "Log entry edited (super admin only)", body = SolicitudDto),
        (status = 403, description = "Requires super admin")
    )
)]
pub async fn editar_solicitud(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<EditarSolicitudRequest>,
) -> ApiResult<Json<SolicitudDto>> {
    guard::require_superadmin(&user)?;
    let mut conn = state.pool.get().await?;
    let sol = repo::editar_solicitud(&mut conn, user.conjunto_id, id, req.detalle).await?;
    Ok(Json(SolicitudDto::from(sol)))
}

#[utoipa::path(
    delete,
    path = "/api/v1/parqueadero/solicitudes/{id}",
    tag = "parqueadero",
    params(("id" = Uuid, Path, description = "Solicitud id")),
    responses(
        (status = 200, description = "Log entry deleted (super admin only)"),
        (status = 403, description = "Requires super admin")
    )
)]
pub async fn borrar_solicitud(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<serde_json::Value>> {
    guard::require_superadmin(&user)?;
    let mut conn = state.pool.get().await?;
    repo::borrar_solicitud(&mut conn, user.conjunto_id, id).await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

#[utoipa::path(
    get,
    path = "/api/v1/parqueadero/solicitudes/mias",
    tag = "parqueadero",
    responses(
        (status = 200, description = "Visitor-cell requests awaiting THIS resident's approval", body = [SolicitudDto]),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn mis_solicitudes_inquilino(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<SolicitudDto>>> {
    let mut conn = state.pool.get().await?;
    // Por defecto solo las pendientes de su aprobación.
    let rows = repo::solicitudes_de_inquilino(&mut conn, user.conjunto_id, user.id, true).await?;
    Ok(Json(rows.into_iter().map(SolicitudDto::from).collect()))
}

#[utoipa::path(
    post,
    path = "/api/v1/parqueadero/solicitudes/{id}/inquilino/aprobar",
    tag = "parqueadero",
    params(("id" = Uuid, Path, description = "Solicitud id")),
    responses(
        (status = 200, description = "Resident approved: visitor cell assigned", body = SolicitudDto),
        (status = 403, description = "Not the intended resident"),
        (status = 404, description = "Solicitud not found")
    )
)]
pub async fn inquilino_aprobar(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<SolicitudDto>> {
    let mut conn = state.pool.get().await?;
    let sol = repo::inquilino_aprobar(
        &mut conn,
        user.conjunto_id,
        id,
        user.id,
        user.nombre.clone(),
    )
    .await?;
    notificar(&state, user.conjunto_id, "celda_asignada", None).await;
    notificar(&state, user.conjunto_id, "solicitud_resuelta", None).await;
    Ok(Json(SolicitudDto::from(sol)))
}

#[utoipa::path(
    post,
    path = "/api/v1/parqueadero/solicitudes/{id}/inquilino/rechazar",
    tag = "parqueadero",
    params(("id" = Uuid, Path, description = "Solicitud id")),
    responses(
        (status = 200, description = "Resident rejected: no assignment made", body = SolicitudDto),
        (status = 403, description = "Not the intended resident"),
        (status = 404, description = "Solicitud not found")
    )
)]
pub async fn inquilino_rechazar(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<SolicitudDto>> {
    let mut conn = state.pool.get().await?;
    let sol = repo::inquilino_rechazar(
        &mut conn,
        user.conjunto_id,
        id,
        user.id,
        user.nombre.clone(),
    )
    .await?;
    notificar(&state, user.conjunto_id, "solicitud_resuelta", None).await;
    Ok(Json(SolicitudDto::from(sol)))
}

// ─────────────────────────────────────────────────────────────────────────────
// Sesiones de cobro de visitante (conteo regresivo + liquidación).
// ─────────────────────────────────────────────────────────────────────────────

#[utoipa::path(
    get,
    path = "/api/v1/parqueadero/sesiones/mias",
    tag = "parqueadero",
    responses(
        (status = 200, description = "Active visitor parking sessions for this resident (live countdown)", body = [SesionDto]),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn mis_sesiones(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<SesionDto>>> {
    let mut conn = state.pool.get().await?;
    let rows = sesiones::sesiones_activas_de_residente(&mut conn, user.conjunto_id, user.id).await?;
    let ahora = chrono::Utc::now();
    Ok(Json(rows.iter().map(|s| sesiones::to_dto(s, ahora)).collect()))
}

#[utoipa::path(
    get,
    path = "/api/v1/parqueadero/sesiones/celda/{id}",
    tag = "parqueadero",
    params(("id" = Uuid, Path, description = "Cell id")),
    responses(
        (status = 200, description = "Active session for a cell, or null", body = Option<SesionDto>),
        (status = 403, description = "Requires parking manager role")
    )
)]
pub async fn sesion_de_celda(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Option<SesionDto>>> {
    guard::require(&user, ROLES_GESTION_CELDAS)?;
    let mut conn = state.pool.get().await?;
    let sesion = sesiones::sesion_activa_de_celda(&mut conn, user.conjunto_id, id).await?;
    let ahora = chrono::Utc::now();
    Ok(Json(sesion.map(|s| sesiones::to_dto(&s, ahora))))
}

#[utoipa::path(
    post,
    path = "/api/v1/parqueadero/sesiones/{id}/cerrar",
    tag = "parqueadero",
    params(("id" = Uuid, Path, description = "Session id")),
    request_body = CerrarSesionRequest,
    responses(
        (status = 200, description = "Session closed (charge frozen) and cell released", body = SesionDto),
        (status = 403, description = "Requires parking manager role"),
        (status = 404, description = "Active session not found")
    )
)]
pub async fn cerrar_sesion(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<CerrarSesionRequest>,
) -> ApiResult<Json<SesionDto>> {
    guard::require(&user, ROLES_GESTION_CELDAS)?;
    let mut conn = state.pool.get().await?;
    // Resolver la celda de la sesión para cerrarla + liberar la celda.
    let sesion = sesiones::obtener_sesion(&mut conn, user.conjunto_id, id)
        .await?
        .ok_or_else(|| ApiError::NotFound("sesión no encontrada".into()))?;
    if sesion.estado != "ACTIVA" {
        return Err(ApiError::BadRequest("la sesión ya está cerrada".into()));
    }
    let celda_id = sesion
        .parqueadero_id
        .ok_or_else(|| ApiError::BadRequest("sesión sin celda".into()))?;

    let cerrada = sesiones::cerrar_sesion_de_celda(
        &mut conn,
        user.conjunto_id,
        celda_id,
        Some(req.liquidacion),
    )
    .await?
    .ok_or_else(|| ApiError::NotFound("sin sesión activa para cerrar".into()))?;

    // Vehículo en portería → liberar la celda.
    let _ = repo::liberar_celda(&mut conn, user.conjunto_id, celda_id, actor_de(&user)).await;

    // Si el cargo quedó PENDIENTE de aprobación del residente, notificarle con el
    // monto para que apruebe o rechace desde su app.
    if cerrada.liquidacion.as_deref() == Some("CARGADO_APTO_PENDIENTE") {
        let monto = cerrada
            .monto
            .clone()
            .unwrap_or_else(|| bigdecimal::BigDecimal::from(0));
        let _ = repo::notificar_inquilino(
            &mut conn,
            user.conjunto_id,
            cerrada.residente_id,
            &format!("Cargo de parqueadero {} — aprueba o rechaza", cerrada.celda_numero),
            &format!(
                "Tu visita usó el parqueadero {} y se generó un cobro de ${}. Apruébalo para cargarlo a tu apartamento o recházalo desde Parqueadero.",
                cerrada.celda_numero,
                monto.with_scale(0)
            ),
        )
        .await;
    }

    notificar(&state, user.conjunto_id, "celda_liberada", None).await;
    notificar(&state, user.conjunto_id, "sesion_cerrada", None).await;
    let ahora = chrono::Utc::now();
    Ok(Json(sesiones::to_dto(&cerrada, ahora)))
}

#[utoipa::path(
    get,
    path = "/api/v1/parqueadero/cargos/mios",
    tag = "parqueadero",
    responses(
        (status = 200, description = "Closed sessions with a charge awaiting THIS resident's approval", body = [SesionDto]),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn mis_cargos_pendientes(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<SesionDto>>> {
    let mut conn = state.pool.get().await?;
    let rows =
        sesiones::sesiones_cargo_pendiente_de_residente(&mut conn, user.conjunto_id, user.id)
            .await?;
    let ahora = chrono::Utc::now();
    Ok(Json(rows.iter().map(|s| sesiones::to_dto(s, ahora)).collect()))
}

#[utoipa::path(
    post,
    path = "/api/v1/parqueadero/cargos/{id}/aprobar",
    tag = "parqueadero",
    params(("id" = Uuid, Path, description = "Session id")),
    responses(
        (status = 200, description = "Resident approved the charge: payment created", body = SesionDto),
        (status = 403, description = "Not the resident of this charge"),
        (status = 404, description = "Session not found")
    )
)]
pub async fn cargo_aprobar(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<SesionDto>> {
    let mut conn = state.pool.get().await?;
    let sesion = sesiones::resolver_cargo(&mut conn, user.conjunto_id, id, user.id, true).await?;
    notificar(&state, user.conjunto_id, "cargo_resuelto", None).await;
    let ahora = chrono::Utc::now();
    Ok(Json(sesiones::to_dto(&sesion, ahora)))
}

#[utoipa::path(
    post,
    path = "/api/v1/parqueadero/cargos/{id}/rechazar",
    tag = "parqueadero",
    params(("id" = Uuid, Path, description = "Session id")),
    responses(
        (status = 200, description = "Resident rejected the charge: no payment, marked as dispute", body = SesionDto),
        (status = 403, description = "Not the resident of this charge"),
        (status = 404, description = "Session not found")
    )
)]
pub async fn cargo_rechazar(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<SesionDto>> {
    let mut conn = state.pool.get().await?;
    let sesion = sesiones::resolver_cargo(&mut conn, user.conjunto_id, id, user.id, false).await?;
    notificar(&state, user.conjunto_id, "cargo_resuelto", None).await;
    let ahora = chrono::Utc::now();
    Ok(Json(sesiones::to_dto(&sesion, ahora)))
}
