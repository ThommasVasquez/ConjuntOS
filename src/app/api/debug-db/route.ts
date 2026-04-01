import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { Pool, neonConfig } from "@neondatabase/serverless";

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface DiagnosticResult {
  state: string;
  cloudflare: { context: string };
  dbTest: { connection: string; write: string };
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
    dbTest: { connection: "Pendiente", write: "Pendiente" },
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

    neonConfig.useSecureWebSocket = false;
    const pool = new Pool({ 
      connectionString: sanitized,
      ssl: { rejectUnauthorized: false }
    });

    try {
      const dbStart = Date.now();
      await pool.query("SELECT 1");
      diagnostics.dbTest.connection = `✅ OK (Neon Serverless - ${Date.now() - dbStart}ms)`;

      // CREAR TABLA DE LOGS PERSISTENTES SI NO EXISTE
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "AuthDebug" (
          id TEXT PRIMARY KEY,
          email TEXT,
          step TEXT,
          details TEXT,
          "creadoEn" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);
      diagnostics.dbTest.write = "✅ OK (Tabla AuthDebug verificada)";
    } catch (dbError: unknown) {
      const err = dbError as Error;
      diagnostics.dbTest.connection = `❌ Error: ${err.message}`;
      diagnostics.error = err.message;
    }

    if (runSetup && diagnostics.dbTest.connection.startsWith("✅")) {
      try {
        diagnostics.setup.logs.push("Asegurando datos maestros...");

        await pool.query(`
          INSERT INTO "Conjunto" (id, nombre, subdominio, direccion, ciudad)
          VALUES ('demo_id', 'Residencial Horizonte', 'demo', 'Calle Digital 101', 'Nube')
          ON CONFLICT (subdominio) DO UPDATE SET nombre = 'Residencial Horizonte'
        `);
        diagnostics.setup.logs.push("✅ Conjunto 'demo_id' verificado.");

        await pool.query(`
          INSERT INTO "Usuario" (id, "conjuntoId", nombre, email, password, rol, activo, genero)
          VALUES ('master_thommy', 'demo_id', 'ThommyEnergy', 'thommy@example.com', 'Md5891129Ae$', 'SUPER_ADMIN', true, 'femenino')
          ON CONFLICT (email) DO UPDATE SET password = 'Md5891129Ae$'
        `);
        diagnostics.setup.logs.push("✅ Usuario maestro verificado.");
        
        const userRes = await pool.query('SELECT email, rol, password FROM "Usuario" WHERE email = $1', ['thommy@example.com']);
        if (userRes.rows.length > 0) {
          const u = userRes.rows[0] as { email: string; rol: string; password?: string };
          diagnostics.setup.logs.push(`🔍 Verificación DB: Email=${u.email}, Rol=${u.rol}, PassLen=${u.password?.length}`);
        }
        
        diagnostics.setup.status = "✅ ÉXITO";
      } catch (e: unknown) {
        const err = e as Error;
        diagnostics.setup.status = "❌ FALLO";
        diagnostics.setup.logs.push(`Error en setup: ${err.message}`);
      }
    }

    // LEER ÚLTIMOS LOGS PERSISTENTES
    try {
      const logs = await pool.query('SELECT step, details, email, "creadoEn" FROM "AuthDebug" ORDER BY "creadoEn" DESC LIMIT 10');
      diagnostics.persistent_auth_logs = logs.rows as unknown[];
    } catch {
      diagnostics.persistent_auth_logs = [];
    }

    const anyGlobal = globalThis as unknown as { __prismaError?: string; __lastAuthStep?: string };
    if (anyGlobal.__prismaError) diagnostics.prisma_singleton_error = anyGlobal.__prismaError;
    
    diagnostics.auth_debug = {
      last_login_step: anyGlobal.__lastAuthStep || "NO_ATTEMPTS_YET",
      secret_status: (process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET) ? "✅ DEFINED" : "❌ MISSING",
      timestamp: new Date().toISOString()
    };

    await pool.end();
    return NextResponse.json(diagnostics);

  } catch (globalError: unknown) {
    const err = globalError as Error;
    return NextResponse.json({
      state: "Error Fatal",
      error: err.message,
      stack: err.stack
    }, { status: 500 });
  }
}
