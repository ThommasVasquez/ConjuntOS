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
        usuario: { select: { nombre: true } }
      }
    });

    return NextResponse.json({ success: true, data: parqueaderos });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'DB Error' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (!session || role !== 'ENCARGADO_PARQUEADERO') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { parqueaderoId, estado } = body;

    if (!parqueaderoId || !estado) {
       return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const { default: db } = await import('@/lib/db');
    const prisma = db as any;

    await prisma.parqueadero.update({
      where: { id: parqueaderoId },
      data: { estado }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'DB Error' }, { status: 500 });
  }
}
