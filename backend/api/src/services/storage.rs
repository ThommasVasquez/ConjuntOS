use std::sync::Arc;

use crate::config::Config;

/// Trait for uploading blobs to object storage.
pub trait StorageService: Send + Sync {
    fn upload(
        &self,
        bucket: &str,
        path: &str,
        data: &[u8],
        content_type: &str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = anyhow::Result<String>> + Send + '_>>;
}

/// S3-compatible storage (MinIO / AWS S3 / DigitalOcean Spaces).
pub struct S3Storage {
    bucket: s3::Bucket,
    public_url: String,
}

impl S3Storage {
    pub fn new(
        endpoint: &str,
        region: &str,
        bucket_name: &str,
        access_key: &str,
        secret_key: &str,
        public_url: &str,
    ) -> anyhow::Result<Self> {
        let region = s3::Region::Custom {
            region: region.to_string(),
            endpoint: endpoint.to_string(),
        };
        let credentials =
            s3::creds::Credentials::new(Some(access_key), Some(secret_key), None, None, None)?;

        let mut bucket = *s3::Bucket::new(bucket_name, region, credentials)?;
        bucket.set_path_style();

        Ok(Self {
            bucket,
            public_url: public_url.trim_end_matches('/').to_string(),
        })
    }
}

impl StorageService for S3Storage {
    fn upload(
        &self,
        _bucket: &str,
        path: &str,
        data: &[u8],
        content_type: &str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = anyhow::Result<String>> + Send + '_>>
    {
        let path = path.to_string();
        let data = data.to_vec();
        let content_type = content_type.to_string();
        let public_url = format!("{}/{}", self.public_url, path);

        Box::pin(async move {
            let resp = self
                .bucket
                .put_object_with_content_type(&path, &data, &content_type)
                .await?;

            if resp.status_code() >= 300 {
                anyhow::bail!(
                    "S3 upload failed ({}): {}",
                    resp.status_code(),
                    String::from_utf8_lossy(resp.as_slice())
                );
            }

            tracing::info!("S3: uploaded {} bytes -> {}", data.len(), public_url);
            Ok(public_url)
        })
    }
}

/// Fallback when object storage (MinIO/S3) is unconfigured or failed to init.
/// There is intentionally NO fake/in-memory storage: per constitution Law 4 an
/// upload must never fabricate a success. Uploads fail loudly so callers return
/// 5xx instead of persisting a dangling URL to the DB.
pub struct UnconfiguredStorage;

impl StorageService for UnconfiguredStorage {
    fn upload(
        &self,
        _bucket: &str,
        _path: &str,
        _data: &[u8],
        _content_type: &str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = anyhow::Result<String>> + Send + '_>>
    {
        Box::pin(async move {
            anyhow::bail!("object storage is not configured (set S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY/S3_SECRET_KEY)")
        })
    }
}

/// Returns `S3Storage` when S3 is configured, otherwise `UnconfiguredStorage`
/// (uploads fail loudly — Law 4, no silent mock fallback in production).
pub fn create_storage_service(config: &Config) -> Arc<dyn StorageService> {
    if let (Some(endpoint), Some(bucket), Some(access_key), Some(secret_key)) = (
        &config.s3_endpoint,
        &config.s3_bucket,
        &config.s3_access_key,
        &config.s3_secret_key,
    ) {
        let region = config.s3_region.as_deref().unwrap_or("us-east-1");
        let public_url = config
            .s3_public_url
            .clone()
            .unwrap_or_else(|| format!("{}/{}", endpoint.trim_end_matches('/'), bucket));

        match S3Storage::new(
            endpoint,
            region,
            bucket,
            access_key,
            secret_key,
            &public_url,
        ) {
            Ok(s3) => {
                tracing::info!("storage: MinIO/S3 at {endpoint} bucket={bucket}");
                return Arc::new(s3);
            }
            Err(e) => {
                tracing::error!("S3 init failed: {e}");
            }
        }
    }

    tracing::warn!(
        "storage: S3 not configured — uploads will return an error (set S3_ENDPOINT to enable)"
    );
    Arc::new(UnconfiguredStorage)
}
