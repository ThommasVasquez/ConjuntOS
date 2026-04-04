export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function GET() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  
  if (!session || !['ADMINISTRADOR', 'CONCEJO', 'SUPER_ADMIN'].includes(role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { default: db } = await import('@/lib/db');
    const prisma = db as any;

    // Supongamos mes actual
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

    const pagosMes = await prisma.pago.aggregate({
      where: {
        fechaPago: { gte: firstDay },
        estado: 'COMPLETADO'
      },
      _sum: { monto: true }
    });

    const reservasPendientes = await prisma.reserva.count({
      where: { estado: 'PENDIENTE' }
    });

    const recaudado = pagosMes._sum.monto || 0;

    return NextResponse.json({ success: true, data: { recaudado, novedadesPendientes: reservasPendientes } });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'DB Error' }, { status: 500 });
  }
}
