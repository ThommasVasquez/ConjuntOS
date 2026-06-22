//! Reusable expiry-reminder engine.
//!
//! Domains that own rows with a future due date (vehicle SOAT/tecnomecánica,
//! pet vaccine boosters, dues, …) contribute [`DueReminder`]s; this engine emits
//! an in-app notice + realtime `recordatorio` event + web push for each, **at most
//! once per `(source, row, lead-time, day)`**. The idempotency decision lives in the
//! pure [`select_unsent`] so it is unit-testable without a database; persistence of
//! the "already sent" set is the DB edge (`recordatorios_enviados`).

use std::collections::HashSet;

use chrono::{NaiveDate, Utc};
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use uuid::Uuid;

use crate::db::schema::{
    mascotas, mascotas_vacunas, push_subscriptions, recordatorios_enviados, vehiculos,
};
use crate::db::DbConn;
use crate::error::ApiResult;
use crate::services::push::PushSubscriptionInfo;
use crate::services::ws_hub::{ws_events, WsEvent};
use crate::state::AppState;

/// Raw row returned by the reservation reminder query.
#[derive(QueryableByName)]
struct ReservaReminderRow {
    #[diesel(sql_type = diesel::sql_types::Uuid)]
    id: Uuid,
    #[diesel(sql_type = diesel::sql_types::Uuid)]
    conjunto_id: Uuid,
    #[diesel(sql_type = diesel::sql_types::Uuid)]
    usuario_id: Uuid,
    #[diesel(sql_type = diesel::sql_types::Text)]
    area_nombre: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    hora: String,
}

/// A reminder a source reports as due right now, for one lead-time bucket.
#[derive(Clone, Debug)]
pub struct DueReminder {
    pub conjunto_id: Uuid,
    pub usuario_id: Uuid,
    /// Stable source name, e.g. `"vehiculo_soat"` or `"mascota_vacuna"`.
    pub source: String,
    /// The entity whose date is expiring (the dedup subject).
    pub row_id: Uuid,
    /// Which lead-time bucket fired (e.g. 30, 15, 3 days before expiry).
    pub lead_dias: i32,
    pub titulo: String,
    pub mensaje: String,
}

/// Idempotency key: a given reminder is sent at most once per calendar day.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct ReminderKey {
    pub source: String,
    pub row_id: Uuid,
    pub lead_dias: i32,
    pub fecha: NaiveDate,
}

impl DueReminder {
    pub fn key(&self, today: NaiveDate) -> ReminderKey {
        ReminderKey {
            source: self.source.clone(),
            row_id: self.row_id,
            lead_dias: self.lead_dias,
            fecha: today,
        }
    }
}

/// Keep only the reminders that have not already been sent today, deduping
/// repeats within the same batch too. Pure — the heart of the engine.
pub fn select_unsent(
    due: Vec<DueReminder>,
    already_sent: &HashSet<ReminderKey>,
    today: NaiveDate,
) -> Vec<DueReminder> {
    let mut seen = HashSet::new();
    due.into_iter()
        .filter(|r| {
            let key = r.key(today);
            !already_sent.contains(&key) && seen.insert(key)
        })
        .collect()
}

/// Collect every reminder currently due across all registered sources.
///
/// Feature work appends its own due-list query here — F6 (vehicle SOAT /
/// tecnomecánica) and F7 (pet vaccine boosters) each return the rows whose date
/// falls in a lead-time bucket today. Empty until the first source lands, so the
/// scheduler is a harmless no-op in the meantime.
#[allow(clippy::type_complexity)] // local query tuples; aliases would hurt readability here
pub async fn gather_due(conn: &mut DbConn, today: NaiveDate) -> ApiResult<Vec<DueReminder>> {
    let mut reminders = Vec::new();

    // ── Reserva recordatorio: 30 minutos antes del inicio ──
    let reservas_due: Vec<ReservaReminderRow> = diesel::sql_query(
        "SELECT r.id, r.conjunto_id, r.usuario_id,
                a.nombre AS area_nombre,
                to_char(r.fecha_inicio AT TIME ZONE 'America/Bogota', 'HH24:MI') AS hora
         FROM reservas r
         JOIN areas_comunes a ON a.id = r.area_id
         WHERE r.fecha_inicio > now()
           AND r.fecha_inicio <= now() + interval '30 minutes'
           AND r.estado IN ('CONFIRMADA', 'PENDIENTE')",
    )
    .load(conn)
    .await?;

    for row in reservas_due {
        reminders.push(DueReminder {
            conjunto_id: row.conjunto_id,
            usuario_id: row.usuario_id,
            source: "reserva_recordatorio".into(),
            row_id: row.id,
            lead_dias: 0, // 30-minute lead time
            titulo: "⏰ Tu reserva está por comenzar".into(),
            mensaje: format!(
                "Tu reserva de {} está programada para las {}. ¡No la pierdas!",
                row.area_nombre, row.hora
            ),
        });
    }

    // Notify at these day-thresholds before a date lapses (the engine dedups per day).
    const BUCKETS: [i64; 5] = [30, 15, 7, 3, 1];

    // F6 — vehicle SOAT / tecnomecánica expiry.
    let vehs: Vec<(Uuid, Uuid, Uuid, String, Option<NaiveDate>, Option<NaiveDate>)> =
        vehiculos::table
            .select((
                vehiculos::id,
                vehiculos::conjunto_id,
                vehiculos::usuario_id,
                vehiculos::placa,
                vehiculos::soat_vence,
                vehiculos::tecnomecanica_vence,
            ))
            .load(conn)
            .await?;
    for (id, conjunto_id, usuario_id, placa, soat, tecno) in vehs {
        for (etiqueta, fecha) in [("SOAT", soat), ("Tecnomecánica", tecno)] {
            if let Some(d) = fecha {
                let dias = (d - today).num_days();
                if BUCKETS.contains(&dias) {
                    reminders.push(DueReminder {
                        conjunto_id,
                        usuario_id,
                        source: format!("vehiculo_{}", etiqueta.to_ascii_lowercase()),
                        row_id: id,
                        lead_dias: dias as i32,
                        titulo: format!("{etiqueta} por vencer"),
                        mensaje: format!(
                            "El {etiqueta} de tu vehículo {placa} vence en {dias} día(s)."
                        ),
                    });
                }
            }
        }
    }

    // F7 — pet vaccine boosters.
    let vacs: Vec<(Uuid, Uuid, Uuid, String, Option<NaiveDate>)> = mascotas_vacunas::table
        .inner_join(mascotas::table.on(mascotas::id.eq(mascotas_vacunas::mascota_id)))
        .select((
            mascotas_vacunas::id,
            mascotas_vacunas::conjunto_id,
            mascotas::usuario_id,
            mascotas_vacunas::vacuna,
            mascotas_vacunas::proxima,
        ))
        .load(conn)
        .await?;
    for (id, conjunto_id, usuario_id, vacuna, proxima) in vacs {
        if let Some(d) = proxima {
            let dias = (d - today).num_days();
            if BUCKETS.contains(&dias) {
                reminders.push(DueReminder {
                    conjunto_id,
                    usuario_id,
                    source: "mascota_vacuna".into(),
                    row_id: id,
                    lead_dias: dias as i32,
                    titulo: "Refuerzo de vacuna".into(),
                    mensaje: format!("La vacuna {vacuna} de tu mascota vence en {dias} día(s)."),
                });
            }
        }
    }

    Ok(reminders)
}

/// Persist + notify a single reminder: in-app notice, realtime events, web push.
async fn dispatch_reminder(conn: &mut DbConn, state: &AppState, r: &DueReminder) -> ApiResult<()> {
    crate::domains::notificaciones::repo::create_notificacion(
        conn,
        r.conjunto_id,
        r.usuario_id,
        "recordatorio",
        &r.titulo,
        &r.mensaje,
        None,
    )
    .await?;

    // Refresh the notification bell, plus a dedicated `recordatorio` event for any
    // screen subscribed to it (vehicle docs / pet vaccines).
    state
        .ws_hub
        .publish(
            r.conjunto_id,
            WsEvent::to_user(r.usuario_id, "notification", "created", None),
        )
        .await;
    let payload = serde_json::json!({
        "source": r.source,
        "rowId": r.row_id,
        "leadDias": r.lead_dias,
        "titulo": r.titulo,
        "mensaje": r.mensaje,
    });
    state
        .ws_hub
        .publish(
            r.conjunto_id,
            WsEvent::to_user(
                r.usuario_id,
                ws_events::RECORDATORIO,
                ws_events::action::CREATED,
                Some(payload),
            ),
        )
        .await;

    // Best-effort web push to the resident's registered devices.
    let subs: Vec<(String, String, String)> = push_subscriptions::table
        .filter(push_subscriptions::conjunto_id.eq(r.conjunto_id))
        .filter(push_subscriptions::usuario_id.eq(r.usuario_id))
        .select((
            push_subscriptions::endpoint,
            push_subscriptions::p256dh,
            push_subscriptions::auth,
        ))
        .load(conn)
        .await?;
    let push_payload = serde_json::json!({
        "title": r.titulo,
        "body": r.mensaje,
        "data": { "url": "/perfil" },
    });
    let bytes = serde_json::to_vec(&push_payload).unwrap_or_default();
    for (endpoint, p256dh, auth) in subs {
        let info = PushSubscriptionInfo {
            endpoint: endpoint.clone(),
            p256dh,
            auth,
        };
        if let Err(e) = state.push_sender.send(&info, &bytes).await {
            tracing::warn!(endpoint = %endpoint, error = ?e, "reminder push failed");
        }
    }
    Ok(())
}

/// Run one reminder pass: dedup against today's ledger, dispatch the rest, and
/// record each as sent (the UNIQUE constraint is the cross-run idempotency backstop).
pub async fn run_reminders(
    conn: &mut DbConn,
    state: &AppState,
    due: Vec<DueReminder>,
    today: NaiveDate,
) -> ApiResult<usize> {
    if due.is_empty() {
        return Ok(0);
    }

    let row_ids: Vec<Uuid> = due.iter().map(|r| r.row_id).collect();
    let sent_rows: Vec<(String, Uuid, i32)> = recordatorios_enviados::table
        .filter(recordatorios_enviados::fecha.eq(today))
        .filter(recordatorios_enviados::row_id.eq_any(&row_ids))
        .select((
            recordatorios_enviados::source,
            recordatorios_enviados::row_id,
            recordatorios_enviados::lead_dias,
        ))
        .load(conn)
        .await?;
    let already: HashSet<ReminderKey> = sent_rows
        .into_iter()
        .map(|(source, row_id, lead_dias)| ReminderKey {
            source,
            row_id,
            lead_dias,
            fecha: today,
        })
        .collect();

    let to_send = select_unsent(due, &already, today);
    let mut count = 0usize;
    for r in &to_send {
        dispatch_reminder(conn, state, r).await?;
        diesel::insert_into(recordatorios_enviados::table)
            .values((
                recordatorios_enviados::conjunto_id.eq(r.conjunto_id),
                recordatorios_enviados::usuario_id.eq(r.usuario_id),
                recordatorios_enviados::source.eq(&r.source),
                recordatorios_enviados::row_id.eq(r.row_id),
                recordatorios_enviados::lead_dias.eq(r.lead_dias),
                recordatorios_enviados::fecha.eq(today),
            ))
            .on_conflict((
                recordatorios_enviados::source,
                recordatorios_enviados::row_id,
                recordatorios_enviados::lead_dias,
                recordatorios_enviados::fecha,
            ))
            .do_nothing()
            .execute(conn)
            .await?;
        count += 1;
    }
    Ok(count)
}

/// Spawn the reminder scheduler on the same `tokio::interval` pattern as the
/// other domain schedulers. Tick period is configurable via `REMINDER_TICK_SECS`
/// (default 3600s); date-keyed idempotency makes a more frequent tick harmless.
pub fn spawn_scheduler(state: AppState) {
    let secs = std::env::var("REMINDER_TICK_SECS")
        .ok()
        .and_then(|s| s.parse::<u64>().ok())
        .filter(|n| *n > 0)
        .unwrap_or(3600);
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(std::time::Duration::from_secs(secs));
        ticker.tick().await; // skip the immediate first tick at boot
        loop {
            ticker.tick().await;
            let mut conn = match state.pool.get().await {
                Ok(c) => c,
                Err(e) => {
                    tracing::warn!("scheduler recordatorios: no DB conn: {e}");
                    continue;
                }
            };
            let today = Utc::now().date_naive();
            let due = match gather_due(&mut conn, today).await {
                Ok(d) => d,
                Err(e) => {
                    tracing::warn!("scheduler recordatorios: gather_due error: {e}");
                    continue;
                }
            };
            match run_reminders(&mut conn, &state, due, today).await {
                Ok(n) if n > 0 => tracing::info!("recordatorios: {n} emitidos"),
                Ok(_) => {}
                Err(e) => tracing::warn!("scheduler recordatorios: run error: {e}"),
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn today() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 6, 22).unwrap()
    }

    fn reminder(row: Uuid, lead: i32) -> DueReminder {
        DueReminder {
            conjunto_id: Uuid::nil(),
            usuario_id: Uuid::nil(),
            source: "vehiculo_soat".into(),
            row_id: row,
            lead_dias: lead,
            titulo: "SOAT por vencer".into(),
            mensaje: "Tu SOAT vence en 3 días".into(),
        }
    }

    #[test]
    fn emits_once_then_zero_when_already_sent_today() {
        let row = Uuid::from_u128(1);
        let due = vec![reminder(row, 3)];

        // First run: nothing sent yet → the one due reminder is selected.
        let first = select_unsent(due, &HashSet::new(), today());
        assert_eq!(first.len(), 1);

        // Record what we sent, then re-run the same day → nothing re-emitted.
        let sent: HashSet<ReminderKey> = first.iter().map(|r| r.key(today())).collect();
        let second = select_unsent(vec![reminder(row, 3)], &sent, today());
        assert_eq!(second.len(), 0);
    }

    #[test]
    fn dedups_repeats_within_one_batch() {
        let row = Uuid::from_u128(2);
        let due = vec![reminder(row, 3), reminder(row, 3)];
        let selected = select_unsent(due, &HashSet::new(), today());
        assert_eq!(selected.len(), 1);
    }

    #[test]
    fn different_lead_buckets_for_same_row_are_independent() {
        let row = Uuid::from_u128(3);
        let due = vec![reminder(row, 30), reminder(row, 3)];
        let selected = select_unsent(due, &HashSet::new(), today());
        assert_eq!(selected.len(), 2);
    }

    #[test]
    fn same_key_on_a_different_day_emits_again() {
        let row = Uuid::from_u128(4);
        let yesterday = NaiveDate::from_ymd_opt(2026, 6, 21).unwrap();
        let sent: HashSet<ReminderKey> = [reminder(row, 3).key(yesterday)].into_iter().collect();
        // Sent yesterday must not suppress today's reminder.
        let selected = select_unsent(vec![reminder(row, 3)], &sent, today());
        assert_eq!(selected.len(), 1);
    }
}
