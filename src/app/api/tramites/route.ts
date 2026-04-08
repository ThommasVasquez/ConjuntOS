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
    
    // Obtener los datos del usuario para validar permisos
    const dbUser = await db.usuario.findUnique({
      where: { id: session.user.id },
      select: { rol: true, conjuntoId: true }
    });

    if (!dbUser) {
      return NextResponse.json({ success: false, error: "Usuario no encontrado" }, { status: 404 });
    }

    // Lógica de filtrado por rol
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

    const tramites = await db.tramite.findMany({
      where: whereClause,
      include: {
        usuario: {
          select: { 
            nombre: true, 
            email: true, 
            rol: true,
            unidad: {
              select: { numero: true, torre: true }
            }
          }
        },
        aprobadoPor: {
          select: { nombre: true, rol: true }
        }
      },
      orderBy: { creadoEn: 'desc' }
    });

    return NextResponse.json({ success: true, data: tramites });
  } catch (error: any) {
    console.error("❌ [API-TRAMITES] GET error:", error.message);
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

    const descString = typeof descripcion === "string" ? descripcion : JSON.stringify(descripcion);

    const dbUser = await db.usuario.findUnique({
      where: { id: session.user.id },
      select: { conjuntoId: true }
    });

    if (!dbUser?.conjuntoId) {
      return NextResponse.json({ success: false, error: "Conjunto no asignado" }, { status: 400 });
    }

    // Crear el registro vía proxy unificado
    const nuevoTramite = await db.tramite.create({
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
    console.error("❌ [API-TRAMITES] POST error:", error.message);
    return NextResponse.json({ 
        success: false, 
        error: error.message || "Error desconocido",
        details: error.code || "No code"
    }, { status: 500 });
  }
}
