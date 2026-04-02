import { NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";

export const runtime = "edge";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const data = await req.json();
    const { name, phone, gender, avatar } = data;

    console.log("🚀 [API-UPDATE] Iniciando actualización para user:", session.user.id);

    const updated = await (await db.usuario).update({
      where: { id: session.user.id },
      data: {
        nombre: name,
        telefono: phone,
        genero: gender,
        avatar: avatar
      }
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("❌ [API-UPDATE-ERROR]:", error);
    return NextResponse.json({ 
      success: false, 
      error: "Error interno del servidor",
      details: (error as Error).message 
    }, { status: 500 });
  }
}
