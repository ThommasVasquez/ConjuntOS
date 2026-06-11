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
    let app = build_router(state);

    let listener = tokio::net::TcpListener::bind((Ipv4Addr::UNSPECIFIED, port)).await?;
    tracing::info!("enconjunto-api listening on {}", listener.local_addr()?);
    axum::serve(listener, app).await?;
    Ok(())
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
