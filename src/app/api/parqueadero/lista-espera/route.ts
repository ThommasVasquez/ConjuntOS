import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import db from '@/lib/db';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Default fetch for current session user's conjunto, assuming 'demo_id' for now or from user logic.
    // To be robust, we fetch all active waitlist items.
    const waitlist = await db.listaEsperaParqueadero.findMany({
      where: { estado: 'EN_ESPERA' },
      orderBy: { creadoEn: 'asc' }
    });

    return NextResponse.json({ success: true, data: waitlist });
  } catch (error: any) {
    console.error("❌ [API-LISTA-ESPERA] GET error:", error.message);
    return NextResponse.json({ success: false, error: 'DB Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const conjuntoId = (session?.user as any)?.conjuntoId || 'demo_id';
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { placa, apto } = await req.json();

    if (!placa) {
      return NextResponse.json({ error: 'Missing placa' }, { status: 400 });
    }

    const item = await db.listaEsperaParqueadero.create({
      data: {
        conjuntoId,
        placa,
        apto
      }
    });

    return NextResponse.json({ success: true, data: item });
  } catch (error: any) {
    console.error("❌ [API-LISTA-ESPERA] POST error:", error.message);
    return NextResponse.json({ success: false, error: 'DB Error' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { id, estado } = await req.json();
    if (!id || !estado) {
      return NextResponse.json({ error: 'Missing id or estado' }, { status: 400 });
    }

    const updated = await db.listaEsperaParqueadero.update({
      where: { id },
      data: { 
        estado,
        asignadoEn: estado === 'ASIGNADO' ? new Date() : null
      }
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error("❌ [API-LISTA-ESPERA] PUT error:", error.message);
    return NextResponse.json({ success: false, error: 'DB Error' }, { status: 500 });
  }
}
