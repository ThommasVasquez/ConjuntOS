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
  };
  setupStatus: string;
  setupLogs: string[];
  dbTest: {
    connection: string;
    writeTest: string;
    error_details?: any;
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const setupMode = searchParams.get("setup") === "true";

  const diagnostics: DiagnosticResult = {
    cloudflare: {
      context: "❌ NO DISPONIBLE",
      env_db_len: 0
    },
    setupStatus: "No intentado",
    setupLogs: [],
    dbTest: {
      connection: "Pendiente",
      writeTest: "No intentada"
    }
  };

  let connectionString = "";

  try {
    const ctx = getRequestContext() as unknown as { env: { DATABASE_URL?: string } };
    if (ctx?.env?.DATABASE_URL) {
      connectionString = ctx.env.DATABASE_URL.trim();
      diagnostics.cloudflare.context = "✅ DISPONIBLE";
      diagnostics.cloudflare.env_db_len = connectionString.length;
    }
  } catch (err) {
    diagnostics.cloudflare.context = `❌ ERROR ENTORNO: ${err instanceof Error ? err.message : String(err)}`;
  }

  if (connectionString) {
    const sanitized = sanitizeUrl(connectionString);
    const sql = neon(sanitized);

    // 1. PRUEBA DE CONEXIÓN
    try {
      await sql`SELECT 1`;
      diagnostics.dbTest.connection = "✅ CONEXIÓN EXITOSA";
    } catch (err: any) {
      diagnostics.dbTest.connection = "❌ FALLO CONEXIÓN";
      diagnostics.dbTest.error_details = {
        message: err.message,
        code: err.code,
        detail: err.detail
      };
      return NextResponse.json(diagnostics);
    }

    // 2. PRUEBA DE ESCRITURA MÍNIMA
    try {
      diagnostics.dbTest.writeTest = "Iniciando...";
      await sql`CREATE TEMP TABLE test_write (id int); DROP TABLE test_write;`;
      diagnostics.dbTest.writeTest = "✅ ESCRITURA TEMPORAL EXITOSA";
    } catch (err: any) {
      diagnostics.dbTest.writeTest = "❌ FALLO ESCRITURA";
      diagnostics.dbTest.error_details = {
        message: err.message,
        code: err.code,
        detail: err.detail
      };
    }

    // 3. MODO SETUP (INYECCIÓN REAL)
    if (setupMode) {
      diagnostics.setupStatus = "Ejecutando...";
      try {
        diagnostics.setupLogs.push("--- PASO 1: CONJUNTO ---");
        const conjuntoRes = await sql`
          INSERT INTO "Conjunto" (id, nombre, subdominio, direccion, ciudad, "colorPrimario", plan, activo)
          VALUES ('admin_demo_id', 'Residencial Horizonte', 'horizonte', 'Calle 100', 'Bogotá', '#1E3A5F', 'BASICO', true)
          ON CONFLICT (subdominio) DO UPDATE SET nombre = 'Residencial Horizonte'
          RETURNING id
        `;
        const cid = conjuntoRes[0].id;
        diagnostics.setupLogs.push(`✅ Conjunto ID: ${cid}`);

        diagnostics.setupLogs.push("--- PASO 2: USUARIO ---");
        await sql`
          INSERT INTO "Usuario" (id, "conjuntoId", nombre, email, password, rol, activo, genero)
          VALUES ('master_thommy', ${cid}, 'ThommyEnergy', 'thommy@example.com', '123456', 'SUPER_ADMIN', true, 'femenino')
          ON CONFLICT (email) DO UPDATE SET password = '123456'
        `;
        diagnostics.setupLogs.push("✅ Usuario maestro inyectado.");

        diagnostics.setupStatus = "✅ SETUP COMPLETADO EXITOSAMENTE";
      } catch (err: any) {
        diagnostics.setupStatus = "❌ FALLO SETUP";
        diagnostics.setupLogs.push(`ERROR DETALLADO: ${err.message}`);
        diagnostics.dbTest.error_details = {
          code: err.code,
          detail: err.detail,
          hint: err.hint,
          where: err.where
        };
      }
    }
  }

  return NextResponse.json(diagnostics);
}
