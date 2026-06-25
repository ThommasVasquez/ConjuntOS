//! Monetary fines from the comité de convivencia (F5, Ley 675).
//!
//! ADMINISTRADOR issues a fine for a resident (optionally from a caso). The fine
//! creates a linked Pago so it shows up payable in the resident's cartera, a PDF
//! notice is generated best-effort, and the resident is notified. Residents may
//! appeal; admin may anular. Appeal does not block payability.

use axum::extract::{Path, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use bigdecimal::BigDecimal;
use chrono::{DateTime, Duration, NaiveDate, Utc};
use diesel::prelude::*;
use diesel::OptionalExtension;
use diesel_async::RunQueryDsl;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::extract::AuthUser;
use crate::auth::guard;
use crate::db::enums::{EstadoMulta, EstadoPago, Rol};
use crate::db::schema::{multas, pagos, usuarios};
use crate::db::DbConn;
use crate::error::{ApiError, ApiResult};
use crate::services::pdf::{render_and_store, PdfDoc};
use crate::services::ws_hub::{ws_events, WsEvent};
use crate::state::AppState;

const ADMIN_ROLES: &[Rol] = &[Rol::Administrador, Rol::Concejo];

// ── Model ────────────────────────────────────────────────────────────────────

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = multas, check_for_backend(diesel::pg::Pg))]
pub struct Multa {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub caso_id: Option<Uuid>,
    pub usuario_id: Uuid,
    pub pago_id: Option<Uuid>,
    pub monto: BigDecimal,
    pub motivo: String,
    pub estado: EstadoMulta,
    pub fecha_limite: Option<NaiveDate>,
    pub pdf_url: Option<String>,
    pub creada_por: Uuid,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum MultaAccion {
    Apelar,
    Anular,
}

/// Validate a fine state transition. A fine can be appealed or anulled while
/// IMPUESTA; an appealed fine can still be anulled; PAGADA/ANULADA are terminal.
pub fn aplicar_transicion(actual: EstadoMulta, accion: MultaAccion) -> ApiResult<EstadoMulta> {
    use EstadoMulta::*;
    use MultaAccion::*;
    match (actual, accion) {
        (Impuesta, Apelar) => Ok(Apelada),
        (Impuesta, Anular) | (Apelada, Anular) => Ok(Anulada),
        _ => Err(ApiError::BadRequest("transición de multa inválida".into())),
    }
}

// ── DTOs ─────────────────────────────────────────────────────────────────────

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EmitirMultaRequest {
    pub usuario_id: Uuid,
    pub caso_id: Option<Uuid>,
    #[schema(value_type = String)]
    pub monto: BigDecimal,
    pub motivo: String,
    pub fecha_limite: Option<NaiveDate>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MultaDto {
    pub id: Uuid,
    pub usuario_id: Uuid,
    pub caso_id: Option<Uuid>,
    pub pago_id: Option<Uuid>,
    #[schema(value_type = String)]
    pub monto: BigDecimal,
    pub motivo: String,
    pub estado: EstadoMulta,
    pub fecha_limite: Option<NaiveDate>,
    pub pdf_url: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl From<Multa> for MultaDto {
    fn from(m: Multa) -> Self {
        Self {
            id: m.id,
            usuario_id: m.usuario_id,
            caso_id: m.caso_id,
            pago_id: m.pago_id,
            monto: m.monto,
            motivo: m.motivo,
            estado: m.estado,
            fecha_limite: m.fecha_limite,
            pdf_url: m.pdf_url,
            created_at: m.created_at,
        }
    }
}

// ── Router ───────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/multas", get(listar).post(emitir))
        .route("/multas/{id}/apelar", post(apelar))
        .route("/multas/{id}/anular", post(anular))
}

// ── Handlers ─────────────────────────────────────────────────────────────────

// BigDecimal has no PartialOrd<i32>, so a zero literal won't compile here.
#[allow(clippy::cmp_owned)]
async fn emitir(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<EmitirMultaRequest>,
) -> ApiResult<Json<MultaDto>> {
    guard::require(&user, ADMIN_ROLES)?;
    if req.motivo.trim().is_empty() {
        return Err(ApiError::BadRequest("el motivo es obligatorio".into()));
    }
    if req.monto <= BigDecimal::from(0) {
        return Err(ApiError::BadRequest("el monto debe ser mayor a cero".into()));
    }

    let mut conn = state.pool.get().await?;

    // If a convivencia case is linked, it must belong to the same conjunto —
    // otherwise an admin could forge a cross-tenant FK to another conjunto's case.
    if let Some(caso_id) = req.caso_id {
        use crate::db::schema::casos_convivencia;
        let belongs: Option<Uuid> = casos_convivencia::table
            .filter(casos_convivencia::id.eq(caso_id))
            .filter(casos_convivencia::conjunto_id.eq(user.conjunto_id))
            .select(casos_convivencia::id)
            .first(&mut conn)
            .await
            .optional()?;
        if belongs.is_none() {
            return Err(ApiError::BadRequest("caso de convivencia inválido".into()));
        }
    }

    // The fine becomes payable through the resident's cartera, which needs a unit.
    let unidad_id: Uuid = usuarios::table
        .filter(usuarios::id.eq(req.usuario_id))
        .filter(usuarios::conjunto_id.eq(user.conjunto_id))
        .select(usuarios::unidad_id)
        .first::<Option<Uuid>>(&mut conn)
        .await
        .optional()?
        .flatten()
        .ok_or_else(|| ApiError::BadRequest("el residente no tiene unidad asignada".into()))?;

    let vencimiento: DateTime<Utc> = req
        .fecha_limite
        .and_then(|d| d.and_hms_opt(23, 59, 59))
        .map(|dt| dt.and_utc())
        .unwrap_or_else(|| Utc::now() + Duration::days(30));

    let pago_id: Uuid = diesel::insert_into(pagos::table)
        .values((
            pagos::conjunto_id.eq(user.conjunto_id),
            pagos::unidad_id.eq(unidad_id),
            pagos::usuario_id.eq(req.usuario_id),
            pagos::concepto.eq(format!("Multa: {}", req.motivo.trim())),
            pagos::monto.eq(&req.monto),
            pagos::estado.eq(EstadoPago::Pendiente),
            pagos::fecha_vencimiento.eq(vencimiento),
        ))
        .returning(pagos::id)
        .get_result(&mut conn)
        .await?;

    let pdf_url = generar_notice(&state, &req).await;

    let multa: Multa = diesel::insert_into(multas::table)
        .values((
            multas::conjunto_id.eq(user.conjunto_id),
            multas::caso_id.eq(req.caso_id),
            multas::usuario_id.eq(req.usuario_id),
            multas::pago_id.eq(Some(pago_id)),
            multas::monto.eq(&req.monto),
            multas::motivo.eq(req.motivo.trim()),
            multas::fecha_limite.eq(req.fecha_limite),
            multas::pdf_url.eq(pdf_url),
            multas::creada_por.eq(user.id),
        ))
        .returning(Multa::as_returning())
        .get_result(&mut conn)
        .await?;

    let _ = crate::domains::notificaciones::repo::create_notificacion(
        &mut conn,
        user.conjunto_id,
        req.usuario_id,
        "multa",
        "Nueva multa",
        &format!("Se te impuso una multa de ${}: {}", req.monto, req.motivo.trim()),
        None,
    )
    .await;

    let dto = MultaDto::from(multa);
    publish(&state, user.conjunto_id, req.usuario_id, ws_events::action::CREATED, &dto).await;
    Ok(Json(dto))
}

async fn listar(State(state): State<AppState>, user: AuthUser) -> ApiResult<Json<Vec<MultaDto>>> {
    let admin = guard::require(&user, ADMIN_ROLES).is_ok();
    let mut conn = state.pool.get().await?;
    let mut query = multas::table
        .filter(multas::conjunto_id.eq(user.conjunto_id))
        .into_boxed();
    if !admin {
        query = query.filter(multas::usuario_id.eq(user.id));
    }
    let rows: Vec<Multa> = query
        .order(multas::created_at.desc())
        .select(Multa::as_select())
        .load(&mut conn)
        .await?;
    Ok(Json(rows.into_iter().map(MultaDto::from).collect()))
}

async fn apelar(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<MultaDto>> {
    let mut conn = state.pool.get().await?;
    let multa = cargar(&mut conn, id, user.conjunto_id).await?;
    if multa.usuario_id != user.id {
        return Err(ApiError::Forbidden);
    }
    transicionar(&state, &mut conn, multa, MultaAccion::Apelar, user.conjunto_id).await
}

async fn anular(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<MultaDto>> {
    guard::require(&user, ADMIN_ROLES)?;
    let mut conn = state.pool.get().await?;
    let multa = cargar(&mut conn, id, user.conjunto_id).await?;
    transicionar(&state, &mut conn, multa, MultaAccion::Anular, user.conjunto_id).await
}

// ── Internals ────────────────────────────────────────────────────────────────

async fn cargar(conn: &mut DbConn, id: Uuid, conjunto_id: Uuid) -> ApiResult<Multa> {
    multas::table
        .find(id)
        .filter(multas::conjunto_id.eq(conjunto_id))
        .select(Multa::as_select())
        .first(conn)
        .await
        .optional()?
        .ok_or_else(|| ApiError::NotFound("multa no encontrada".into()))
}

async fn transicionar(
    state: &AppState,
    conn: &mut DbConn,
    multa: Multa,
    accion: MultaAccion,
    conjunto_id: Uuid,
) -> ApiResult<Json<MultaDto>> {
    let nuevo = aplicar_transicion(multa.estado, accion)?;
    let usuario_id = multa.usuario_id;
    let pago_id = multa.pago_id;
    let updated: Multa = diesel::update(multas::table.find(multa.id))
        .set(multas::estado.eq(nuevo))
        .returning(Multa::as_returning())
        .get_result(conn)
        .await?;

    // Anular una multa debe anular también su pago autogenerado; de lo contrario el
    // residente sigue debiendo una multa que ya no existe (deuda huérfana en cartera).
    // EstadoPago no tiene un estado "anulado", así que eliminamos el cobro pendiente.
    if matches!(accion, MultaAccion::Anular) {
        if let Some(pid) = pago_id {
            diesel::delete(
                pagos::table
                    .find(pid)
                    .filter(pagos::conjunto_id.eq(conjunto_id)),
            )
            .execute(conn)
            .await?;
        }
    }

    let dto = MultaDto::from(updated);
    publish(state, conjunto_id, usuario_id, ws_events::action::UPDATED, &dto).await;
    Ok(Json(dto))
}

async fn generar_notice(state: &AppState, req: &EmitirMultaRequest) -> Option<String> {
    let doc = PdfDoc {
        title: "Notificación de Multa".to_string(),
        lines: vec![
            format!("Motivo: {}", req.motivo.trim()),
            format!("Valor: ${}", req.monto),
            req.fecha_limite
                .map(|d| format!("Fecha límite de pago: {d}"))
                .unwrap_or_default(),
            String::new(),
            "Conforme a la Ley 675 de 2001 y el reglamento de propiedad horizontal."
                .to_string(),
            "Puede presentar apelación desde la aplicación.".to_string(),
        ],
    };
    let path = format!("multas/{}.pdf", Uuid::new_v4());
    render_and_store(state.storage.as_ref(), "documentos", &path, &doc)
        .await
        .ok()
}

async fn publish(state: &AppState, conjunto_id: Uuid, usuario_id: Uuid, action: &str, dto: &MultaDto) {
    state
        .ws_hub
        .publish(
            conjunto_id,
            WsEvent::to_user(
                usuario_id,
                ws_events::MULTA,
                action,
                Some(serde_json::to_value(dto).unwrap_or_default()),
            ),
        )
        .await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_transitions() {
        assert_eq!(
            aplicar_transicion(EstadoMulta::Impuesta, MultaAccion::Apelar).unwrap(),
            EstadoMulta::Apelada
        );
        assert_eq!(
            aplicar_transicion(EstadoMulta::Impuesta, MultaAccion::Anular).unwrap(),
            EstadoMulta::Anulada
        );
        assert_eq!(
            aplicar_transicion(EstadoMulta::Apelada, MultaAccion::Anular).unwrap(),
            EstadoMulta::Anulada
        );
    }

    #[test]
    fn terminal_states_reject_transitions() {
        assert!(aplicar_transicion(EstadoMulta::Pagada, MultaAccion::Apelar).is_err());
        assert!(aplicar_transicion(EstadoMulta::Anulada, MultaAccion::Anular).is_err());
        assert!(aplicar_transicion(EstadoMulta::Apelada, MultaAccion::Apelar).is_err());
    }
}
