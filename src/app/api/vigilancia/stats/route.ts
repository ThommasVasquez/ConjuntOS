import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import db from '@/lib/db';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    // Use type assertion for custom role property in next-auth session
    const user = session?.user as { id: string; role?: string } | undefined;
    
    if (!session || !user || (user.role !== 'VIGILANTE' && user.role !== 'SUPERVISOR_VIGILANCIA' && user.role !== 'ADMINISTRADOR')) {
      return NextResponse.json({ error: 'No autorizado para ver estadísticas' }, { status: 403 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get counts via unified proxy (consistent with Supabase Edge)
    const [visitasHoy, paquetesPendientes, totalResidentes] = await Promise.all([
      db.visita.count({
        where: { creadoEn: { gte: today.toISOString() } }
      }),
      db.paquete.count({
        where: { estado: 'RECIBIDO' }
      }),
      db.usuario.count({
        where: { rol: 'RESIDENTE' }
      })
    ]);

    return NextResponse.json({
      success: true,
      stats: {
        visitas: visitasHoy,
        paquetes: paquetesPendientes,
        residentes: totalResidentes
      }
    });

  } catch (error: any) {
    console.error("❌ [VIGILANCIA-STATS] Error:", error.message);
    return NextResponse.json({
      success: false,
      error: 'Error al obtener estadísticas del tablero'
    }, { status: 500 });
  }
}
