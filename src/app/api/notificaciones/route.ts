export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import db from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const notificacionDelegate = await db.notificacion;
    const notificaciones = await notificacionDelegate.findMany({
      where: { usuarioId: session.user.id },
      orderBy: { creadoEn: 'desc' },
      take: 20
    });

    return NextResponse.json({ success: true, data: notificaciones });
  } catch (error) {
    console.error("GET Notificaciones Error:", error);
    return NextResponse.json({ success: false, error: 'DB Error' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
    const session = await auth();
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    try {
        const { id, leida, all } = await req.json();
        
        if (all) {
          const { supabase } = await import('@/lib/db');
          const { error } = await supabase
            .from("Notificacion")
            .update({ leida: true })
            .eq("usuarioId", session.user.id);
            
          if (error) throw error;
          return NextResponse.json({ success: true });
        }

        const notificacionDelegate = await db.notificacion;
        const updated = await notificacionDelegate.update({
            where: { id, usuarioId: session.user.id },
            data: { leida: leida ?? true }
        });

        return NextResponse.json({ success: true, data: updated });
    } catch (error) {
        return NextResponse.json({ success: false, error: 'DB Error' }, { status: 500 });
    }
}
