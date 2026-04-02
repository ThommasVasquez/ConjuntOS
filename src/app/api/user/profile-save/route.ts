import { NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
       return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { name, phone, gender, avatar } = await req.json();
    const userId = session.user.id;

    const usuarioDelegate = await db.usuario;
    const updated = await usuarioDelegate.update({
      where: { id: userId },
      data: {
        nombre: name,
        telefono: phone,
        genero: gender,
        avatar: avatar
      }
    });

    return NextResponse.json({ success: true, data: updated });

  } catch (error: unknown) {
    const err = error as Error;
    console.error("❌ [API-PROFILE-SAVE-FATAL]:", err);
    
    // Diagnóstico agresivo
    let envKeys: string[] = [];
    try {
      const { getRequestContext } = await import("@cloudflare/next-on-pages");
      const ctx = getRequestContext();
      envKeys = Object.keys(ctx?.env || {});
    } catch { /* Ignorar si no hay contexto */ }

    // Si es un error de Neon por falta de URL
    if (err.message?.includes("connection string") || err.message?.includes("host")) {
      return NextResponse.json({ 
        success: false, 
        error: "CONFIG_ERROR: DATABASE_URL_MISSING",
        details: `No se encontró la DATABASE_URL. Keys disponibles en el worker: [${envKeys.join(", ")}]`,
        worker_env_keys: envKeys
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: false, 
      error: "Error interno al guardar",
      details: err.message || "Fallo desconocido",
      worker_env_keys: envKeys
    }, { status: 500 });
  }
}
