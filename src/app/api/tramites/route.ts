import { NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const estado = searchParams.get("estado");
    
    // Obtener los datos del rol directamente desde el proxy
    const usuarioDelegate = await db.usuario;
    const dbUser = await usuarioDelegate.findUnique({
      where: { id: session.user.id },
      select: { rol: true, conjuntoId: true }
    });

    if (!dbUser) {
      return NextResponse.json({ success: false, error: "Usuario no encontrado" }, { status: 404 });
    }

    const tramiteDelegate = await db.tramite;
    let tramites;

    // Si es admin/supervisor/concejo, ve todos los del conjunto.
    // Si es residente, ve solo los suyos.
    const isGestor = ['ADMINISTRADOR', 'SUPER_ADMIN'].includes(dbUser.rol);

    const whereClause: any = {
      conjuntoId: dbUser.conjuntoId
    };

    if (!isGestor) {
      whereClause.usuarioId = session.user.id;
    }
    
    if (estado) {
      whereClause.estado = estado;
    }

    tramites = await tramiteDelegate.findMany({
      where: whereClause,
      include: {
        usuario: {
          select: { nombre: true, email: true, rol: true, unidad: { select: { numero: true, torre: true } } }
        },
        aprobadoPor: {
          select: { nombre: true, rol: true }
        }
      },
      orderBy: { creadoEn: 'desc' }
    });

    return NextResponse.json({ success: true, data: tramites });
  } catch (error: any) {
    console.error("Error en GET /api/tramites:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { tipo, descripcion } = body;

    if (!tipo || !descripcion) {
       return NextResponse.json({ success: false, error: "Datos incompletos" }, { status: 400 });
    }

    // Convertir a string JSON si viene como objeto
    const descString = typeof descripcion === "string" ? descripcion : JSON.stringify(descripcion);

    const usuarioDelegate = await db.usuario;
    const dbUser = await usuarioDelegate.findUnique({
      where: { id: session.user.id },
      select: { conjuntoId: true }
    });

    if (!dbUser) {
      return NextResponse.json({ success: false, error: "Usuario no encontrado" }, { status: 404 });
    }

    const tramiteDelegate = await db.tramite;
    if (!tramiteDelegate) {
        throw new Error("Delegate 'tramite' no encontrado en Prisma Client.");
    }
    
    if (!dbUser.conjuntoId) {
        return NextResponse.json({ success: false, error: "El usuario no tiene un conjunto asignado en su perfil." }, { status: 400 });
    }

    // Crear el registro
    const nuevoTramite = await tramiteDelegate.create({
      data: {
        conjuntoId: dbUser.conjuntoId,
        usuarioId: session.user.id,
        tipo: tipo,
        estado: 'PENDIENTE',
        descripcion: descString
      }
    });

    return NextResponse.json({ success: true, data: nuevoTramite });
  } catch (error: any) {
    console.error("Error en POST /api/tramites:", error);
    
    // Diagnóstico extra para el error 500
    const { discoverUrl } = await import("@/lib/db");
    const rawUrl = await discoverUrl();
    const maskedUrl = rawUrl ? `${rawUrl.substring(0, 15)}...${rawUrl.substring(rawUrl.length - 10)}` : "VACÍA";

    return NextResponse.json({ 
        success: false, 
        error: error.message || "Error desconocido",
        details: error.code || "No code",
        diagnostics: { url: maskedUrl }
    }, { status: 500 });
  }
}
