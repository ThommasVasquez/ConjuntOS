use std::env;

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("missing required environment variable {0}")]
    Missing(&'static str),
    #[error("invalid value for {0}: {1}")]
    Invalid(&'static str, String),
    #[error(
        "DATABASE_URL points at the Supabase transaction pooler (port 6543), which breaks \
         prepared statements. Use the session pooler (port 5432) instead. See \
         specs/constitution.md Law 6."
    )]
    TransactionPooler,
}

#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    pub database_url: String,
    /// Direct (non-pooled) connection for DDL; falls back to `database_url`.
    pub migrations_database_url: Option<String>,
    pub db_pool_size: usize,
    pub jwt_secret: String,
    pub allowed_origins: Vec<String>,
    pub run_migrations: bool,
    pub gemini_api_key: Option<String>,
    pub vapid_public_key: Option<String>,
    pub vapid_private_key: Option<String>,
    pub vapid_subject: Option<String>,
    /// S3-compatible storage (MinIO / AWS S3).
    pub s3_endpoint: Option<String>,
    pub s3_region: Option<String>,
    pub s3_bucket: Option<String>,
    pub s3_access_key: Option<String>,
    pub s3_secret_key: Option<String>,
    /// Public base URL for serving S3 objects (e.g. http://localhost:9000/enconjunto).
    pub s3_public_url: Option<String>,
    /// `SameSite=None` is needed while the frontend lives on pages.dev (cross-site).
    pub cookie_cross_site: bool,
    /// Optional cookie `Domain` attribute (e.g. `.conjuntos.app`) so the session
    /// cookie is shared across subdomains (api.* sets it, app.* reads it).
    pub cookie_domain: Option<String>,
    /// Emails allowed to switch their own role at runtime (tester accounts).
    /// Lowercased. Empty = nobody can switch (feature off).
    pub tester_emails: Vec<String>,
    /// LiveKit server configuration for video rooms.
    pub livekit_api_key: Option<String>,
    pub livekit_api_secret: Option<String>,
    pub livekit_url: Option<String>,
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        let database_url = require("DATABASE_URL")?;
        validate_not_transaction_pooler(&database_url)?;

        let port = match env::var("PORT") {
            Ok(v) => v
                .parse::<u16>()
                .map_err(|e| ConfigError::Invalid("PORT", e.to_string()))?,
            Err(_) => 8080,
        };

        let db_pool_size = match env::var("DB_POOL_SIZE") {
            Ok(v) => v
                .parse::<usize>()
                .map_err(|e| ConfigError::Invalid("DB_POOL_SIZE", e.to_string()))?,
            Err(_) => 10,
        };

        Ok(Self {
            port,
            database_url,
            migrations_database_url: env::var("MIGRATIONS_DATABASE_URL")
                .ok()
                .filter(|v| !v.is_empty()),
            db_pool_size,
            jwt_secret: require("JWT_SECRET")?,
            allowed_origins: parse_origins(&env::var("ALLOWED_ORIGINS").unwrap_or_default()),
            run_migrations: env::var("RUN_MIGRATIONS").is_ok_and(|v| v == "true" || v == "1"),
            gemini_api_key: env::var("GEMINI_API_KEY").ok(),
            vapid_public_key: env::var("VAPID_PUBLIC_KEY").ok(),
            vapid_private_key: env::var("VAPID_PRIVATE_KEY").ok(),
            vapid_subject: env::var("VAPID_SUBJECT").ok(),
            s3_endpoint: env::var("S3_ENDPOINT").ok().filter(|v| !v.is_empty()),
            s3_region: env::var("S3_REGION").ok().filter(|v| !v.is_empty()),
            s3_bucket: env::var("S3_BUCKET").ok().filter(|v| !v.is_empty()),
            s3_access_key: env::var("S3_ACCESS_KEY").ok().filter(|v| !v.is_empty()),
            s3_secret_key: env::var("S3_SECRET_KEY").ok().filter(|v| !v.is_empty()),
            s3_public_url: env::var("S3_PUBLIC_URL").ok().filter(|v| !v.is_empty()),
            cookie_cross_site: env::var("COOKIE_CROSS_SITE").is_ok_and(|v| v == "true" || v == "1"),
            cookie_domain: env::var("COOKIE_DOMAIN").ok().filter(|v| !v.is_empty()),
            tester_emails: parse_tester_emails(&env::var("TESTER_EMAILS").unwrap_or_default()),
            livekit_api_key: env::var("LIVEKIT_API_KEY").ok().filter(|v| !v.is_empty()),
            livekit_api_secret: env::var("LIVEKIT_API_SECRET")
                .ok()
                .filter(|v| !v.is_empty()),
            livekit_url: env::var("LIVEKIT_URL").ok().filter(|v| !v.is_empty()),
        })
    }
}

fn require(name: &'static str) -> Result<String, ConfigError> {
    env::var(name)
        .ok()
        .filter(|v| !v.is_empty())
        .ok_or(ConfigError::Missing(name))
}

fn validate_not_transaction_pooler(url: &str) -> Result<(), ConfigError> {
    if url.contains(":6543") {
        return Err(ConfigError::TransactionPooler);
    }
    Ok(())
}

fn parse_origins(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.trim_end_matches('/').to_string())
        .collect()
}

/// Tester emails are comma-separated and compared case-insensitively, so we
/// store them lowercased and trimmed.
fn parse_tester_emails(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_lowercase())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_transaction_pooler_port() {
        let url = "postgresql://user:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
        assert!(matches!(
            validate_not_transaction_pooler(url),
            Err(ConfigError::TransactionPooler)
        ));
    }

    #[test]
    fn accepts_session_pooler_and_direct() {
        for url in [
            "postgresql://user:pass@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
            "postgresql://user:pass@db.abc.supabase.co:5432/postgres",
            "postgresql://localhost/enconjunto_test",
        ] {
            assert!(validate_not_transaction_pooler(url).is_ok());
        }
    }

    #[test]
    fn parses_origin_list() {
        let origins = parse_origins("https://app.example.com, https://en-conjunto.pages.dev/ ,");
        assert_eq!(
            origins,
            vec![
                "https://app.example.com".to_string(),
                "https://en-conjunto.pages.dev".to_string(),
            ]
        );
    }
}
