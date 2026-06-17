/**
 * notifyUser - Shared helper for porter (vigilancia) server actions.
 * Creates a DB Notificacion record AND sends a Web Push notification
 * to the target resident's device if they have a push subscription.
 *
 * Usage (inside an Edge route handler):
 *   await notifyUser({ usuarioId, titulo, mensaje, tipo, url });
 *
 * NOTE: This module must only be imported in server-side / edge routes.
 */

interface NotifyUserParams {
  prisma: any;        // the db proxy instance (already imported in the calling route)
  usuarioId: string;  // ID of the resident to notify
  titulo: string;     // Push & DB notification title
  mensaje: string;    // Push & DB notification body
  tipo?: string;      // Notificacion.tipo (default: 'INFO')
  url?: string;       // Deep link for push click (default: '/inicio')
}

export async function notifyUser({
  prisma,
  usuarioId,
  titulo,
  mensaje,
  tipo = 'INFO',
  url = '/inicio',
}: NotifyUserParams): Promise<void> {
  // 1. Persist in-app notification so bell icon shows it
  try {
    await prisma.notificacion.create({
      data: {
        usuarioId,
        tipo,
        titulo,
        mensaje,
        leida: false,
      },
    });
  } catch (dbErr) {
    console.error('[notifyUser] DB notification error:', dbErr);
  }

  // 2. Send Web Push (best-effort; never throws)
  try {
    const targetUser = await prisma.usuario.findFirst({
      where: { id: usuarioId },
      select: { notifPush: true },
    });

    if (targetUser?.notifPush) {
      const { sendPushNotification } = await import('@mmmike/web-push/send');
      const vapidKeys = {
        publicKey:  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '',
        privateKey: process.env.VAPID_PRIVATE_KEY || '',
        subject:    process.env.VAPID_SUBJECT || 'mailto:soporte@conjuntos.app',
      };
      const subscription = JSON.parse(targetUser.notifPush);
      await sendPushNotification(subscription, { title: titulo, body: mensaje, data: { url } } as any, vapidKeys);
    }
  } catch (pushErr) {
    console.error('[notifyUser] Push error:', pushErr);
  }
}
