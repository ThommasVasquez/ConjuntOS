export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function GET() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (!session || role !== 'ENCARGADO_PARQUEADERO') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { default: db } = await import('@/lib/db');
    const prisma = db as any;

    const parqueaderos = await prisma.parqueadero.findMany({
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
  } catch (error) {
    return NextResponse.json({ success: false, error: 'DB Error' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  const role = (session?.user as { role?: string })?.role;
  
  if (!session || !userId || role !== 'ENCARGADO_PARQUEADERO') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { parqueaderoId, estado, placa, observacion } = body;

    if (!parqueaderoId || !estado) {
       return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const { default: db } = await import('@/lib/db');
    const prisma = db as any;

    // Update cell status
    const updated = await prisma.parqueadero.update({
      where: { id: parqueaderoId },
      data: { estado }
    });

    // Create Audit Log
    await prisma.registroParqueadero.create({
      data: {
        parqueaderoId,
        usuarioId: userId,
        tipo: estado === 'OCUPADO' ? 'INGRESO' : 'SALIDA',
        placa,
        observacion
      }
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("PUT Error:", error);
    return NextResponse.json({ success: false, error: 'DB Error' }, { status: 500 });
  }
}
