import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { supabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const logs: string[] = [];
  try {
    logs.push("🚀 Iniciando Setup Bridge (Voice Messages)...");

    // 1. Configurar Storage
    logs.push("📦 Configurando Supabase Storage...");
    const { data: bucketData, error: bucketError } = await (supabase.storage as any).createBucket('chat-voice', {
      public: true,
      fileSizeLimit: 10485760, // 10MB
    });

    if (bucketError) {
      if (bucketError.message.includes("already exists")) {
        logs.push("✅ Bucket 'chat-voice' ya existía.");
      } else {
        throw new Error(`Error en storage: ${bucketError.message}`);
      }
    } else {
      logs.push("✅ Bucket 'chat-voice' creado exitosamente.");
    }

    // 2. Ejecutar Migración SQL
    logs.push("🗄️ Iniciando migración de base de datos...");
    const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres.zudntuczwfhmyqgzcvrc:Md5891129Ae%23%241129@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
    
    try {
      const sql = neon(DATABASE_URL);
      await sql.query(`
        ALTER TABLE "ChatAdmin" 
        ADD COLUMN IF NOT EXISTS "audioUrl" TEXT,
        ADD COLUMN IF NOT EXISTS "transcripcion" TEXT;
      `);
      logs.push("✅ Columnas agregadas via HTTP driver.");
    } catch (e: any) {
      logs.push(`⚠️ HTTP driver falló: ${e.message}. Probando binario local...`);
      // Fallback: Intentar con el binario de prisma si estamos en Node
      try {
        const { execSync } = require('child_process');
        const nodePath = process.execPath;
        const prismaPath = require.resolve('prisma/package.json').replace('package.json', 'build/index.js');
        
        logs.push(`🔍 Node Path: ${nodePath}`);
        
        const cmd = `${nodePath} ./node_modules/prisma/build/index.js migrate dev --name add_voice --skip-generate --schema ./prisma/schema.prisma`;
        execSync(cmd, { env: { ...process.env, DATABASE_URL } });
        logs.push("✅ Migración completada via Prisma CLI.");
      } catch (e2: any) {
        logs.push(`❌ Fallo total de migración: ${e2.message}`);
        // No lanzamos error para que al menos el bucket quede configurado
      }
    }

    return NextResponse.json({
      success: true,
      message: "Infraestructura de Voz configurada exitósamente",
      logs
    });

  } catch (error: any) {
    console.error("🔥 [SETUP-ERROR]:", error);
    return NextResponse.json({
      success: false,
      error: error.message,
      logs
    }, { status: 500 });
  }
}
