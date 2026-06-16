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

    for (idx, user) in demo_users().into_iter().enumerate() {
        let hash = hash_password(DEMO_PASSWORD)?;
        // Immutable internal dial code, 0001, 0002, ... (kept on re-seed).
        let numero_interno = format!("{:04}", idx + 1);

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
                     genero, activo, created_at, numero_interno
                 )
                 VALUES (
                     gen_random_uuid(), $1, $2, $3, $4,
                     false, $5, $6, $7, $8, $9,
                     $10, true, NOW(), $11
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
                    &numero_interno,
                ],
            )
            .await?;
        tracing::info!(email = user.email, rol = user.rol, "seeded demo user");
    }

    // Citofonía: ensure EVERY user in EVERY conjunto has an internal dial number.
    // Idempotent — only fills users missing one, assigning the next free per-conjunto
    // 4-digit code (immutable once set). Existing numbers are never changed.
    let assigned = target
        .execute(
            "WITH missing AS (
                 SELECT id, conjunto_id,
                        ROW_NUMBER() OVER (PARTITION BY conjunto_id ORDER BY created_at, id) AS rn
                 FROM usuarios
                 WHERE numero_interno IS NULL OR length(numero_interno) = 0
             ),
             maxn AS (
                 SELECT conjunto_id,
                        COALESCE(MAX(CASE WHEN numero_interno ~ '^[0-9]+$'
                                          THEN numero_interno::int ELSE 0 END), 0) AS m
                 FROM usuarios
                 GROUP BY conjunto_id
             )
             UPDATE usuarios u
             SET numero_interno = LPAD((mx.m + ms.rn)::text, 4, '0')
             FROM missing ms
             JOIN maxn mx ON mx.conjunto_id = ms.conjunto_id
             WHERE u.id = ms.id",
            &[],
        )
        .await?;
    tracing::info!(assigned, "citofonía: ensured internal numbers across all conjuntos");

    // Populate the resident-facing content layer (novedades, mascotas, pagos,
    // reservas, etc.) so the demo app is not empty on first login.
    seed_content(target, conjunto_id).await?;

    tracing::info!("Demo data seeded for conjunto {conjunto_id}");
    Ok(())
}

/// Email of the primary resident whose dashboard the demo showcases.
const RESIDENTE: &str = "residente@demo.conjuntos.app";
const ARRENDATARIO: &str = "arrendatario@demo.conjuntos.app";
const CASA: &str = "casa@demo.conjuntos.app";
const VIGILANTE: &str = "vigilante@demo.conjuntos.app";

// Tuple aliases for the demo content rows (keeps clippy::type_complexity happy).
/// (titulo, contenido, tipo, fijado, days_ago)
type AnuncioRow = (&'static str, &'static str, &'static str, bool, i32);
/// (email, concepto, monto, estado, metodo, fecha_venc_offset_days)
type PagoRow = (
    &'static str,
    &'static str,
    &'static str,
    &'static str,
    Option<&'static str>,
    i32,
);
/// (nombre, descripcion, cap, requiere_deposito, deposito_monto, apertura, cierre, dias, slot_min)
type AreaRow = (
    &'static str,
    &'static str,
    i32,
    bool,
    Option<&'static str>,
    &'static str,
    &'static str,
    &'static str,
    i32,
);
/// (email, nombre, tipo, vehiculo_tipo, placa, tiene_parqueadero, day_offset)
type VisitaRow = (
    &'static str,
    &'static str,
    &'static str,
    Option<&'static str>,
    Option<&'static str>,
    bool,
    i32,
);

/// Seed the full resident-facing content set for the demo conjunto. Idempotent:
/// every content table is cleared (scoped to this conjunto) and re-inserted, so
/// a re-seed always restores a known, fully-populated state. Users and unidades
/// are NOT touched here (handled by seed_demo).
async fn seed_content(target: &Client, conjunto_id: Uuid) -> Result<()> {
    // 1) Clear existing demo content in FK-safe order (children first).
    for table in [
        // Parking sessions reference pagos (pago_id) — clear before pagos.
        "sesiones_parqueadero",
        "reservas",
        "areas_comunes",
        "pagos",
        "recibos_publicos",
        "gastos",
        "mascotas",
        "vehiculos",
        "visitas",
        "paquetes",
        "notificaciones",
        "anuncios",
        "documentos",
    ] {
        target
            .execute(
                &format!("DELETE FROM {table} WHERE conjunto_id = $1"),
                &[&conjunto_id],
            )
            .await?;
    }

    // 2) Anuncios / Novedades — conjunto-wide, varied tipos, one pinned.
    let anuncios: &[AnuncioRow] = &[
        (
            "Asamblea General Ordinaria 2026",
            "Convocatoria a la Asamblea General Ordinaria el 28 de junio a las 9:00 AM en el salón social. Se tratará el presupuesto anual y la elección del nuevo consejo. Quórum requerido: 50%+1.",
            "EVENTO",
            true,
            2,
        ),
        (
            "Corte de agua programado",
            "El próximo martes 16 de junio habrá suspensión del servicio de agua de 8:00 AM a 2:00 PM por mantenimiento del tanque subterráneo. Por favor almacenar agua con anticipación.",
            "MANTENIMIENTO",
            true,
            1,
        ),
        (
            "Nueva jornada de reciclaje",
            "Iniciamos la jornada de reciclaje los sábados. Punto de acopio en el sótano 1, junto a la portería. Separa vidrio, papel y plástico. ¡Cuidemos nuestro conjunto!",
            "GENERAL",
            false,
            3,
        ),
        (
            "Mantenimiento de ascensores torre A",
            "Los ascensores de la torre A estarán fuera de servicio el jueves 18 de junio entre 7:00 AM y 11:00 AM. Agradecemos su comprensión.",
            "MANTENIMIENTO",
            false,
            5,
        ),
        (
            "Fiesta de integración familiar",
            "Te invitamos a la fiesta de integración el domingo 22 de junio desde las 3:00 PM en la zona BBQ. Habrá actividades para niños, música y refrigerios. ¡No faltes!",
            "EVENTO",
            false,
            7,
        ),
        (
            "Recordatorio: pago de administración",
            "Recuerda que la cuota de administración vence el día 10 de cada mes. Realiza tu pago a tiempo para evitar intereses de mora. Puedes pagar desde la app en la sección Pagos.",
            "GENERAL",
            false,
            9,
        ),
    ];
    for (titulo, contenido, tipo, fijado, days_ago) in anuncios {
        target
            .execute(
                "INSERT INTO anuncios (id, conjunto_id, titulo, contenido, tipo, fijado, publicado_en, vistas)
                 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW() - ($6 || ' days')::interval, $7)",
                &[
                    &conjunto_id,
                    titulo,
                    contenido,
                    tipo,
                    fijado,
                    &days_ago.to_string(),
                    &(30 + days_ago * 7),
                ],
            )
            .await?;
    }

    // 3) Mascotas — per resident.
    let mascotas: &[(&str, &str, &str, &str)] = &[
        (RESIDENTE, "Max", "PERRO", "Golden Retriever"),
        (RESIDENTE, "Michi", "GATO", "Siamés"),
        (ARRENDATARIO, "Rocky", "PERRO", "Bulldog Francés"),
        (CASA, "Pepa", "PERRO", "Border Collie"),
        (CASA, "Kiwi", "AVE", "Periquito Australiano"),
    ];
    for (email, nombre, tipo, raza) in mascotas {
        target
            .execute(
                "INSERT INTO mascotas (id, conjunto_id, usuario_id, nombre, tipo, raza)
                 SELECT gen_random_uuid(), $1, u.id, $3, $4, $5
                 FROM usuarios u WHERE u.email = $2 AND u.conjunto_id = $1",
                &[&conjunto_id, email, nombre, tipo, raza],
            )
            .await?;
    }

    // 4) Vehículos — per resident.
    let vehiculos: &[(&str, &str, &str, &str, &str, &str)] = &[
        (RESIDENTE, "ABC123", "Mazda", "CX-5", "Gris", "CARRO"),
        (RESIDENTE, "XYZ45D", "Yamaha", "FZ 2.0", "Azul", "MOTO"),
        (
            ARRENDATARIO,
            "DEF456",
            "Renault",
            "Logan",
            "Blanco",
            "CARRO",
        ),
        (CASA, "GHI789", "Toyota", "Hilux", "Negro", "CARRO"),
    ];
    for (email, placa, marca, modelo, color, tipo) in vehiculos {
        target
            .execute(
                "INSERT INTO vehiculos (id, conjunto_id, usuario_id, placa, marca, modelo, color, tipo)
                 SELECT gen_random_uuid(), $1, u.id, $3, $4, $5, $6, $7
                 FROM usuarios u WHERE u.email = $2 AND u.conjunto_id = $1",
                &[&conjunto_id, email, placa, marca, modelo, color, tipo],
            )
            .await?;
    }

    // 5) Pagos — per resident unidad (a paid one, a pending current one, an overdue one).
    let pagos: &[PagoRow] = &[
        // (email, concepto, monto, estado, metodo, fecha_venc_offset_days)
        (
            RESIDENTE,
            "Administración Mayo 2026",
            "350000.00",
            "PAGADO",
            Some("PSE"),
            -30,
        ),
        (
            RESIDENTE,
            "Administración Junio 2026",
            "350000.00",
            "PENDIENTE",
            None,
            5,
        ),
        (
            ARRENDATARIO,
            "Administración Junio 2026",
            "320000.00",
            "PENDIENTE",
            None,
            5,
        ),
        (
            ARRENDATARIO,
            "Cuota extraordinaria fachada",
            "180000.00",
            "VENCIDO",
            None,
            -10,
        ),
        (
            CASA,
            "Administración Junio 2026",
            "480000.00",
            "PAGADO",
            Some("NEQUI"),
            -2,
        ),
    ];
    for (email, concepto, monto, estado, metodo, venc_days) in pagos {
        let fecha_pago_sql = if *estado == "PAGADO" {
            "NOW() - '1 day'::interval"
        } else {
            "NULL"
        };
        target
            .execute(
                &format!(
                    "INSERT INTO pagos (id, conjunto_id, unidad_id, usuario_id, concepto, monto, estado, metodo, fecha_vencimiento, fecha_pago)
                     SELECT gen_random_uuid(), $1, u.unidad_id, u.id, $3, $4::text::numeric, $5, $6, NOW() + ($7 || ' days')::interval, {fecha_pago_sql}
                     FROM usuarios u WHERE u.email = $2 AND u.conjunto_id = $1 AND u.unidad_id IS NOT NULL"
                ),
                &[
                    &conjunto_id,
                    email,
                    concepto,
                    monto,
                    estado,
                    metodo,
                    &venc_days.to_string(),
                ],
            )
            .await?;
    }

    // 6) Áreas comunes.
    let areas: &[AreaRow] = &[
        (
            "Salón Social",
            "Salón para eventos con capacidad para 50 personas, cocina equipada y sonido.",
            50,
            true,
            Some("150000.00"),
            "08:00",
            "22:00",
            "LUN,MAR,MIE,JUE,VIE,SAB,DOM",
            240,
        ),
        (
            "Piscina",
            "Piscina semiolímpica climatizada con zona de niños.",
            30,
            false,
            None,
            "06:00",
            "20:00",
            "LUN,MAR,MIE,JUE,VIE,SAB,DOM",
            120,
        ),
        (
            "Zona BBQ",
            "Asadores a gas, mesas y zona verde para parrilladas.",
            20,
            true,
            Some("60000.00"),
            "10:00",
            "22:00",
            "VIE,SAB,DOM",
            180,
        ),
        (
            "Gimnasio",
            "Gimnasio equipado con máquinas cardiovasculares y peso libre.",
            15,
            false,
            None,
            "05:00",
            "23:00",
            "LUN,MAR,MIE,JUE,VIE,SAB",
            60,
        ),
    ];
    for (nombre, descripcion, cap, req_dep, dep_monto, ap, cierre, dias, slot) in areas {
        target
            .execute(
                "INSERT INTO areas_comunes (id, conjunto_id, nombre, descripcion, capacidad_max, requiere_deposito, deposito_monto, hora_apertura, hora_cierre, dias_disponibles, duracion_slot, activa)
                 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6::text::numeric, $7, $8, $9, $10, true)",
                &[&conjunto_id, nombre, descripcion, cap, req_dep, dep_monto, ap, cierre, dias, slot],
            )
            .await?;
    }

    // 7) Reservas — link resident to Salón Social and Zona BBQ.
    let reservas: &[(&str, &str, &str, i32, i32, i32)] = &[
        // (email, area_nombre, estado, start_offset_days, start_hour, duration_hours)
        (RESIDENTE, "Salón Social", "CONFIRMADA", 5, 15, 4),
        (RESIDENTE, "Zona BBQ", "PENDIENTE", 10, 12, 3),
        (ARRENDATARIO, "Piscina", "CONFIRMADA", 2, 10, 2),
    ];
    for (email, area, estado, day_off, hour, dur) in reservas {
        target
            .execute(
                "INSERT INTO reservas (id, conjunto_id, usuario_id, area_id, fecha_inicio, fecha_fin, estado, notas)
                 SELECT gen_random_uuid(), $1, u.id, a.id,
                        date_trunc('day', NOW()) + ($4 || ' days')::interval + ($5 || ' hours')::interval,
                        date_trunc('day', NOW()) + ($4 || ' days')::interval + (($5::text::int + $6::text::int) || ' hours')::interval,
                        $7, 'Reserva demo'
                 FROM usuarios u, areas_comunes a
                 WHERE u.email = $2 AND u.conjunto_id = $1 AND a.nombre = $3 AND a.conjunto_id = $1",
                &[
                    &conjunto_id,
                    email,
                    area,
                    &day_off.to_string(),
                    &hour.to_string(),
                    &dur.to_string(),
                    estado,
                ],
            )
            .await?;
    }

    // 8) Visitas — registered by residents.
    let visitas: &[VisitaRow] = &[
        (
            RESIDENTE,
            "Carlos Pérez (familiar)",
            "VEHICULAR",
            Some("CARRO"),
            Some("TUV890"),
            true,
            -1,
        ),
        (
            RESIDENTE,
            "Domicilio Rappi",
            "PEATONAL",
            None,
            None,
            false,
            0,
        ),
        (
            ARRENDATARIO,
            "Ana Gómez (amiga)",
            "PEATONAL",
            None,
            None,
            false,
            -2,
        ),
    ];
    for (email, nombre, tipo, veh_tipo, placa, tiene_parq, day_off) in visitas {
        target
            .execute(
                "INSERT INTO visitas (id, conjunto_id, usuario_id, nombre, tipo, vehiculo_tipo, placa, fecha, tiene_parqueadero, observacion)
                 SELECT gen_random_uuid(), $1, u.id, $3, $4, $5, $6, NOW() + ($7 || ' days')::interval, $8, 'Visita demo'
                 FROM usuarios u WHERE u.email = $2 AND u.conjunto_id = $1",
                &[&conjunto_id, email, nombre, tipo, veh_tipo, placa, &day_off.to_string(), tiene_parq],
            )
            .await?;
    }

    // 9) Paquetes — one waiting at the gate, one delivered.
    let paquetes: &[(&str, &str, &str, &str)] = &[
        (RESIDENTE, "Caja mediana Amazon", "Amazon", "EN_PORTERIA"),
        (RESIDENTE, "Sobre Servientrega", "Servientrega", "ENTREGADO"),
        (
            ARRENDATARIO,
            "Paquete Mercado Libre",
            "Mercado Libre",
            "EN_PORTERIA",
        ),
    ];
    for (email, descripcion, remitente, estado) in paquetes {
        let entregado_sql = if *estado == "ENTREGADO" {
            "NOW() - '6 hours'::interval"
        } else {
            "NULL"
        };
        target
            .execute(
                &format!(
                    "INSERT INTO paquetes (id, conjunto_id, usuario_id, descripcion, remitente, estado, fecha_llegada, entregado_en)
                     SELECT gen_random_uuid(), $1, u.id, $3, $4, $5, NOW() - '8 hours'::interval, {entregado_sql}
                     FROM usuarios u WHERE u.email = $2 AND u.conjunto_id = $1"
                ),
                &[&conjunto_id, email, descripcion, remitente, estado],
            )
            .await?;
    }

    // 10) Notificaciones — per resident (some unread).
    let notifs: &[(&str, &str, &str, &str, bool)] = &[
        (
            RESIDENTE,
            "PAQUETE",
            "Tienes un paquete en portería",
            "Caja mediana de Amazon te espera en la recepción.",
            false,
        ),
        (
            RESIDENTE,
            "INFO",
            "Pago de administración próximo a vencer",
            "Tu cuota de junio vence en 5 días.",
            false,
        ),
        (
            RESIDENTE,
            "SISTEMA",
            "Reserva confirmada",
            "Tu reserva del Salón Social fue confirmada.",
            true,
        ),
        (
            ARRENDATARIO,
            "PAQUETE",
            "Tienes un paquete en portería",
            "Paquete de Mercado Libre en recepción.",
            false,
        ),
    ];
    for (email, tipo, titulo, mensaje, leida) in notifs {
        target
            .execute(
                "INSERT INTO notificaciones (id, conjunto_id, usuario_id, tipo, titulo, mensaje, leida)
                 SELECT gen_random_uuid(), $1, u.id, $3, $4, $5, $6
                 FROM usuarios u WHERE u.email = $2 AND u.conjunto_id = $1",
                &[&conjunto_id, email, tipo, titulo, mensaje, leida],
            )
            .await?;
    }

    // 11) Documentos del conjunto.
    let documentos: &[(&str, &str, &str)] = &[
        (
            "Reglamento de Propiedad Horizontal",
            "REGLAMENTO",
            "https://demo.conjuntos.app/docs/reglamento.pdf",
        ),
        (
            "Manual de Convivencia",
            "CONVIVENCIA",
            "https://demo.conjuntos.app/docs/convivencia.pdf",
        ),
        (
            "Política de Mascotas",
            "MASCOTAS",
            "https://demo.conjuntos.app/docs/mascotas.pdf",
        ),
        (
            "Normas de Parqueadero",
            "PARQUEADERO",
            "https://demo.conjuntos.app/docs/parqueadero.pdf",
        ),
    ];
    for (nombre, categoria, url) in documentos {
        target
            .execute(
                "INSERT INTO documentos (id, conjunto_id, nombre, categoria, url, version)
                 VALUES (gen_random_uuid(), $1, $2, $3, $4, 'v1.0')",
                &[&conjunto_id, nombre, categoria, url],
            )
            .await?;
    }

    // 12) Gastos del conjunto (para panel admin-finanzas).
    let gastos: &[(&str, &str, &str, &str, i32)] = &[
        (
            "SERVICIOS",
            "Energía zonas comunes - Mayo",
            "1250000.00",
            "Enel Codensa",
            -25,
        ),
        (
            "NOMINA",
            "Salarios vigilancia - Mayo",
            "4800000.00",
            "Seguridad Total Ltda",
            -20,
        ),
        (
            "MANTENIMIENTO",
            "Mantenimiento ascensores",
            "950000.00",
            "Otis Colombia",
            -15,
        ),
        (
            "ADMINISTRACION",
            "Honorarios administración - Mayo",
            "2200000.00",
            "Gestión PH SAS",
            -10,
        ),
    ];
    for (categoria, descripcion, monto, proveedor, day_off) in gastos {
        target
            .execute(
                "INSERT INTO gastos (id, conjunto_id, categoria, descripcion, monto, proveedor, fecha, aprobado_por)
                 VALUES (gen_random_uuid(), $1, $2, $3, $4::text::numeric, $5, NOW() + ($6 || ' days')::interval, 'Admin Demo')",
                &[&conjunto_id, categoria, descripcion, monto, proveedor, &day_off.to_string()],
            )
            .await?;
    }

    // 13) Recibos públicos — per resident unidad.
    let recibos: &[(&str, &str, &str, &str, i32)] = &[
        (RESIDENTE, "ACUEDUCTO", "EAAB", "85000.00", 8),
        (RESIDENTE, "ENERGIA", "Enel Codensa", "120000.00", 12),
        (CASA, "GAS", "Vanti", "45000.00", 15),
    ];
    for (email, servicio, empresa, monto, venc_days) in recibos {
        target
            .execute(
                "INSERT INTO recibos_publicos (id, conjunto_id, unidad_id, servicio, empresa, periodo, monto, vencimiento, pagado)
                 SELECT gen_random_uuid(), $1, u.unidad_id, $3, $4, 'Junio 2026', $5::text::numeric, NOW() + ($6 || ' days')::interval, false
                 FROM usuarios u WHERE u.email = $2 AND u.conjunto_id = $1 AND u.unidad_id IS NOT NULL",
                &[&conjunto_id, email, servicio, empresa, monto, &venc_days.to_string()],
            )
            .await?;
    }

    let _ = VIGILANTE; // reserved for future vigilancia content
    tracing::info!("Demo content seeded (anuncios, mascotas, pagos, reservas, etc.)");
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
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6::text::numeric)
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
