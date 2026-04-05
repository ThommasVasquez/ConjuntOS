export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  try {
    const { default: db } = await import('@/lib/db');
    const prisma = db as any;

    // Get the latest round done today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const lastRound = await prisma.rondaParqueadero.findFirst({
      where: {
        fecha: { gte: startOfDay }
      },
      orderBy: { fecha: 'desc' },
      include: { usuario: { select: { nombre: true } } }
    });

    return NextResponse.json({ success: true, data: lastRound });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'DB Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  const role = (session?.user as { role?: string })?.role;

  if (!session || !userId || (role !== 'ENCARGADO_PARQUEADERO' && role !== 'VIGILANTE')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { hallazgos, completada } = body;

    const { default: db } = await import('@/lib/db');
    const prisma = db as any;

    const newRound = await prisma.rondaParqueadero.create({
      data: {
        usuarioId: userId,
        hallazgos: typeof hallazgos === 'string' ? hallazgos : JSON.stringify(hallazgos),
        completada: !!completada
      }
    });

    return NextResponse.json({ success: true, data: newRound });
  } catch (error) {
    console.error("POST Ronda Error:", error);
    return NextResponse.json({ success: false, error: 'DB Error' }, { status: 500 });
  }
}
