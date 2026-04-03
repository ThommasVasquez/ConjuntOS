import { NextResponse } from "next/server";
import db from "@/lib/db";
import { auth } from "@/auth";
import { autoSeedUserPagos } from "@/lib/seed-utils";

export const runtime = 'edge';

interface PagoRecord {
  id: string;
  monto: string | number; 
  estado: string;
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;

    // Obtener los delegados de Prisma asíncronos (Patrón del Proyecto)
    const usuarioDelegate = await db.usuario;
    
    // Obtener los pagos del usuario junto con la unidad
    const user = await usuarioDelegate.findUnique({
      where: { id: userId },
      include: {
        unidad: {
          select: {
            numero: true,
            torre: true,
            coeficiente: true,
          }
        },
        pagos: {
          orderBy: { creadoEn: 'desc' },
        }
      }
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "Usuario no encontrado" }, { status: 404 });
    }

    const debt = (user.pagos as unknown as PagoRecord[])
      .filter((p) => p.estado === 'PENDIENTE' || p.estado === 'VENCIDO')
      .reduce((acc, p) => acc + Number(p.monto), 0);

    return NextResponse.json({
      success: true,
      data: {
        unidad: user.unidad,
        pagos: user.pagos,
        totalDebt: debt
      }
    });

  } catch (error) {
    console.error("❌ Error fetching payments:", error);
    return NextResponse.json({ success: false, error: "Error en el servidor" }, { status: 500 });
  }
}
