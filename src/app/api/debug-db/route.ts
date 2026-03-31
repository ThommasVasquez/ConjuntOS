import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import db from "@/lib/db";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET() {
  let cfContextStatus = "❌ NO DISPONIBLE";
  let cfEnvStatus = "❌ NO DISPONIBLE";

  try {
    const ctx = getRequestContext();
    if (ctx) {
      cfContextStatus = "✅ DISPONIBLE";
      const cfEnv = ctx.env as { DATABASE_URL?: string };
      cfEnvStatus = cfEnv.DATABASE_URL ? "✅ CONFIGURADA (Contexto)" : "❌ VACÍA en Contexto";
    }
  } catch (_) {
    cfContextStatus = "❌ ERROR: Fallo al obtener contexto";
  }

  const diagnostics = {
    env: {
      DATABASE_URL: process.env.DATABASE_URL ? "✅ Configurada (Censurada)" : "❌ FALTANTE",
      AUTH_SECRET: process.env.AUTH_SECRET ? "✅ Configurada" : "❌ FALTANTE",
      NEXTAUTH_URL: process.env.NEXTAUTH_URL || "No configurada (v5 no la requiere estrictamente)",
    },
    cloudflare: {
      context: cfContextStatus,
      env_db: cfEnvStatus
    },
    database: {
      status: "Desconocido",
      error: null as string | null,
      userCount: 0,
    }
  };

  try {
    // Intento de conexión rápida
    const count = await db.usuario.count();
    diagnostics.database.status = "✅ CONECTADA";
    diagnostics.database.userCount = count;
  } catch (error: unknown) {
    diagnostics.database.status = "❌ ERROR DE CONEXIÓN";
    diagnostics.database.error = error instanceof Error ? error.message : "Error desconocido";
    console.error("🔥 Error en Diagnóstico DB:", error);
  }

  return NextResponse.json(diagnostics);
}
