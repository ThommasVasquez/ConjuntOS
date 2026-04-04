export const runtime = 'edge';
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

    const paquetes = await prisma.paquete.findMany({
      where: { estado: 'EN_PORTERIA' },
      orderBy: { fechaLlegada: 'desc' },
      include: {
        usuario: { select: { nombre: true, unidad: { select: { numero: true, torre: true } } } }
      }
    });

    return NextResponse.json({ success: true, data: paquetes });
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
    const { usuarioId, descripcion, remitente } = body;

    if (!usuarioId || !descripcion || !remitente) {
      return NextResponse.json({ error: 'Missing req fields' }, { status: 400 });
    }

    const { default: db } = await import('@/lib/db');
    const prisma = db as any;

    const nuevoPaquete = await prisma.paquete.create({
      data: {
        usuarioId,
        descripcion,
        remitente,
        estado: 'EN_PORTERIA',
        fechaLlegada: new Date()
      }
    });

    return NextResponse.json({ success: true, data: nuevoPaquete });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'DB Error' }, { status: 500 });
  }
}

// Para marcar como ENTREGADO
export async function PUT(req: Request) {
  const session = await auth();
  if (!session || (session.user.role !== 'VIGILANTE' && session.user.role !== 'SUPERVISOR_VIGILANCIA')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { paqueteId } = body;

    if (!paqueteId) {
       return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const { default: db } = await import('@/lib/db');
    const prisma = db as any;

    await prisma.paquete.update({
      where: { id: paqueteId },
      data: { estado: 'ENTREGADO', entregadoEn: new Date() }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'DB Error' }, { status: 500 });
  }
}
