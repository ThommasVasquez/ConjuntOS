import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function GET() {
  const session = await auth();
  if (!session || (session.user.role !== 'VIGILANTE' && session.user.role !== 'SUPERVISOR_VIGILANCIA')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { default: db } = await import('@/lib/db');
    const prisma = db as any;

    const today = new Date();
    today.setHours(0,0,0,0);

    const visitas = await prisma.visita.findMany({
      where: { creadoEn: { gte: today } },
      orderBy: { creadoEn: 'desc' },
      include: {
        usuario: { select: { nombre: true, unidad: { select: { numero: true, torre: true } } } }
      }
    });

    return NextResponse.json({ success: true, data: visitas });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'DB Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session || (session.user.role !== 'VIGILANTE' && session.user.role !== 'SUPERVISOR_VIGILANCIA')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { usuarioId, nombre, tipo, vehiculoTipo, placa, observacion } = body;

    if (!usuarioId || !nombre || !tipo) {
      return NextResponse.json({ error: 'Missing req fields' }, { status: 400 });
    }

    const { default: db } = await import('@/lib/db');
    const prisma = db as any;

    const nuevaVisita = await prisma.visita.create({
      data: {
        usuarioId,
        nombre,
        tipo,
        vehiculoTipo: vehiculoTipo || null,
        placa: placa || null,
        fecha: new Date(),
        observacion: observacion || null
      }
    });

    return NextResponse.json({ success: true, data: nuevaVisita });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'DB Error' }, { status: 500 });
  }
}
