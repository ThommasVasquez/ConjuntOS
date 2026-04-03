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

    // AUTO-SEED: Si no tiene pagos, sembramos historial de ejemplo automáticamente
    if (user.pagos.length === 0) {
      console.log(`✨ Auto-seeding pagos for user: ${userId}`);
      await autoSeedUserPagos(userId);
      
      // Volver a obtener el usuario actualizado con la unidad y los nuevos pagos
      const updatedUser = await usuarioDelegate.findUnique({
        where: { id: userId },
        include: { unidad: true, pagos: { orderBy: { creadoEn: 'desc' } } }
      });
      
      if (updatedUser) {
        const updatedDebt = (updatedUser.pagos as unknown as PagoRecord[])
          .filter((p) => p.estado === 'PENDIENTE' || p.estado === 'VENCIDO')
          .reduce((acc, p) => acc + Number(p.monto), 0);

        return NextResponse.json({
          success: true,
          data: {
            unidad: updatedUser.unidad,
            pagos: updatedUser.pagos,
            totalDebt: updatedDebt
          }
        });
      }
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
