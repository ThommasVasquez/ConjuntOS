import { NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";

export const runtime = "edge";

export const POST = auth(async (req) => {
  try {
    // 🛠 DEBUG: Verificamos qué llega a la API
    const cookies = req.headers.get("cookie") || "Sin cookies";
    console.log("🍪 [API-UPDATE] Headers Cookies:", cookies.substring(0, 50) + "...");

    // Intentamos obtener la sesión de req.auth o auth() directo como fallback
    let session = req.auth;
    if (!session) {
      console.log("⚠️ [API-UPDATE] req.auth es nulo, intentando auth() directo...");
      session = await auth();
    }

    if (!session?.user?.id) {
      console.error("❌ [API-UPDATE] No se encontró sesión válida (401)");
      return NextResponse.json({ success: false, error: "No autorizado - Sesión no encontrada" }, { status: 401 });
    }

    const data = await req.json();
    const { name, phone, gender, avatar } = data;
    const userId = session.user.id;

    console.log("✅ [API-UPDATE] Procesando actualización para user:", userId);

    const updated = await (await db.usuario).update({
      where: { id: userId },
      data: {
        nombre: name,
        telefono: phone,
        genero: gender,
        avatar: avatar
      }
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("❌ [API-UPDATE-FATAL]:", error);
    return NextResponse.json({ 
      success: false, 
      error: "Error interno del servidor",
      details: (error as Error).message 
    }, { status: 500 });
  }
});
