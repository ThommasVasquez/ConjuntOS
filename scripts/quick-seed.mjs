import { Pool } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL;

async function seed() {
  const pool = new Pool({ connectionString });
  
  try {
    console.log("🔗 Conectando a la base de datos...");
    
    // 1. Encontrar el usuario (usamos el primero si no encontramos el email específico)
    const userRes = await pool.query('SELECT id, "conjuntoId", "unidadId" FROM "Usuario" WHERE email = $1 LIMIT 1', ["thommas.vz@gmail.com"]);
    
    let user = userRes.rows[0];
    if (!user) {
      console.log("⚠️ Usuario 'thommas.vz@gmail.com' no encontrado. Usando el primer usuario con unidad...");
      const fallbackRes = await pool.query('SELECT id, "conjuntoId", "unidadId" FROM "Usuario" WHERE "unidadId" IS NOT NULL LIMIT 1');
      user = fallbackRes.rows[0];
    }

    if (!user) {
      console.error("❌ No se encontró ningún usuario con unidad asignada.");
      return;
    }

    console.log(`✅ Usuario seleccionado: ${user.id}`);

    const payments = [
      ["Administración Marzo 2026", 250000, "PENDIENTE", "2026-03-31 23:59:59", null],
      ["Energía Eléctrica Feb 2026", 88500, "PAGADO", "2026-02-15 23:59:59", "2026-02-10 14:30:00"],
      ["Gas Natural Ene 2026", 32400, "PAGADO", "2026-01-20 23:59:59", "2026-01-18 09:15:00"],
      ["Agua Potable Dic 2025", 45200, "PAGADO", "2025-12-25 23:59:59", "2025-12-20 16:45:00"],
      ["Alquiler Salón Comunal", 120000, "PAGADO", "2025-11-15 23:59:59", "2025-11-12 10:00:00"],
      ["Administración Febrero 2026", 250000, "PAGADO", "2026-02-28 23:59:59", "2026-02-25 10:00:00"],
      ["Administración Enero 2026", 250000, "PAGADO", "2026-01-31 23:59:59", "2026-01-28 15:30:00"],
      ["Administración Diciembre 2025", 250000, "VENCIDO", "2025-12-31 23:59:59", null],
    ];

    console.log("📥 Insertando pagos...");
    for (const [concepto, monto, estado, vencimiento, pago] of payments) {
      await pool.query(
        `INSERT INTO "Pago" (id, "conjuntoId", "unidadId", "usuarioId", concepto, monto, estado, "fechaVencimiento", "fechaPago", "creadoEn") 
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [user.conjuntoId, user.unidadId, user.id, concepto, monto, estado, vencimiento, pago]
      );
    }

    console.log("🏁 ¡Sembrado completado con éxito!");

  } catch (err) {
    console.error("❌ Error en el seed:", err);
  } finally {
    await pool.end();
  }
}

seed();
