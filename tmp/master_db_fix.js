const { Client } = require("pg");

async function masterDbFix() {
  // USANDO EL HOST DIRECTO DE SUPABASE (Evita el Pooler)
  const url = "postgresql://postgres.zudntuczwfhmyqgzcvrc:Md5891129Ae%23%241129@db.zudntuczwfhmyqgzcvrc.supabase.co:5432/postgres";
  
  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log("🚀 Iniciando Estabilización Maestra (Direct Connect to Supabase)...");
    await client.connect();

    // 1. Enums
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "EstadoReserva" AS ENUM ('PENDIENTE', 'CONFIRMADA', 'CANCELADA', 'COMPLETADA');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 2. AreaComun
    await client.query(`
      CREATE TABLE IF NOT EXISTS "AreaComun" (
        "id" TEXT PRIMARY KEY,
        "conjuntoId" TEXT NOT NULL,
        "nombre" TEXT NOT NULL,
        "descripcion" TEXT,
        "capacidadMax" INTEGER NOT NULL,
        "imagenUrl" TEXT,
        "requiereDeposito" BOOLEAN NOT NULL DEFAULT false,
        "depositoMonto" DECIMAL(65,30),
        "horaApertura" TEXT NOT NULL,
        "horaCierre" TEXT NOT NULL,
        "diasDisponibles" TEXT NOT NULL,
        "duracionSlot" INTEGER NOT NULL,
        "activa" BOOLEAN NOT NULL DEFAULT true
      );
    `);

    // 3. Reserva
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Reserva" (
        "id" TEXT PRIMARY KEY,
        "conjuntoId" TEXT NOT NULL,
        "usuarioId" TEXT NOT NULL,
        "areaId" TEXT NOT NULL,
        "fechaInicio" TIMESTAMP(3) NOT NULL,
        "fechaFin" TIMESTAMP(3) NOT NULL,
        "estado" "EstadoReserva" NOT NULL,
        "notas" TEXT,
        "pagoId" TEXT,
        "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. FKs
    await client.query(`
      ALTER TABLE "AreaComun" DROP CONSTRAINT IF EXISTS "AreaComun_conjuntoId_fkey";
      ALTER TABLE "AreaComun" ADD CONSTRAINT "AreaComun_conjuntoId_fkey" FOREIGN KEY ("conjuntoId") REFERENCES "Conjunto"("id") ON DELETE CASCADE;
      
      ALTER TABLE "Reserva" DROP CONSTRAINT IF EXISTS "Reserva_areaId_fkey";
      ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "AreaComun"("id") ON DELETE CASCADE;
      
      ALTER TABLE "Reserva" DROP CONSTRAINT IF EXISTS "Reserva_usuarioId_fkey";
      ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE;
    `);

    // 5. Seed
    const conjuntoRes = await client.query('SELECT id FROM "Conjunto" LIMIT 1');
    if (conjuntoRes.rows.length > 0) {
      const cId = conjuntoRes.rows[0].id;
      await client.query(`
        INSERT INTO "AreaComun" (id, "conjuntoId", nombre, "capacidadMax", "horaApertura", "horaCierre", "diasDisponibles", "duracionSlot")
        VALUES ('mock_piscina', $1, 'Piscina Olímpica', 100, '08:00', '20:00', '1,2,3,4,5,6,0', 60)
        ON CONFLICT (id) DO NOTHING;
      `, [cId]);
      await client.query(`
        INSERT INTO "AreaComun" (id, "conjuntoId", nombre, "capacidadMax", "horaApertura", "horaCierre", "diasDisponibles", "duracionSlot")
        VALUES ('mock_gym', $1, 'Gimnasio Fitness', 20, '05:00', '22:00', '1,2,3,4,5,6,0', 45)
        ON CONFLICT (id) DO NOTHING;
      `, [cId]);
    }

    console.log("✅ Base de Datos estabilizada correctamente.");

  } catch (err) {
    console.error("❌ ERROR MAESTRO:", err.message);
  } finally {
    await client.end();
  }
}

masterDbFix();
