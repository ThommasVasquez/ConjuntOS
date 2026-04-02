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
    console.error("❌ [API-PROFILE-SAVE-ERROR]:", error);
    const err = error as { message?: string };
    return NextResponse.json({ 
      success: false, 
      error: "Error al guardar el perfil",
      details: err.message || "Fallo interno en el servidor"
    }, { status: 500 });
  }
}
