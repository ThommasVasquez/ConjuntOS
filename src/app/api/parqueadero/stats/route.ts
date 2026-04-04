export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== 'ENCARGADO_PARQUEADERO') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { default: db } = await import('@/lib/db');
    const prisma = db as any;

    const total = await prisma.parqueadero.count();
    const ocupados = await prisma.parqueadero.count({
      where: { estado: 'OCUPADO' }
    });

    const percent = total > 0 ? Math.round((ocupados / total) * 100) : 0;

    return NextResponse.json({ success: true, data: { ocupacion: percent, libres: total - ocupados, ocupados } });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'DB Error' }, { status: 500 });
  }
}
