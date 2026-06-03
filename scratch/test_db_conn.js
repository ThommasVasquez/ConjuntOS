import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
dotenv.config();

const password = "Md5891129Ae#$1129"; // Decoded password

const connections = [
  // 1. Original env URL
  process.env.DATABASE_URL,
  // 2. Direct regional pooler with session mode (port 5432)
  `postgresql://postgres.zudntuczwfhmyqgzcvrc:${encodeURIComponent(password)}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
  // 3. Direct pooler with transaction mode (port 6543)
  `postgresql://postgres.zudntuczwfhmyqgzcvrc:${encodeURIComponent(password)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true`,
  // 4. Project-specific pooling URL (old style)
  `postgresql://postgres.zudntuczwfhmyqgzcvrc:${encodeURIComponent(password)}@db.zudntuczwfhmyqgzcvrc.supabase.co:6543/postgres`
];

async function tryConnect(connectionString, label) {
  console.log(`\nTesting connection for: ${label}...`);
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log(`✅ Conexión exitosa para: ${label}!`);
    await client.query(`
      ALTER TABLE "Conjunto" 
      ADD COLUMN IF NOT EXISTS "representanteLegal" TEXT,
      ADD COLUMN IF NOT EXISTS "notariaEscritura" TEXT,
      ADD COLUMN IF NOT EXISTS "numeroEscritura" TEXT,
      ADD COLUMN IF NOT EXISTS "fechaEscritura" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS "matriculaInmobiliaria" TEXT,
      ADD COLUMN IF NOT EXISTS "totalUnidades" INTEGER DEFAULT 1;
    `);
    console.log("✅ Query ejecutado!");
    await client.end();
    return true;
  } catch (err) {
    console.log(`❌ Falló ${label}:`, err.message);
    try { await client.end(); } catch(e) {}
    return false;
  }
}

async function main() {
  for (let i = 0; i < connections.length; i++) {
    const conn = connections[i];
    if (!conn) continue;
    const ok = await tryConnect(conn, `Option ${i + 1}`);
    if (ok) {
      console.log("\n🎉 ÉXITO TOTAL!");
      break;
    }
  }
}

main();
