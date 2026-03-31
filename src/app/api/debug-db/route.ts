import { NextResponse } from "next/server";
import db from "@/lib/db";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET() {
  const diagnostics = {
    env: {
      DATABASE_URL: process.env.DATABASE_URL ? "✅ Configurada (Censurada)" : "❌ FALTANTE",
      AUTH_SECRET: process.env.AUTH_SECRET ? "✅ Configurada" : "❌ FALTANTE",
      NEXTAUTH_URL: process.env.NEXTAUTH_URL || "No configurada (v5 no la requiere estrictamente)",
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
  } catch (err: any) {
    diagnostics.database.status = "❌ ERROR DE CONEXIÓN";
    diagnostics.database.error = err.message || "Error desconocido";
    console.error("🔥 Error en Diagnóstico DB:", err);
  }

  return NextResponse.json(diagnostics);
}
