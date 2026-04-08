import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import db from '@/lib/db';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    const role = (session?.user as { role?: string })?.role;
    const allowedRoles = ['ENCARGADO_PARQUEADERO', 'ADMINISTRADOR', 'SUPER_ADMIN'];
    
    if (!session || !role || !allowedRoles.includes(role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const parqueaderos = await db.parqueadero.findMany({
      orderBy: { numero: 'asc' },
      include: {
        usuario: { 
          select: { 
            nombre: true,
            vehiculos: true 
          } 
        }
      }
    });

    return NextResponse.json({ success: true, data: parqueaderos });
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
    
    if (!session || !userId || role !== 'ENCARGADO_PARQUEADERO') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json();
    const { parqueaderoId, estado, placa, observacion } = body;

    if (!parqueaderoId || !estado) {
       return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
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
