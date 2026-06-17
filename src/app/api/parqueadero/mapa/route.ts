import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import db from '@/lib/db';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    const role = (session?.user as { role?: string })?.role;
    const allowedRoles = ['ENCARGADO_PARQUEADERO', 'VIGILANTE', 'SUPERVISOR_VIGILANCIA', 'ADMINISTRADOR', 'SUPER_ADMIN'];
    
    if (!session || !role || !allowedRoles.includes(role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const parqueaderos = await db.parqueadero.findMany({
      orderBy: { numero: 'asc' },
      include: {
        usuario: { 
          select: { 
            id: true,
            nombre: true,
            vehiculos: true 
          } 
        }
      }
    });

    // Fetch the latest 100 INGRESO records to find active check-in times and plates
    const latestIngresos = await db.registroParqueadero.findMany({
      where: { tipo: 'INGRESO' },
      orderBy: { fecha: 'desc' },
      take: 100
    });

    const latestBySpot: Record<string, any> = {};
    for (const reg of latestIngresos) {
      if (!latestBySpot[reg.parqueaderoId]) {
        latestBySpot[reg.parqueaderoId] = reg;
      }
    }

    const enriched = parqueaderos.map((p: any) => {
      const activeReg = p.estado === 'OCUPADO' ? latestBySpot[p.id] : null;
      return {
        ...p,
        placaActiva: activeReg?.placa || null,
        fechaIngreso: activeReg?.fecha || null,
        observacionIngreso: activeReg?.observacion || null
      };
    });

    return NextResponse.json({ success: true, data: enriched });
  } catch (error: any) {
    console.error("❌ [API-MAPA] GET error:", error.message);
    return NextResponse.json({ success: false, error: 'DB Error' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    const role = (session?.user as { role?: string })?.role;
    const allowedRoles = ['ENCARGADO_PARQUEADERO', 'VIGILANTE', 'SUPERVISOR_VIGILANCIA', 'ADMINISTRADOR', 'SUPER_ADMIN'];
    
    if (!session || !userId || !role || !allowedRoles.includes(role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json();
    const { parqueaderoId, estado, placa, observacion } = body;

    if (!parqueaderoId || !estado) {
       return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Check if the cell is RESIDENTE and the user is a VIGILANTE
    if (role === 'VIGILANTE' || role === 'SUPERVISOR_VIGILANCIA') {
      const spot = await db.parqueadero.findUnique({
        where: { id: parqueaderoId }
      });
      if (spot && spot.tipo === 'RESIDENTE') {
        return NextResponse.json({ success: false, error: 'Las celdas de residentes no son modificables por vigilancia' }, { status: 403 });
      }
    }

    // Update cell status via unified proxy
    const updated = await db.parqueadero.update({
      where: { id: parqueaderoId },
      data: { estado }
    });

    // Create Audit Log via unified proxy
    await db.registroParqueadero.create({
      data: {
        parqueaderoId,
        usuarioId: userId,
        tipo: estado === 'OCUPADO' ? 'INGRESO' : 'SALIDA',
        placa,
        observacion
      }
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error("❌ [API-MAPA] PUT error:", error.message);
    return NextResponse.json({ success: false, error: 'DB Error' }, { status: 500 });
  }
}
