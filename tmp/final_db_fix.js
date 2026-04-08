const { Client } = require("pg");

async function finalDbFix() {
  const connectionString = "postgresql://postgres.zudntuczwfhmyqgzcvrc:Md5891129Ae%23%241129@aws-0-us-east-1.pooler.supabase.com:5432/postgres";
  
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log("🚀 Iniciando Estabilización Definitiva (Port 5432)...");
    await client.connect();

    // 1. Create Enums
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "EstadoReserva" AS ENUM ('PENDIENTE', 'CONFIRMADA', 'CANCELADA', 'COMPLETADA');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 2. Create AreaComun
    await client.query(`
      CREATE TABLE IF NOT EXISTS "AreaComun" (
        "id" TEXT PRIMARY KEY,
        "conjuntoId" TEXT NOT NULL,
        "nombre" TEXT NOT NULL,
        "capacidadMax" INTEGER NOT NULL,
        "horaApertura" TEXT NOT NULL,
        "horaCierre" TEXT NOT NULL,
        "diasDisponibles" TEXT NOT NULL,
        "duracionSlot" INTEGER NOT NULL
      );
    `);

    // 3. Create Reserva
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Reserva" (
        "id" TEXT PRIMARY KEY,
        "conjuntoId" TEXT NOT NULL,
        "usuarioId" TEXT NOT NULL,
        "areaId" TEXT NOT NULL,
        "fechaInicio" TIMESTAMP(3) NOT NULL,
        "fechaFin" TIMESTAMP(3) NOT NULL,
        "estado" "EstadoReserva" NOT NULL
      );
    `);

    console.log("✅ Tablas de Reservas estabilizadas exitosamente.");

  } catch (err) {
    console.error("❌ ERROR FINAL:", err.message);
  } finally {
    await client.end();
  }
}

finalDbFix();
