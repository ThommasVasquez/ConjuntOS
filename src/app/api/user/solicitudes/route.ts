import { NextResponse } from "next/server";
import db from "@/lib/db";
import { auth } from "@/auth";

export const runtime = "edge";

/**
 * API DE SOLICITUDES / PQRS - CONJUNTOAPP
 * Gestión centralizada de peticiones, quejas y mantenimiento.
 */

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;
    const solicitudesDelegate = await db.solicitudServicio;

    const solicitudes = await solicitudesDelegate.findMany({
      where: { usuarioId: userId },
      orderBy: { creadoEn: 'desc' },
    });

    return NextResponse.json({ success: true, data: solicitudes });

  } catch (error: unknown) {
    console.error("❌ Error fetching solicitudes:", error);
    return NextResponse.json({ success: false, error: "Error en el servidor" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { tipo, categoria, descripcion, urgente, imagenes } = body;

    if (!tipo || !categoria || !descripcion) {
      return NextResponse.json({ success: false, error: "Faltan campos obligatorios" }, { status: 400 });
    }

    const userId = session.user.id;
    
    // Obtenemos los datos del usuario para asociar correctamente
    const usuarioDelegate = await db.usuario;
    const user = await usuarioDelegate.findUnique({
      where: { id: userId },
      select: { conjuntoId: true }
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "Usuario no encontrado" }, { status: 404 });
    }

    const solicitudesDelegate = await db.solicitudServicio;

    const nuevaSolicitud = await (solicitudesDelegate as unknown as { create: (args: unknown) => Promise<unknown> }).create({
      data: {
        conjuntoId: user.conjuntoId,
        usuarioId: userId,
        tipo,
        categoria,
        descripcion,
        urgente: urgente || false,
        imagenes: imagenes || "[]",
        estado: "ABIERTA"
      }
    });

    return NextResponse.json({ success: true, data: nuevaSolicitud });

  } catch (error: unknown) {
    console.error("❌ Error creating solicitud:", error);
    return NextResponse.json({ success: false, error: "Error al crear la solicitud" }, { status: 500 });
  }
}
