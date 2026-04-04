export const runtime = 'edge';
import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    const usuarios = await (await db.usuario).findMany({
      select: { email: true, rol: true, nombre: true }
    });
    return NextResponse.json({ success: true, count: usuarios.length, data: usuarios });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
