import { neon } from "@neondatabase/serverless";

async function stabilize() {
  const url = "postgresql://postgres.zudntuczwfhmyqgzcvrc:Md5891129Ae%23%241129@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
  const sql = neon(url);

  console.log("🚀 Estabilizando via Neon HTTP (Tagged)...");

  try {
     // 1. Enums
     await sql`
       DO $$ BEGIN
         CREATE TYPE "EstadoReserva" AS ENUM ('PENDIENTE', 'CONFIRMADA', 'CANCELADA', 'COMPLETADA');
       EXCEPTION
         WHEN duplicate_object THEN null;
       END $$;
     `;

     // 2. AreaComun
     await sql`
       CREATE TABLE IF NOT EXISTS "AreaComun" (
         id TEXT PRIMARY KEY,
         "conjuntoId" TEXT NOT NULL,
         nombre TEXT NOT NULL,
         "capacidadMax" INTEGER NOT NULL,
         "horaApertura" TEXT NOT NULL,
         "horaCierre" TEXT NOT NULL,
         "diasDisponibles" TEXT NOT NULL,
         "duracionSlot" INTEGER NOT NULL
       );
     `;

     // 3. Reserva
     await sql`
       CREATE TABLE IF NOT EXISTS "Reserva" (
         id TEXT PRIMARY KEY,
         "conjuntoId" TEXT NOT NULL,
         "usuarioId" TEXT NOT NULL,
         "areaId" TEXT NOT NULL,
         "fechaInicio" TIMESTAMP NOT NULL,
         "fechaFin" TIMESTAMP NOT NULL,
         estado "EstadoReserva" NOT NULL
       );
     `;

     console.log("✅ Tablas inicializadas satisfactoriamente.");

  } catch (e: any) {
     console.error("❌ Fallo en estabilización:", e.message);
  }
}

stabilize();
