import { NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";

export const runtime = "edge";

export async function POST(req: Request) {
  try {
    const cookieHeader = req.headers.get("cookie") || "";
    const cookieNames = cookieHeader.split(';').map(c => c.split('=')[0].trim());
    console.log("🍪 [API-UPDATE] Cookies detectadas:", cookieNames.join(', '));

    // Intento de sesión directo
    let session = await auth();

    // 🛡️ FALLBACK: Si auth() falla, mandamos logs extra para debug
    if (!session?.user?.id) {
       console.warn("⚠️ [API-UPDATE] auth() no detectó sesión. Buscando tokens en cookies...");
       const hasToken = cookieNames.some(name => name.includes('session-token'));
       if (hasToken) {
          console.log("💡 [API-UPDATE] Se encontró cookie de sesión física, pero auth() falló al validarla.");
       }
    }
    
    if (!session?.user?.id) {
      return NextResponse.json({ 
        success: false, 
        error: "Unauthorized", 
        debug: { cookiesPresentes: cookieNames } 
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
