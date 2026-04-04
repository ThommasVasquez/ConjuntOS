import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * DIAGNOSTIC API
 * Permite verificar el estado del entorno Edge, autenticación y acceso a modelos de DB.
 */
export async function GET() {
  try {
    const session = await auth();
    
    // Chequeo de Modelos (Sin ejecutar queries pesadas)
    let modelsStatus = {};
    try {
      const { default: db } = await import("@/lib/db");
      modelsStatus = {
        usuario: !!db.usuario,
        visita: !!db.visita,
        paquete: !!db.paquete,
        pago: !!db.pago,
        solicitud: !!db.solicitudServicio,
      };
    } catch (e) {
      modelsStatus = { error: (e as Error).message };
    }

    return NextResponse.json({ 
      success: true, 
      status: "Operational",
      timestamp: new Date().toISOString(),
      runtime: "Cloudflare Edge",
      auth: {
        authenticated: !!session,
        userId: session?.user?.id || null,
        userName: session?.user?.name || null,
      },
      env: {
        DATABASE_URL_SET: !!process.env.DATABASE_URL,
        AUTH_SECRET_SET: !!process.env.AUTH_SECRET,
        NEXTAUTH_URL_SET: !!process.env.NEXTAUTH_URL,
        NODE_ENV: process.env.NODE_ENV,
      },
      database: {
        prismaModels: modelsStatus,
      }
    });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ 
      success: false, 
      error: error.message,
      stack: error.stack,
      context: "Diagnostic failed at root level"
    }, { status: 500 });
  }
}
