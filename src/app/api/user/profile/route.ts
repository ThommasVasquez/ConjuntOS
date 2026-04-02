import { NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
       return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;

    // Intentamos cargar el usuario con Prisma (Capa 1)
    try {
      const usuarioDelegate = await db.usuario;
      const user = await usuarioDelegate.findUnique({
        where: { id: userId },
        include: { unidad: true }
      });

      if (user) {
        return NextResponse.json({ success: true, data: user });
      }
    } catch (prismaErr: unknown) {
      const pErr = prismaErr as { message?: string };
      console.warn("⚠️ [API-PROFILE-GET]: Prisma falló, intentando SQL Directo...", pErr.message);
    }

    // INTENTO DE SQL DIRECTO (Salvavidas máximo - Capa 2)
    try {
      const { Pool } = await import("@neondatabase/serverless");
      const { discoverUrl } = await import("@/lib/db");
      const url = await discoverUrl();
      
      const pool = new Pool({ connectionString: url });
      
      const res = await pool.query({
        text: `
          SELECT u.*, row_to_json(un.*) as unidad 
          FROM "Usuario" u 
          LEFT JOIN "Unidad" un ON u."unidadId" = un.id 
          WHERE u.id = $1
        `,
        values: [userId]
      });
      
      if (res.rows.length > 0) {
        return NextResponse.json({ success: true, data: res.rows[0] });
      }
    } catch (sqlError: unknown) {
      const sqlErr = sqlError as { message?: string };
      console.error("❌ [API-PROFILE-GET-FATAL]:", sqlErr);
    }

    return NextResponse.json({ 
      success: false, 
      error: "Usuario no encontrado",
      details: "No se encontró el registro en ninguna capa."
    }, { status: 404 });

  } catch (error: unknown) {
    const err = error as { message?: string };
    return NextResponse.json({ 
      success: false, 
      error: "Error interno", 
      details: err.message 
    }, { status: 500 });
  }
}
