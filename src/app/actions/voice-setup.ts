"use server";

import { neon } from "@neondatabase/serverless";
import { supabase } from "@/lib/db";

export async function runVoiceSetup() {
  const logs = [];
  try {
    logs.push("🚀 Servidor: Iniciando setup...");

    // 1. Bucket
    logs.push("📦 Creando bucket 'chat-voice'...");
    const { error: bErr } = await (supabase.storage as any).createBucket('chat-voice', { public: true });
    if (bErr && !bErr.message.includes("already exists")) throw bErr;
    logs.push("✅ Bucket listo.");

    // 2. SQL
    logs.push("🗄️ Ejecutando SQL...");
    const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres.zudntuczwfhmyqgzcvrc:Md5891129Ae%23%241129@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
    const sql = neon(DATABASE_URL);
    await sql.query(`
      ALTER TABLE "ChatAdmin" 
      ADD COLUMN IF NOT EXISTS "audioUrl" TEXT,
      ADD COLUMN IF NOT EXISTS "transcripcion" TEXT;
    `);
    logs.push("✅ Base de datos actualizada.");

    return { success: true, logs };
  } catch (err: any) {
    return { success: false, error: err.message, logs };
  }
}
