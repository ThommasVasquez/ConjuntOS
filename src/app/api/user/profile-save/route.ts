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
    const err = error as { code?: string; message?: string };
    console.error("❌ [API-PROFILE-SAVE-FATAL]:", err);
    
    // Captura de llaves de entorno para diagnóstico
    let envKeys: string[] = [];
    try {
      const { getRequestContext } = await import("@cloudflare/next-on-pages");
      const ctx = getRequestContext();
      envKeys = Object.keys(ctx?.env || {});
    } catch { /* Ignorar */ }

    // Error específico de Prisma: Registro no encontrado
    if (err.code === 'P2025') {
       return NextResponse.json({ 
        success: false, 
        error: "USUARIO_NO_ENCONTRADO",
        details: "El ID de usuario en tu sesión no coincide con ningún registro en la base de datos actual. ¿Tal vez cambiaste de base de datos?",
        worker_env_keys: envKeys
      }, { status: 404 });
    }

    // Error de Neon/Conexión
    if (err.message?.includes("connection string") || err.message?.includes("host")) {
      return NextResponse.json({ 
        success: false, 
        error: "CONFIG_ERROR: DATABASE_URL_MISSING",
        details: `No se encontró la URL de la base de datos. Llaves vistas: [${envKeys.join(", ")}]`,
        worker_env_keys: envKeys
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: false, 
      error: "Error interno al guardar",
      details: err.message || "Fallo desconocido",
      worker_env_keys: envKeys,
      prisma_code: err.code
    }, { status: 500 });
  }
}
