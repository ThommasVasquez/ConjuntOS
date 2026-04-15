import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { supabase } from "@/lib/db";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET() {
  const logs: string[] = [];
  try {
    logs.push("🚀 Iniciando Setup Bridge Resiliente...");

    // 1. Storage
    logs.push("📦 Configurando Storage...");
    const { error: bErr } = await (supabase.storage as any).createBucket('chat-voice', { public: true });
    if (bErr && !bErr.message.includes("already exists")) {
       logs.push(`⚠️ Storage: ${bErr.message}`);
    } else {
       logs.push("✅ Storage listo.");
    }

    // 2. SQL Migration - Intento Multi-Conexión
    logs.push("🗄️ Iniciando migración de base de datos...");
    
    // Variantes de URL
    const urls = [
      // 1. Original (Pooler 6543)
      "postgresql://postgres.zudntuczwfhmyqgzcvrc:Md5891129Ae%23%241129@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
      // 2. Directo (5432)
      "postgresql://postgres.zudntuczwfhmyqgzcvrc:Md5891129Ae%23%241129@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
      // 3. Decodificado (Port 5432)
      "postgresql://postgres.zudntuczwfhmyqgzcvrc:Md5891129Ae#$1129@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
    ];

    let sqlSuccess = false;
    for (const url of urls) {
      if (sqlSuccess) break;
      try {
        logs.push(`Testing: ${url.split('@')[1]}`);
        const sql = neon(url);
        await sql.query(`
          ALTER TABLE "ChatAdmin" 
          ADD COLUMN IF NOT EXISTS "audioUrl" TEXT,
          ADD COLUMN IF NOT EXISTS "transcripcion" TEXT;
        `);
        logs.push(`✅ ÉXITO con ${url.split('@')[1]}`);
        sqlSuccess = true;
      } catch (e: any) {
        logs.push(`❌ Falló: ${e.message.split('\n')[0]}`);
      }
    }

    if (!sqlSuccess) {
      logs.push("🆘 FALLO TOTAL SQL. Por favor ejecute el SQL manual en Supabase.");
    }

    return NextResponse.json({
      success: true,
      sqlSuccess,
      logs
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message, logs }, { status: 500 });
  }
}
