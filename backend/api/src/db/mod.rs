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

        if let Ok((client, connection)) = tokio_postgres::connect(url, tls).await {
            return AsyncPgConnection::try_from_client_and_connection(client, connection).await;
        }

        match tokio_postgres::connect(url, tokio_postgres::NoTls).await {
            Ok((client, connection)) => {
                AsyncPgConnection::try_from_client_and_connection(client, connection).await
            }
            Err(e) => {
                let msg = if let Some(db_err) = e.as_db_error() {
                    format!(
                        "DB FATAL [code={}]: {} ({:?})",
                        db_err.code().code(),
                        db_err.message(),
                        db_err.detail()
                    )
                } else {
                    e.to_string()
                };
                Err(ConnectionError::BadConnection(msg))
            }
        }
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

    let conn = match establish_tls_connection(database_url).await {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("Migration connection error detail: {:?}", e);
            return Err(anyhow::anyhow!("migration connection failed: {:?}", e));
        }
    };
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

/// Ensure that Erika user exists in production database with correct password.
pub async fn ensure_erika_user(database_url: &str) -> anyhow::Result<()> {
    use diesel::prelude::*;
    use diesel_async::RunQueryDsl;

    let mut conn = establish_tls_connection(database_url)
        .await
        .map_err(|e| anyhow::anyhow!("ensure_erika_user connection failed: {e}"))?;

    // Check if erika@conjuntos.app exists
    let count: i64 = schema::usuarios::table
        .filter(schema::usuarios::email.eq("erika@conjuntos.app"))
        .count()
        .get_result(&mut conn)
        .await?;
    let exists = count > 0;

    let brisas_id: Option<uuid::Uuid> = schema::conjuntos::table
        .filter(schema::conjuntos::subdominio.eq("lasbrisasph"))
        .select(schema::conjuntos::id)
        .first(&mut conn)
        .await
        .optional()?;

    let first_conjunto = match brisas_id {
        Some(id) => Some(id),
        None => schema::conjuntos::table.select(schema::conjuntos::id).first(&mut conn).await.optional()?,
    };

    let password_hash = crate::auth::password::hash_password("Md5891129Ae$")
        .map_err(|e| anyhow::anyhow!("password hashing failed: {e}"))?;

    if !exists {
        if let Some(conj_id) = first_conjunto {
            let numero_interno = format!("{:04}", (uuid::Uuid::new_v4().as_u128() % 10000) as u16);

            diesel::insert_into(schema::usuarios::table)
                .values((
                    schema::usuarios::conjunto_id.eq(conj_id),
                    schema::usuarios::nombre.eq("Erika"),
                    schema::usuarios::email.eq("erika@conjuntos.app"),
                    schema::usuarios::password_hash.eq(password_hash),
                    schema::usuarios::must_change_password.eq(false),
                    schema::usuarios::rol.eq("ADMINISTRADOR"),
                    schema::usuarios::activo.eq(true),
                    schema::usuarios::numero_interno.eq(numero_interno),
                ))
                .execute(&mut conn)
                .await?;

            tracing::info!("Startup hook: Created Erika administrator user");
        } else {
            tracing::warn!("Startup hook: Erika user could not be created because no conjuntos exist in the database.");
        }
    } else {
        if let Some(conj_id) = first_conjunto {
            diesel::update(schema::usuarios::table.filter(schema::usuarios::email.eq("erika@conjuntos.app")))
                .set((
                    schema::usuarios::conjunto_id.eq(conj_id),
                    schema::usuarios::password_hash.eq(password_hash),
                    schema::usuarios::rol.eq("ADMINISTRADOR"),
                    schema::usuarios::activo.eq(true),
                ))
                .execute(&mut conn)
                .await?;
        }

        tracing::info!("Startup hook: Updated Erika administrator user for Las Brisas");
    }

    Ok(())
}

/// Ensure that EnergySoft Media user exists in production database with correct password and admin role in Las Brisas.
pub async fn ensure_energysoftmedia_user(database_url: &str) -> anyhow::Result<()> {
    use diesel::prelude::*;
    use diesel_async::RunQueryDsl;

    let mut conn = establish_tls_connection(database_url)
        .await
        .map_err(|e| anyhow::anyhow!("ensure_energysoftmedia_user connection failed: {e}"))?;

    let brisas_id: Option<uuid::Uuid> = schema::conjuntos::table
        .filter(schema::conjuntos::subdominio.eq("lasbrisasph"))
        .select(schema::conjuntos::id)
        .first(&mut conn)
        .await
        .optional()?;

    let conjunto_id = match brisas_id {
        Some(id) => id,
        None => {
            schema::conjuntos::table
                .select(schema::conjuntos::id)
                .first(&mut conn)
                .await?
        }
    };

    let count: i64 = schema::usuarios::table
        .filter(schema::usuarios::email.eq("energysoftmedia@gmail.com"))
        .count()
        .get_result(&mut conn)
        .await?;
    let exists = count > 0;

    let password_hash = crate::auth::password::hash_password("Md5891129Ae$")
        .map_err(|e| anyhow::anyhow!("password hashing failed: {e}"))?;

    if !exists {
        let numero_interno = format!("{:04}", (uuid::Uuid::new_v4().as_u128() % 10000) as u16);

        diesel::insert_into(schema::usuarios::table)
            .values((
                schema::usuarios::conjunto_id.eq(conjunto_id),
                schema::usuarios::nombre.eq("EnergySoft Media"),
                schema::usuarios::email.eq("energysoftmedia@gmail.com"),
                schema::usuarios::password_hash.eq(password_hash),
                schema::usuarios::must_change_password.eq(false),
                schema::usuarios::rol.eq("ADMINISTRADOR"),
                schema::usuarios::activo.eq(true),
                schema::usuarios::numero_interno.eq(numero_interno),
            ))
            .execute(&mut conn)
            .await?;

        tracing::info!("Startup hook: Created EnergySoft Media administrator user in Las Brisas");
    } else {
        diesel::update(schema::usuarios::table.filter(schema::usuarios::email.eq("energysoftmedia@gmail.com")))
            .set((
                schema::usuarios::conjunto_id.eq(conjunto_id),
                schema::usuarios::password_hash.eq(password_hash),
                schema::usuarios::rol.eq("ADMINISTRADOR"),
                schema::usuarios::activo.eq(true),
                schema::usuarios::must_change_password.eq(false),
                schema::usuarios::torre.eq(None::<String>),
                schema::usuarios::apto.eq(None::<String>),
                schema::usuarios::unidad_id.eq(None::<uuid::Uuid>),
            ))
            .execute(&mut conn)
            .await?;

        tracing::info!("Startup hook: Updated EnergySoft Media admin user for Las Brisas");
    }

    Ok(())
}
