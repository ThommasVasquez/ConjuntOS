use anyhow::Result;
use tokio_postgres::Client;

/// Connect to a PostgreSQL database, trying TLS first and falling back to plain.
pub async fn connect(url: &str) -> Result<Client> {
    match try_tls_connect(url).await {
        Ok(client) => Ok(client),
        Err(_) => {
            let (client, connection) = tokio_postgres::connect(url, tokio_postgres::NoTls).await?;
            tokio::spawn(async move {
                if let Err(e) = connection.await {
                    tracing::error!("DB connection error: {e}");
                }
            });
            Ok(client)
        }
    }
}

async fn try_tls_connect(url: &str) -> Result<Client> {
    let mut roots = rustls::RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    let config = rustls::ClientConfig::builder()
        .with_root_certificates(roots)
        .with_no_client_auth();
    let tls = tokio_postgres_rustls::MakeRustlsConnect::new(config);
    let (client, connection) = tokio_postgres::connect(url, tls).await?;
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            tracing::error!("DB connection error: {e}");
        }
    });
    Ok(client)
}
