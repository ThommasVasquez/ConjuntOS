export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { notifyUser } from '@/lib/notifyUser';

export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const allowedRoles = ['VIGILANTE', 'SUPERVISOR_VIGILANCIA', 'ADMINISTRADOR', 'SUPER_ADMIN'];
  if (!session?.user || !allowedRoles.includes(role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { default: db } = await import('@/lib/db');
    const prisma = db as any;

    const today = new Date();
    today.setHours(0,0,0,0);

    const novedades = await prisma.novedad.findMany({
      where: { creadoEn: { gte: today } },
      orderBy: { creadoEn: 'desc' }
    });

    const enriched = await Promise.all(novedades.map(async (n: any) => {
      if (!n.usuarioId) return { ...n, usuario: null };
      const usuario = await prisma.usuario.findFirst({
        where: { id: n.usuarioId }
      });
      return {
        ...n,
        usuario: usuario ? {
          nombre: usuario.nombre,
          rol: usuario.rol
        } : null
      };
    }));

    return NextResponse.json({ success: true, data: enriched });
  } catch (error) {
    console.error("GET Novedades Error:", error);
    return NextResponse.json({ success: false, error: 'DB Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const allowedRoles = ['VIGILANTE', 'SUPERVISOR_VIGILANCIA', 'ADMINISTRADOR', 'SUPER_ADMIN'];
  if (!session?.user || !allowedRoles.includes(role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { titulo, descripcion, tipo, notificarUsuarioId } = body;

    if (!titulo || !descripcion || !tipo) {
      return NextResponse.json({ error: 'Missing req fields' }, { status: 400 });
    }

    const { default: db } = await import('@/lib/db');
    const prisma = db as any;

    const nuevaNovedad = await prisma.novedad.create({
      data: {
        usuarioId: (session.user as any).id,
        titulo,
        descripcion,
        tipo
      }
    });

    // Notify all administrators in this conjunto
    try {
      const autor = await prisma.usuario.findFirst({
        where: { id: (session.user as any).id },
        select: { conjuntoId: true, nombre: true }
      });

      if (autor?.conjuntoId) {
        const admins = await prisma.usuario.findMany({
          where: { conjuntoId: autor.conjuntoId, rol: 'ADMINISTRADOR' },
          select: { id: true }
        });

        const tipoLabel: Record<string, string> = {
          INCIDENTE: '⚠️ Incidente',
          DAÑO: '🔧 Daño',
          CAMBIO_TURNO: '🔄 Cambio de turno',
          SOSPECHOSO: '🚫 Actividad sospechosa',
          RONDAS: '🛡️ Rondas',
          OTRO: '📝 Novedad',
        };
        const tipoStr = tipoLabel[tipo] || '📝 Novedad';

        await Promise.all(admins.map((admin: any) =>
          notifyUser({
            prisma,
            usuarioId: admin.id,
            titulo: `${tipoStr} reportada por portería`,
            mensaje: `${titulo}: ${descripcion.substring(0, 100)}${descripcion.length > 100 ? '…' : ''}`,
            tipo: 'NOVEDAD',
            url: '/admin-novedades',
          })
        ));

        // Notify specific resident if provided (e.g. for parking spot incidents)
        if (notificarUsuarioId) {
          await notifyUser({
            prisma,
            usuarioId: notificarUsuarioId,
            titulo: `Alerta de Parqueadero: ${titulo}`,
            mensaje: descripcion,
            tipo: 'NOVEDAD',
            url: '/inicio',
          });
        }
      }
    } catch (notifErr) {
      console.error('[novedades]: Error notificando admins/usuario:', notifErr);
    }

    return NextResponse.json({ success: true, data: nuevaNovedad });
  } catch (error) {
    console.error("POST Novedades Error:", error);
    return NextResponse.json({ success: false, error: 'DB Error' }, { status: 500 });
  }
}
