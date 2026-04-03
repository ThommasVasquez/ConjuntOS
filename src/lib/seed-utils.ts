import db from "./db";

/**
 * Utilidad para sembrar datos de ejemplo de forma automática y transparente.
 */
export async function autoSeedUserPagos(userId: string) {
  try {
    const usuarioDelegate = await db.usuario;
    const user = await usuarioDelegate.findUnique({
      where: { id: userId },
      select: { id: true, conjuntoId: true, unidadId: true }
    });

    if (!user) return null;

    // 1. Asegurar Unidad
    let unitId = user.unidadId;
    if (!unitId) {
      const unidadDelegate = await db.unidad;
      const firstUnit = await unidadDelegate.findFirst({
        where: { conjuntoId: user.conjuntoId }
      });
      if (firstUnit) {
        await usuarioDelegate.update({
          where: { id: userId },
          data: { unidadId: firstUnit.id }
        });
        unitId = firstUnit.id;
      }
    }

    if (!unitId) return null;

    // 2. Sembrar Pagos
    const pagoDelegate = await db.pago;
    
    // Verificar si ya tiene pagos para no duplicar accidentalmente
    const existingCount = await pagoDelegate.count({ where: { usuarioId: userId } });
    if (existingCount > 0) return null;

    const seedData = [
      { concepto: "Administración Marzo 2026", monto: 250000, estado: "PENDIENTE", fechaVencimiento: new Date("2026-03-31T23:59:59Z") },
      { concepto: "Energía Eléctrica Feb 2026", monto: 88500, estado: "PAGADO", fechaVencimiento: new Date("2026-02-15T23:59:59Z"), fechaPago: new Date("2026-02-10T14:30:00Z") },
      { concepto: "Consumo de Gas Natural Ene 2026", monto: 32400, estado: "PAGADO", fechaVencimiento: new Date("2026-01-20T23:59:59Z"), fechaPago: new Date("2026-01-18T09:15:00Z") },
      { concepto: "Agua y Alcantarillado Dic 2025", monto: 45200, estado: "PAGADO", fechaVencimiento: new Date("2025-12-25T23:59:59Z"), fechaPago: new Date("2025-12-20T16:45:00Z") },
      { concepto: "Alquiler Salón Comunal", monto: 120000, estado: "PAGADO", fechaVencimiento: new Date("2025-11-15T23:59:59Z"), fechaPago: new Date("2025-11-12T10:00:00Z") },
      { concepto: "Administración Febrero 2026", monto: 250000, estado: "PAGADO", fechaVencimiento: new Date("2026-02-28T23:59:59Z"), fechaPago: new Date("2026-02-25T10:00:00Z") },
      { concepto: "Administración Enero 2026", monto: 250000, estado: "PAGADO", fechaVencimiento: new Date("2026-01-31T23:59:59Z"), fechaPago: new Date("2026-01-28T15:30:00Z") },
      { concepto: "Intereses de Mora (Diciembre)", monto: 12500, estado: "VENCIDO", fechaVencimiento: new Date("2025-12-31T23:59:59Z") },
    ];

    for (const data of seedData) {
      await (pagoDelegate as unknown as { create: (args: { data: unknown }) => Promise<unknown> }).create({
        data: {
          conjuntoId: user.conjuntoId,
          unidadId: unitId,
          usuarioId: userId,
          ...data
        }
      });
    }

    return true;
  } catch (error) {
    console.error("❌ Error in autoSeedUserPagos:", error);
    return false;
  }
}
