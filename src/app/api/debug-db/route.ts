import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { Pool } from "@neondatabase/serverless";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const isSetupMode = searchParams.get("setup") === "true";

  const diagnostics: any = {
    env: {
      DATABASE_URL_PROCESS: process.env.DATABASE_URL ? `EXISTE (Len: ${process.env.DATABASE_URL.length})` : "❌ FALTANTE en process.env",
    },
    cloudflare: {
      context: "❌ NO DISPONIBLE",
      env_db: "❌ NO DISPONIBLE",
      raw_db_prefix: "N/A",
    },
    direct_pool_test: {
      status: "No intentado",
      error: null,
    },
    database: {
      status: "Desconocido",
      userCount: 0,
      masterUserExists: false,
    }
  };

  let connectionString = "";

  // 1. Extraer del contexto de Cloudflare
  try {
    const ctx = getRequestContext();
    if (ctx) {
      diagnostics.cloudflare.context = "✅ DISPONIBLE";
      const cfEnv = ctx.env as { DATABASE_URL?: string };
      if (cfEnv?.DATABASE_URL) {
        connectionString = cfEnv.DATABASE_URL.trim();
        diagnostics.cloudflare.env_db = `✅ ENCONTRADA (Len: ${connectionString.length})`;
        diagnostics.cloudflare.raw_db_prefix = connectionString.substring(0, 8);
      } else {
        diagnostics.cloudflare.env_db = "❌ VACÍA en env";
      }
    }
  } catch (e: any) {
    diagnostics.cloudflare.context = `❌ ERROR EXTRACCIÓN: ${e.message}`;
  }

  // 2. Prueba de Pool DIRECTA (Sin Prisma)
  if (connectionString) {
    diagnostics.direct_pool_test.status = "Iniciando prueba de Pool directa...";
    const pool = new Pool({ connectionString });
    try {
      const client = await pool.connect();
      const result = await client.query('SELECT NOW()');
      diagnostics.direct_pool_test.status = "✅ ÉXITO: Pool conectado y consulta SQL directa ok";
      client.release();
      await pool.end();
    } catch (e: any) {
      diagnostics.direct_pool_test.status = "❌ FALLO: El Pool no pudo conectar";
      diagnostics.direct_pool_test.error = e.message;
    }
  }

  // 3. Prueba con el Cliente Global (Prisma)
  try {
    const { default: db } = await import("@/lib/db");
    const count = await db.usuario.count();
    diagnostics.database.userCount = count;
    diagnostics.database.status = "✅ PRISMA CONECTADO";
    
    const masterUser = await db.usuario.findFirst({ where: { email: "thommy@example.com" } });
    diagnostics.database.masterUserExists = !!masterUser;
  } catch (e: any) {
    diagnostics.database.status = "❌ PRISMA FALLÓ";
    diagnostics.database.error = e.message;
  }

  return NextResponse.json(diagnostics);
}
