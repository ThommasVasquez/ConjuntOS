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

    console.log("✅ [API-UPDATE] Actualizando usuario:", userId);

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
      error: "Internal Server Error",
      details: (error as Error).message 
    }, { status: 500 });
  }
}
