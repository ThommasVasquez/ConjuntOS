import pkg from 'pg';
const { Client } = pkg;

const password = "Md5891129Ae$";
const host = "aws-1-us-east-1.pooler.supabase.com";
const user = "postgres.zudntuczwfhmyqgzcvrc";
const dbName = "postgres";

async function main() {
  // Use port 5432 for session mode
  const client = new Client({
    host,
    port: 5432,
    user,
    password,
    database: dbName,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("✅ Conectado a Supabase Postgres!");
    
    console.log("Agregando columnas a la tabla Conjunto...");
    await client.query(`
      ALTER TABLE "Conjunto" 
      ADD COLUMN IF NOT EXISTS "representanteLegal" TEXT,
      ADD COLUMN IF NOT EXISTS "notariaEscritura" TEXT,
      ADD COLUMN IF NOT EXISTS "numeroEscritura" TEXT,
      ADD COLUMN IF NOT EXISTS "fechaEscritura" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS "matriculaInmobiliaria" TEXT,
      ADD COLUMN IF NOT EXISTS "totalUnidades" INTEGER DEFAULT 1;
    `);
    console.log("✅ Columnas agregadas con éxito!");
  } catch (err) {
    console.error("❌ Error ejecutando consultas:", err);
  } finally {
    await client.end();
  }
}

main();
