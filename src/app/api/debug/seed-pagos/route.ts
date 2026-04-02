import { NextResponse } from "next/server";
import db from "@/lib/db";
import { auth } from "@/auth";

export const runtime = 'edge';

/**
 * AUTO-SEEDER ROBUSTO: Genera historial de pagos para el usuario actual.
 */

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
       return NextResponse.json({ success: false, error: "Debes iniciar sesión primero" }, { status: 401 });
    }

    const userId = session.user.id;
    const usuarioDelegate = await db.usuario;
    const user = await usuarioDelegate.findUnique({
      where: { id: userId },
      select: { id: true, conjuntoId: true, unidadId: true }
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "Usuario no encontrado" }, { status: 404 });
    }

    // SI EL USUARIO NO TIENE UNIDAD, LE ASIGNAMOS UNA (CAPA DE ROBUSTEZ)
    let unitId = user.unidadId;
    let conjuntoId = user.conjuntoId;

    if (!unitId) {
       console.log("⚠️ Usuario sin unidad. Buscando unidad disponible...");
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
          console.log(`✅ Unidad ${firstUnit.numero} asignada al usuario.`);
       } else {
          return NextResponse.json({ success: false, error: "No hay unidades en el conjunto para asignar." }, { status: 400 });
       }
    }

    const pagoDelegate = await db.pago;

    // LIMPIAR PAGOS PREVIOS (Para evitar duplicados en el demo)
    await pagoDelegate.deleteMany({
      where: { usuarioId: userId }
    });

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

    const results = [];
    for (const data of seedData) {
      const p = await (pagoDelegate as unknown as { create: (args: unknown) => Promise<{ id: string }> }).create({
        data: {
          conjuntoId: conjuntoId,
          unidadId: unitId,
          usuarioId: userId,
          concepto: data.concepto,
          monto: data.monto,
          estado: data.estado,
          fechaVencimiento: data.fechaVencimiento,
          fechaPago: data.fechaPago || null,
        }
      });
      results.push(p.id);
    }

    return NextResponse.json({ 
      success: true, 
      message: "¡Historial de pagos generado con éxito!",
      count: results.length,
      unitAssigned: unitId
    });

  } catch (error: unknown) {
    console.error("❌ Error seeding payments:", error);
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
