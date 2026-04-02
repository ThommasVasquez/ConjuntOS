import { NextResponse } from "next/server";
import db from "@/lib/db";
import { auth } from "@/auth";

export const runtime = 'edge';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
       return NextResponse.json({ success: false, error: "No sesion" }, { status: 401 });
    }

    const userId = session.user.id;
    const usuarioDelegate = await db.usuario;
    const user = await usuarioDelegate.findUnique({
      where: { id: userId },
      select: { conjuntoId: true, unidadId: true }
    });

    if (!user || !user.unidadId) {
      return NextResponse.json({ success: false, error: "Usuario sin unidad" }, { status: 400 });
    }

    const pagoDelegate = await db.pago;

    const seedData = [
      { concepto: "Administración Marzo 2026", monto: 250000, estado: "PENDIENTE", fechaVencimiento: new Date("2026-03-31T23:59:59Z") },
      { concepto: "Energía Eléctrica Feb 2026", monto: 88500, estado: "PAGADO", fechaVencimiento: new Date("2026-02-15T23:59:59Z"), fechaPago: new Date("2026-02-10T14:30:00Z") },
      { concepto: "Consumo de Gas Natural Ene 2026", monto: 32400, estado: "PAGADO", fechaVencimiento: new Date("2026-01-20T23:59:59Z"), fechaPago: new Date("2026-01-18T09:15:00Z") },
      { concepto: "Agua y Alcantarillado Dic 2025", monto: 45200, estado: "PAGADO", fechaVencimiento: new Date("2025-12-25T23:59:59Z"), fechaPago: new Date("2025-12-20T16:45:00Z") },
      { concepto: "Alquiler Salón Comunal - Evento", monto: 120000, estado: "PAGADO", fechaVencimiento: new Date("2025-11-15T23:59:59Z"), fechaPago: new Date("2025-11-10T11:00:00Z") },
      { concepto: "Administración Febrero 2026", monto: 250000, estado: "PAGADO", fechaVencimiento: new Date("2026-02-28T23:59:59Z"), fechaPago: new Date("2026-02-25T10:00:00Z") },
      { concepto: "Administración Enero 2026", monto: 250000, estado: "PAGADO", fechaVencimiento: new Date("2026-01-31T23:59:59Z"), fechaPago: new Date("2026-01-28T15:30:00Z") },
      { concepto: "Administración Diciembre 2025", monto: 250000, estado: "VENCIDO", fechaVencimiento: new Date("2025-12-31T23:59:59Z") },
    ];

    const results = [];
    for (const data of seedData) {
      const p = await (pagoDelegate as any).create({
        data: {
          conjuntoId: user.conjuntoId,
          unidadId: user.unidadId,
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

    return NextResponse.json({ success: true, count: results.length });

  } catch (error: unknown) {
    console.error("❌ Error seeding payments:", error);
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
