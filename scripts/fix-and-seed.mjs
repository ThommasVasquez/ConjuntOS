import { Pool } from "@neondatabase/serverless";
import { config } from "dotenv";
import { resolve } from "path";

// Cargar .env desde la raíz
config({ path: resolve(process.cwd(), ".env") });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌ ERROR: DATABASE_URL no encontrada en el .env");
  process.exit(1);
}

async function run() {
  console.log("🔗 Conectando a:", connectionString.split("@")[1]); // No mostrar pass
  const pool = new Pool({ connectionString });
  
  try {
    // 1. Buscar al usuario Thommy
    const userRes = await pool.query('SELECT id, "conjuntoId" FROM "Usuario" WHERE nombre ILIKE \'%Thommy%\' LIMIT 1');
    const user = userRes.rows[0];
    
    if (!user) {
      console.error("❌ No se encontró el usuario 'Thommy'");
      return;
    }

    console.log(`✅ Usuario encontrado: ${user.id}`);

    // 2. Buscar o crear una Unidad
    let unitRes = await pool.query('SELECT id FROM "Unidad" WHERE "conjuntoId" = $1 LIMIT 1', [user.conjuntoId]);
    let unit = unitRes.rows[0];

    if (!unit) {
      console.log("🏙️ Creando unidad de prueba...");
      const newUnit = await pool.query(
        'INSERT INTO "Unidad" (id, "conjuntoId", numero, torre, coeficiente, "tipoUnidad") VALUES (gen_random_uuid()::text, $1, \'101\', \'1\', 1.0, \'APARTAMENTO\') RETURNING id',
        [user.conjuntoId]
      );
      unit = newUnit.rows[0];
    }

    // 3. Asignar unidad al usuario
    await pool.query('UPDATE "Usuario" SET "unidadId" = $1 WHERE id = $2', [unit.id, user.id]);
    console.log("🏠 Unidad asignada!");

    // 4. Limpiar y sembrar pagos
    await pool.query('DELETE FROM "Pago" WHERE "usuarioId" = $1', [user.id]);
    
    const payments = [
      ["Administración Marzo 2026", 250000, "PENDIENTE", "2026-03-31 23:59:59"],
      ["Energía Eléctrica Feb 2026", 88500, "PAGADO", "2026-02-15 23:59:59"],
      ["Gas Natural Ene 2026", 32400, "PAGADO", "2026-01-20 23:59:59"],
      ["Agua Potable Dic 2025", 45200, "PAGADO", "2025-12-25 23:59:59"],
      ["Alquiler Salón Comunal", 120000, "PAGADO", "2025-11-15 23:59:59"],
      ["Administración Febrero 2026", 250000, "PAGADO", "2026-02-28 23:59:59"],
      ["Administración Enero 2026", 250000, "PAGADO", "2026-01-31 23:59:59"],
      ["Intereses Mora Dic", 12500, "VENCIDO", "2025-12-31 23:59:59"],
    ];

    for (const [concepto, monto, estado, fecha] of payments) {
      await pool.query(
        'INSERT INTO "Pago" (id, "conjuntoId", "unidadId", "usuarioId", concepto, monto, estado, "fechaVencimiento", "creadoEn") VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, NOW())',
        [user.conjuntoId, unit.id, user.id, concepto, monto, estado, fecha]
      );
    }

    console.log("🏁 ¡HISTORIAL SEMBRADO CON ÉXITO!");

  } catch (err) {
    console.error("❌ ERROR:", err);
  } finally {
    await pool.end();
  }
}

run();
