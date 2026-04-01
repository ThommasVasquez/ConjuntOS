import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import db from "@/lib/db";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const isSetupMode = searchParams.get("setup") === "true";

  let cfContextStatus = "❌ NO DISPONIBLE";
  let cfEnvStatus = "❌ NO DISPONIBLE";

  try {
    const ctx = getRequestContext();
    if (ctx) {
      cfContextStatus = "✅ DISPONIBLE";
      const cfEnv = ctx.env as { DATABASE_URL?: string };
      cfEnvStatus = cfEnv.DATABASE_URL ? "✅ CONFIGURADA (Contexto)" : "❌ VACÍA en Contexto";
    }
  } catch {
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
      masterUserExists: false,
      setupSuccess: null as boolean | null,
      setupLogs: [] as string[],
    }
  };

  try {
    // 1. Verificar conteo
    diagnostics.database.userCount = await db.usuario.count();
    
    // 2. Verificar Master User
    const masterUser = await db.usuario.findFirst({
      where: { email: "thommy@example.com" }
    });
    diagnostics.database.masterUserExists = !!masterUser;
    diagnostics.database.status = "✅ CONECTADA";

    // 3. MODO SETUP FORZADO
    if (isSetupMode && !masterUser) {
      diagnostics.database.setupLogs.push("🛠️ Iniciando Setup Forzado...");
      
      // Asegurar Conjunto
      let conjunto = await db.conjunto.findFirst();
      if (!conjunto) {
        diagnostics.database.setupLogs.push("🏢 Creando Conjunto Master...");
        conjunto = await db.conjunto.create({
          data: {
            nombre: "Conjunto Demo",
            subdominio: `demo-${Date.now()}`, // Único para evitar errores de duplicado
            direccion: "Dirección Master",
            ciudad: "Bogotá"
          }
        });
      }

      // Crear Usuario
      diagnostics.database.setupLogs.push("👤 Creando Usuario Thommy...");
      await db.usuario.create({
        data: {
          nombre: "Thommy Administrator",
          email: "thommy@example.com",
          password: "123456",
          rol: "SUPER_ADMIN",
          conjuntoId: conjunto.id,
          genero: "femenino"
        }
      });
      
      diagnostics.database.setupSuccess = true;
      diagnostics.database.setupLogs.push("✅ Usuario maestro creado con éxito.");
      diagnostics.database.masterUserExists = true;
      diagnostics.database.userCount = await db.usuario.count();
    }

  } catch (error: unknown) {
    diagnostics.database.status = "❌ ERROR EN DB";
    diagnostics.database.error = error instanceof Error ? error.message : "Error desconocido";
    diagnostics.database.setupSuccess = false;
  }

  return NextResponse.json(diagnostics);
}
