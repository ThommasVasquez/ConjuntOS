import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { Pool } from "@neondatabase/serverless";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const isSetupMode = searchParams.get("setup") === "true";

  const diagnostics: Record<string, unknown> = {
    setup_mode: isSetupMode ? "ACTIVADO" : "DESACTIVADO",
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
      error: null as string | null,
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
    const ctx = getRequestContext() as { env: { DATABASE_URL?: string } };
    if (ctx && ctx.env) {
      diagnostics.cloudflare = { ...diagnostics.cloudflare as object, context: "✅ DISPONIBLE" };
      if (ctx.env.DATABASE_URL) {
        connectionString = ctx.env.DATABASE_URL.trim();
        diagnostics.cloudflare = { 
          ...diagnostics.cloudflare as object, 
          env_db: `✅ ENCONTRADA (Len: ${connectionString.length})`,
          raw_db_prefix: connectionString.substring(0, 8)
        };
      } else {
        diagnostics.cloudflare = { ...diagnostics.cloudflare as object, env_db: "❌ VACÍA en env" };
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Desconocido";
    diagnostics.cloudflare = { ...diagnostics.cloudflare as object, context: `❌ ERROR EXTRACCIÓN: ${msg}` };
  }

  // 2. Prueba de Pool DIRECTA (Sin Prisma)
  if (connectionString) {
    const pool_info = diagnostics.direct_pool_test as Record<string, unknown>;
    pool_info.status = "Iniciando prueba de Pool directa...";
    const pool = new Pool({ connectionString });
    try {
      const client = await pool.connect();
      await client.query('SELECT NOW()');
      pool_info.status = "✅ ÉXITO: Pool conectado y consulta SQL directa ok";
      client.release();
      await pool.end();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Desconocido";
      pool_info.status = "❌ FALLO: El Pool no pudo conectar";
      pool_info.error = msg;
    }
  }

  // 3. Prueba con el Cliente Global (Prisma)
  try {
    const { default: db } = await import("@/lib/db");
    const count = await db.usuario.count();
    const db_info = diagnostics.database as Record<string, unknown>;
    db_info.userCount = count;
    db_info.status = "✅ PRISMA CONECTADO";
    
    const masterUser = await db.usuario.findFirst({ where: { email: "thommy@example.com" } });
    db_info.masterUserExists = !!masterUser;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Desconocido";
    const db_info = diagnostics.database as Record<string, unknown>;
    db_info.status = "❌ PRISMA FALLÓ";
    db_info.error = msg;
  }

  return NextResponse.json(diagnostics);
}
