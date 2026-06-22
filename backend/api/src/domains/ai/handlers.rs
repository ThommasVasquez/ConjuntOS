use axum::extract::{Path, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::auth::guard;
use crate::db::enums::Rol;
use crate::domains::ai::dto::{
    ActaDto, ConsensuarRequest, ConsensuarResponse, CopilotRequest, CopilotResponse,
    CreateSubtituloRequest, GenerateActaRequest, SearchRequest, SearchResponse, SubtituloDto,
    TranslateRequest, TranslateResponse,
};
use crate::domains::ai::models::NuevoSubtitulo;
use crate::domains::ai::repo;
use crate::domains::asamblea::repo as asamblea_repo;
use crate::error::{ApiError, ApiResult};
use crate::services::gemini::GeminiClient;
use crate::services::pdf::{render_and_store, PdfDoc};
use crate::services::ws_hub::WsEvent;
use crate::state::AppState;

const ADMIN_ROLES: &[Rol] = &[Rol::Administrador, Rol::SuperAdmin];

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/asambleas/{id}/copilot", post(copilot))
        .route("/asambleas/copilot/translate", post(translate))
        .route("/asambleas/{id}/copilot/consensuar", post(consensuar))
        .route("/asambleas/{id}/acta", get(get_acta).post(generate_acta))
        .route("/asambleas/{id}/acta/pdf", get(acta_pdf))
        .route("/ai/asistente", post(asistente))
        .route(
            "/asambleas/{id}/subtitulos",
            get(list_subtitulos).post(create_subtitulo),
        )
        .route("/search", post(search))
}

// ── Helpers ─────────────────────────────────────────────────────────────

fn require_gemini(state: &AppState) -> ApiResult<&GeminiClient> {
    state
        .gemini
        .as_ref()
        .ok_or_else(|| ApiError::ServiceUnavailable("GEMINI_API_KEY no configurado".into()))
}

// ── Copilot ─────────────────────────────────────────────────────────────

async fn copilot(
    State(state): State<AppState>,
    user: AuthUser,
    Path(asamblea_id): Path<Uuid>,
    Json(req): Json<CopilotRequest>,
) -> ApiResult<Json<CopilotResponse>> {
    guard::require(&user, ADMIN_ROLES)?;
    let gemini = require_gemini(&state)?;

    let mut conn = state.pool.get().await?;
    let asamblea =
        asamblea_repo::verify_asamblea_tenant(&mut conn, asamblea_id, user.conjunto_id).await?;

    if req.pregunta.trim().is_empty() {
        return Err(ApiError::BadRequest("pregunta es obligatoria".into()));
    }

    let orden_dia = serde_json::to_string_pretty(&asamblea.orden_dia).unwrap_or_default();
    let contexto_extra = req
        .contexto
        .filter(|c| !c.is_empty())
        .map(|c| format!("\nContexto adicional: {c}"))
        .unwrap_or_default();

    let prompt = format!(
        "Eres un copiloto experto en mediación y convivencia en propiedad horizontal colombiana.\n\
         Tu tarea es asistir al administrador del conjunto residencial durante una asamblea.\n\n\
         Datos de la asamblea:\n\
         - Título: {titulo}\n\
         - Orden del día: {orden_dia}\n\
         {contexto_extra}\n\n\
         Pregunta del administrador: {pregunta}\n\n\
         Responde en español de forma clara, concisa y profesional. \
         Si la pregunta involucra votaciones, licitaciones o temas financieros, \
         incluye datos numéricos relevantes cuando sea posible.",
        titulo = asamblea.titulo,
        pregunta = req.pregunta,
    );

    let respuesta = gemini
        .generate(&prompt, 2048, 0.7)
        .await
        .map_err(|e| ApiError::Upstream(format!("Error del servicio de IA: {e}")))?;

    Ok(Json(CopilotResponse { respuesta }))
}

// ── Translate ───────────────────────────────────────────────────────────

async fn translate(
    State(state): State<AppState>,
    _user: AuthUser,
    Json(req): Json<TranslateRequest>,
) -> ApiResult<Json<TranslateResponse>> {
    if req.texto.trim().is_empty() {
        return Err(ApiError::BadRequest("texto es obligatorio".into()));
    }
    if req.idioma_destino.trim().is_empty() {
        return Err(ApiError::BadRequest("idioma_destino es obligatorio".into()));
    }

    // Short-circuit: if target is Spanish, return the text as-is.
    if req.idioma_destino.eq_ignore_ascii_case("ES") {
        return Ok(Json(TranslateResponse {
            traduccion: req.texto,
        }));
    }

    let gemini = require_gemini(&state)?;

    let prompt = format!(
        "Eres un traductor profesional especializado en propiedad horizontal.\n\
         Traduce el siguiente texto en español al idioma indicado por el código \
         (\"{idioma}\": EN=inglés, PT=portugués, FR=francés).\n\n\
         Texto original: \"{texto}\"\n\n\
         Responde ÚNICAMENTE con el texto traducido, sin explicaciones ni formato adicional. \
         Respeta los términos técnicos de copropiedades.",
        idioma = req.idioma_destino,
        texto = req.texto,
    );

    let traduccion = gemini
        .generate(&prompt, 1024, 0.3)
        .await
        .map_err(|e| ApiError::Upstream(format!("Error del servicio de IA: {e}")))?;

    Ok(Json(TranslateResponse { traduccion }))
}

// ── Consensuar ──────────────────────────────────────────────────────────

async fn consensuar(
    State(state): State<AppState>,
    user: AuthUser,
    Path(asamblea_id): Path<Uuid>,
    Json(req): Json<ConsensuarRequest>,
) -> ApiResult<Json<ConsensuarResponse>> {
    guard::require(&user, ADMIN_ROLES)?;
    let gemini = require_gemini(&state)?;

    let mut conn = state.pool.get().await?;
    asamblea_repo::verify_asamblea_tenant(&mut conn, asamblea_id, user.conjunto_id).await?;

    if req.opiniones.is_empty() {
        return Err(ApiError::BadRequest(
            "se requiere al menos una opinión".into(),
        ));
    }

    let opiniones_text: String = req
        .opiniones
        .iter()
        .enumerate()
        .map(|(i, o)| format!("{}. {o}", i + 1))
        .collect::<Vec<_>>()
        .join("\n");

    let tema_text = req
        .tema
        .filter(|t| !t.is_empty())
        .map(|t| format!("Tema en discusión: {t}\n\n"))
        .unwrap_or_default();

    let prompt = format!(
        "Eres un mediador experto en asambleas de propiedad horizontal colombiana.\n\
         Analiza las opiniones expresadas por los copropietarios y sintetiza un punto \
         de consenso que concilie las posturas.\n\n\
         {tema_text}\
         Opiniones de los residentes:\n\
         {opiniones_text}\n\n\
         Genera una síntesis breve y constructiva que:\n\
         1. Identifique los puntos de acuerdo\n\
         2. Reconozca las preocupaciones principales\n\
         3. Proponga un camino común o una propuesta de votación\n\n\
         Responde en español de forma profesional e imparcial.",
    );

    let sintesis = gemini
        .generate(&prompt, 1536, 0.5)
        .await
        .map_err(|e| ApiError::Upstream(format!("Error del servicio de IA: {e}")))?;

    Ok(Json(ConsensuarResponse { sintesis }))
}

// ── Acta (GET / POST) ──────────────────────────────────────────────────

async fn get_acta(
    State(state): State<AppState>,
    user: AuthUser,
    Path(asamblea_id): Path<Uuid>,
) -> ApiResult<Json<ActaDto>> {
    let mut conn = state.pool.get().await?;
    asamblea_repo::verify_asamblea_tenant(&mut conn, asamblea_id, user.conjunto_id).await?;

    let acta = repo::get_acta(&mut conn, asamblea_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("acta no encontrada para esta asamblea".into()))?;

    Ok(Json(ActaDto::from(acta)))
}

async fn generate_acta(
    State(state): State<AppState>,
    user: AuthUser,
    Path(asamblea_id): Path<Uuid>,
    Json(req): Json<GenerateActaRequest>,
) -> ApiResult<Json<ActaDto>> {
    guard::require(&user, ADMIN_ROLES)?;
    let gemini = require_gemini(&state)?;

    let mut conn = state.pool.get().await?;
    asamblea_repo::verify_asamblea_tenant(&mut conn, asamblea_id, user.conjunto_id).await?;

    if req.puntos.is_empty() {
        return Err(ApiError::BadRequest(
            "se requiere al menos un punto tratado".into(),
        ));
    }

    let puntos_text = req
        .puntos
        .iter()
        .enumerate()
        .map(|(i, p)| format!("{}. {p}", i + 1))
        .collect::<Vec<_>>()
        .join("\n");

    let decisiones_text = if req.decisiones.is_empty() {
        "No se registraron decisiones formales.".to_string()
    } else {
        req.decisiones
            .iter()
            .enumerate()
            .map(|(i, d)| format!("{}. {d}", i + 1))
            .collect::<Vec<_>>()
            .join("\n")
    };

    let quorum_text = req
        .quorum
        .filter(|q| !q.is_empty())
        .unwrap_or_else(|| "No especificado".to_string());

    let prompt = format!(
        "Eres un secretario jurídico experto en propiedad horizontal colombiana.\n\
         Redacta el Acta Oficial de la Asamblea General de Copropietarios.\n\
         El documento debe tener validez legal, lenguaje formal y estar en formato Markdown.\n\n\
         Puntos tratados en el orden del día:\n{puntos_text}\n\n\
         Decisiones adoptadas:\n{decisiones_text}\n\n\
         Asistentes: {asistentes}\n\
         Quórum: {quorum_text}\n\n\
         Estructura requerida:\n\
         1. ENCABEZADO (fecha, tipo de asamblea)\n\
         2. VERIFICACIÓN DE ASISTENCIA Y QUÓRUM\n\
         3. LECTURA Y DESARROLLO DEL ORDEN DEL DÍA\n\
         4. VOTACIONES Y DECISIONES ADOPTADAS\n\
         5. PROPOSICIONES Y VARIOS\n\
         6. CIERRE Y FIRMAS\n\n\
         Responde ÚNICAMENTE con el acta en Markdown sin bloques de código.",
        asistentes = req.asistentes,
    );

    let contenido = gemini
        .generate(&prompt, 4096, 0.4)
        .await
        .map_err(|e| ApiError::Upstream(format!("Error del servicio de IA: {e}")))?;

    let acta = repo::upsert_acta(&mut conn, asamblea_id, contenido, "gemini".to_string()).await?;

    let dto = ActaDto::from(acta);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "asamblea".into(),
                action: "acta_generated".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}

// ── Subtítulos ──────────────────────────────────────────────────────────

async fn list_subtitulos(
    State(state): State<AppState>,
    user: AuthUser,
    Path(asamblea_id): Path<Uuid>,
) -> ApiResult<Json<Vec<SubtituloDto>>> {
    let mut conn = state.pool.get().await?;
    asamblea_repo::verify_asamblea_tenant(&mut conn, asamblea_id, user.conjunto_id).await?;

    let rows = repo::list_subtitulos(&mut conn, asamblea_id).await?;
    Ok(Json(rows.into_iter().map(SubtituloDto::from).collect()))
}

async fn create_subtitulo(
    State(state): State<AppState>,
    user: AuthUser,
    Path(asamblea_id): Path<Uuid>,
    Json(req): Json<CreateSubtituloRequest>,
) -> ApiResult<Json<SubtituloDto>> {
    let mut conn = state.pool.get().await?;
    asamblea_repo::verify_asamblea_tenant(&mut conn, asamblea_id, user.conjunto_id).await?;

    if req.text.trim().is_empty() {
        return Err(ApiError::BadRequest("text es obligatorio".into()));
    }

    let subtitulo = repo::create_subtitulo(
        &mut conn,
        NuevoSubtitulo {
            asamblea_id,
            speaker: req.speaker,
            text: req.text,
        },
    )
    .await?;

    let dto = SubtituloDto::from(subtitulo);
    state
        .ws_hub
        .publish(
            user.conjunto_id,
            WsEvent {
                domain: "asamblea".into(),
                action: "subtitulo_created".into(),
                payload: Some(serde_json::to_value(&dto).unwrap_or_default()),
                target_user_id: None,
            },
        )
        .await;
    Ok(Json(dto))
}

// ── Search ──────────────────────────────────────────────────────────────

async fn search(
    State(state): State<AppState>,
    _user: AuthUser,
    Json(req): Json<SearchRequest>,
) -> ApiResult<Json<SearchResponse>> {
    let gemini = require_gemini(&state)?;

    if req.query.trim().len() < 2 {
        return Err(ApiError::BadRequest("query muy corto".into()));
    }

    let contexto_extra = req
        .contexto
        .filter(|c| !c.is_empty())
        .map(|c| format!("\nContexto del residente: {c}"))
        .unwrap_or_default();

    let prompt = format!(
        "Eres el asistente de ConjuntOS, plataforma de gestión residencial \
         para conjuntos cerrados en Colombia.\n\n\
         Módulos disponibles: Pagos, Reservas, Parqueadero, Paquetería, PQRS, \
         Visitas, Citofonía, Cartelera, Inmobiliaria, Asamblea.\n\n\
         Reglas:\n\
         - Responde SIEMPRE en español, de forma amable y concisa (máximo 3 oraciones)\n\
         - Si necesitas dirigir al usuario a un módulo, di exactamente cuál\n\
         - Nunca inventes datos concretos (montos, fechas) que no estén en el contexto\n\
         {contexto_extra}\n\n\
         Pregunta del residente: \"{query}\"",
        query = req.query,
    );

    let respuesta = gemini
        .generate(&prompt, 512, 0.7)
        .await
        .map_err(|e| ApiError::Upstream(format!("Error del servicio de IA: {e}")))?;

    Ok(Json(SearchResponse {
        respuesta,
        fuentes: vec![],
    }))
}

// ── Acta PDF export (F8) ──────────────────────────────────────────────────

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ActaPdfResponse {
    url: String,
}

/// Export a stored acta to an archived, downloadable PDF (reuses services::pdf).
async fn acta_pdf(
    State(state): State<AppState>,
    user: AuthUser,
    Path(asamblea_id): Path<Uuid>,
) -> ApiResult<Json<ActaPdfResponse>> {
    let mut conn = state.pool.get().await?;
    let asamblea =
        asamblea_repo::verify_asamblea_tenant(&mut conn, asamblea_id, user.conjunto_id).await?;
    let acta = repo::get_acta(&mut conn, asamblea_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("acta no encontrada para esta asamblea".into()))?;

    let doc = PdfDoc {
        title: format!("Acta — {}", asamblea.titulo),
        lines: acta.contenido.lines().map(|l| l.to_string()).collect(),
    };
    let path = format!("actas/{asamblea_id}.pdf");
    let url = render_and_store(state.storage.as_ref(), "documentos", &path, &doc)
        .await
        .map_err(|e| ApiError::Upstream(format!("No se pudo generar el PDF: {e}")))?;
    Ok(Json(ActaPdfResponse { url }))
}

// ── Resident assistant: Ley 675 / reglamento (F9) ─────────────────────────

#[derive(serde::Deserialize)]
struct AsistenteRequest {
    pregunta: String,
}

#[derive(serde::Serialize)]
struct AsistenteResponse {
    respuesta: String,
}

/// Resident-facing assistant grounded in Ley 675 + propiedad horizontal. Open to
/// any authenticated resident; guardrails keep it in-scope, cited, and non-actioning.
async fn asistente(
    State(state): State<AppState>,
    _user: AuthUser,
    Json(req): Json<AsistenteRequest>,
) -> ApiResult<Json<AsistenteResponse>> {
    if req.pregunta.trim().is_empty() {
        return Err(ApiError::BadRequest("pregunta es obligatoria".into()));
    }
    let gemini = require_gemini(&state)?;

    let prompt = format!(
        "Eres un asistente legal para residentes de un conjunto en Colombia, experto \
         en la Ley 675 de 2001 (propiedad horizontal) y la convivencia en copropiedades.\n\n\
         Reglas estrictas:\n\
         - Responde SOLO preguntas sobre Ley 675, propiedad horizontal, reglamento interno \
         o convivencia. Si la pregunta está fuera de ese alcance, responde exactamente: \
         \"Esa consulta está fuera de mi alcance. Por favor contacta a la administración.\"\n\
         - Cita el artículo de la Ley 675 cuando aplique.\n\
         - No realizas acciones (no pagas, no creas trámites, no apruebas nada): solo informas.\n\
         - Si no estás seguro, recomienda contactar a la administración del conjunto.\n\
         - Responde en español, claro y breve.\n\n\
         Pregunta del residente: {pregunta}",
        pregunta = req.pregunta.trim(),
    );

    let respuesta = gemini
        .generate(&prompt, 1024, 0.3)
        .await
        .map_err(|e| ApiError::Upstream(format!("Error del servicio de IA: {e}")))?;
    Ok(Json(AsistenteResponse { respuesta }))
}
