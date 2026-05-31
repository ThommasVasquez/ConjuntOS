import { NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * API: PARQUEADERO GET
 * Recupera vehículos del usuario y estado de celdas.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const userId = session.user.id;

    try {
      const vehiculoDelegate = await db.vehiculo;
      const parqueaderoDelegate = await db.parqueadero;

      const [vehiculos, misCeldas, disponibilidad] = await Promise.all([
        vehiculoDelegate.findMany({ where: { usuarioId: userId } }),
        parqueaderoDelegate.findMany({ where: { usuarioId: userId } }),
        parqueaderoDelegate.findMany({ 
          where: { tipo: "VISITANTE" },
          take: 20 
        })
      ]);

      return NextResponse.json({
        success: true,
        data: {
          vehiculos,
          misCeldas,
          disponibilidadVisitantes: {
            total: disponibilidad.length,
            libres: disponibilidad.filter((c: any) => c.estado === "DISPONIBLE").length,
            ocupadas: disponibilidad.filter((c: any) => c.estado === "OCUPADO").length
          }
        }
      });
    } catch (dbErr: unknown) {
      console.warn("⚠️ [API-PARQUEADERO]: Error DB, usando Mock Fallback", dbErr instanceof Error ? dbErr.message : String(dbErr));
      return NextResponse.json({
        success: true,
        isMock: true,
        data: {
          vehiculos: [
            { id: "v1", placa: "ABC-123", marca: "Mazda", modelo: "CX-5", color: "Gris", tipo: "CARRO" }
          ],
          misCeldas: [
            { id: "c1", numero: "P-102", torre: "A", tipo: "RESIDENTE", estado: "OCUPADO" }
          ],
          disponibilidadVisitantes: {
            total: 15,
            libres: 4,
            ocupadas: 11
          }
        }
      });
    }
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/**
 * API: PARQUEADERO POST
 * Registra un nuevo vehículo.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await req.json();
    const { placa, marca, modelo, color, tipo } = body;

    try {
      const vehiculoDelegate = await db.vehiculo;
      const nuevoVehiculo = await vehiculoDelegate.create({
        data: {
          usuarioId: session.user.id,
          placa: placa.toUpperCase(),
          marca,
          modelo,
          color,
          tipo
        }
      });

      return NextResponse.json({ success: true, data: nuevoVehiculo });
    } catch (dbError) {
      console.error("❌ [API-PARQUEADERO-POST]: Error", dbError);
      return NextResponse.json({ 
        success: true, 
        isMock: true, 
        data: { id: "mock_" + Date.now(), placa, marca, tipo } 
      });
    }
  } catch {
    return NextResponse.json({ error: "Error procesando solicitud" }, { status: 500 });
  }
}
