use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::{Algorithm, Argon2, Params, Version};

use crate::error::{ApiError, ApiResult};

/// Argon2id with OWASP-recommended parameters (specs/constitution.md Law 3).
fn hasher() -> Argon2<'static> {
    let params = Params::new(19_456, 2, 1, None).expect("valid argon2 params");
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
}

pub fn hash_password(plain: &str) -> ApiResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    hasher()
        .hash_password(plain.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("password hashing failed: {e}")))
}

pub fn verify_password(plain: &str, hash: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(hash) else {
        // Unusable hash (e.g. migrated user flagged must_change_password).
        return false;
    };
    hasher().verify_password(plain.as_bytes(), &parsed).is_ok()
}

/// CPU-bound Argon2 work runs off the async executor.
pub async fn hash_password_blocking(plain: String) -> ApiResult<String> {
    tokio::task::spawn_blocking(move || hash_password(&plain))
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!(e)))?
}

pub async fn verify_password_blocking(plain: String, hash: String) -> ApiResult<bool> {
    tokio::task::spawn_blocking(move || verify_password(&plain, &hash))
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!(e)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_and_verify_round_trip() {
        let hash = hash_password("hunter2!").unwrap();
        assert!(hash.starts_with("$argon2id$"));
        assert!(verify_password("hunter2!", &hash));
        assert!(!verify_password("wrong", &hash));
    }

    #[test]
    fn garbage_hash_never_verifies() {
        assert!(!verify_password("anything", "not-a-hash"));
        assert!(!verify_password("anything", ""));
    }
}
