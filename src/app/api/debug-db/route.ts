import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { neon } from "@neondatabase/serverless";
import db, { discoverUrl } from "@/lib/db";

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface DiagnosticResult {
  state: string;
  cloudflare: { context: string };
  version: string;
  dbTest: { connection: string; write: string };
  lastDbError: any;
  setup: { status: string; logs: string[] };
  error?: string;
  message?: string;
  stack?: string;
  diagnostics?: {
    active_host: string;
    env_host: string;
    bypass_active: boolean;
  };
  persistent_auth_logs?: unknown[];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runSetup = searchParams.get("setup") === "true";

  const diagnostics: DiagnosticResult = {
    state: "Iniciando...",
    cloudflare: { context: "❌ Error" },
    version: "30.0-bypass-sync",
    dbTest: { connection: "Pendiente", write: "Pendiente" },
    lastDbError: (db as any).getLastError ? (db as any).getLastError() : null,
    setup: { status: "No ejecutado", logs: [] },
  };

  try {
    // 1. OBTENER URLS (ENV vs ACTIVE)
    const envUrl = (process.env.DATABASE_URL || "").trim();
    const activeUrl = await discoverUrl();
    
    const envHost = envUrl.split("@")[1]?.split("/")[0] || "VACÍO";
    const activeHost = activeUrl.split("@")[1]?.split("?")[0] || "error";
    const bypassActive = envHost !== activeHost;

    diagnostics.diagnostics = {
      active_host: activeHost,
      env_host: envHost,
      bypass_active: bypassActive
    };

    if (bypassActive) {
      diagnostics.setup.logs.push(`🚨 BYPASS DETECTADO: Usando Neon en lugar de Supabase (${envHost})`);
    }

    // 2. CLOUDFLARE CONTEXT
    try {
      const ctx = getRequestContext();
      if (ctx) diagnostics.cloudflare.context = "✅ OK";
    } catch { diagnostics.cloudflare.context = "⚠️ Fuera de Cloudflare?"; }

    // 3. CONEXIÓN SINCRONIZADA (USANDO LA MISMA URL QUE LA APP)
    const sql = neon(activeUrl);

    try {
        const dbStart = Date.now();
        await sql.query("SELECT 1");
        diagnostics.dbTest.connection = `✅ OK (Neon Sync - ${Date.now() - dbStart}ms)`;

        // LISTAR TABLAS
        const rows = await sql.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        const tables = rows.map((r: any) => r.table_name);
        diagnostics.setup.logs.push(`Tablas encontradas: ${tables.length}`);

        // PRUEBA DE PRISMA PROXY
        try {
            const count = await db.usuario.count();
            diagnostics.dbTest.write = `✅ PROXY OK (${count} usuarios)`;
        } catch (perr: any) {
            diagnostics.dbTest.write = `❌ PROXY FALLÓ: ${perr.message}`;
        }

        // TABLA DE LOGS
        await sql.query(`
          CREATE TABLE IF NOT EXISTS "AuthDebug" (
            id TEXT PRIMARY KEY,
            email TEXT,
            step TEXT,
            details TEXT,
            "creadoEn" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          )
        `);

        if (runSetup) {
           diagnostics.setup.status = "✅ Setup completado";
        }

      } catch (dbErr: any) {
        diagnostics.dbTest.connection = `❌ Error DB: ${dbErr.message}`;
        diagnostics.error = dbErr.message;
      }

    // AUTH DEBUG LOGS
    try {
       const logs = await sql.query('SELECT * FROM "AuthDebug" ORDER BY "creadoEn" DESC LIMIT 5');
       diagnostics.persistent_auth_logs = logs;
    } catch { 
       diagnostics.persistent_auth_logs = ["Tabla AuthDebug aún no accesible"];
    }

    diagnostics.state = "Completado";
    return NextResponse.json(diagnostics);

  } catch (err: any) {
    diagnostics.state = "❌ Error crítico";
    diagnostics.error = err.message;
    diagnostics.stack = err.stack;
    return NextResponse.json(diagnostics, { status: 500 });
  }
}
