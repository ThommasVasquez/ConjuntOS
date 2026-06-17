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

    const paquetes = await prisma.paquete.findMany({
      where: { estado: 'EN_PORTERIA' },
      orderBy: { fechaLlegada: 'desc' }
    });

    // Enrich with user info manually (proxy doesn't support nested include.usuario.unidad)
    const enriched = await Promise.all(paquetes.map(async (p: any) => {
      if (!p.usuarioId) return { ...p, usuario: null };
      const usuario = await prisma.usuario.findFirst({ where: { id: p.usuarioId } });
      let userTorre = null;
      let userNumero = null;
      if (usuario?.unidadId) {
        const unidad = await prisma.unidad.findFirst({ where: { id: usuario.unidadId } });
        userTorre = unidad?.torre || null;
        userNumero = unidad?.numero || null;
      }
      return { 
        ...p, 
        usuario: usuario ? { 
          nombre: usuario.nombre, 
          torre: userTorre, 
          apto: userNumero,
          unidad: {
            torre: userTorre,
            numero: userNumero
          }
        } : null 
      };
    }));

    return NextResponse.json({ success: true, data: enriched });
  } catch (error) {
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

    // Create a database notification for the user
    try {
      await prisma.notificacion.create({
        data: {
          usuarioId,
          tipo: 'INFO',
          titulo: '¡Nuevo paquete recibido! 📦',
          mensaje: `${remitente} entregó: ${descripcion}. Recógelo en portería.`,
          leida: false
        }
      });
      console.log(`[paquete-notif]: Database notification created for user ${usuarioId}`);
    } catch (dbNotifErr) {
      console.error("Error creating database notification for package:", dbNotifErr);
    }

    // Send push notification to target user
    const targetUser = await prisma.usuario.findFirst({
      where: { id: usuarioId },
      select: { notifPush: true }
    });

    if (targetUser?.notifPush) {
      try {
        const { sendPushNotification } = await import("@mmmike/web-push/send");
        const vapidKeys = {
          publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "",
          privateKey: process.env.VAPID_PRIVATE_KEY || "",
          subject: process.env.VAPID_SUBJECT || "mailto:soporte@conjuntos.app",
        };
        const subscription = JSON.parse(targetUser.notifPush);
        const payload = {
          title: "¡Nuevo paquete recibido! 📦",
          body: `${remitente} entregó: ${descripcion}. Recógelo en portería.`,
          data: {
            url: "/paqueteria",
          }
        };
        await sendPushNotification(subscription, payload, vapidKeys);
        console.log(`[paquete-push]: Push notification sent to user ${usuarioId}`);
      } catch (pushErr) {
        console.error("Error sending push notification for package:", pushErr);
      }
    }

    return NextResponse.json({ success: true, data: nuevoPaquete });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'DB Error' }, { status: 500 });
  }
}

// Para marcar como ENTREGADO
export async function PUT(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const allowedRoles = ['VIGILANTE', 'SUPERVISOR_VIGILANCIA', 'ADMINISTRADOR', 'SUPER_ADMIN'];
  if (!session?.user || !allowedRoles.includes(role)) {
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

    const paquete = await prisma.paquete.update({
      where: { id: paqueteId },
      data: { estado: 'ENTREGADO', entregadoEn: new Date() }
    });

    // Notify resident that they picked up their package
    if (paquete?.usuarioId) {
      await notifyUser({
        prisma,
        usuarioId: paquete.usuarioId,
        titulo: 'Paquete entregado ✅',
        mensaje: `Tu paquete de ${paquete.remitente} fue marcado como entregado. ¡Ya está en tus manos!`,
        tipo: 'INFO',
        url: '/paqueteria',
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'DB Error' }, { status: 500 });
  }
}
