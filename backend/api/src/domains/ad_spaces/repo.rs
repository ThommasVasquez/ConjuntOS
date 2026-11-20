use std::collections::{HashMap, HashSet};

use chrono::{Datelike, FixedOffset, Timelike, Utc};
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use uuid::Uuid;

use crate::db::schema::{ad_events, ad_spaces, conjuntos};
use crate::db::DbConn;
use crate::domains::ad_spaces::models::{
    AdCampaignMetricsDto, AdCampaignSummaryDto, AdSpace, AdSpaceChangeset, AdSpaceFeedDto,
    ConjuntoAdMetricDto, HourlyAdMetricDto, NuevoAdEvent, NuevoAdSpace,
};
use crate::error::ApiResult;

/// Colombia local time (UTC-5, no DST).
pub fn colombia_now() -> chrono::DateTime<FixedOffset> {
    let tz = FixedOffset::west_opt(5 * 3600).unwrap();
    Utc::now().with_timezone(&tz)
}

/// Checks whether `hour` (0..=23) falls inside `hora_inicio..=hora_fin`
/// (supports wrap-around overnight windows like 22..=2).
pub fn hour_in_window(hour: i32, hora_inicio: i32, hora_fin: i32) -> bool {
    if hora_inicio <= hora_fin {
        hour >= hora_inicio && hour <= hora_fin
    } else {
        hour >= hora_inicio || hour <= hora_fin
    }
}

/// Checks whether ISO weekday (1=Mon .. 7=Sun) is enabled in `dias_semana` (e.g. "1,2,3,4,5").
pub fn weekday_enabled(weekday: u32, dias_semana: &str) -> bool {
    let target = weekday.to_string();
    dias_semana
        .split(',')
        .any(|d| d.trim() == target)
}

pub async fn list_all(conn: &mut DbConn, conjunto_id: Uuid) -> ApiResult<Vec<AdSpace>> {
    let rows = ad_spaces::table
        .filter(ad_spaces::conjunto_id.eq(conjunto_id))
        .order((ad_spaces::prioridad.desc(), ad_spaces::inicio_en.desc()))
        .select(AdSpace::as_select())
        .load(conn)
        .await?;
    Ok(rows)
}

pub async fn list_active_for_feed(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    usuario_id: Uuid,
) -> ApiResult<Vec<AdSpaceFeedDto>> {
    let now_utc = Utc::now();
    let now_co = colombia_now();
    let cur_hour = now_co.hour() as i32;
    let cur_weekday = now_co.weekday().number_from_monday();

    let rows = ad_spaces::table
        .filter(ad_spaces::conjunto_id.eq(conjunto_id))
        .filter(ad_spaces::activo.eq(true))
        .filter(ad_spaces::inicio_en.le(now_utc))
        .filter(ad_spaces::fin_en.ge(now_utc))
        .order((ad_spaces::prioridad.desc(), ad_spaces::inicio_en.desc()))
        .select(AdSpace::as_select())
        .load(conn)
        .await?;

    // Start of today in Colombia time (converted to UTC) for daily frequency cap.
    let today_start_utc = now_co
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_local_timezone(*now_co.offset())
        .unwrap()
        .with_timezone(&Utc);

    let mut out = Vec::new();
    for ad in rows {
        // 1. Dayparting: hour & weekday
        if !hour_in_window(cur_hour, ad.hora_inicio, ad.hora_fin) {
            continue;
        }
        if !weekday_enabled(cur_weekday, &ad.dias_semana) {
            continue;
        }
        // 2. Total impression cap
        if let Some(max_imp) = ad.max_impresiones {
            if max_imp > 0 && ad.impresiones >= max_imp {
                continue;
            }
        }
        // 3. Per-user daily frequency cap
        if let Some(max_day) = ad.max_por_usuario_dia {
            if max_day > 0 {
                let seen_today: i64 = ad_events::table
                    .filter(ad_events::ad_space_id.eq(ad.id))
                    .filter(ad_events::usuario_id.eq(usuario_id))
                    .filter(ad_events::tipo.eq("IMPRESSION"))
                    .filter(ad_events::created_at.ge(today_start_utc))
                    .count()
                    .get_result(conn)
                    .await?;
                if seen_today >= i64::from(max_day) {
                    continue;
                }
            }
        }
        out.push(AdSpaceFeedDto::from(ad));
    }

    Ok(out)
}

pub async fn find_by_id(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    id: Uuid,
) -> ApiResult<Option<AdSpace>> {
    let row = ad_spaces::table
        .filter(ad_spaces::id.eq(id))
        .filter(ad_spaces::conjunto_id.eq(conjunto_id))
        .select(AdSpace::as_select())
        .first(conn)
        .await
        .optional()?;
    Ok(row)
}

pub async fn create(conn: &mut DbConn, nuevo: NuevoAdSpace) -> ApiResult<AdSpace> {
    let row = diesel::insert_into(ad_spaces::table)
        .values(&nuevo)
        .returning(AdSpace::as_returning())
        .get_result(conn)
        .await?;
    Ok(row)
}

pub async fn update(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    id: Uuid,
    changes: AdSpaceChangeset,
) -> ApiResult<Option<AdSpace>> {
    let row = diesel::update(
        ad_spaces::table
            .filter(ad_spaces::id.eq(id))
            .filter(ad_spaces::conjunto_id.eq(conjunto_id)),
    )
    .set(&changes)
    .returning(AdSpace::as_returning())
    .get_result(conn)
    .await
    .optional()?;
    Ok(row)
}

pub async fn delete(conn: &mut DbConn, conjunto_id: Uuid, id: Uuid) -> ApiResult<usize> {
    let deleted = diesel::delete(
        ad_spaces::table
            .filter(ad_spaces::id.eq(id))
            .filter(ad_spaces::conjunto_id.eq(conjunto_id)),
    )
    .execute(conn)
    .await?;
    Ok(deleted)
}

pub async fn register_impression(
    conn: &mut DbConn,
    id: Uuid,
    usuario_id: Option<Uuid>,
) -> ApiResult<()> {
    let ad: Option<(Uuid,)> = diesel::update(ad_spaces::table.filter(ad_spaces::id.eq(id)))
        .set(ad_spaces::impresiones.eq(ad_spaces::impresiones + 1))
        .returning((ad_spaces::conjunto_id,))
        .get_result(conn)
        .await
        .optional()?;

    if let Some((conjunto_id,)) = ad {
        let hora_local = colombia_now().hour() as i32;
        let _ = diesel::insert_into(ad_events::table)
            .values(NuevoAdEvent {
                ad_space_id: id,
                conjunto_id,
                usuario_id,
                tipo: "IMPRESSION".to_string(),
                hora_local,
            })
            .execute(conn)
            .await;
    }
    Ok(())
}

pub async fn register_click(
    conn: &mut DbConn,
    id: Uuid,
    usuario_id: Option<Uuid>,
) -> ApiResult<()> {
    let ad: Option<(Uuid,)> = diesel::update(ad_spaces::table.filter(ad_spaces::id.eq(id)))
        .set(ad_spaces::clics.eq(ad_spaces::clics + 1))
        .returning((ad_spaces::conjunto_id,))
        .get_result(conn)
        .await
        .optional()?;

    if let Some((conjunto_id,)) = ad {
        let hora_local = colombia_now().hour() as i32;
        let _ = diesel::insert_into(ad_events::table)
            .values(NuevoAdEvent {
                ad_space_id: id,
                conjunto_id,
                usuario_id,
                tipo: "CLICK".to_string(),
                hora_local,
            })
            .execute(conn)
            .await;
    }
    Ok(())
}

// ── SuperAdmin Multi-Conjunto Campaigns & Hourly Analytics ──────────────────

pub async fn list_campaigns(conn: &mut DbConn) -> ApiResult<Vec<AdCampaignSummaryDto>> {
    let rows = ad_spaces::table
        .order((ad_spaces::inicio_en.desc(), ad_spaces::prioridad.desc()))
        .select(AdSpace::as_select())
        .load(conn)
        .await?;

    let conj_rows: Vec<(Uuid, String)> = conjuntos::table
        .select((conjuntos::id, conjuntos::nombre))
        .load(conn)
        .await?;
    let conj_map: HashMap<Uuid, String> = conj_rows.into_iter().collect();

    let mut order: Vec<Uuid> = Vec::new();
    let mut grouped: HashMap<Uuid, Vec<AdSpace>> = HashMap::new();
    for ad in rows {
        let cid = ad.campana_id.unwrap_or(ad.id);
        if !grouped.contains_key(&cid) {
            order.push(cid);
        }
        grouped.entry(cid).or_default().push(ad);
    }

    let mut out = Vec::with_capacity(order.len());
    for campana_id in order {
        let items = grouped.remove(&campana_id).unwrap_or_default();
        let Some(first) = items.as_slice().first() else { continue };
        let impresiones: i64 = items.iter().map(|i| i64::from(i.impresiones)).sum();
        let clics: i64 = items.iter().map(|i| i64::from(i.clics)).sum();
        let ctr = if impresiones > 0 {
            ((clics as f64 / impresiones as f64) * 10_000.0).round() / 100.0
        } else {
            0.0
        };
        let activo = items.iter().any(|i| i.activo);
        let conjuntos_nombres: Vec<String> = items
            .iter()
            .map(|i| {
                conj_map
                    .get(&i.conjunto_id)
                    .cloned()
                    .unwrap_or_else(|| "Conjunto".to_string())
            })
            .collect();

        out.push(AdCampaignSummaryDto {
            campana_id,
            nombre: first.nombre.clone(),
            empresa: first.empresa.clone(),
            posicion: first.posicion.clone(),
            imagen_url: first.imagen_url.clone(),
            link_url: first.link_url.clone(),
            cta_texto: first.cta_texto.clone(),
            activo,
            inicio_en: first.inicio_en,
            fin_en: first.fin_en,
            hora_inicio: first.hora_inicio,
            hora_fin: first.hora_fin,
            dias_semana: first.dias_semana.clone(),
            prioridad: first.prioridad,
            max_impresiones: first.max_impresiones,
            max_por_usuario_dia: first.max_por_usuario_dia,
            conjuntos_count: items.len(),
            conjuntos_nombres,
            impresiones,
            clics,
            ctr,
        });
    }

    Ok(out)
}

pub async fn toggle_campaign(conn: &mut DbConn, campana_id: Uuid) -> ApiResult<Option<bool>> {
    let rows = ad_spaces::table
        .filter(ad_spaces::campana_id.eq(campana_id).or(ad_spaces::id.eq(campana_id)))
        .select(AdSpace::as_select())
        .load(conn)
        .await?;
    if rows.is_empty() {
        return Ok(None);
    }
    let next_active = !rows.iter().any(|r| r.activo);
    diesel::update(
        ad_spaces::table
            .filter(ad_spaces::campana_id.eq(campana_id).or(ad_spaces::id.eq(campana_id))),
    )
    .set(ad_spaces::activo.eq(next_active))
    .execute(conn)
    .await?;
    Ok(Some(next_active))
}

pub async fn delete_campaign(conn: &mut DbConn, campana_id: Uuid) -> ApiResult<usize> {
    let deleted = diesel::delete(
        ad_spaces::table
            .filter(ad_spaces::campana_id.eq(campana_id).or(ad_spaces::id.eq(campana_id))),
    )
    .execute(conn)
    .await?;
    Ok(deleted)
}

pub async fn campaign_metrics(
    conn: &mut DbConn,
    campana_id: Uuid,
) -> ApiResult<Option<AdCampaignMetricsDto>> {
    let items = ad_spaces::table
        .filter(ad_spaces::campana_id.eq(campana_id).or(ad_spaces::id.eq(campana_id)))
        .select(AdSpace::as_select())
        .load(conn)
        .await?;

    let Some(first) = items.as_slice().first() else {
        return Ok(None);
    };

    let space_ids: Vec<Uuid> = items.iter().map(|i| i.id).collect();
    let conj_rows: Vec<(Uuid, String)> = conjuntos::table
        .select((conjuntos::id, conjuntos::nombre))
        .load(conn)
        .await?;
    let conj_map: HashMap<Uuid, String> = conj_rows.into_iter().collect();

    let events: Vec<(String, i32, Option<Uuid>)> = ad_events::table
        .filter(ad_events::ad_space_id.eq_any(&space_ids))
        .select((ad_events::tipo, ad_events::hora_local, ad_events::usuario_id))
        .load(conn)
        .await?;

    let mut hourly_imp = [0i64; 24];
    let mut hourly_clk = [0i64; 24];
    let mut unique_users: HashSet<Uuid> = HashSet::new();

    for (tipo, hora, uid) in events {
        let h = hora.clamp(0, 23) as usize;
        if tipo == "IMPRESSION" {
            hourly_imp[h] += 1;
            if let Some(u) = uid {
                unique_users.insert(u);
            }
        } else if tipo == "CLICK" {
            hourly_clk[h] += 1;
        }
    }

    let impresiones: i64 = items.iter().map(|i| i64::from(i.impresiones)).sum();
    let clics: i64 = items.iter().map(|i| i64::from(i.clics)).sum();
    let ctr = if impresiones > 0 {
        ((clics as f64 / impresiones as f64) * 10_000.0).round() / 100.0
    } else {
        0.0
    };

    let por_hora: Vec<HourlyAdMetricDto> = (0..24)
        .map(|h| HourlyAdMetricDto {
            hora: h as i32,
            impresiones: hourly_imp[h],
            clics: hourly_clk[h],
        })
        .collect();

    let hora_pico = por_hora
        .iter()
        .filter(|h| h.impresiones > 0)
        .max_by_key(|h| h.impresiones)
        .map(|h| h.hora);

    let mut por_conjunto: Vec<ConjuntoAdMetricDto> = items
        .iter()
        .map(|i| {
            let imp = i64::from(i.impresiones);
            let clk = i64::from(i.clics);
            let c_ctr = if imp > 0 {
                ((clk as f64 / imp as f64) * 10_000.0).round() / 100.0
            } else {
                0.0
            };
            ConjuntoAdMetricDto {
                conjunto_id: i.conjunto_id,
                conjunto_nombre: conj_map
                    .get(&i.conjunto_id)
                    .cloned()
                    .unwrap_or_else(|| "Conjunto".to_string()),
                impresiones: imp,
                clics: clk,
                ctr: c_ctr,
            }
        })
        .collect();
    por_conjunto.sort_by(|a, b| b.impresiones.cmp(&a.impresiones));

    Ok(Some(AdCampaignMetricsDto {
        campana_id,
        nombre: first.nombre.clone(),
        empresa: first.empresa.clone(),
        impresiones,
        clics,
        ctr,
        usuarios_unicos: unique_users.len() as i64,
        hora_pico,
        por_hora,
        por_conjunto,
    }))
}
