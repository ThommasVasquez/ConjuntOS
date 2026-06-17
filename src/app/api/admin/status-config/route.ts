import { NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;

    // Fetch caller's details
    const user = await db.usuario.findUnique({
      where: { id: userId },
      select: { rol: true, conjuntoId: true, activoLlamadas: true, activoMensajes: true }
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "Usuario no encontrado" }, { status: 404 });
    }

    if (user.rol === "ADMINISTRADOR" || user.rol === "SUPER_ADMIN") {
      return NextResponse.json({
        success: true,
        activoLlamadas: user.activoLlamadas ?? true,
        activoMensajes: user.activoMensajes ?? true
      });
    }

    // For residents, fetch the administration status of their conjunto
    const admins = await db.usuario.findMany({
      where: { conjuntoId: user.conjuntoId, rol: "ADMINISTRADOR" },
      select: { activoLlamadas: true, activoMensajes: true }
    });

    // If no admin is configured, default availability to true
    if (admins.length === 0) {
      return NextResponse.json({
        success: true,
        isAdminOnline: true,
        activoLlamadas: true
      });
    }

    // If at least one admin is online/active, show as online/active
    const isAdminOnline = admins.some((admin: any) => admin.activoMensajes !== false);
    const activoLlamadas = admins.some((admin: any) => admin.activoLlamadas !== false);

    return NextResponse.json({
      success: true,
      isAdminOnline,
      activoLlamadas
    });

  } catch (error: any) {
    console.error("❌ [API-ADMIN-STATUS-CONFIG-GET]:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user?.id || !["ADMINISTRADOR", "SUPER_ADMIN"].includes(role || "")) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
    }

    const userId = session.user.id;
    const body = await req.json();
    
    const updateData: any = {};
    if (body.activoLlamadas !== undefined) {
      updateData.activoLlamadas = Boolean(body.activoLlamadas);
    }
    if (body.activoMensajes !== undefined) {
      updateData.activoMensajes = Boolean(body.activoMensajes);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: false, error: "No se proporcionaron datos de actualización" }, { status: 400 });
    }

    await db.usuario.update({
      where: { id: userId },
      data: updateData
    });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("❌ [API-ADMIN-STATUS-CONFIG-POST]:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
