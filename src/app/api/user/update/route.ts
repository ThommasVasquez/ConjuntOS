import { NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";

export const runtime = "edge";

export async function POST(req: Request) {
  try {
    // Diagnóstico de cookies para depuración en el panel de Cloudflare
    const cookieHeader = req.headers.get("cookie") || "";
    const cookieNames = cookieHeader.split(';').map(c => c.split('=')[0].trim());
    console.log("🍪 [API-UPDATE] Cookies en la petición:", cookieNames.join(', '));

    // En NextAuth v5, auth() en API routes (Edge) debería detectar la sesión automáticamente
    // si el secret y trustHost están correctamente configurados.
    const session = await auth();

    // 🛡️ FALLBACK: Diagnóstico para fallos de sesión en Edge
    if (!session?.user?.id) {
       console.warn("⚠️ [API-UPDATE] No se detectó sesión activa.");
       
       const hasSecureToken = cookieNames.some(name => name.includes('__Secure-next-auth.session-token'));
       const hasNormalToken = cookieNames.some(name => name.includes('next-auth.session-token'));
       
       return NextResponse.json({ 
         success: false, 
         error: "Unauthorized", 
         debug: { 
           message: "Session is null. Please re-login.",
           cookieNames,
           hasSecureToken,
           hasNormalToken
         } 
       }, { status: 401 });
    }

    const data = await req.json();
    const { name, phone, gender, avatar } = data;
    const userId = session.user.id;

    console.log("✅ [API-UPDATE] Usuario identificado:", userId);

    const usuarioDelegate = await db.usuario;
    
    // Verificar si el usuario existe para evitar el error P2025 de Prisma
    const exists = await usuarioDelegate.findUnique({ where: { id: userId } });
    if (!exists) {
      console.error("❌ [API-UPDATE] Usuario no encontrado en la DB:", userId);
      return NextResponse.json({ success: false, error: "Usuario no encontrado en la base de datos" }, { status: 404 });
    }

    const updated = await usuarioDelegate.update({
      where: { id: userId },
      data: {
        nombre: name,
        telefono: phone,
        genero: gender,
        avatar: avatar
      }
    });

    console.log("✨ [API-UPDATE] Perfil actualizado con éxito.");
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    const err = error as Error;
    console.error("❌ [API-UPDATE-FATAL]:", err.name, err.message);
    return NextResponse.json({ 
      success: false, 
      error: "Error interno del servidor",
      details: `${err.name}: ${err.message}` 
    }, { status: 500 });
  }
}
