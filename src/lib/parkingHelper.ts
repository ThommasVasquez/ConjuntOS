// notifyUser stub — the actual notification is handled by the Rust backend
async function notifyUser(_params: any): Promise<void> {
  // noop: backend handles push notifications
}

/**
 * checkAndProcessReservations
 * Automatically checks and processes vehicular visitor reservations:
 * 1. For PENDING/ASSIGNED spots (CELDA_ASIGNADA) where arrival is within 15 minutes, notifies the resident and marks as NOTIFICADO_15_MIN.
 * 2. For reserved spots (CELDA_ASIGNADA, NOTIFICADO_15_MIN) where arrival is more than 15 minutes overdue, releases the cell and marks as EXPIRADA.
 */
export async function checkAndProcessReservations(prisma: any): Promise<void> {
  const now = new Date();

  try {
    // 1. Process 15-Minute Warnings
    const warningVisits = await prisma.visita.findMany({
      where: {
        tipo: 'VEHICULAR',
        estadoVisita: 'CELDA_ASIGNADA',
        horaLlegadaEstimada: { not: null },
        fecha: { gte: new Date(now.getTime() - 24 * 3600 * 1000) } // Optimization: only check recent/future visits
      }
    });

    for (const v of warningVisits) {
      try {
        const [hours, minutes] = v.horaLlegadaEstimada.split(':').map(Number);
        const arrivalDateTime = new Date(v.fecha);
        arrivalDateTime.setHours(hours, minutes, 0, 0);

        const diffMs = arrivalDateTime.getTime() - now.getTime();
        
        // If estimated arrival is less than or equal to 15 minutes from now (e.g. 0 to 15 mins before arrival)
        if (diffMs <= 15 * 60 * 1000 && diffMs > -15 * 60 * 1000) {
          let cellNumber = "asignada";
          if (v.celdaAsignadaId) {
            const celda = await prisma.parqueadero.findUnique({
              where: { id: v.celdaAsignadaId },
              select: { numero: true }
            });
            if (celda) {
              cellNumber = celda.numero;
            }
          }

          // Notify Resident
          await notifyUser({
            prisma,
            usuarioId: v.usuarioId,
            titulo: `Confirmación de Celda Asignada: ${cellNumber} 🅿️`,
            mensaje: `Se asignó la celda ${cellNumber} para tu visita ${v.nombre}. Reconfirma su llegada por favor. Sólo se guardará por 15 minutos más de la hora pactada.`,
            tipo: 'INFO',
            url: '/citofonia?tab=VISITAS'
          });

          // Transition state to NOTIFICADO_15_MIN
          await prisma.visita.update({
            where: { id: v.id },
            data: { estadoVisita: 'NOTIFICADO_15_MIN' }
          });
        }
      } catch (err) {
        console.error(`[parkingHelper] Error processing warning for visit ${v.id}:`, err);
      }
    }

    // 2. Process Expirations (15 Minutes Late)
    const overdueVisits = await prisma.visita.findMany({
      where: {
        tipo: 'VEHICULAR',
        estadoVisita: { in: ['CELDA_ASIGNADA', 'NOTIFICADO_15_MIN'] },
        horaLlegadaEstimada: { not: null },
        fecha: { gte: new Date(now.getTime() - 24 * 3600 * 1000) }
      }
    });

    for (const v of overdueVisits) {
      try {
        const [hours, minutes] = v.horaLlegadaEstimada.split(':').map(Number);
        const arrivalDateTime = new Date(v.fecha);
        arrivalDateTime.setHours(hours, minutes, 0, 0);

        const diffMs = now.getTime() - arrivalDateTime.getTime();

        // Over 15 minutes late
        if (diffMs > 15 * 60 * 1000) {
          const celdaId = v.celdaAsignadaId;

          // Release the parking spot if one was assigned
          if (celdaId) {
            await prisma.parqueadero.update({
              where: { id: celdaId },
              data: { estado: 'DISPONIBLE' }
            });
          }

          // Update visit state to EXPIRADA and clear celdaAsignadaId
          const updatedVisit = await prisma.visita.update({
            where: { id: v.id },
            data: {
              estadoVisita: 'EXPIRADA',
              celdaAsignadaId: null
            }
          });

          // Notify Resident
          await notifyUser({
            prisma,
            usuarioId: v.usuarioId,
            titulo: `Reserva de Parqueadero Expirada ⏱️`,
            mensaje: `La reserva de estacionamiento para ${v.nombre} expiró por incomparecencia (límite de 15 minutos). El visitante deberá solicitar cupo en portería si hay disponibilidad.`,
            tipo: 'INFO',
            url: '/citofonia?tab=VISITAS'
          });

          // Notify Watchmen of the freed cell
          try {
            const resident = await prisma.usuario.findUnique({
              where: { id: v.usuarioId },
              select: { conjuntoId: true }
            });
            if (resident?.conjuntoId) {
              const watchmen = await prisma.usuario.findMany({
                where: {
                  conjuntoId: resident.conjuntoId,
                  rol: { in: ['VIGILANTE', 'SUPERVISOR_VIGILANCIA', 'ENCARGADO_PARQUEADERO'] }
                },
                select: { id: true }
              });

              if (watchmen.length > 0) {
                await Promise.all(watchmen.map((w: any) =>
                  notifyUser({
                    prisma,
                    usuarioId: w.id,
                    titulo: `Reserva Cancelada ⏱️`,
                    mensaje: `La reserva de celda para ${updatedVisit.nombre} expiró por incomparecencia. Celda liberada.`,
                    tipo: 'INFO',
                    url: '/mapa-parqueadero'
                  })
                ));
              }
            }
          } catch (notifErr) {
            console.warn("[parkingHelper] Failed to notify watchmen about expiration:", notifErr);
          }
        }
      } catch (err) {
        console.error(`[parkingHelper] Error processing expiration for visit ${v.id}:`, err);
      }
    }
  } catch (error) {
    console.error("[parkingHelper] Error during checkAndProcessReservations:", error);
  }
}
