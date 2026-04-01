import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { neon } from "@neondatabase/serverless";

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface DiagnosticResult {
  cloudflare: {
    context: string;
    env_db_len: number;
    protocol: string;
  };
  http_test: {
    status: string;
    error_name: string | null;
    error_message: string | null;
    error_stack: string | null;
    data?: unknown;
  };
  database: {
    status: string;
    error: string | null;
  };
}

export async function GET() {
  const diagnostics: DiagnosticResult = {
    cloudflare: {
      context: "❌ NO DISPONIBLE",
      env_db_len: 0,
      protocol: "N/A"
    },
    http_test: {
      status: "No intentado",
      error_name: null,
      error_message: null,
      error_stack: null
    },
    database: {
      status: "Desconocido",
      error: null
    }
  };

  let connectionString = "";

  try {
    const ctx = getRequestContext() as unknown as { env: { DATABASE_URL?: string } };
    if (ctx && ctx.env) {
      if (ctx.env.DATABASE_URL) {
        connectionString = ctx.env.DATABASE_URL.trim();
        diagnostics.cloudflare.context = "✅ DISPONIBLE";
        diagnostics.cloudflare.env_db_len = connectionString.length;
        diagnostics.cloudflare.protocol = connectionString.split(":")[0];
      } else {
        diagnostics.cloudflare.context = "✅ DISPONIBLE (Pero DATABASE_URL vacía)";
      }
    }
  } catch (err) {
    diagnostics.cloudflare.context = `❌ ERROR EXTRACCIÓN: ${err instanceof Error ? err.message : "Desconocido"}`;
  }

  // PRUEBA HTTP (El método más robusto en Edge)
  if (connectionString) {
    diagnostics.http_test.status = "Iniciando prueba HTTP cruda...";
    try {
      const sql = neon(connectionString);
      const result = await sql`SELECT NOW()`;
      diagnostics.http_test.status = "✅ ÉXITO TOTAL: HTTP conectó y ejecutó SQL";
      diagnostics.http_test.data = result;
    } catch (err) {
      diagnostics.http_test.status = "❌ FALLO HTTP";
      if (err instanceof Error) {
        diagnostics.http_test.error_name = err.name;
        diagnostics.http_test.error_message = err.message;
        diagnostics.http_test.error_stack = err.stack || null;
      }
    }
  }

  return NextResponse.json(diagnostics);
}
