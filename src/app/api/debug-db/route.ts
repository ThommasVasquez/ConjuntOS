import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { neon } from "@neondatabase/serverless";
import db from "@/lib/db";

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
    host: string;
    port: string;
    authAudit?: {
      user_display: string;
      pass_display: string;
      pass_length: number;
      has_special_chars: boolean;
    };
  };
  auth_debug?: {
    last_login_step: string;
    secret_status: string;
    timestamp: string;
  };
  persistent_auth_logs?: unknown[];
  prisma_singleton_error?: string;
}

/**
 * Escapa el carácter '%' en la contraseña para que URL lo acepte.
 */
function localSanitizeUrl(baseUrl: string): string {
  if (!baseUrl) return "";
  try {
    const url = baseUrl;
    const parts = url.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.+)(@.+)$/);
    if (parts) {
      const [, protocol, user, password, rest] = parts;
      const safePassword = password.includes("%25") 
        ? password 
        : password.replace(/%/g, "%25");
      return `${protocol}${user}:${safePassword}${rest}`;
    }
    return url;
  } catch { return baseUrl; }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runSetup = searchParams.get("setup") === "true";

  const diagnostics: DiagnosticResult = {
    state: "Iniciando...",
    cloudflare: { context: "❌ Error" },
    version: "29.0-neon-sql-query-fix",
    dbTest: { connection: "Pendiente", write: "Pendiente" },
    lastDbError: (db as any).getLastError ? (db as any).getLastError() : null,
    setup: { status: "No ejecutado", logs: [] },
  };

  try {
    const url = (process.env.DATABASE_URL || "").trim();
    const sanitized = localSanitizeUrl(url);
    const partsHost = sanitized.split("@")[1];
    const host = partsHost ? partsHost.split(":")[0] : "desconocido";
    const partsPort = sanitized.split(":");
    const port = partsPort[3] ? partsPort[3].split("/")[0] : "5432";

    diagnostics.diagnostics = {
      host,
      port,
      authAudit: {
        user_display: (sanitized.split(":")[1]?.substring(2, 7) || "") + "..." + (sanitized.split("@")[0]?.slice(-5) || ""),
        pass_display: (sanitized.split(":")[2]?.split("@")[0]?.substring(0, 4) || "") + "..." + (sanitized.split(":")[2]?.split("@")[0]?.slice(-4) || ""),
        pass_length: sanitized.split(":")[2]?.split("@")[0]?.length || 0,
        has_special_chars: /[%$#@!]/.test(sanitized.split(":")[2]?.split("@")[0] || ""),
      },
    };

    try {
      const ctx = getRequestContext();
      if (ctx) diagnostics.cloudflare.context = "✅ OK";
    } catch { diagnostics.cloudflare.context = "⚠️ Fuera de Cloudflare?"; }

    // UNIFICACIÓN DE DRIVER: USAMOS NEON FETCH (v29.0)
    const sql = neon(sanitized);

    try {
        const dbStart = Date.now();
        await sql.query("SELECT 1");
        diagnostics.dbTest.connection = `✅ OK (Neon HTTP Fetch - ${Date.now() - dbStart}ms)`;

        // DIAGNÓSTICO DE URL
        const { discoverUrl } = await import("@/lib/db");
        const rawUrl = await discoverUrl();
        const maskedUrl = rawUrl ? `${rawUrl.substring(0, 15)}...${rawUrl.substring(rawUrl.length - 10)}` : "VACÍA";
        diagnostics.setup.logs.push(`URL Activa: ${maskedUrl}`);

        // LISTAR TABLAS EXISTENTES
        const rows = await sql.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        const tables = rows.map((r: any) => r.table_name);
        diagnostics.setup.logs.push(`Tablas encontradas: ${tables.join(", ")}`);

        // PRUEBA DE PRISMA (MISMO MOTOR QUE TRAMITES)
        try {
            const { default: db_test } = await import("@/lib/db");
            const usuarioTest = await db_test.usuario;
            const count = await usuarioTest.count();
            diagnostics.dbTest.write = `✅ PRISMA FETCH OK (${count} usuarios)`;
        } catch (perr: any) {
            diagnostics.dbTest.write = `❌ PRISMA FALLÓ: ${perr.message}`;
            diagnostics.setup.logs.push(`Error Prisma Msg: ${perr.message}`);
        }

        // CREAR TABLA DE LOGS PERSISTENTES SI NO EXISTE
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
        diagnostics.stack = dbErr.stack;
      }

    // AUTH DEBUG LOGS
    try {
       // @ts-ignore
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
