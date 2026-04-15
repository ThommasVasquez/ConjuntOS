import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { Pool } from "@neondatabase/serverless";
import { discoverUrl } from "@/lib/db";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { userId: string } }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
       return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { userId } = await params;
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

    const res = await pool.query('SELECT * FROM "ChatAdmin" WHERE "usuarioId" = $1 ORDER BY "creadoEn" ASC', [userId]);

    // Optional: Mark as read when admin opens the chat
    await pool.query('UPDATE "ChatAdmin" SET leido = true WHERE "usuarioId" = $1 AND "esDeAdmin" = false', [userId]);

    return NextResponse.json({ success: true, data: res.rows });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: { userId: string } }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
       return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { userId } = await params;
    const { mensaje } = await req.json();

    if (!mensaje) {
      return NextResponse.json({ success: false, error: "Mensaje vacío" }, { status: 400 });
    }

    const url = await discoverUrl();
    const pool = new Pool({ connectionString: url });

    const res = await pool.query(
      'INSERT INTO "ChatAdmin" (id, "usuarioId", mensaje, "esDeAdmin", leido, "creadoEn") VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *',
      [`adm_chat_${Date.now()}`, userId, mensaje, true, false]
    );

    return NextResponse.json({ success: true, data: res.rows[0] });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
