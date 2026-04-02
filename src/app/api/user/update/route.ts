import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";

export const runtime = "edge";

export const POST = auth(async (req) => {
  try {
    if (!req.auth?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    // req.json() must be called on the req object
    const data = await req.json();
    const { name, phone, gender, avatar } = data;

    const userId = req.auth.user.id;
    console.log("🚀 [API-UPDATE] Iniciando actualización para user:", userId);

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
    console.error("❌ [API-UPDATE-ERROR]:", error);
    return NextResponse.json({ 
      success: false, 
      error: "Error interno del servidor",
      details: (error as Error).message 
    }, { status: 500 });
  }
});
