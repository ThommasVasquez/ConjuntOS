import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { neon } from "@neondatabase/serverless";
import { sanitizeUrl } from "@/lib/db";

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface DiagnosticResult {
  cloudflare: {
    context: string;
    env_db_len: number;
    protocol: string;
  };
  setupStatus: string;
  setupLogs: string[];
  http_test: {
    status: string;
    error?: string;
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const setupMode = searchParams.get("setup") === "true";

  const diagnostics: DiagnosticResult = {
    cloudflare: {
      context: "❌ NO DISPONIBLE",
      env_db_len: 0,
      protocol: "N/A"
    },
    setupStatus: "No intentado",
    setupLogs: [],
    http_test: {
      status: "No intentado"
    }
  };

  let connectionString = "";

  try {
    const ctx = getRequestContext() as unknown as { env: { DATABASE_URL?: string } };
    if (ctx && ctx.env && ctx.env.DATABASE_URL) {
      connectionString = ctx.env.DATABASE_URL.trim();
      diagnostics.cloudflare.context = "✅ DISPONIBLE";
      diagnostics.cloudflare.env_db_len = connectionString.length;
      diagnostics.cloudflare.protocol = connectionString.split(":")[0];
    }
  } catch (err) {
    diagnostics.cloudflare.context = `❌ ERROR EXTRACCIÓN: ${err instanceof Error ? err.message : "Desconocido"}`;
  }

  if (connectionString) {
    const sanitized = sanitizeUrl(connectionString);
    const sql = neon(sanitized);

    // 1. Diagnóstico Simple
    try {
      await sql`SELECT 1`;
      diagnostics.http_test.status = "✅ CONEXIÓN HTTP OK";
    } catch (err) {
      diagnostics.http_test.status = "❌ FALLO CONEXIÓN";
      diagnostics.http_test.error = err instanceof Error ? err.message : String(err);
    }

    // 2. Modo Setup (Inyección Directa)
    if (setupMode) {
      diagnostics.setupStatus = "Iniciando...";
      try {
        // A. Crear Conjunto Demo
        const conjuntoId = "demo_conjunto_id";
        diagnostics.setupLogs.push("Buscando/Creando conjunto...");
        
        await sql`
          INSERT INTO "Conjunto" (id, nombre, subdominio, direccion, ciudad, "colorPrimario", plan, activo)
          VALUES (${conjuntoId}, 'Residencial Horizonte', 'demo', 'Calle 123', 'Bogotá', '#1E3A5F', 'BASICO', true)
          ON CONFLICT (subdominio) DO NOTHING
        `;

        // B. Crear Usuario Maestro
        diagnostics.setupLogs.push("Buscando/Creando usuario maestro...");
        await sql`
          INSERT INTO "Usuario" (id, "conjuntoId", nombre, email, password, rol, activo, genero)
          VALUES ('master_user_id', ${conjuntoId}, 'ThommyEnergy', 'thommy@example.com', '123456', 'SUPER_ADMIN', true, 'femenino')
          ON CONFLICT (email) DO UPDATE SET password = '123456'
        `;

        diagnostics.setupStatus = "✅ TODO CREADO CON ÉXITO";
      } catch (err) {
        diagnostics.setupStatus = "❌ FALLO SETUP";
        diagnostics.setupLogs.push(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return NextResponse.json(diagnostics);
}
