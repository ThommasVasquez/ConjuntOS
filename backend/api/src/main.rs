use std::net::Ipv4Addr;

use enconjunto_api::config::Config;
use enconjunto_api::state::AppState;
use enconjunto_api::{build_router, db};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    init_tracing();

    let config = Config::from_env()?;
    let pool = db::init_pool(&config.database_url, config.db_pool_size)?;

    if config.run_migrations {
        let url = config
            .migrations_database_url
            .as_deref()
            .unwrap_or(&config.database_url);
        db::run_pending_migrations(url).await?;
    }

    let port = config.port;
    let state = AppState::new(config, pool);

    // Scheduler de cobros de parqueadero de visitante (avisos 20 min + inicio cobro).
    enconjunto_api::domains::parqueadero::sesiones::spawn_scheduler(state.clone());

    // Scheduler de expiración de pases temporales (desactiva usuarios huésped cada 30 min).
    enconjunto_api::domains::pases_temporales::spawn_scheduler(state.clone());

    // Scheduler de recordatorios de vencimiento (documentos de vehículo, vacunas de
    // mascotas, …). Sin fuentes registradas aún → no-op hasta F6/F7.
    enconjunto_api::services::reminders::spawn_scheduler(state.clone());

    let app = build_router(state);

    let listener = tokio::net::TcpListener::bind((Ipv4Addr::UNSPECIFIED, port)).await?;
    tracing::info!("enconjunto-api listening on {}", listener.local_addr()?);
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

/// Resolves on SIGTERM (containers) or Ctrl-C so axum can drain in-flight
/// requests and close DB connections cleanly instead of dropping them.
async fn shutdown_signal() {
    use tokio::signal;

    let ctrl_c = async {
        let _ = signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        match signal::unix::signal(signal::unix::SignalKind::terminate()) {
            Ok(mut s) => {
                s.recv().await;
            }
            Err(e) => tracing::error!("failed to install SIGTERM handler: {e}"),
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    tracing::info!("shutdown signal received — draining connections");
}

fn init_tracing() {
    use tracing_subscriber::{fmt, EnvFilter};

    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    if std::env::var("LOG_FORMAT").is_ok_and(|v| v == "json") {
        fmt().with_env_filter(filter).json().init();
    } else {
        fmt().with_env_filter(filter).init();
    }
}
