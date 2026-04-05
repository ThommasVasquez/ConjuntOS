export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  const role = (session?.user as { role?: string })?.role;

  if (!session || !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Roles permitted
  const isGuard = role === 'ENCARGADO_PARQUEADERO' || role === 'VIGILANTE';
  const isAdmin = role === 'ADMINISTRADOR' || role === 'SUPER_ADMIN';

  if (!isGuard && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { default: db } = await import('@/lib/db');
    const prisma = db as any;

    const where: any = {};
    
    // Guard only sees their own logs
    if (isGuard && !isAdmin) {
      where.usuarioId = userId;
    }

    const registros = await prisma.registroParqueadero.findMany({
      where,
      orderBy: { fecha: 'desc' },
      take: 50,
      include: {
        parqueadero: { select: { numero: true, tipo: true } },
        usuario: { select: { nombre: true } }
      }
    });

    return NextResponse.json({ success: true, data: registros });
  } catch (error) {
    console.error("GET Registros Error:", error);
    return NextResponse.json({ success: false, error: 'DB Error' }, { status: 500 });
  }
}
