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

    const { checkAndProcessReservations } = await import("@/lib/parkingHelper");
    try {
      await checkAndProcessReservations(prisma);
    } catch (cronErr) {
      console.warn("⚠️ Error processing reservations in visitas GET:", cronErr);
    }

    const today = new Date();
    today.setHours(0,0,0,0);

    const visitas = await prisma.visita.findMany({
      where: {
        OR: [
          { creadoEn: { gte: today } },
          { fecha: { gte: today } },
          { estadoVisita: { in: ['PENDIENTE', 'CELDA_ASIGNADA', 'NOTIFICADO_15_MIN', 'CONFIRMADA', 'EXPIRADA'] } }
        ]
      },
      orderBy: { creadoEn: 'desc' }
    });

    // Enrich with user and unit info manually (proxy doesn't support nested includes/joins)
    const enriched = await Promise.all(visitas.map(async (v: any) => {
      if (!v.usuarioId) return { ...v, usuario: null };
      const usuario = await prisma.usuario.findFirst({ where: { id: v.usuarioId } });
      let userTorre = null;
      let userNumero = null;
      if (usuario?.unidadId) {
        const unidad = await prisma.unidad.findFirst({ where: { id: usuario.unidadId } });
        userTorre = unidad?.torre || null;
        userNumero = unidad?.numero || null;
      }
      return {
        ...v,
        usuario: usuario ? {
          nombre: usuario.nombre,
          unidad: {
            torre: userTorre,
            numero: userNumero
          }
        } : null
      };
    }));

    return NextResponse.json({ success: true, data: enriched });
  } catch (error) {
    console.error("GET Visitas Error:", error);
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
    const { usuarioId, nombre, tipo, vehiculoTipo, placa, observacion, documento, categoria } = body;

    if (!usuarioId || !nombre || !tipo) {
      return NextResponse.json({ error: 'Missing req fields' }, { status: 400 });
    }

    const { default: db } = await import('@/lib/db');
    const prisma = db as any;

    const nuevaVisita = await prisma.visita.create({
      data: {
        usuarioId,
        nombre,
        tipo,
        vehiculoTipo: vehiculoTipo || null,
        placa: placa || null,
        fecha: new Date(),
        observacion: observacion || null,
        documento: documento || null,
        categoria: categoria || 'VISITA'
      }
    });

    // Notify the resident that a visitor has arrived
    const catLabel: Record<string, string> = {
      VISITA: 'visita',
      DELIVERY: 'domicilio',
      CONTRATISTA: 'contratista',
      PROVEEDOR: 'proveedor',
    };
    const catStr = catLabel[categoria || 'VISITA'] || 'visita';
    await notifyUser({
      prisma,
      usuarioId,
      titulo: `Ingreso de ${catStr} 🚪`,
      mensaje: `${nombre} llegó a portería${observacion ? ` — ${observacion}` : ''}.`,
      tipo: 'INFO',
      url: '/inicio',
    });

    return NextResponse.json({ success: true, data: nuevaVisita });
  } catch (error) {
    console.error("POST Visitas Error:", error);
    return NextResponse.json({ success: false, error: 'DB Error' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const role = (session?.user as any)?.role;
  const watchmanRoles = ['VIGILANTE', 'SUPERVISOR_VIGILANCIA', 'ADMINISTRADOR', 'SUPER_ADMIN', 'ENCARGADO_PARQUEADERO'];

  try {
    const body = await req.json();
    const { visitaId, action, celdaId } = body;

    if (!visitaId) {
      return NextResponse.json({ error: 'Missing req fields' }, { status: 400 });
    }

    const { default: db } = await import('@/lib/db');
    const prisma = db as any;

    const visita = await prisma.visita.findFirst({ where: { id: visitaId } });
    if (!visita) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }

    // Auth check based on action
    if (action === "RECONFIRM") {
      if (session.user.id !== visita.usuarioId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else {
      if (!watchmanRoles.includes(role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    if (action === "ASSIGN_CELL") {
      if (!celdaId) {
        return NextResponse.json({ error: 'Missing celdaId' }, { status: 400 });
      }

      // Update visit
      const visitaActualizada = await prisma.visita.update({
        where: { id: visitaId },
        data: {
          celdaAsignadaId: celdaId,
          estadoVisita: 'CELDA_ASIGNADA'
        }
      });

      // Update parking spot to RESERVED
      const celda = await prisma.parqueadero.update({
        where: { id: celdaId },
        data: { estado: 'RESERVADO' }
      });

      // Notify resident
      await notifyUser({
        prisma,
        usuarioId: visitaActualizada.usuarioId,
        titulo: `Celda Asignada: ${celda.numero} 🅿️`,
        mensaje: `Se asignó la celda ${celda.numero} para tu visita ${visitaActualizada.nombre}. Reconfirma su llegada por favor.`,
        tipo: 'INFO',
        url: '/citofonia?tab=VISITAS'
      });

      return NextResponse.json({ success: true, data: visitaActualizada });
    }

    if (action === "ARRIVE" || action === "CHECKIN") {
      const celdaIdToUse = celdaId || visita.celdaAsignadaId;
      if (!celdaIdToUse) {
        return NextResponse.json({ error: 'No cell assigned to this visit' }, { status: 400 });
      }

      // Fetch cell to get number
      const celda = await prisma.parqueadero.findUnique({
        where: { id: celdaIdToUse }
      });

      if (!celda) {
        return NextResponse.json({ error: 'Parking cell not found' }, { status: 404 });
      }

      // Update visit
      const visitaActualizada = await prisma.visita.update({
        where: { id: visitaId },
        data: {
          celdaAsignadaId: celdaIdToUse,
          estadoVisita: 'CONFIRMADA'
        }
      });

      // Update parking spot to OCUPADO
      await prisma.parqueadero.update({
        where: { id: celdaIdToUse },
        data: { estado: 'OCUPADO' }
      });

      // Create check-in log
      await prisma.registroParqueadero.create({
        data: {
          parqueaderoId: celdaIdToUse,
          usuarioId: session.user.id,
          tipo: 'INGRESO',
          placa: visita.placa || null,
          observacion: `[Visita Agendada: ${visita.nombre}]`
        }
      });

      // Notify resident
      await notifyUser({
        prisma,
        usuarioId: visitaActualizada.usuarioId,
        titulo: `Ingreso de Visita Agendada 🚗`,
        mensaje: `Tu visita agendada ${visitaActualizada.nombre} (Placa: ${visitaActualizada.placa || 'Sin placa'}) ingresó al parqueadero celda ${celda.numero}.`,
        tipo: 'INFO',
        url: '/citofonia?tab=VISITAS'
      });

      return NextResponse.json({ success: true, data: visitaActualizada });
    }

    if (action === "RECONFIRM") {
      const visitaActualizada = await prisma.visita.update({
        where: { id: visitaId },
        data: {
          estadoVisita: 'CONFIRMADA'
        }
      });

      // Notify watchmen
      try {
        const watchmen = await prisma.usuario.findMany({
          where: {
            conjuntoId: visitaActualizada.conjuntoId,
            rol: { in: ['VIGILANTE', 'SUPERVISOR_VIGILANCIA', 'ENCARGADO_PARQUEADERO'] }
          },
          select: { id: true }
        });

        if (watchmen.length > 0) {
          await Promise.all(watchmen.map((w: any) =>
            notifyUser({
              prisma,
              usuarioId: w.id,
              titulo: `Visita Confirmada ✅`,
              mensaje: `El residente reconfirmó la llegada de ${visitaActualizada.nombre} (Placa: ${visitaActualizada.placa || 'Sin placa'}).`,
              tipo: 'INFO',
              url: '/mapa-parqueadero'
            })
          ));
        }
      } catch (notifErr) {
        console.error("Watchmen notification error:", notifErr);
      }

      return NextResponse.json({ success: true, data: visitaActualizada });
    }

    if (action === "RELEASE") {
      // Release cell if reserved
      if (visita.celdaAsignadaId) {
        await prisma.parqueadero.update({
          where: { id: visita.celdaAsignadaId },
          data: { estado: 'DISPONIBLE' }
        });
      }

      const visitaActualizada = await prisma.visita.update({
        where: { id: visitaId },
        data: {
          estadoVisita: 'EXPIRADA',
          celdaAsignadaId: null
        }
      });

      // Notify resident
      await notifyUser({
        prisma,
        usuarioId: visitaActualizada.usuarioId,
        titulo: `Reserva Expirada ⏱️`,
        mensaje: `Tu reserva de parqueadero para ${visitaActualizada.nombre} expiró por incomparecencia (límite de 15 minutos).`,
        tipo: 'INFO',
        url: '/citofonia?tab=VISITAS'
      });

      return NextResponse.json({ success: true, data: visitaActualizada });
    }

    // Default action: CHECKOUT
    const visitaActualizada = await prisma.visita.update({
      where: { id: visitaId },
      data: {
        fechaSalida: new Date(),
        estadoVisita: 'FINALIZADA'
      }
    });

    // If cell was assigned, free it
    if (visitaActualizada.celdaAsignadaId) {
      await prisma.parqueadero.update({
        where: { id: visitaActualizada.celdaAsignadaId },
        data: { estado: 'DISPONIBLE' }
      });
    }

    if (visitaActualizada?.usuarioId) {
      await notifyUser({
        prisma,
        usuarioId: visitaActualizada.usuarioId,
        titulo: `Tu visitante salió 🚶`,
        mensaje: `${visitaActualizada.nombre} registró su salida del conjunto.`,
        tipo: 'INFO',
        url: '/inicio',
      });
    }

    return NextResponse.json({ success: true, data: visitaActualizada });
  } catch (error) {
    console.error("PUT Visita Error:", error);
    return NextResponse.json({ success: false, error: 'DB Error' }, { status: 500 });
  }
}
