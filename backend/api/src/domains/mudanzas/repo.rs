use chrono::Utc;
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use uuid::Uuid;

use crate::db::schema::{mudanzas, usuarios};
use crate::db::DbConn;

use super::models::{Mudanza, NewMudanza};

pub async fn create(conn: &mut DbConn, new_m: NewMudanza) -> anyhow::Result<Mudanza> {
    let m = diesel::insert_into(mudanzas::table)
        .values(&new_m)
        .get_result::<Mudanza>(conn)
        .await?;
    Ok(m)
}

pub async fn find_by_id(conn: &mut DbConn, id: Uuid) -> anyhow::Result<Option<Mudanza>> {
    let res = mudanzas::table
        .filter(mudanzas::id.eq(id))
        .first::<Mudanza>(conn)
        .await
        .optional()?;
    Ok(res)
}

pub async fn list_by_conjunto(conn: &mut DbConn, conjunto_id: Uuid) -> anyhow::Result<Vec<Mudanza>> {
    let res = mudanzas::table
        .filter(mudanzas::conjunto_id.eq(conjunto_id))
        .order(mudanzas::created_at.desc())
        .load::<Mudanza>(conn)
        .await?;
    Ok(res)
}

pub async fn list_by_usuario(conn: &mut DbConn, usuario_id: Uuid) -> anyhow::Result<Vec<Mudanza>> {
    let res = mudanzas::table
        .filter(mudanzas::usuario_id.eq(usuario_id))
        .order(mudanzas::created_at.desc())
        .load::<Mudanza>(conn)
        .await?;
    Ok(res)
}

pub async fn aprobar(
    conn: &mut DbConn,
    id: Uuid,
    codigo_pz: &str,
    admin_id: Uuid,
) -> anyhow::Result<Mudanza> {
    let m = diesel::update(mudanzas::table.filter(mudanzas::id.eq(id)))
        .set((
            mudanzas::estado.eq("APROBADO"),
            mudanzas::paz_y_salvo_codigo.eq(codigo_pz),
            mudanzas::aprobado_por_usuario_id.eq(admin_id),
            mudanzas::aprobado_at.eq(Utc::now()),
            mudanzas::updated_at.eq(Utc::now()),
        ))
        .get_result::<Mudanza>(conn)
        .await?;
    Ok(m)
}

pub async fn rechazar(
    conn: &mut DbConn,
    id: Uuid,
    motivo: &str,
    admin_id: Uuid,
) -> anyhow::Result<Mudanza> {
    let m = diesel::update(mudanzas::table.filter(mudanzas::id.eq(id)))
        .set((
            mudanzas::estado.eq("RECHAZADO"),
            mudanzas::motivo_rechazo.eq(motivo),
            mudanzas::aprobado_por_usuario_id.eq(admin_id),
            mudanzas::aprobado_at.eq(Utc::now()),
            mudanzas::updated_at.eq(Utc::now()),
        ))
        .get_result::<Mudanza>(conn)
        .await?;
    Ok(m)
}

pub async fn update_estado(
    conn: &mut DbConn,
    id: Uuid,
    nuevo_estado: &str,
) -> anyhow::Result<Mudanza> {
    let m = diesel::update(mudanzas::table.filter(mudanzas::id.eq(id)))
        .set((
            mudanzas::estado.eq(nuevo_estado),
            mudanzas::updated_at.eq(Utc::now()),
        ))
        .get_result::<Mudanza>(conn)
        .await?;
    Ok(m)
}

/// Helper: fetch user details (name, email, torre, apto)
pub async fn get_user_info(
    conn: &mut DbConn,
    uid: Uuid,
) -> anyhow::Result<Option<(String, String, Option<String>, Option<String>)>> {
    let res = usuarios::table
        .filter(usuarios::id.eq(uid))
        .select((
            usuarios::nombre,
            usuarios::email,
            usuarios::torre,
            usuarios::apto,
        ))
        .first::<(String, String, Option<String>, Option<String>)>(conn)
        .await
        .optional()?;
    Ok(res)
}

/// Helper: deactivate resident user and unlink unit on outgoing move completion
pub async fn deactivate_user(conn: &mut DbConn, uid: Uuid) -> anyhow::Result<()> {
    diesel::update(usuarios::table.filter(usuarios::id.eq(uid)))
        .set((
            usuarios::activo.eq(false),
            usuarios::unidad_id.eq(Option::<Uuid>::None),
            usuarios::torre.eq(Option::<String>::None),
            usuarios::apto.eq(Option::<String>::None),
        ))
        .execute(conn)
        .await?;
    Ok(())
}

/// Helper: check administration debts, active penalties/fines, and unpaid parking charges
pub async fn check_resident_debt(
    conn: &mut DbConn,
    uid: Uuid,
) -> anyhow::Result<(f64, Vec<String>)> {
    use crate::db::schema::{pagos, casos_convivencia, sesiones_parqueadero, usuarios};
    use bigdecimal::ToPrimitive;

    let mut total: f64 = 0.0;
    let mut details: Vec<String> = Vec::new();

    // 1. Administration & Extra fee debts (pagos PENDIENTE)
    if let Ok(pending_payments) = pagos::table
        .filter(pagos::usuario_id.eq(uid))
        .filter(pagos::estado.eq("PENDIENTE"))
        .select((pagos::concepto, pagos::monto))
        .load::<(String, bigdecimal::BigDecimal)>(conn)
        .await
    {
        for (concepto, monto) in pending_payments {
            let val = monto.to_f64().unwrap_or(0.0);
            total += val;
            details.push(format!("Deuda en {}: ${:.0} COP", concepto, val));
        }
    }

    // 2. Open / Fined coexistence committee complaints (casos_convivencia)
    let unit_id = usuarios::table
        .filter(usuarios::id.eq(uid))
        .select(usuarios::unidad_id)
        .first::<Option<Uuid>>(conn)
        .await
        .ok()
        .flatten();

    if let Some(unid) = unit_id {
        if let Ok(fined_cases) = casos_convivencia::table
            .filter(casos_convivencia::unidad_reportada_id.eq(unid))
            .filter(casos_convivencia::estado.eq_any(vec!["MULTADO", "SANCIONADO", "ABIERTO"]))
            .select((casos_convivencia::tipo, casos_convivencia::estado))
            .load::<(String, String)>(conn)
            .await
        {
            for (tipo_caso, estado_caso) in fined_cases {
                total += 150000.0;
                details.push(format!("Multa/Sanción Convivencial ({}) en estado {}", tipo_caso, estado_caso));
            }
        }
    }

    // 3. Unpaid parking fees (sesiones_parqueadero)
    if let Ok(parking_debts) = sesiones_parqueadero::table
        .filter(sesiones_parqueadero::residente_id.eq(uid))
        .filter(sesiones_parqueadero::estado.eq("PENDIENTE"))
        .select((sesiones_parqueadero::celda_numero, sesiones_parqueadero::monto))
        .load::<(String, Option<bigdecimal::BigDecimal>)>(conn)
        .await
    {
        for (celda, monto_opt) in parking_debts {
            let val = monto_opt.and_then(|m| m.to_f64()).unwrap_or(0.0);
            total += val;
            details.push(format!("Cobro de Estacionamiento Celda {}: ${:.0} COP", celda, val));
        }
    }

    Ok((total, details))
}

pub async fn notify_guards_mudanza_autorizada(
    conn: &mut DbConn,
    state: &crate::state::AppState,
    conjunto_id: Uuid,
    dto: &super::dto::MudanzaResp,
    codigo_pz: &str,
    admin_id: Uuid,
) -> anyhow::Result<()> {
    use crate::db::schema::{novedades_seguridad, notificaciones, usuarios};
    use crate::services::ws_hub::WsEvent;

    let torre_str = dto.torre.as_deref().unwrap_or("?");
    let apto_str = dto.apto.as_deref().unwrap_or("?");
    let nombre_str = dto.usuario_nombre.as_deref().unwrap_or("Residente");

    let desc = format!(
        "MUDANZA AUTORIZADA (PAZ Y SALVO {}): Residente {} (T{} - A{}). Fecha: {}, Horario: {} a {}. Permiso de trasteo habilitado en portería y parqueaderos.",
        codigo_pz, nombre_str, torre_str, apto_str, dto.fecha_mudanza, dto.hora_inicio, dto.hora_fin
    );

    // 1. Insert Security Incident / Novedad record for guards
    let _ = diesel::insert_into(novedades_seguridad::table)
        .values((
            novedades_seguridad::id.eq(Uuid::new_v4()),
            novedades_seguridad::conjunto_id.eq(conjunto_id),
            novedades_seguridad::usuario_id.eq(admin_id),
            novedades_seguridad::tipo.eq("MUDANZA_AUTORIZADA"),
            novedades_seguridad::ubicacion.eq(Some(format!("Torre {} - Apto {}", torre_str, apto_str))),
            novedades_seguridad::descripcion.eq(desc.clone()),
            novedades_seguridad::severidad.eq("INFO"),
            novedades_seguridad::estado.eq("PENDIENTE"),
            novedades_seguridad::created_at.eq(Utc::now()),
        ))
        .execute(conn)
        .await;

    // 2. Fetch all security and parking guards in this copropiedad
    if let Ok(guard_ids) = usuarios::table
        .filter(usuarios::activo.eq(true))
        .filter(usuarios::rol.eq_any(vec!["VIGILANTE", "SUPERVISOR_VIGILANCIA", "ENCARGADO_PARQUEADERO"]))
        .select(usuarios::id)
        .load::<Uuid>(conn)
        .await
    {
        let notif_title = "🚨 MUDANZA AUTORIZADA - PAZ Y SALVO".to_string();
        let notif_msg = format!("T{} - A{} ({}) autorizado para mudanza el {} ({}-{}). Código: {}", torre_str, apto_str, nombre_str, dto.fecha_mudanza, dto.hora_inicio, dto.hora_fin, codigo_pz);

        for guard_id in guard_ids {
            let _ = diesel::insert_into(notificaciones::table)
                .values((
                    notificaciones::id.eq(Uuid::new_v4()),
                    notificaciones::conjunto_id.eq(conjunto_id),
                    notificaciones::usuario_id.eq(guard_id),
                    notificaciones::tipo.eq("MUDANZA_AUTORIZADA"),
                    notificaciones::titulo.eq(&notif_title),
                    notificaciones::mensaje.eq(&notif_msg),
                    notificaciones::leida.eq(false),
                    notificaciones::created_at.eq(Utc::now()),
                ))
                .execute(conn)
                .await;
        }
    }

    // 3. Broadcast real-time WebSocket event to all guard terminals online
    state.ws_hub.publish(
        conjunto_id,
        WsEvent {
            domain: "vigilancia".into(),
            action: "mudanza_autorizada".into(),
            payload: serde_json::to_value(dto).ok(),
            target_user_id: None,
        },
    ).await;

    Ok(())
}
