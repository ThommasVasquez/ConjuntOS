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

    try {
      // Use proxy delegate if necessary as seen in other routes
      const chatDelegate = db.chatAdmin; 
      const messages = await chatDelegate.findMany({
        where: { usuarioId: userId },
        orderBy: { creadoEn: 'asc' },
        take: 50
      });
      return NextResponse.json({ success: true, data: messages });
    } catch (prismaErr) {
       console.warn("⚠️ [API-CHAT]: Prisma failed, using SQL fallback...");
       // SQL Fallback
       const { Pool } = await import("@neondatabase/serverless");
       const { discoverUrl } = await import("@/lib/db");
       const url = await discoverUrl();
       const pool = new Pool({ connectionString: url });
       const res = await pool.query('SELECT * FROM "ChatAdmin" WHERE "usuarioId" = $1 ORDER BY "creadoEn" ASC LIMIT 50', [userId]);
       return NextResponse.json({ success: true, data: res.rows });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
       return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;
    const { mensaje } = await req.json();

    if (!mensaje) {
      return NextResponse.json({ success: false, error: "Mensaje vacío" }, { status: 400 });
    }

    try {
       const chatDelegate = db.chatAdmin;
       const newMessage = await chatDelegate.create({
         data: {
           usuarioId: userId,
           mensaje,
           esDeAdmin: false
         }
       });
       return NextResponse.json({ success: true, data: newMessage });
    } catch (prismaErr) {
       console.warn("⚠️ [API-CHAT-POST]: Prisma failed, using SQL fallback...");
       const { Pool } = await import("@neondatabase/serverless");
       const { discoverUrl } = await import("@/lib/db");
       const url = await discoverUrl();
       const pool = new Pool({ connectionString: url });
       const res = await pool.query(
         'INSERT INTO "ChatAdmin" (id, "usuarioId", mensaje, "esDeAdmin", leido, "creadoEn") VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *',
         [`chat_${Date.now()}`, userId, mensaje, false, false]
       );
       return NextResponse.json({ success: true, data: res.rows[0] });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
