import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { neon } from "@neondatabase/serverless";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * INLINED Sanitizer to avoid module resolution errors
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
  const diagnostics: any = {
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
      const ctx = getRequestContext() as any;
      if (ctx?.env?.DATABASE_URL) {
        connectionString = ctx.env.DATABASE_URL.trim();
        diagnostics.cloudflare.context = "✅ OK";
      } else {
        diagnostics.cloudflare.context = "❌ DATABASE_URL no encontrada en env";
      }
    } catch (e: any) {
      diagnostics.cloudflare.context = `❌ Error Contexto: ${e.message}`;
    }

    if (!connectionString) {
      return NextResponse.json({ ...diagnostics, error: "No hay connection string" });
    }

    // 2. Conector Neon (Sanitizado)
    const sanitized = localSanitizeUrl(connectionString);
    const sql = neon(sanitized);

    // 3. Prueba Conexión
    try {
      await sql`SELECT 1`;
      diagnostics.dbTest.connection = "✅ OK";
    } catch (e: any) {
      diagnostics.dbTest.connection = `❌ Error: ${e.message}`;
      return NextResponse.json(diagnostics);
    }

    // 4. Prueba Escritura (Atómica)
    try {
      await sql`CREATE TEMP TABLE debug_test (id int)`;
      await sql`DROP TABLE debug_test`;
      diagnostics.dbTest.write = "✅ OK";
    } catch (e: any) {
      diagnostics.dbTest.write = `❌ Error Escritura: ${e.message}`;
    }

    // 5. Setup (Si aplica)
    if (setupMode) {
      diagnostics.setup.status = "Procesando...";
      try {
        diagnostics.setup.logs.push("Creando conjunto...");
        await sql`
          INSERT INTO "Conjunto" (id, nombre, subdominio, direccion, ciudad, "colorPrimario", plan, activo)
          VALUES ('demo_id', 'Residencial Horizonte', 'horizonte_demo', 'Calle 100', 'Bogotá', '#1E3A5F', 'BASICO', true)
          ON CONFLICT (subdominio) DO UPDATE SET nombre = 'Residencial Horizonte'
        `;

        diagnostics.setup.logs.push("Creando usuario maestro...");
        await sql`
          INSERT INTO "Usuario" (id, "conjuntoId", nombre, email, password, rol, activo, genero)
          VALUES ('master_thommy', 'demo_id', 'ThommyEnergy', 'thommy@example.com', '123456', 'SUPER_ADMIN', true, 'femenino')
          ON CONFLICT (email) DO UPDATE SET password = '123456'
        `;
        diagnostics.setup.status = "✅ ÉXITO";
      } catch (e: any) {
        diagnostics.setup.status = "❌ FALLO";
        diagnostics.setup.logs.push(`Error: ${e.message}`);
      }
    }

    return NextResponse.json(diagnostics);

  } catch (globalError: any) {
    return NextResponse.json({
      error: "CRASH GLOBAL EN HANDLER",
      message: globalError.message,
      stack: globalError.stack,
      diagnostics
    }, { status: 500 });
  }
}
