pub mod enums;
#[rustfmt::skip]
pub mod schema;

use diesel::ConnectionError;
use diesel_async::pooled_connection::deadpool::Pool;
use diesel_async::pooled_connection::{AsyncDieselConnectionManager, ManagerConfig};
use diesel_async::AsyncPgConnection;
use futures_util::future::BoxFuture;
use futures_util::FutureExt;

pub type DbPool = Pool<AsyncPgConnection>;
pub type DbConn = diesel_async::pooled_connection::deadpool::Object<AsyncPgConnection>;

/// Build the connection pool. Connections go through rustls because Supabase
/// requires TLS and the runtime image carries no libpq/openssl.
pub fn init_pool(database_url: &str, max_size: usize) -> anyhow::Result<DbPool> {
    // Idempotent; errors only if another provider was already installed, which is fine.
    let _ = rustls::crypto::ring::default_provider().install_default();

    let mut manager_config = ManagerConfig::default();
    manager_config.custom_setup = Box::new(establish_tls_connection);
    let manager = AsyncDieselConnectionManager::<AsyncPgConnection>::new_with_config(
        database_url,
        manager_config,
    );
    Pool::builder(manager)
        .max_size(max_size)
        .build()
        .map_err(anyhow::Error::new)
}

fn establish_tls_connection(
    url: &str,
) -> BoxFuture<'_, Result<AsyncPgConnection, ConnectionError>> {
    async move {
        let mut roots = rustls::RootCertStore::empty();
        roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
        let tls_config = rustls::ClientConfig::builder()
            .with_root_certificates(roots)
            .with_no_client_auth();
        let tls = tokio_postgres_rustls::MakeRustlsConnect::new(tls_config);

        let (client, connection) = tokio_postgres::connect(url, tls)
            .await
            .map_err(|e| ConnectionError::BadConnection(e.to_string()))?;
        AsyncPgConnection::try_from_client_and_connection(client, connection).await
    }
    .boxed()
}

pub const MIGRATIONS: diesel_migrations::EmbeddedMigrations =
    diesel_migrations::embed_migrations!("../migrations");

/// Run pending Diesel migrations over an async (TLS) connection. Used at startup
/// behind RUN_MIGRATIONS=true and by integration tests.
pub async fn run_pending_migrations(database_url: &str) -> anyhow::Result<()> {
    use diesel_async::async_connection_wrapper::AsyncConnectionWrapper;
    use diesel_migrations::MigrationHarness;

    let conn = establish_tls_connection(database_url)
        .await
        .map_err(|e| anyhow::anyhow!("migration connection failed: {e}"))?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
        let mut wrapper: AsyncConnectionWrapper<AsyncPgConnection> =
            AsyncConnectionWrapper::from(conn);
        let applied = wrapper
            .run_pending_migrations(MIGRATIONS)
            .map_err(|e| anyhow::anyhow!("running migrations failed: {e}"))?;
        for version in applied {
            tracing::info!(%version, "applied migration");
        }
        Ok(())
    })
    .await??;
    Ok(())
}

/// Cheap liveness probe used by /healthz.
pub async fn ping(pool: &DbPool) -> anyhow::Result<()> {
    use diesel_async::RunQueryDsl;

    let mut conn = tokio::time::timeout(std::time::Duration::from_secs(3), pool.get())
        .await
        .map_err(|_| anyhow::anyhow!("timed out acquiring a database connection"))??;
    diesel::sql_query("SELECT 1").execute(&mut conn).await?;
    Ok(())
}
