use anyhow::Result;
use chrono::{DateTime, NaiveDateTime, Utc};
use tokio_postgres::Client;

use crate::idmap::{cuid_opt, cuid_to_uuid};
use crate::report::ReportRow;

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

pub struct MigrateResult {
    pub table: &'static str,
    pub migrated: u64,
    pub skipped: u64,
    pub errors: u64,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Try to parse a string column as JSON. On failure, log to report and return `serde_json::Value::Null`.
fn parse_json_or_null(
    raw: &str,
    table: &str,
    legacy_id: &str,
    column: &str,
    report: &mut Vec<ReportRow>,
) -> serde_json::Value {
    match serde_json::from_str(raw) {
        Ok(v) => v,
        Err(_) => {
            report.push(ReportRow {
                table: table.to_string(),
                legacy_id: legacy_id.to_string(),
                column: column.to_string(),
                raw_value: raw.chars().take(200).collect(),
                action: "set_null".to_string(),
            });
            serde_json::Value::Null
        }
    }
}

/// Parse a Postgres timestamptz column that comes back as a `SystemTime`.
fn ts(row: &tokio_postgres::Row, idx: &str) -> DateTime<Utc> {
    row.try_get::<_, DateTime<Utc>>(idx)
        .or_else(|_| row.try_get::<_, NaiveDateTime>(idx).map(|n| n.and_utc()))
        .unwrap_or_default()
}

fn ts_opt(row: &tokio_postgres::Row, idx: &str) -> Option<DateTime<Utc>> {
    row.try_get::<_, DateTime<Utc>>(idx).ok().or_else(|| {
        row.try_get::<_, NaiveDateTime>(idx)
            .ok()
            .map(|n| n.and_utc())
    })
}

fn str_col(row: &tokio_postgres::Row, idx: &str) -> String {
    row.try_get::<_, String>(idx).unwrap_or_default()
}

fn str_opt(row: &tokio_postgres::Row, idx: &str) -> Option<String> {
    row.try_get::<_, String>(idx).ok().filter(|s| !s.is_empty())
}

fn bool_col(row: &tokio_postgres::Row, idx: &str) -> bool {
    row.try_get::<_, bool>(idx).unwrap_or(false)
}

fn int_col(row: &tokio_postgres::Row, idx: &str) -> i32 {
    row.try_get::<_, i32>(idx).unwrap_or(0)
}

fn int_opt(row: &tokio_postgres::Row, idx: &str) -> Option<i32> {
    row.try_get::<_, i32>(idx).ok()
}

/// Decimal values come as strings from the legacy DB; we pass them as `CAST($n AS NUMERIC)` in SQL.
fn dec_str(row: &tokio_postgres::Row, idx: &str) -> String {
    // tokio_postgres can return Decimal as a string representation
    row.try_get::<_, String>(idx)
        .or_else(|_| row.try_get::<_, f64>(idx).map(|f| f.to_string()))
        .unwrap_or_else(|_| "0".to_string())
}

fn dec_str_opt(row: &tokio_postgres::Row, idx: &str) -> Option<String> {
    row.try_get::<_, String>(idx)
        .ok()
        .or_else(|| row.try_get::<_, f64>(idx).ok().map(|f| f.to_string()))
}

// ---------------------------------------------------------------------------
// Phase runner
// ---------------------------------------------------------------------------

/// Helper: run a single phase, log it, push result.
macro_rules! run_phase {
    ($results:ident, $phase:expr, $legacy:expr, $target:expr, $dry:expr, $report:expr, $name:expr, $func:ident) => {
        if $phase.is_none() || $phase == Some($name) {
            tracing::info!("Migrating {}...", $name);
            let res = $func($legacy, $target, $dry, $report).await?;
            tracing::info!(
                "  {}: migrated={} skipped={} errors={}",
                res.table,
                res.migrated,
                res.skipped,
                res.errors
            );
            $results.push(res);
        }
    };
}

/// Run all migration phases in dependency order, or a single phase by name.
pub async fn run_all(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    phase: Option<&str>,
    report: &mut Vec<ReportRow>,
) -> Result<Vec<MigrateResult>> {
    let mut results = Vec::new();
    // Ordered by FK dependencies: parents first
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "conjuntos",
        migrate_conjuntos
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "unidades",
        migrate_unidades
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "usuarios",
        migrate_usuarios
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "notificaciones",
        migrate_notificaciones
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "visitas",
        migrate_visitas
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "paquetes",
        migrate_paquetes
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "vehiculos",
        migrate_vehiculos
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "mascotas",
        migrate_mascotas
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "parqueaderos",
        migrate_parqueaderos
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "registros_parqueadero",
        migrate_registros_parqueadero
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "rondas_parqueadero",
        migrate_rondas_parqueadero
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "tramites",
        migrate_tramites
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "areas_comunes",
        migrate_areas_comunes
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "reservas",
        migrate_reservas
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "anuncios",
        migrate_anuncios
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "documentos",
        migrate_documentos
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "juntas",
        migrate_juntas
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "pagos",
        migrate_pagos
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "gastos",
        migrate_gastos
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "locales",
        migrate_locales
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "productos",
        migrate_productos
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "pedidos",
        migrate_pedidos
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "solicitudes_servicio",
        migrate_solicitudes
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "recibos_publicos",
        migrate_recibos_publicos
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "ad_spaces",
        migrate_ad_spaces
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "inmuebles",
        migrate_inmuebles
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "chat_admin",
        migrate_chat_admin
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "asambleas",
        migrate_asambleas
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "asamblea_turnos",
        migrate_asamblea_turnos
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "asamblea_opiniones",
        migrate_asamblea_opiniones
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "asamblea_pairings",
        migrate_asamblea_pairings
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "asamblea_asistencias",
        migrate_asamblea_asistencias
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "asamblea_poderes",
        migrate_asamblea_poderes
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "asamblea_votaciones",
        migrate_asamblea_votaciones
    );
    run_phase!(
        results,
        phase,
        legacy,
        target,
        dry_run,
        report,
        "asamblea_votos",
        migrate_asamblea_votos
    );
    Ok(results)
}

// ---------------------------------------------------------------------------
// Migration functions
// ---------------------------------------------------------------------------

pub async fn migrate_conjuntos(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    _report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy.query(r#"SELECT * FROM "Conjunto""#, &[]).await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let id = cuid_to_uuid(&str_col(row, "id"));
        if dry_run {
            migrated += 1;
            continue;
        }
        let res = target
            .execute(
                "INSERT INTO conjuntos (id, nombre, nit, subdominio, direccion, ciudad, logo_url, color_primario, plan, activo, representante_legal, notaria_escritura, numero_escritura, fecha_escritura, matricula_inmobiliaria, total_unidades, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id,
                    &str_col(row, "nombre"),
                    &str_opt(row, "nit"),
                    &str_col(row, "subdominio"),
                    &str_col(row, "direccion"),
                    &str_col(row, "ciudad"),
                    &str_opt(row, "logoUrl"),
                    &str_col(row, "colorPrimario"),
                    &str_col(row, "plan"),
                    &bool_col(row, "activo"),
                    &str_opt(row, "representanteLegal"),
                    &str_opt(row, "notariaEscritura"),
                    &str_opt(row, "numeroEscritura"),
                    &ts_opt(row, "fechaEscritura"),
                    &str_opt(row, "matriculaInmobiliaria"),
                    &int_opt(row, "totalUnidades"),
                    &ts(row, "creadoEn"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("conjuntos insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "conjuntos",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_unidades(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    _report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy.query(r#"SELECT * FROM "Unidad""#, &[]).await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let id = cuid_to_uuid(&str_col(row, "id"));
        let conjunto_id = cuid_to_uuid(&str_col(row, "conjuntoId"));
        if dry_run {
            migrated += 1;
            continue;
        }
        let res = target
            .execute(
                "INSERT INTO unidades (id, conjunto_id, numero, torre, piso, tipo, coeficiente)
                 VALUES ($1,$2,$3,$4,$5,$6,CAST($7 AS NUMERIC))
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id,
                    &conjunto_id,
                    &str_col(row, "numero"),
                    &str_opt(row, "torre"),
                    &int_opt(row, "piso"),
                    &str_col(row, "tipo"),
                    &dec_str(row, "coeficiente"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("unidades insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "unidades",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_usuarios(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy.query(r#"SELECT * FROM "Usuario""#, &[]).await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let legacy_id = str_col(row, "id");
        let id = cuid_to_uuid(&legacy_id);
        let conjunto_id = cuid_to_uuid(&str_col(row, "conjuntoId"));
        let unidad_id = cuid_opt(row.try_get::<_, String>("unidadId").ok().as_deref());

        // Password handling: hash if present, otherwise generate placeholder
        let raw_pw = str_opt(row, "password");
        let (password_hash, must_change) = match raw_pw {
            Some(ref pw) if pw.len() >= 6 => {
                // Re-hash with Argon2id regardless of original format
                (hash_password_migration(pw), false)
            }
            _ => {
                // No usable password → force change
                (
                    hash_password_migration("MIGRATION_PLACEHOLDER_CHANGE_ME"),
                    true,
                )
            }
        };

        // Parse notifPush → push_subscriptions (handled after user insert)
        let notif_push_raw = str_opt(row, "notifPush");

        if dry_run {
            migrated += 1;
            continue;
        }

        let res = target
            .execute(
                "INSERT INTO usuarios (id, conjunto_id, nombre, email, password_hash, must_change_password, telefono, rol, unidad_id, avatar, torre, apto, genero, activo, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id,
                    &conjunto_id,
                    &str_col(row, "nombre"),
                    &str_col(row, "email"),
                    &password_hash,
                    &must_change,
                    &str_opt(row, "telefono"),
                    &str_col(row, "rol"),
                    &unidad_id,
                    &str_opt(row, "avatar"),
                    &str_opt(row, "torre"),
                    &str_opt(row, "apto"),
                    &str_opt(row, "genero"),
                    &bool_col(row, "activo"),
                    &ts(row, "creadoEn"),
                ],
            )
            .await;
        match res {
            Ok(1) => {
                migrated += 1;
                // Try to migrate push subscription
                if let Some(ref raw) = notif_push_raw {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(raw) {
                        let endpoint = val.get("endpoint").and_then(|v| v.as_str());
                        let p256dh = val
                            .get("keys")
                            .and_then(|k| k.get("p256dh"))
                            .and_then(|v| v.as_str());
                        let auth = val
                            .get("keys")
                            .and_then(|k| k.get("auth"))
                            .and_then(|v| v.as_str());
                        if let (Some(ep), Some(p), Some(a)) = (endpoint, p256dh, auth) {
                            let _ = target
                                .execute(
                                    "INSERT INTO push_subscriptions (id, conjunto_id, usuario_id, endpoint, p256dh, auth, created_at)
                                     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
                                     ON CONFLICT DO NOTHING",
                                    &[&conjunto_id, &id, &ep.to_string(), &p.to_string(), &a.to_string()],
                                )
                                .await;
                        }
                    } else {
                        report.push(ReportRow {
                            table: "usuarios".to_string(),
                            legacy_id: legacy_id.clone(),
                            column: "notifPush".to_string(),
                            raw_value: raw.chars().take(200).collect(),
                            action: "push_sub_skipped".to_string(),
                        });
                    }
                }
            }
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("usuarios insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "usuarios",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_notificaciones(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    _report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy.query(r#"SELECT * FROM "Notificacion""#, &[]).await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let id = cuid_to_uuid(&str_col(row, "id"));
        let usuario_id = cuid_to_uuid(&str_col(row, "usuarioId"));
        // Derive conjunto_id from the usuario's conjunto
        if dry_run {
            migrated += 1;
            continue;
        }
        // Notificaciones in the new schema have conjunto_id; we look it up from the migrated user.
        let conjunto_row = target
            .query_opt(
                "SELECT conjunto_id FROM usuarios WHERE id = $1",
                &[&usuario_id],
            )
            .await?;
        let conjunto_id = match conjunto_row {
            Some(r) => r.get::<_, uuid::Uuid>(0),
            None => {
                skipped += 1;
                continue;
            }
        };
        let res = target
            .execute(
                "INSERT INTO notificaciones (id, conjunto_id, usuario_id, tipo, titulo, mensaje, leida, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &conjunto_id, &usuario_id,
                    &str_col(row, "tipo"),
                    &str_col(row, "titulo"),
                    &str_col(row, "mensaje"),
                    &bool_col(row, "leida"),
                    &ts(row, "creadoEn"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("notificaciones insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "notificaciones",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_visitas(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    _report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy.query(r#"SELECT * FROM "Visita""#, &[]).await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let id = cuid_to_uuid(&str_col(row, "id"));
        let usuario_id = cuid_to_uuid(&str_col(row, "usuarioId"));
        if dry_run {
            migrated += 1;
            continue;
        }
        let conjunto_row = target
            .query_opt(
                "SELECT conjunto_id FROM usuarios WHERE id = $1",
                &[&usuario_id],
            )
            .await?;
        let conjunto_id = match conjunto_row {
            Some(r) => r.get::<_, uuid::Uuid>(0),
            None => {
                skipped += 1;
                continue;
            }
        };
        let res = target
            .execute(
                "INSERT INTO visitas (id, conjunto_id, usuario_id, nombre, tipo, vehiculo_tipo, placa, fecha, tiene_parqueadero, observacion, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &conjunto_id, &usuario_id,
                    &str_col(row, "nombre"),
                    &str_col(row, "tipo"),
                    &str_opt(row, "vehiculoTipo"),
                    &str_opt(row, "placa"),
                    &ts(row, "fecha"),
                    &bool_col(row, "tieneParqueadero"),
                    &str_opt(row, "observacion"),
                    &ts(row, "creadoEn"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("visitas insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "visitas",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_paquetes(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    _report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy.query(r#"SELECT * FROM "Paquete""#, &[]).await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let id = cuid_to_uuid(&str_col(row, "id"));
        let usuario_id = cuid_to_uuid(&str_col(row, "usuarioId"));
        if dry_run {
            migrated += 1;
            continue;
        }
        let conjunto_row = target
            .query_opt(
                "SELECT conjunto_id FROM usuarios WHERE id = $1",
                &[&usuario_id],
            )
            .await?;
        let conjunto_id = match conjunto_row {
            Some(r) => r.get::<_, uuid::Uuid>(0),
            None => {
                skipped += 1;
                continue;
            }
        };
        let res = target
            .execute(
                "INSERT INTO paquetes (id, conjunto_id, usuario_id, descripcion, remitente, estado, fecha_llegada, entregado_en)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &conjunto_id, &usuario_id,
                    &str_col(row, "descripcion"),
                    &str_col(row, "remitente"),
                    &str_col(row, "estado"),
                    &ts(row, "fechaLlegada"),
                    &ts_opt(row, "entregadoEn"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("paquetes insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "paquetes",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_vehiculos(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    _report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy.query(r#"SELECT * FROM "Vehiculo""#, &[]).await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let id = cuid_to_uuid(&str_col(row, "id"));
        let usuario_id = cuid_to_uuid(&str_col(row, "usuarioId"));
        if dry_run {
            migrated += 1;
            continue;
        }
        let conjunto_row = target
            .query_opt(
                "SELECT conjunto_id FROM usuarios WHERE id = $1",
                &[&usuario_id],
            )
            .await?;
        let conjunto_id = match conjunto_row {
            Some(r) => r.get::<_, uuid::Uuid>(0),
            None => {
                skipped += 1;
                continue;
            }
        };
        let res = target
            .execute(
                "INSERT INTO vehiculos (id, conjunto_id, usuario_id, placa, marca, modelo, color, tipo, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &conjunto_id, &usuario_id,
                    &str_col(row, "placa"),
                    &str_opt(row, "marca"),
                    &str_opt(row, "modelo"),
                    &str_opt(row, "color"),
                    &str_col(row, "tipo"),
                    &ts(row, "creadoEn"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("vehiculos insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "vehiculos",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_mascotas(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    _report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy.query(r#"SELECT * FROM "Mascota""#, &[]).await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let id = cuid_to_uuid(&str_col(row, "id"));
        let usuario_id = cuid_to_uuid(&str_col(row, "usuarioId"));
        if dry_run {
            migrated += 1;
            continue;
        }
        let conjunto_row = target
            .query_opt(
                "SELECT conjunto_id FROM usuarios WHERE id = $1",
                &[&usuario_id],
            )
            .await?;
        let conjunto_id = match conjunto_row {
            Some(r) => r.get::<_, uuid::Uuid>(0),
            None => {
                skipped += 1;
                continue;
            }
        };
        let res = target
            .execute(
                "INSERT INTO mascotas (id, conjunto_id, usuario_id, nombre, tipo, raza, foto_url, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &conjunto_id, &usuario_id,
                    &str_col(row, "nombre"),
                    &str_col(row, "tipo"),
                    &str_opt(row, "raza"),
                    &str_opt(row, "fotoUrl"),
                    &ts(row, "creadoEn"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("mascotas insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "mascotas",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_parqueaderos(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    _report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy.query(r#"SELECT * FROM "Parqueadero""#, &[]).await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let id = cuid_to_uuid(&str_col(row, "id"));
        let conjunto_id = cuid_to_uuid(&str_col(row, "conjuntoId"));
        let usuario_id = cuid_opt(row.try_get::<_, String>("usuarioId").ok().as_deref());
        if dry_run {
            migrated += 1;
            continue;
        }
        let res = target
            .execute(
                "INSERT INTO parqueaderos (id, conjunto_id, numero, torre, tipo, estado, usuario_id, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &conjunto_id,
                    &str_col(row, "numero"),
                    &str_opt(row, "torre"),
                    &str_col(row, "tipo"),
                    &str_col(row, "estado"),
                    &usuario_id,
                    &ts(row, "creadoEn"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("parqueaderos insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "parqueaderos",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_registros_parqueadero(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    _report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy
        .query(r#"SELECT * FROM "RegistroParqueadero""#, &[])
        .await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let id = cuid_to_uuid(&str_col(row, "id"));
        let parqueadero_id = cuid_to_uuid(&str_col(row, "parqueaderoId"));
        let usuario_id = cuid_to_uuid(&str_col(row, "usuarioId"));
        if dry_run {
            migrated += 1;
            continue;
        }
        // Derive conjunto_id from the parqueadero
        let conjunto_row = target
            .query_opt(
                "SELECT conjunto_id FROM parqueaderos WHERE id = $1",
                &[&parqueadero_id],
            )
            .await?;
        let conjunto_id = match conjunto_row {
            Some(r) => r.get::<_, uuid::Uuid>(0),
            None => {
                skipped += 1;
                continue;
            }
        };
        let res = target
            .execute(
                "INSERT INTO registros_parqueadero (id, conjunto_id, parqueadero_id, usuario_id, tipo, placa, observacion, fecha)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &conjunto_id, &parqueadero_id, &usuario_id,
                    &str_col(row, "tipo"),
                    &str_opt(row, "placa"),
                    &str_opt(row, "observacion"),
                    &ts(row, "fecha"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("registros_parqueadero insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "registros_parqueadero",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_rondas_parqueadero(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy
        .query(r#"SELECT * FROM "RondaParqueadero""#, &[])
        .await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let legacy_id = str_col(row, "id");
        let id = cuid_to_uuid(&legacy_id);
        let usuario_id = cuid_to_uuid(&str_col(row, "usuarioId"));
        if dry_run {
            migrated += 1;
            continue;
        }
        let conjunto_row = target
            .query_opt(
                "SELECT conjunto_id FROM usuarios WHERE id = $1",
                &[&usuario_id],
            )
            .await?;
        let conjunto_id = match conjunto_row {
            Some(r) => r.get::<_, uuid::Uuid>(0),
            None => {
                skipped += 1;
                continue;
            }
        };
        let hallazgos: Option<serde_json::Value> = str_opt(row, "hallazgos")
            .map(|raw| {
                parse_json_or_null(&raw, "rondas_parqueadero", &legacy_id, "hallazgos", report)
            })
            .filter(|v| !v.is_null());
        let res = target
            .execute(
                "INSERT INTO rondas_parqueadero (id, conjunto_id, usuario_id, fecha, hallazgos, completada)
                 VALUES ($1,$2,$3,$4,$5,$6)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &conjunto_id, &usuario_id,
                    &ts(row, "fecha"),
                    &hallazgos,
                    &bool_col(row, "completada"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("rondas_parqueadero insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "rondas_parqueadero",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_tramites(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy.query(r#"SELECT * FROM "Tramite""#, &[]).await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let legacy_id = str_col(row, "id");
        let id = cuid_to_uuid(&legacy_id);
        let conjunto_id = cuid_to_uuid(&str_col(row, "conjuntoId"));
        let usuario_id = cuid_to_uuid(&str_col(row, "usuarioId"));
        let aprobado_por_id = cuid_opt(row.try_get::<_, String>("aprobadoPorId").ok().as_deref());
        // descripcion in legacy is a JSON payload → target.payload
        let desc_raw = str_col(row, "descripcion");
        let payload = parse_json_or_null(&desc_raw, "tramites", &legacy_id, "descripcion", report);
        let documentos = serde_json::Value::Array(vec![]); // legacy has no separate documentos field
        if dry_run {
            migrated += 1;
            continue;
        }
        let res = target
            .execute(
                "INSERT INTO tramites (id, conjunto_id, usuario_id, tipo, estado, payload, documentos, observacion_admin, aprobado_por_id, fecha_respuesta, created_at, updated_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &conjunto_id, &usuario_id,
                    &str_col(row, "tipo"),
                    &str_col(row, "estado"),
                    &payload,
                    &documentos,
                    &str_opt(row, "observacionAdmin"),
                    &aprobado_por_id,
                    &ts_opt(row, "fechaRespuesta"),
                    &ts(row, "creadoEn"),
                    &ts(row, "actualizadoEn"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("tramites insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "tramites",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_areas_comunes(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    _report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy.query(r#"SELECT * FROM "AreaComun""#, &[]).await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let id = cuid_to_uuid(&str_col(row, "id"));
        let conjunto_id = cuid_to_uuid(&str_col(row, "conjuntoId"));
        if dry_run {
            migrated += 1;
            continue;
        }
        let res = target
            .execute(
                "INSERT INTO areas_comunes (id, conjunto_id, nombre, descripcion, capacidad_max, imagen_url, requiere_deposito, deposito_monto, hora_apertura, hora_cierre, dias_disponibles, duracion_slot, activa)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,CAST($8 AS NUMERIC),$9,$10,$11,$12,$13)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &conjunto_id,
                    &str_col(row, "nombre"),
                    &str_opt(row, "descripcion"),
                    &int_col(row, "capacidadMax"),
                    &str_opt(row, "imagenUrl"),
                    &bool_col(row, "requiereDeposito"),
                    &dec_str_opt(row, "depositoMonto"),
                    &str_col(row, "horaApertura"),
                    &str_col(row, "horaCierre"),
                    &str_col(row, "diasDisponibles"),
                    &int_col(row, "duracionSlot"),
                    &bool_col(row, "activa"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("areas_comunes insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "areas_comunes",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_reservas(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    _report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy.query(r#"SELECT * FROM "Reserva""#, &[]).await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let id = cuid_to_uuid(&str_col(row, "id"));
        let conjunto_id = cuid_to_uuid(&str_col(row, "conjuntoId"));
        let usuario_id = cuid_to_uuid(&str_col(row, "usuarioId"));
        let area_id = cuid_to_uuid(&str_col(row, "areaId"));
        let pago_id = cuid_opt(row.try_get::<_, String>("pagoId").ok().as_deref());
        if dry_run {
            migrated += 1;
            continue;
        }
        let res = target
            .execute(
                "INSERT INTO reservas (id, conjunto_id, usuario_id, area_id, fecha_inicio, fecha_fin, estado, notas, pago_id, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &conjunto_id, &usuario_id, &area_id,
                    &ts(row, "fechaInicio"),
                    &ts(row, "fechaFin"),
                    &str_col(row, "estado"),
                    &str_opt(row, "notas"),
                    &pago_id,
                    &ts(row, "creadoEn"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("reservas insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "reservas",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_anuncios(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy.query(r#"SELECT * FROM "Anuncio""#, &[]).await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let legacy_id = str_col(row, "id");
        let id = cuid_to_uuid(&legacy_id);
        let conjunto_id = cuid_to_uuid(&str_col(row, "conjuntoId"));
        let archivos_raw = str_col(row, "archivosUrl");
        let archivos_url =
            parse_json_or_null(&archivos_raw, "anuncios", &legacy_id, "archivosUrl", report);
        if dry_run {
            migrated += 1;
            continue;
        }
        let res = target
            .execute(
                "INSERT INTO anuncios (id, conjunto_id, titulo, contenido, tipo, imagen_url, archivos_url, fijado, publicado_en, expires_en, vistas)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &conjunto_id,
                    &str_col(row, "titulo"),
                    &str_col(row, "contenido"),
                    &str_col(row, "tipo"),
                    &str_opt(row, "imagenUrl"),
                    &archivos_url,
                    &bool_col(row, "fijado"),
                    &ts(row, "publicadoEn"),
                    &ts_opt(row, "expiresEn"),
                    &int_col(row, "vistas"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("anuncios insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "anuncios",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_documentos(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    _report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy.query(r#"SELECT * FROM "Documento""#, &[]).await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let id = cuid_to_uuid(&str_col(row, "id"));
        let conjunto_id = cuid_to_uuid(&str_col(row, "conjuntoId"));
        if dry_run {
            migrated += 1;
            continue;
        }
        let res = target
            .execute(
                "INSERT INTO documentos (id, conjunto_id, nombre, categoria, url, version, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &conjunto_id,
                    &str_col(row, "nombre"),
                    &str_col(row, "categoria"),
                    &str_col(row, "url"),
                    &str_opt(row, "version"),
                    &ts(row, "creadoEn"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("documentos insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "documentos",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_juntas(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    _report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy.query(r#"SELECT * FROM "Junta""#, &[]).await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let id = cuid_to_uuid(&str_col(row, "id"));
        let conjunto_id = cuid_to_uuid(&str_col(row, "conjuntoId"));
        if dry_run {
            migrated += 1;
            continue;
        }
        let res = target
            .execute(
                "INSERT INTO juntas (id, conjunto_id, tipo, fecha, titulo, descripcion, transcripcion, audio_url, acta_url, publicada)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &conjunto_id,
                    &str_col(row, "tipo"),
                    &ts(row, "fecha"),
                    &str_col(row, "titulo"),
                    &str_opt(row, "descripcion"),
                    &str_opt(row, "transcripcion"),
                    &str_opt(row, "audioUrl"),
                    &str_opt(row, "actaUrl"),
                    &bool_col(row, "publicada"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("juntas insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "juntas",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_pagos(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    _report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy.query(r#"SELECT * FROM "Pago""#, &[]).await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let id = cuid_to_uuid(&str_col(row, "id"));
        let conjunto_id = cuid_to_uuid(&str_col(row, "conjuntoId"));
        let unidad_id = cuid_to_uuid(&str_col(row, "unidadId"));
        let usuario_id = cuid_to_uuid(&str_col(row, "usuarioId"));
        if dry_run {
            migrated += 1;
            continue;
        }
        let res = target
            .execute(
                "INSERT INTO pagos (id, conjunto_id, unidad_id, usuario_id, concepto, monto, estado, metodo, wompi_ref, fecha_vencimiento, fecha_pago, comprobante, created_at)
                 VALUES ($1,$2,$3,$4,$5,CAST($6 AS NUMERIC),$7,$8,$9,$10,$11,$12,$13)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &conjunto_id, &unidad_id, &usuario_id,
                    &str_col(row, "concepto"),
                    &dec_str(row, "monto"),
                    &str_col(row, "estado"),
                    &str_opt(row, "metodo"),
                    &str_opt(row, "wompiRef"),
                    &ts(row, "fechaVencimiento"),
                    &ts_opt(row, "fechaPago"),
                    &str_opt(row, "comprobante"),
                    &ts(row, "creadoEn"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("pagos insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "pagos",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_gastos(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    _report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy.query(r#"SELECT * FROM "Gasto""#, &[]).await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let id = cuid_to_uuid(&str_col(row, "id"));
        let conjunto_id = cuid_to_uuid(&str_col(row, "conjuntoId"));
        if dry_run {
            migrated += 1;
            continue;
        }
        let res = target
            .execute(
                "INSERT INTO gastos (id, conjunto_id, categoria, descripcion, monto, proveedor, soporte_url, fecha, aprobado_por, created_at)
                 VALUES ($1,$2,$3,$4,CAST($5 AS NUMERIC),$6,$7,$8,$9,$10)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &conjunto_id,
                    &str_col(row, "categoria"),
                    &str_col(row, "descripcion"),
                    &dec_str(row, "monto"),
                    &str_opt(row, "proveedor"),
                    &str_opt(row, "soporteUrl"),
                    &ts(row, "fecha"),
                    &str_opt(row, "aprobadoPor"),
                    &ts(row, "creadoEn"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("gastos insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "gastos",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_locales(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    _report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy.query(r#"SELECT * FROM "Local""#, &[]).await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let id = cuid_to_uuid(&str_col(row, "id"));
        let conjunto_id = cuid_to_uuid(&str_col(row, "conjuntoId"));
        let propietario_id = cuid_opt(row.try_get::<_, String>("propietarioId").ok().as_deref());
        if dry_run {
            migrated += 1;
            continue;
        }
        let res = target
            .execute(
                "INSERT INTO locales (id, conjunto_id, nombre, categoria, descripcion, imagen_url, activo, telefono, whatsapp, propietario_id, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &conjunto_id,
                    &str_col(row, "nombre"),
                    &str_col(row, "categoria"),
                    &str_opt(row, "descripcion"),
                    &str_opt(row, "imagenUrl"),
                    &bool_col(row, "activo"),
                    &str_opt(row, "telefono"),
                    &str_opt(row, "whatsapp"),
                    &propietario_id,
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("locales insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "locales",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_productos(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    _report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy.query(r#"SELECT * FROM "Producto""#, &[]).await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let id = cuid_to_uuid(&str_col(row, "id"));
        let local_id = cuid_to_uuid(&str_col(row, "localId"));
        if dry_run {
            migrated += 1;
            continue;
        }
        let res = target
            .execute(
                "INSERT INTO productos (id, local_id, nombre, descripcion, precio, imagen_url)
                 VALUES ($1,$2,$3,$4,CAST($5 AS NUMERIC),$6)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id,
                    &local_id,
                    &str_col(row, "nombre"),
                    &str_opt(row, "descripcion"),
                    &dec_str(row, "precio"),
                    &str_opt(row, "imagenUrl"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("productos insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "productos",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_pedidos(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy.query(r#"SELECT * FROM "Pedido""#, &[]).await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let legacy_id = str_col(row, "id");
        let id = cuid_to_uuid(&legacy_id);
        let conjunto_id = cuid_to_uuid(&str_col(row, "conjuntoId"));
        let local_id = cuid_to_uuid(&str_col(row, "localId"));
        let usuario_id = cuid_to_uuid(&str_col(row, "usuarioId"));
        let items_raw = str_col(row, "items");
        let items = parse_json_or_null(&items_raw, "pedidos", &legacy_id, "items", report);
        if dry_run {
            migrated += 1;
            continue;
        }
        let res = target
            .execute(
                "INSERT INTO pedidos (id, conjunto_id, local_id, usuario_id, items, total, estado, notas, unidad_entrega, created_at)
                 VALUES ($1,$2,$3,$4,$5,CAST($6 AS NUMERIC),$7,$8,$9,$10)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &conjunto_id, &local_id, &usuario_id,
                    &items,
                    &dec_str(row, "total"),
                    &str_col(row, "estado"),
                    &str_opt(row, "notas"),
                    &str_col(row, "unidadEntrega"),
                    &ts(row, "creadoEn"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("pedidos insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "pedidos",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_solicitudes(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy
        .query(r#"SELECT * FROM "SolicitudServicio""#, &[])
        .await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let legacy_id = str_col(row, "id");
        let id = cuid_to_uuid(&legacy_id);
        let conjunto_id = cuid_to_uuid(&str_col(row, "conjuntoId"));
        let usuario_id = cuid_to_uuid(&str_col(row, "usuarioId"));
        let proveedor_id = cuid_opt(row.try_get::<_, String>("proveedorId").ok().as_deref());
        let imagenes_raw = str_col(row, "imagenes");
        let imagenes = parse_json_or_null(
            &imagenes_raw,
            "solicitudes_servicio",
            &legacy_id,
            "imagenes",
            report,
        );
        if dry_run {
            migrated += 1;
            continue;
        }
        let res = target
            .execute(
                "INSERT INTO solicitudes_servicio (id, conjunto_id, usuario_id, categoria, tipo, descripcion, urgente, imagenes, estado, proveedor_id, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &conjunto_id, &usuario_id,
                    &str_col(row, "categoria"),
                    &str_col(row, "tipo"),
                    &str_col(row, "descripcion"),
                    &bool_col(row, "urgente"),
                    &imagenes,
                    &str_col(row, "estado"),
                    &proveedor_id,
                    &ts(row, "creadoEn"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("solicitudes insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "solicitudes_servicio",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_recibos_publicos(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    _report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy
        .query(r#"SELECT * FROM "ReciboPublico""#, &[])
        .await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let id = cuid_to_uuid(&str_col(row, "id"));
        let conjunto_id = cuid_to_uuid(&str_col(row, "conjuntoId"));
        let unidad_id = cuid_to_uuid(&str_col(row, "unidadId"));
        if dry_run {
            migrated += 1;
            continue;
        }
        let res = target
            .execute(
                "INSERT INTO recibos_publicos (id, conjunto_id, unidad_id, servicio, empresa, periodo, monto, vencimiento, url_recibo, pagado, fecha_pago, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,CAST($7 AS NUMERIC),$8,$9,$10,$11,$12)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &conjunto_id, &unidad_id,
                    &str_col(row, "servicio"),
                    &str_col(row, "empresa"),
                    &str_col(row, "periodo"),
                    &dec_str(row, "monto"),
                    &ts(row, "vencimiento"),
                    &str_opt(row, "urlRecibo"),
                    &bool_col(row, "pagado"),
                    &ts_opt(row, "fechaPago"),
                    &ts(row, "creadoEn"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("recibos_publicos insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "recibos_publicos",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_ad_spaces(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    _report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy.query(r#"SELECT * FROM "AdSpace""#, &[]).await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let id = cuid_to_uuid(&str_col(row, "id"));
        let conjunto_id = cuid_to_uuid(&str_col(row, "conjuntoId"));
        if dry_run {
            migrated += 1;
            continue;
        }
        let res = target
            .execute(
                "INSERT INTO ad_spaces (id, conjunto_id, nombre, posicion, imagen_url, link_url, activo, empresa, inicio_en, fin_en, impresiones, clics)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &conjunto_id,
                    &str_col(row, "nombre"),
                    &str_col(row, "posicion"),
                    &str_opt(row, "imagenUrl"),
                    &str_opt(row, "linkUrl"),
                    &bool_col(row, "activo"),
                    &str_opt(row, "empresa"),
                    &ts(row, "inicioEn"),
                    &ts(row, "finEn"),
                    &int_col(row, "impresiones"),
                    &int_col(row, "clics"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("ad_spaces insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "ad_spaces",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_inmuebles(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy.query(r#"SELECT * FROM "Inmueble""#, &[]).await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let legacy_id = str_col(row, "id");
        let id = cuid_to_uuid(&legacy_id);
        let conjunto_id = cuid_to_uuid(&str_col(row, "conjuntoId"));
        let usuario_id = cuid_to_uuid(&str_col(row, "usuarioId"));
        let imagenes_raw = str_col(row, "imagenes");
        let imagenes =
            parse_json_or_null(&imagenes_raw, "inmuebles", &legacy_id, "imagenes", report);
        let caract_raw = row
            .try_get::<_, String>("caracteristicas")
            .unwrap_or_else(|_| "[]".to_string());
        let caracteristicas = parse_json_or_null(
            &caract_raw,
            "inmuebles",
            &legacy_id,
            "caracteristicas",
            report,
        );
        if dry_run {
            migrated += 1;
            continue;
        }
        let res = target
            .execute(
                "INSERT INTO inmuebles (id, conjunto_id, usuario_id, titulo, descripcion, precio, tipo_negocio, tipo_unidad, habitaciones, banos, area, imagenes, caracteristicas, estado, destacado, created_at, updated_at)
                 VALUES ($1,$2,$3,$4,$5,CAST($6 AS NUMERIC),$7,$8,$9,$10,CAST($11 AS NUMERIC),$12,$13,$14,$15,$16,$17)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &conjunto_id, &usuario_id,
                    &str_col(row, "titulo"),
                    &str_col(row, "descripcion"),
                    &dec_str(row, "precio"),
                    &str_col(row, "tipoNegocio"),
                    &str_col(row, "tipoUnidad"),
                    &int_col(row, "habitaciones"),
                    &int_col(row, "banos"),
                    &dec_str_opt(row, "area"),
                    &imagenes,
                    &caracteristicas,
                    &str_col(row, "estado"),
                    &bool_col(row, "destacado"),
                    &ts(row, "creadoEn"),
                    &ts(row, "actualizadoEn"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("inmuebles insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "inmuebles",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_chat_admin(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    _report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy.query(r#"SELECT * FROM "ChatAdmin""#, &[]).await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let id = cuid_to_uuid(&str_col(row, "id"));
        let usuario_id = cuid_to_uuid(&str_col(row, "usuarioId"));
        if dry_run {
            migrated += 1;
            continue;
        }
        let conjunto_row = target
            .query_opt(
                "SELECT conjunto_id FROM usuarios WHERE id = $1",
                &[&usuario_id],
            )
            .await?;
        let conjunto_id = match conjunto_row {
            Some(r) => r.get::<_, uuid::Uuid>(0),
            None => {
                skipped += 1;
                continue;
            }
        };
        let res = target
            .execute(
                "INSERT INTO chat_admin (id, conjunto_id, usuario_id, mensaje, audio_url, transcripcion, es_de_admin, leido, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &conjunto_id, &usuario_id,
                    &str_col(row, "mensaje"),
                    &str_opt(row, "audioUrl"),
                    &str_opt(row, "transcripcion"),
                    &bool_col(row, "esDeAdmin"),
                    &bool_col(row, "leido"),
                    &ts(row, "creadoEn"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("chat_admin insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "chat_admin",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_asambleas(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy.query(r#"SELECT * FROM "Asamblea""#, &[]).await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let legacy_id = str_col(row, "id");
        let id = cuid_to_uuid(&legacy_id);
        let conjunto_id = cuid_to_uuid(&str_col(row, "conjuntoId"));
        let orden_raw = str_col(row, "ordenDia");
        let orden_dia = parse_json_or_null(&orden_raw, "asambleas", &legacy_id, "ordenDia", report);
        let session_state = serde_json::json!({}); // new field, default empty
        if dry_run {
            migrated += 1;
            continue;
        }
        let res = target
            .execute(
                "INSERT INTO asambleas (id, conjunto_id, titulo, descripcion, fecha, activa, orden_dia, item_activo_index, session_state, version)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &conjunto_id,
                    &str_col(row, "titulo"),
                    &str_opt(row, "descripcion"),
                    &ts(row, "fecha"),
                    &bool_col(row, "activa"),
                    &orden_dia,
                    &int_col(row, "itemActivoIndex"),
                    &session_state,
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("asambleas insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "asambleas",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_asamblea_turnos(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    _report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy
        .query(r#"SELECT * FROM "AsambleaTurno""#, &[])
        .await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let id = cuid_to_uuid(&str_col(row, "id"));
        let asamblea_id = cuid_to_uuid(&str_col(row, "asambleaId"));
        let usuario_id = cuid_to_uuid(&str_col(row, "usuarioId"));
        if dry_run {
            migrated += 1;
            continue;
        }
        let res = target
            .execute(
                "INSERT INTO asamblea_turnos (id, asamblea_id, usuario_id, nombre, apto, estado, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &asamblea_id, &usuario_id,
                    &str_col(row, "nombre"),
                    &str_opt(row, "apto"),
                    &str_col(row, "estado"),
                    &ts(row, "creadoEn"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("asamblea_turnos insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "asamblea_turnos",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_asamblea_opiniones(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    _report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy
        .query(r#"SELECT * FROM "AsambleaOpinion""#, &[])
        .await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let id = cuid_to_uuid(&str_col(row, "id"));
        let asamblea_id = cuid_to_uuid(&str_col(row, "asambleaId"));
        let usuario_id = cuid_to_uuid(&str_col(row, "usuarioId"));
        if dry_run {
            migrated += 1;
            continue;
        }
        let res = target
            .execute(
                "INSERT INTO asamblea_opiniones (id, asamblea_id, usuario_id, nombre, apto, contenido, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &asamblea_id, &usuario_id,
                    &str_col(row, "nombre"),
                    &str_opt(row, "apto"),
                    &str_col(row, "contenido"),
                    &ts(row, "creadoEn"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("asamblea_opiniones insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "asamblea_opiniones",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_asamblea_pairings(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    _report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy
        .query(r#"SELECT * FROM "AsambleaPairing""#, &[])
        .await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let id = cuid_to_uuid(&str_col(row, "id"));
        let usuario_id = cuid_opt(row.try_get::<_, String>("usuarioId").ok().as_deref());
        // Legacy has no conjuntoId; we derive from the user if available
        // The new schema requires conjunto_id; skip if we can't determine it
        if dry_run {
            migrated += 1;
            continue;
        }
        let conjunto_id = if let Some(uid) = usuario_id {
            match target
                .query_opt("SELECT conjunto_id FROM usuarios WHERE id = $1", &[&uid])
                .await?
            {
                Some(r) => r.get::<_, uuid::Uuid>(0),
                None => {
                    skipped += 1;
                    continue;
                }
            }
        } else {
            skipped += 1;
            continue;
        };
        // Legacy stores plaintext password → hash for pin_hash
        let raw_code = str_col(row, "codigo");
        let pin_hash = hash_password_migration(&raw_code);
        let res = target
            .execute(
                "INSERT INTO asamblea_pairings (id, conjunto_id, usuario_id, pin_hash, estado, expires_at, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &conjunto_id, &usuario_id,
                    &pin_hash,
                    &str_col(row, "estado"),
                    &ts(row, "expiraEn"),
                    &ts(row, "creadoEn"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("asamblea_pairings insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "asamblea_pairings",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_asamblea_asistencias(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    _report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy
        .query(r#"SELECT * FROM "AsambleaAsistencia""#, &[])
        .await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let id = cuid_to_uuid(&str_col(row, "id"));
        let asamblea_id = cuid_to_uuid(&str_col(row, "asambleaId"));
        let usuario_id = cuid_to_uuid(&str_col(row, "usuarioId"));
        if dry_run {
            migrated += 1;
            continue;
        }
        let res = target
            .execute(
                "INSERT INTO asamblea_asistencias (id, asamblea_id, usuario_id, tipo, verificado, ip, dispositivo, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &asamblea_id, &usuario_id,
                    &str_col(row, "tipo"),
                    &bool_col(row, "verificado"),
                    &str_opt(row, "ip"),
                    &str_opt(row, "dispositivo"),
                    &ts(row, "creadoEn"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("asamblea_asistencias insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "asamblea_asistencias",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_asamblea_poderes(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    _report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy
        .query(r#"SELECT * FROM "AsambleaPoder""#, &[])
        .await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let id = cuid_to_uuid(&str_col(row, "id"));
        let asamblea_id = cuid_to_uuid(&str_col(row, "asambleaId"));
        let otorgante_id = cuid_to_uuid(&str_col(row, "otorganteId"));
        let apoderado_id = cuid_to_uuid(&str_col(row, "apoderadoId"));
        if dry_run {
            migrated += 1;
            continue;
        }
        let res = target
            .execute(
                "INSERT INTO asamblea_poderes (id, asamblea_id, otorgante_id, apoderado_id, documento_url, verificado, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &asamblea_id, &otorgante_id, &apoderado_id,
                    &str_col(row, "documentoUrl"),
                    &bool_col(row, "verificado"),
                    &ts(row, "creadoEn"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("asamblea_poderes insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "asamblea_poderes",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_asamblea_votaciones(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy
        .query(r#"SELECT * FROM "AsambleaVotacion""#, &[])
        .await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let legacy_id = str_col(row, "id");
        let id = cuid_to_uuid(&legacy_id);
        let asamblea_id = cuid_to_uuid(&str_col(row, "asambleaId"));
        let opciones_raw = str_col(row, "opciones");
        let opciones = parse_json_or_null(
            &opciones_raw,
            "asamblea_votaciones",
            &legacy_id,
            "opciones",
            report,
        );
        if dry_run {
            migrated += 1;
            continue;
        }
        let res = target
            .execute(
                "INSERT INTO asamblea_votaciones (id, asamblea_id, titulo, descripcion, opciones, activa, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &asamblea_id,
                    &str_col(row, "titulo"),
                    &str_opt(row, "descripcion"),
                    &opciones,
                    &bool_col(row, "activa"),
                    &ts(row, "creadoEn"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("asamblea_votaciones insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "asamblea_votaciones",
        migrated,
        skipped,
        errors,
    })
}

pub async fn migrate_asamblea_votos(
    legacy: &Client,
    target: &Client,
    dry_run: bool,
    _report: &mut Vec<ReportRow>,
) -> Result<MigrateResult> {
    let rows = legacy.query(r#"SELECT * FROM "AsambleaVoto""#, &[]).await?;
    let (mut migrated, mut skipped, mut errors) = (0u64, 0u64, 0u64);
    for row in &rows {
        let id = cuid_to_uuid(&str_col(row, "id"));
        let votacion_id = cuid_to_uuid(&str_col(row, "votacionId"));
        let usuario_id = cuid_to_uuid(&str_col(row, "usuarioId"));
        if dry_run {
            migrated += 1;
            continue;
        }
        let res = target
            .execute(
                "INSERT INTO asamblea_votos (id, votacion_id, usuario_id, unidad_id, respuesta, coeficiente, es_virtual, hash_firma, created_at)
                 VALUES ($1,$2,$3,NULL,$4,CAST($5 AS NUMERIC),$6,$7,$8)
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &id, &votacion_id, &usuario_id,
                    &str_col(row, "respuesta"),
                    &dec_str(row, "coeficiente"),
                    &bool_col(row, "esVirtual"),
                    &str_col(row, "hashFirma"),
                    &ts(row, "creadoEn"),
                ],
            )
            .await;
        match res {
            Ok(1) => migrated += 1,
            Ok(_) => skipped += 1,
            Err(e) => {
                tracing::warn!("asamblea_votos insert error: {e}");
                errors += 1;
            }
        }
    }
    Ok(MigrateResult {
        table: "asamblea_votos",
        migrated,
        skipped,
        errors,
    })
}

// ---------------------------------------------------------------------------
// Password hashing helper (used during migration)
// ---------------------------------------------------------------------------

fn hash_password_migration(password: &str) -> String {
    use argon2::password_hash::SaltString;
    use argon2::{Argon2, PasswordHasher};
    let salt = SaltString::generate(&mut argon2::password_hash::rand_core::OsRng);
    let params = argon2::Params::new(19456, 2, 1, None).expect("valid argon2 params");
    let argon2 = Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);
    argon2
        .hash_password(password.as_bytes(), &salt)
        .expect("password hashing should not fail")
        .to_string()
}
