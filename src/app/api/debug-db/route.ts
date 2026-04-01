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
  diagnostics?: unknown;
}

/**
 * Escapa el carácter '%' en la contraseña para que URL lo acepte.
 * Crítico para contraseñas como "Md5891129Ae%ThommyEnergy%"
 */
function localSanitizeUrl(baseUrl: string): string {
  if (!baseUrl) return "";
  try {
    let url = baseUrl;
    // Forzamos puerto 6543 para Supabase en el Edge
    if (url.includes("supabase.co") && url.includes(":5432")) {
      url = url.replace(":5432", ":6543");
    }
    // Regex flexible para postgres:// o postgresql://
    const parts = url.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.+)(@.+)$/);
    if (parts) {
      const [, protocol, user, password, rest] = parts;
      const safePassword = password.replace(/%/g, "%25");
      return `${protocol}${user}:${safePassword}${rest}`;
    }
    return url;
  } catch { /* Falls back to original */ }
  return baseUrl;
}

export async function GET(request: Request) {
  const diagnostics: DiagnosticResult = {
    state: "Iniciando...",
    cloudflare: { context: "Pendiente" },
    dbTest: { connection: "Pendiente", write: "Pendiente" },
    setup: { status: "No ejecutado", logs: [] }
  };

  let pool: Pool | null = null;

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

    // 2. Conector Neon Serverless (Edge Natively Compatible)
    const sanitized = localSanitizeUrl(connectionString);
    neonConfig.useSecureWebSocket = false;
    
    // Extraer host/port para diagnóstico visual (seguro)
    const urlObj = new URL(sanitized.replace("postgresql://", "http://").replace("postgres://", "http://"));
    diagnostics.diagnostics = { host: urlObj.hostname, port: urlObj.port };

    // Configuramos SSL flexible para resolver el Error 526
    pool = new Pool({ 
      connectionString: sanitized,
      ssl: { rejectUnauthorized: false }
    });

    // 3. Prueba Conexión (Túnel Neon)
    try {
      const client = await pool.connect();
      const { rows } = await client.query("SELECT 1 as test");
      client.release();
      
      if (rows?.[0]?.test === 1) {
        diagnostics.dbTest.connection = "✅ OK (Neon Serverless)";
      } else {
        diagnostics.dbTest.connection = "❌ Respuesta inesperada del Pool Neon";
      }
    } catch (e: unknown) {
      const error = e as Error;
      diagnostics.dbTest.connection = `❌ Error Conexión: ${error.message}`;
      if (error.message.includes("526")) {
          diagnostics.dbTest.connection += " (SSL Handshake Failure - Intenta puerto 6543)";
      }
      return NextResponse.json(diagnostics);
    }

    // 4. Prueba Escritura (Atómica)
    try {
      diagnostics.setup.logs.push("Iniciando prueba de escritura (TEMP TABLE)...");
      await pool.query('CREATE TEMP TABLE IF NOT EXISTS neon_debug_test (id int)');
      await pool.query('INSERT INTO neon_debug_test (id) VALUES (1)');
      await pool.query('DROP TABLE neon_debug_test');
      diagnostics.dbTest.write = "✅ OK (Escritura temporal verificada)";
      diagnostics.setup.logs.push("Prueba de escritura completada con éxito.");
    } catch (e: unknown) {
      diagnostics.dbTest.write = `❌ Error Escritura: ${e instanceof Error ? e.message : "Desconocido"}`;
      diagnostics.setup.logs.push(`Fallo en prueba de escritura: ${e instanceof Error ? e.message : "Error desconocido"}`);
    }

    // 5. Setup (Si aplica)
    if (setupMode) {
      diagnostics.setup.status = "Procesando...";
      try {
        diagnostics.setup.logs.push("Verificando existencia de tablas...");
        // Split queries for maximum compatibility on Edge
        await pool.query(`
          INSERT INTO "Conjunto" (id, nombre, subdominio, direccion, ciudad, "colorPrimario", plan, activo)
          VALUES ('demo_id', 'Residencial Horizonte', 'horizonte_demo', 'Calle 100', 'Bogotá', '#1E3A5F', 'BASICO', true)
          ON CONFLICT (subdominio) DO UPDATE SET nombre = 'Residencial Horizonte'
        `);
        diagnostics.setup.logs.push("✅ Conjunto 'demo_id' creado/actualizado.");

        await pool.query(`
          INSERT INTO "Usuario" (id, "conjuntoId", nombre, email, password, rol, activo, genero)
          VALUES ('master_thommy', 'demo_id', 'ThommyEnergy', 'thommy@example.com', '123456', 'SUPER_ADMIN', true, 'femenino')
          ON CONFLICT (email) DO UPDATE SET password = '123456'
        `);
        diagnostics.setup.logs.push("✅ Usuario maestro 'master_thommy' creado/actualizado.");
        
        diagnostics.setup.status = "✅ ÉXITO";
      } catch (e: unknown) {
        diagnostics.setup.status = "❌ FALLO";
        const errorMsg = e instanceof Error ? e.message : "Desconocido";
        diagnostics.setup.logs.push(`Error en setup: ${errorMsg}`);
        diagnostics.error = errorMsg;
      }
    }

    return NextResponse.json(diagnostics);

  } catch (globalError: unknown) {
    const error = globalError as Error;
    return NextResponse.json({
      error: "CRASH GLOBAL EN HANDLER",
      message: error.message,
      stack: error.stack,
      diagnostics
    }, { status: 500 });
  } finally {
    // Asegurar que el pool siempre se cierre para no dejar conexiones huérfanas en el Edge
    if (pool) {
      try {
        await pool.end();
      } catch (e) {
        console.error("Error al cerrar el pool:", e);
      }
    }
  }
}
