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
    const areaId = searchParams.get('areaId');
    const dateStr = searchParams.get('date'); // Format: YYYY-MM-DD

    if (!areaId || !dateStr) {
      return NextResponse.json({ success: false, error: "areaId y date (YYYY-MM-DD) son requeridos" }, { status: 400 });
    }

    // Parse bounds for the given day
    const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
    const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);
    
    // SAFETY: If areaId is mock, return empty slots instead of crashing Supabase (Stage 56)
    if (areaId.startsWith("mock_")) {
      return NextResponse.json({ success: true, data: [] });
    }

    const reservaDelegate = await db.reserva;
    const reservasEnDia = await reservaDelegate.findMany({
      where: {
        areaId,
        estado: { not: "CANCELADA" },
        fechaInicio: {
          gte: startOfDay.toISOString(),
          lte: endOfDay.toISOString()
        }
      },
      select: {
        id: true,
        fechaInicio: true,
        fechaFin: true
      }
    });

    return NextResponse.json({ success: true, data: reservasEnDia });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const dbLastError = (db as any).getLastError?.();
    console.error("❌ [API-SLOTS]:", errorMsg, dbLastError);
    return NextResponse.json({ 
      success: false, 
      error: "Error recuperando disponibilidad", 
      details: errorMsg,
      dbErrorInfo: dbLastError 
    }, { status: 500 });
  }
}
