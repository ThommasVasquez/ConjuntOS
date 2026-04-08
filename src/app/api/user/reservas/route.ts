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
    const filter = searchParams.get('filter') || 'future';

    const limitDate = new Date();
    
    const reservaDelegate = await db.reserva;
    const reservas = await reservaDelegate.findMany({
      where: {
        usuarioId: session.user.id,
        ...(filter === 'future' ? { fechaInicio: { gte: limitDate.toISOString() } } : {})
      },
      include: {
        area: {
          select: { nombre: true, imagenUrl: true } // Avoid fetching unused heavy data. (Using Prisma select effectively)
        }
      },
      orderBy: { fechaInicio: 'asc' }
    });

    return NextResponse.json({ success: true, data: reservas });

  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("❌ [API-RESERVAS-GET]:", errorMsg);
    return NextResponse.json({ success: false, error: "Error recuperando reservas", details: errorMsg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
       return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { areaId, fechaInicio, fechaFin, notas } = body;

    if (!areaId || !fechaInicio || !fechaFin) {
       return NextResponse.json({ success: false, error: "Datos incompletos" }, { status: 400 });
    }

    // SAFETY: Prevent crashing Supabase with mock IDs (Stage 56)
    if (areaId.startsWith("mock_")) {
      return NextResponse.json({ success: false, error: "Esta zona está en proceso de activación. Por favor recarga la página." }, { status: 400 });
    }

    const start = new Date(fechaInicio);
    const end = new Date(fechaFin);

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
       return NextResponse.json({ success: false, error: "Rango de tiempo inválido" }, { status: 400 });
    }

    // Opcional: Podríamos verificar la colisión en la DB antes de insertar, 
    // pero para este MVP rápido en el Edge podemos delegar en Unique Constraints si existieran o simplemente consultar:
    const reservaDelegate = await db.reserva;
    const colliding = await reservaDelegate.findFirst({
       where: {
         areaId,
         estado: { not: "CANCELADA" },
         fechaInicio: { lt: end.toISOString() },
         fechaFin: { gt: start.toISOString() }
       }
    });

    if (colliding) {
       return NextResponse.json({ success: false, error: "Este horario ya se encuentra reservado. Actualiza la página." }, { status: 409 });
    }

    // Buscamos Info del Usuario para obtener el conjuntoId
    const usuarioDelegate = await db.usuario;
    const user = await usuarioDelegate.findUnique({ where: { id: session.user.id }, select: { conjuntoId: true } });
    if(!user) return NextResponse.json({ success: false, error: "Usuario no existe" }, { status: 404 });

    // Determinar Estado Inicial (Si requiere depósito, pasa a pendiente)
    const areaDelegate = await db.areaComun;
    const area = await areaDelegate.findUnique({ where: { id: areaId }, select: { requiereDeposito: true } });
    const estadoInicial = area?.requiereDeposito ? "PENDIENTE" : "CONFIRMADA";

    const nuevaReserva = await reservaDelegate.create({
      data: {
        conjuntoId: user.conjuntoId,
        usuarioId: session.user.id,
        areaId,
        fechaInicio: start.toISOString(),
        fechaFin: end.toISOString(),
        estado: estadoInicial as any,
        notas: notas || null
      }
    });

    return NextResponse.json({ success: true, data: nuevaReserva });

  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const dbLastError = (db as any).getLastError?.();
    console.error("❌ [API-RESERVAS-POST]:", errorMsg, dbLastError);
    return NextResponse.json({ 
      success: false, 
      error: "Error procesando reserva", 
      details: errorMsg,
      dbErrorInfo: dbLastError 
    }, { status: 500 });
  }
}
