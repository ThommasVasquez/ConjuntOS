import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { Pool } from "@neondatabase/serverless";
import { discoverUrl } from "@/lib/db";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    // In a real scenario, check if session.user.rol === 'ADMIN'
    if (!session?.user?.id) {
       return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const url = await discoverUrl();
    const pool = new Pool({ connectionString: url });

    // SQL strategy to get latest message per user with user details
    const res = await pool.query(`
      WITH LatestMessages AS (
        SELECT 
          "usuarioId",
          mensaje,
          "creadoEn",
          "esDeAdmin",
          leido,
          ROW_NUMBER() OVER(PARTITION BY "usuarioId" ORDER BY "creadoEn" DESC) as rn
        FROM "ChatAdmin"
      )
      SELECT 
        lm.*,
        u.nombre as "usuarioNombre",
        u.avatar as "usuarioAvatar",
        u.torre as "usuarioTorre",
        u.apto as "usuarioApto"
      FROM LatestMessages lm
      JOIN "Usuario" u ON lm."usuarioId" = u.id
      WHERE lm.rn = 1
      ORDER BY lm."creadoEn" DESC
    `);

    return NextResponse.json({ success: true, data: res.rows });
  } catch (error: any) {
    console.error("❌ [API-ADMIN-CHAT-LIST]:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
