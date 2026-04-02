import { NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";

export const runtime = "edge";

export async function POST(req: Request) {
  try {
    // 1. Validar Sesión
    const session = await auth();

    if (!session?.user?.id) {
       console.warn("⚠️ [API-UPDATE] No se detectó sesión activa.");
       return NextResponse.json({ 
         success: false, 
         error: "Sesión no válida. Por favor, re-login.",
         details: "Session is null or missing user.id"
       }, { status: 401 });
    }

    // 2. Parsear Body con seguridad
    let data;
    try {
      data = await req.json();
    } catch (e) {
      return NextResponse.json({ success: false, error: "Cuerpo de petición inválido" }, { status: 400 });
    }

    const { name, phone, gender, avatar } = data;
    const userId = session.user.id;

    console.log("✅ [API-UPDATE] Procesando actualización para:", userId);

    // 3. Obtener delegado de Prisma (Singleton asíncrono)
    const usuarioDelegate = await db.usuario;

    // 4. Actualización con Upsert/Update seguro
    // Usamos update pero capturamos errores específicos
    try {
      const updated = await usuarioDelegate.update({
        where: { id: userId },
        data: {
          nombre: name,
          telefono: phone ? String(phone) : undefined,
          genero: gender,
          avatar: avatar // Aquí podría estar el fallo si es muy grande
        }
      });

      console.log("✨ [API-UPDATE] Perfil actualizado exitosamente.");
      return NextResponse.json({ success: true, data: updated });
    } catch (dbError: any) {
      console.error("❌ [API-UPDATE-DB-ERROR]:", dbError);
      
      // Error P2025: Record to update not found
      if (dbError.code === 'P2025') {
        return NextResponse.json({ 
          success: false, 
          error: "Usuario no encontrado en la base de datos",
          details: "El ID de sesión no corresponde a ningún usuario registrado."
        }, { status: 404 });
      }

      return NextResponse.json({ 
        success: false, 
        error: "Error en la base de datos",
        details: dbError.message || "Fallo desconocido en Prisma"
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error("❌ [API-UPDATE-FATAL]:", error);
    return NextResponse.json({ 
      success: false, 
      error: "Error interno crítico",
      details: error.message || "Error fatal en el runtime"
    }, { status: 500 });
  }
}
