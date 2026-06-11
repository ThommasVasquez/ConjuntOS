use anyhow::Result;
use argon2::password_hash::SaltString;
use argon2::{Argon2, PasswordHasher};
use tokio_postgres::Client;
use uuid::Uuid;

/// Seed demo data (one conjunto, admin, resident, vigilante).
pub async fn seed_demo(target: &Client) -> Result<()> {
    let conjunto_id = Uuid::new_v4();

    target
        .execute(
            "INSERT INTO conjuntos (id, nombre, subdominio, direccion, ciudad, color_primario, plan, activo, created_at)
             VALUES ($1, 'Conjunto Demo', 'demo', 'Calle 100 # 10-20', 'Bogota', '#1E3A5F', 'BASICO', true, NOW())
             ON CONFLICT DO NOTHING",
            &[&conjunto_id],
        )
        .await?;

    // Admin
    let admin_hash = hash_password("Admin123!")?;
    target
        .execute(
            "INSERT INTO usuarios (id, conjunto_id, nombre, email, password_hash, must_change_password, rol, activo, created_at)
             VALUES (gen_random_uuid(), $1, 'Admin Demo', 'admin@demo.conjuntos.app', $2, false, 'ADMINISTRADOR', true, NOW())
             ON CONFLICT DO NOTHING",
            &[&conjunto_id, &admin_hash],
        )
        .await?;

    // Resident
    let res_hash = hash_password("Residente123!")?;
    target
        .execute(
            "INSERT INTO usuarios (id, conjunto_id, nombre, email, password_hash, must_change_password, rol, torre, apto, activo, created_at)
             VALUES (gen_random_uuid(), $1, 'Residente Demo', 'residente@demo.conjuntos.app', $2, false, 'PROPIETARIO', 'A', '101', true, NOW())
             ON CONFLICT DO NOTHING",
            &[&conjunto_id, &res_hash],
        )
        .await?;

    // Vigilante
    let vig_hash = hash_password("Vigilante123!")?;
    target
        .execute(
            "INSERT INTO usuarios (id, conjunto_id, nombre, email, password_hash, must_change_password, rol, activo, created_at)
             VALUES (gen_random_uuid(), $1, 'Vigilante Demo', 'vigilante@demo.conjuntos.app', $2, false, 'VIGILANTE', true, NOW())
             ON CONFLICT DO NOTHING",
            &[&conjunto_id, &vig_hash],
        )
        .await?;

    tracing::info!("Demo data seeded for conjunto {conjunto_id}");
    Ok(())
}

fn hash_password(password: &str) -> Result<String> {
    let salt = SaltString::generate(&mut argon2::password_hash::rand_core::OsRng);
    let params = argon2::Params::new(19456, 2, 1, None)?;
    let argon2 = Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);
    Ok(argon2
        .hash_password(password.as_bytes(), &salt)?
        .to_string())
}
