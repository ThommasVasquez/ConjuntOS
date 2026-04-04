export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import type { PrismaClient } from '@prisma/client/edge';

export async function GET() {
  const session = await auth();
  if (!session || (session.user.role !== 'VIGILANTE' && session.user.role !== 'SUPERVISOR_VIGILANCIA')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { default: db } = await import('@/lib/db');
    const prisma = db as unknown as { visita: any, paquete: any }; // Bypass TS strictness for edge singleton

    // Visitas de hoy
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const visitasCount = await prisma.visita.count({
      where: {
        creadoEn: { gte: startOfDay }
      }
    });

    // Paquetes en portería
    const paquetesCount = await prisma.paquete.count({
      where: {
        estado: 'EN_PORTERIA'
      }
    });

    return NextResponse.json({ success: true, data: { visitasHoy: visitasCount, paquetesPendientes: paquetesCount } });
  } catch (error: any) {
    console.error('Stats Error:', error);
    return NextResponse.json({ success: false, error: 'Database error' }, { status: 500 });
  }
}
