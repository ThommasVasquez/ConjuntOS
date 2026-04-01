import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { Pool } from "pg";

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
  diagnostics?: unknown;
}

/**
 * Standard PG Sanitizer (preserves port)
 */
function localSanitizeUrl(baseUrl: string): string {
  if (!baseUrl) return "";
  try {
    const parts = baseUrl.match(/^(postgresql:\/\/)([^:]+):(.+)(@.+)$/);
    if (parts) {
      const [, protocol, user, password, rest] = parts;
      const safePassword = password.replace(/%/g, "%25");
      return `${protocol}${user}:${safePassword}${rest}`;
    }
  } catch { /* Fallback */ }
  return baseUrl;
}

export async function GET(request: Request) {
  const diagnostics: DiagnosticResult = {
    state: "Iniciando...",
    cloudflare: { context: "Pendiente" },
    dbTest: { connection: "Pendiente", write: "Pendiente" },
    setup: { status: "No ejecutado", logs: [] }
  };

  try {
    const { searchParams } = new URL(request.url);
    const setupMode = searchParams.get("setup") === "true";

    // 1. Contexto Cloudflare
    let connectionString = "";
    try {
      const ctx = getRequestContext() as unknown as { env: { DATABASE_URL?: string } };
      if (ctx?.env?.DATABASE_URL) {
        connectionString = ctx.env.DATABASE_URL.trim();
        diagnostics.cloudflare.context = "✅ OK";
      } else {
        diagnostics.cloudflare.context = "❌ DATABASE_URL no encontrada en env";
      }
    } catch (e: unknown) {
      diagnostics.cloudflare.context = `❌ Error Contexto: ${e instanceof Error ? e.message : "Desconocido"}`;
    }

    if (!connectionString) {
      return NextResponse.json({ ...diagnostics, error: "No hay connection string" });
    }

    // 2. Conector PG Estándar (TCP Directo vía Cloudflare connect())
    const sanitized = localSanitizeUrl(connectionString);
    const pool = new Pool({ connectionString: sanitized });

    // 3. Prueba Conexión (vía TCP Directo)
    try {
      const { rows } = await pool.query("SELECT 1 as test");
      if (rows?.[0]?.test === 1) {
        diagnostics.dbTest.connection = "✅ OK (Direct TCP)";
      } else {
        diagnostics.dbTest.connection = "❌ Respuesta inesperada del Pool PG";
      }
    } catch (e: unknown) {
      const error = e as Error;
      diagnostics.dbTest.connection = `❌ Error TCP Directo: ${error.message}`;
      return NextResponse.json(diagnostics);
    }

    // 4. Prueba Escritura (Atómica)
    try {
      await pool.query('CREATE TEMP TABLE pg_debug_test (id int)');
      await pool.query('DROP TABLE pg_debug_test');
      diagnostics.dbTest.write = "✅ OK";
    } catch (e: unknown) {
      diagnostics.dbTest.write = `❌ Error Escritura: ${e instanceof Error ? e.message : "Desconocido"}`;
    }

    // 5. Setup (Si aplica)
    if (setupMode) {
      diagnostics.setup.status = "Procesando...";
      try {
        diagnostics.setup.logs.push("Creando conjunto...");
        await pool.query(`
          INSERT INTO "Conjunto" (id, nombre, subdominio, direccion, ciudad, "colorPrimario", plan, activo)
          VALUES ('demo_id', 'Residencial Horizonte', 'horizonte_demo', 'Calle 100', 'Bogotá', '#1E3A5F', 'BASICO', true)
          ON CONFLICT (subdominio) DO UPDATE SET nombre = 'Residencial Horizonte'
        `);

        diagnostics.setup.logs.push("Creando usuario maestro...");
        await pool.query(`
          INSERT INTO "Usuario" (id, "conjuntoId", nombre, email, password, rol, activo, genero)
          VALUES ('master_thommy', 'demo_id', 'ThommyEnergy', 'thommy@example.com', '123456', 'SUPER_ADMIN', true, 'femenino')
          ON CONFLICT (email) DO UPDATE SET password = '123456'
        `);
        diagnostics.setup.status = "✅ ÉXITO";
      } catch (e: unknown) {
        diagnostics.setup.status = "❌ FALLO";
        diagnostics.setup.logs.push(`Error: ${e instanceof Error ? e.message : "Desconocido"}`);
      }
    }

    // Cerrar el pool para liberar la conexión TCP
    await pool.end();
    return NextResponse.json(diagnostics);

  } catch (globalError: unknown) {
    const error = globalError as Error;
    return NextResponse.json({
      error: "CRASH GLOBAL EN HANDLER",
      message: error.message,
      stack: error.stack,
      diagnostics
    }, { status: 500 });
  }
}
