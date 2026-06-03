import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { Pool } from "@neondatabase/serverless";
import { discoverUrl } from "@/lib/db";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    const role = (session?.user as { role?: string })?.role;
    if (!session?.user?.id || !["ADMINISTRADOR", "SUPER_ADMIN"].includes(role || "")) {
       return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
    }

    const url = await discoverUrl();
    const pool = new Pool({ connectionString: url });

    // Ensure table exists (Harden)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "ChatAdmin" (
        "id" TEXT PRIMARY KEY,
        "usuarioId" TEXT NOT NULL,
        "mensaje" TEXT NOT NULL,
        "esDeAdmin" BOOLEAN DEFAULT false,
        "leido" BOOLEAN DEFAULT false,
        "creadoEn" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Simplified SQL to avoid CTE complexities for first test
    const res = await pool.query(`
      SELECT 
        c."usuarioId",
        MAX(c.mensaje) as mensaje,
        MAX(c."creadoEn") as "creadoEn",
        BOOL_OR(c."esDeAdmin") as "esDeAdmin",
        BOOL_AND(c.leido) as leido,
        u.nombre as "usuarioNombre",
        u.avatar as "usuarioAvatar",
        u.email as "usuarioEmail",
        un.torre as "usuarioTorre",
        un.numero as "usuarioApto"
      FROM "ChatAdmin" c
      JOIN "Usuario" u ON c."usuarioId" = u.id
      LEFT JOIN "Unidad" un ON u."unidadId" = un.id
      GROUP BY c."usuarioId", u.nombre, u.avatar, u.email, un.torre, un.numero
      ORDER BY MAX(c."creadoEn") DESC
    `);

    return NextResponse.json({ success: true, data: res.rows });
  } catch (error: any) {
    console.error("❌ [API-ADMIN-CHAT-LIST]:", error);
    return NextResponse.json({ 
      success: false, 
      error: error.message,
      detail: error.detail || null,
      code: error.code || "UNKNOWN"
    }, { status: 500 });
  }
}
