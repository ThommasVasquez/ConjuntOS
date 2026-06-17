export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';

const ALLOWED = ['ENCARGADO_PARQUEADERO', 'VIGILANTE', 'SUPERVISOR_VIGILANCIA', 'ADMINISTRADOR', 'SUPER_ADMIN'];

export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !ALLOWED.includes(role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { default: db } = await import('@/lib/db');
    const prisma = db as any;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const rondas = await prisma.rondaParqueadero.findMany({
      where: { fecha: { gte: startOfDay } },
      orderBy: { fecha: 'desc' },
      take: 20
    });

    // Enrich with user name manually (proxy doesn't support include/join)
    const enriched = await Promise.all(rondas.map(async (r: any) => {
      if (!r.usuarioId) return { ...r, usuario: null };
      try {
        const usuario = await prisma.usuario.findFirst({
          where: { id: r.usuarioId },
          select: { nombre: true }
        });
        return { ...r, usuario: usuario ? { nombre: usuario.nombre } : null };
      } catch {
        return { ...r, usuario: null };
      }
    }));

    return NextResponse.json({ success: true, data: enriched });
  } catch (error) {
    console.error('GET Rondas Error:', error);
    return NextResponse.json({ success: false, error: 'DB Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  const role = (session?.user as any)?.role;

  if (!session?.user || !userId || !ALLOWED.includes(role)) {
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
        hallazgos: typeof hallazgos === 'string' ? hallazgos : JSON.stringify(hallazgos || []),
        completada: !!completada,
        fecha: new Date()
      }
    });

    return NextResponse.json({ success: true, data: newRound });
  } catch (error) {
    console.error('POST Ronda Error:', error);
    return NextResponse.json({ success: false, error: 'DB Error' }, { status: 500 });
  }
}
