import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import db from '@/lib/db';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const parqueaderoId = searchParams.get('parqueaderoId');

    const whereClause = parqueaderoId ? { parqueaderoId } : {};

    const novedades = await db.novedadParqueadero.findMany({
      where: whereClause,
      orderBy: { creadoEn: 'desc' },
      take: 50,
      include: {
        usuario: { select: { nombre: true } },
        parqueadero: { select: { numero: true, torre: true } }
      }
    });

    return NextResponse.json({ success: true, data: novedades });
  } catch (error: any) {
    console.error("❌ [API-NOVEDADES] GET error:", error.message);
    return NextResponse.json({ success: false, error: 'DB Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json();
    const { parqueaderoId, tipo, descripcion, titulo } = body;
    const fullDescripcion = titulo ? `${titulo}${descripcion ? `: ${descripcion}` : ''}` : descripcion;

    if (!parqueaderoId || !tipo) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const novedad = await db.novedadParqueadero.create({
      data: {
        parqueaderoId,
        usuarioId: userId,
        tipo,
        descripcion: fullDescripcion
      }
    });

    // TODO: Trigger push notifications / citofonía events if applicable.

    return NextResponse.json({ success: true, data: novedad });
  } catch (error: any) {
    console.error("❌ [API-NOVEDADES] POST error:", error.message);
    return NextResponse.json({ success: false, error: 'DB Error' }, { status: 500 });
  }
}
