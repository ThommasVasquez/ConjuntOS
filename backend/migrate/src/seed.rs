use anyhow::Result;
use argon2::password_hash::SaltString;
use argon2::{Argon2, PasswordHasher};
use tokio_postgres::Client;
use uuid::Uuid;

/// Shared password for every demo account — trivial on purpose for easy testing.
const DEMO_PASSWORD: &str = "123456789";

/// A demo apartment/unit attached to a resident account.
/// (torre, numero, piso, tipo, coeficiente)
type DemoUnidad = (&'static str, &'static str, i32, &'static str, &'static str);

/// A demo user account.
struct DemoUser {
    nombre: &'static str,
    email: &'static str,
    rol: &'static str,
    genero: &'static str,
    telefono: &'static str,
    /// Some(unit) for residents tied to a unidad; None for staff/admin roles.
    unidad: Option<DemoUnidad>,
}

/// One+ demo account per role. Documented in TEST_CREDENTIALS.md — keep in sync.
fn demo_users() -> Vec<DemoUser> {
    vec![
        DemoUser {
            nombre: "Admin Demo",
            email: "admin@demo.conjuntos.app",
            rol: "ADMINISTRADOR",
            genero: "neutro",
            telefono: "+57 300 000 0001",
            unidad: None,
        },
        DemoUser {
            nombre: "Residente Demo",
            email: "residente@demo.conjuntos.app",
            rol: "PROPIETARIO",
            genero: "masculino",
            telefono: "+57 300 000 0002",
            unidad: Some(("A", "101", 1, "APARTAMENTO", "0.012500")),
        },
        DemoUser {
            nombre: "Arrendatario Demo",
            email: "arrendatario@demo.conjuntos.app",
            rol: "ARRENDATARIO",
            genero: "femenino",
            telefono: "+57 300 000 0003",
            unidad: Some(("B", "202", 2, "APARTAMENTO", "0.013750")),
        },
        DemoUser {
            nombre: "Concejo Demo",
            email: "concejo@demo.conjuntos.app",
            rol: "CONCEJO",
            genero: "femenino",
            telefono: "+57 300 000 0004",
            unidad: Some(("A", "301", 3, "APARTAMENTO", "0.015000")),
        },
        DemoUser {
            nombre: "Propietario Casa Demo",
            email: "casa@demo.conjuntos.app",
            rol: "PROPIETARIO",
            genero: "masculino",
            telefono: "+57 300 000 0005",
            unidad: Some(("C", "C-01", 1, "CASA", "0.020000")),
        },
        DemoUser {
            nombre: "Comerciante Local Demo",
            email: "local@demo.conjuntos.app",
            rol: "ARRENDATARIO",
            genero: "neutro",
            telefono: "+57 300 000 0006",
            unidad: Some(("L", "L-05", 0, "LOCAL", "0.008000")),
        },
        DemoUser {
            nombre: "Vigilante Demo",
            email: "vigilante@demo.conjuntos.app",
            rol: "VIGILANTE",
            genero: "masculino",
            telefono: "+57 300 000 0007",
            unidad: None,
        },
        DemoUser {
            nombre: "Supervisor Vigilancia Demo",
            email: "supervisor@demo.conjuntos.app",
            rol: "SUPERVISOR_VIGILANCIA",
            genero: "neutro",
            telefono: "+57 300 000 0008",
            unidad: None,
        },
        DemoUser {
            nombre: "Encargado Parqueadero Demo",
            email: "parqueadero@demo.conjuntos.app",
            rol: "ENCARGADO_PARQUEADERO",
            genero: "neutro",
            telefono: "+57 300 000 0009",
            unidad: None,
        },
        DemoUser {
            nombre: "Super Admin Demo",
            email: "superadmin@demo.conjuntos.app",
            rol: "SUPER_ADMIN",
            genero: "neutro",
            telefono: "+57 300 000 0010",
            unidad: None,
        },
    ]
}

/// Seed demo data: one fully-described conjunto, its unidades, and one+ account
/// per role. Idempotent: re-running upserts the conjunto (keyed on subdominio),
/// reuses existing unidades (keyed on conjunto+torre+numero), and resets every
/// demo account back to the documented password.
pub async fn seed_demo(target: &Client) -> Result<()> {
    // Upsert keyed on the unique subdominio so re-runs reuse the existing
    // conjunto instead of orphaning new users on a never-inserted id. Populate
    // the Ley 675 de 2001 metadata so the demo tenant looks like a real one.
    let row = target
        .query_one(
            "INSERT INTO conjuntos (
                 id, nombre, nit, subdominio, direccion, ciudad, color_primario,
                 plan, activo, representante_legal, notaria_escritura,
                 numero_escritura, matricula_inmobiliaria, total_unidades, created_at
             )
             VALUES (
                 $1, 'Conjunto Demo', '900.123.456-7', 'demo',
                 'Calle 100 # 10-20', 'Bogota', '#1E3A8A',
                 'PREMIUM', true, 'Maria Fernanda Gomez', 'Notaria 15 de Bogota',
                 'ESC-2026-00123', 'MAT-50C-1234567', 6, NOW()
             )
             ON CONFLICT (subdominio) DO UPDATE SET
                 nombre = EXCLUDED.nombre,
                 nit = EXCLUDED.nit,
                 color_primario = EXCLUDED.color_primario,
                 plan = EXCLUDED.plan,
                 representante_legal = EXCLUDED.representante_legal,
                 notaria_escritura = EXCLUDED.notaria_escritura,
                 numero_escritura = EXCLUDED.numero_escritura,
                 matricula_inmobiliaria = EXCLUDED.matricula_inmobiliaria,
                 total_unidades = EXCLUDED.total_unidades
             RETURNING id",
            &[&Uuid::new_v4()],
        )
        .await?;
    let conjunto_id: Uuid = row.get(0);

    for user in demo_users() {
        let hash = hash_password(DEMO_PASSWORD)?;

        // Resolve (or create) the unidad and capture its id + free-text fields.
        let (unidad_id, torre, apto): (Option<Uuid>, Option<&str>, Option<&str>) =
            match &user.unidad {
                Some((torre, numero, piso, tipo, coeficiente)) => {
                    let id =
                        upsert_unidad(target, conjunto_id, numero, torre, *piso, tipo, coeficiente)
                            .await?;
                    (Some(id), Some(*torre), Some(*numero))
                }
                None => (None, None, None),
            };

        // Upsert the password so re-seeding always resets demo accounts to
        // the documented credentials, and links them to their unidad.
        target
            .execute(
                "INSERT INTO usuarios (
                     id, conjunto_id, nombre, email, password_hash,
                     must_change_password, telefono, rol, unidad_id, torre, apto,
                     genero, activo, created_at
                 )
                 VALUES (
                     gen_random_uuid(), $1, $2, $3, $4,
                     false, $5, $6, $7, $8, $9,
                     $10, true, NOW()
                 )
                 ON CONFLICT (email) DO UPDATE SET
                     password_hash = EXCLUDED.password_hash,
                     must_change_password = false,
                     telefono = EXCLUDED.telefono,
                     unidad_id = EXCLUDED.unidad_id,
                     torre = EXCLUDED.torre,
                     apto = EXCLUDED.apto,
                     genero = EXCLUDED.genero,
                     activo = true",
                &[
                    &conjunto_id,
                    &user.nombre,
                    &user.email,
                    &hash,
                    &user.telefono,
                    &user.rol,
                    &unidad_id,
                    &torre,
                    &apto,
                    &user.genero,
                ],
            )
            .await?;
        tracing::info!(email = user.email, rol = user.rol, "seeded demo user");
    }

    tracing::info!("Demo data seeded for conjunto {conjunto_id}");
    Ok(())
}

/// Look up an existing unidad by (conjunto, torre, numero) or insert a new one.
/// `unidades` has no natural unique constraint, so we emulate an upsert with a
/// SELECT-then-INSERT to keep re-seeding idempotent.
async fn upsert_unidad(
    target: &Client,
    conjunto_id: Uuid,
    numero: &str,
    torre: &str,
    piso: i32,
    tipo: &str,
    coeficiente: &str,
) -> Result<Uuid> {
    if let Some(row) = target
        .query_opt(
            "SELECT id FROM unidades
             WHERE conjunto_id = $1 AND torre = $2 AND numero = $3",
            &[&conjunto_id, &torre, &numero],
        )
        .await?
    {
        return Ok(row.get(0));
    }

    let row = target
        .query_one(
            "INSERT INTO unidades (id, conjunto_id, numero, torre, piso, tipo, coeficiente)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6::numeric)
             RETURNING id",
            &[&conjunto_id, &numero, &torre, &piso, &tipo, &coeficiente],
        )
        .await?;
    Ok(row.get(0))
}

fn hash_password(password: &str) -> Result<String> {
    let salt = SaltString::generate(&mut argon2::password_hash::rand_core::OsRng);
    let params = argon2::Params::new(19456, 2, 1, None)?;
    let argon2 = Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);
    Ok(argon2
        .hash_password(password.as_bytes(), &salt)?
        .to_string())
}
