mod db;
mod idmap;
mod report;
mod seed;
mod steps;
mod verify;

use clap::Parser;
use std::path::PathBuf;

/// One-time data migration from the legacy Prisma (PascalCase, cuid) tables to the
/// new snake_case/UUID schema. See specs/014-data-migration/spec.md.
#[derive(Parser, Debug)]
#[command(name = "enconjunto-migrate", version)]
struct Args {
    /// Parse and validate only; write nothing.
    #[arg(long)]
    dry_run: bool,

    /// Migrate a single table (re-runnable; inserts use ON CONFLICT DO NOTHING).
    #[arg(long)]
    phase: Option<String>,

    /// Compare row counts and spot-check field equality between old and new tables.
    #[arg(long)]
    verify: bool,

    /// Write a CSV report of rows whose legacy JSON columns failed to parse.
    #[arg(long)]
    report: Option<PathBuf>,

    /// Seed demo users/data (replaces the legacy hardcoded demo users and seed routes).
    #[arg(long)]
    seed_demo: bool,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();
    let args = Args::parse();

    let target_url = std::env::var("MIGRATIONS_DATABASE_URL")
        .or_else(|_| std::env::var("DATABASE_URL"))
        .expect("MIGRATIONS_DATABASE_URL or DATABASE_URL required");

    // --seed-demo only needs the target DB, not legacy.
    if args.seed_demo {
        let target = db::connect(&target_url).await?;
        seed::seed_demo(&target).await?;
        return Ok(());
    }

    let legacy_url = std::env::var("LEGACY_DATABASE_URL").expect("LEGACY_DATABASE_URL required");
    let legacy = db::connect(&legacy_url).await?;
    let target = db::connect(&target_url).await?;

    if args.verify {
        let mismatches = verify::verify(&legacy, &target).await?;
        if mismatches.is_empty() {
            tracing::info!("All row counts match");
        } else {
            for (table, legacy_count, target_count) in &mismatches {
                tracing::warn!("{table}: legacy={legacy_count} target={target_count}");
            }
        }
        return Ok(());
    }

    let mut report_rows = vec![];
    let dry = args.dry_run;

    let results = steps::run_all(
        &legacy,
        &target,
        dry,
        args.phase.as_deref(),
        &mut report_rows,
    )
    .await?;

    for r in &results {
        tracing::info!(
            "{}: migrated={} skipped={} errors={}",
            r.table,
            r.migrated,
            r.skipped,
            r.errors
        );
    }

    if let Some(path) = args.report {
        report::write_report(&path, &report_rows)?;
        tracing::info!("Report written to {}", path.display());
    }

    Ok(())
}
