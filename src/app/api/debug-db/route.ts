import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { neon } from "@neondatabase/serverless";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const diagnostics: Record<string, unknown> = {
    cloudflare: {
      context: "❌ NO DISPONIBLE",
      env_db_len: 0,
      protocol: "N/A"
    },
    http_test: {
      status: "No intentado",
      error_name: null as string | null,
      error_message: null as string | null,
      error_stack: null as string | null
    },
    database: {
      status: "Desconocido",
      error: null as string | null
    }
  };

  let connectionString = "";

  try {
    const ctx = getRequestContext();
    const cfEnv = ctx?.env as { DATABASE_URL?: string };
    if (cfEnv?.DATABASE_URL) {
      connectionString = cfEnv.DATABASE_URL.trim();
      diagnostics.cloudflare.context = "✅ DISPONIBLE";
      diagnostics.cloudflare.env_db_len = connectionString.length;
      diagnostics.cloudflare.protocol = connectionString.split(":")[0];
    }
  } catch (e: any) {
    diagnostics.cloudflare.context = `❌ ERROR EXTRACCIÓN: ${e.message}`;
  }

  // PRUEBA HTTP (El método más robusto en Edge)
  if (connectionString) {
    diagnostics.http_test.status = "Iniciando prueba HTTP cruda...";
    try {
      const sql = neon(connectionString);
      const result = await sql`SELECT NOW()`;
      diagnostics.http_test.status = "✅ ÉXITO TOTAL: HTTP conectó y ejecutó SQL";
      diagnostics.http_test.data = result;
    } catch (e: any) {
      diagnostics.http_test.status = "❌ FALLO HTTP";
      diagnostics.http_test.error_name = e.name;
      diagnostics.http_test.error_message = e.message;
      diagnostics.http_test.error_stack = e.stack;
    }
  }

  return NextResponse.json(diagnostics);
}
