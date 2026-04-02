import { NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let userId: string | undefined;

  try {
    const session = await auth();
    userId = session?.user?.id;
    if (!userId) {
       return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { name, gender, phone, avatar } = body;

    try {
      const usuarioDelegate = await db.usuario;
      const updated = await usuarioDelegate.update({
        where: { id: userId },
        data: {
          nombre: name,
          telefono: phone,
          genero: gender,
          avatar: avatar
        }
      });
      return NextResponse.json({ success: true, data: updated });
    } catch (prismaErr: unknown) {
      const pErr = prismaErr as { message?: string };
      console.warn("⚠️ [API-PROFILE-SAVE-PRISMA-FALLING]: Intentando SQL Directo...", pErr.message);
      
      const { Pool } = await import("@neondatabase/serverless");
      const { discoverUrl } = await import("@/lib/db");
      const url = await discoverUrl();
      const pool = new Pool({ connectionString: url });
      
      await pool.query({
        text: `UPDATE "Usuario" SET nombre = $1, genero = $2, telefono = $3, avatar = $4 WHERE id = $5`,
        values: [name, gender, phone, avatar, userId]
      });
      
      return NextResponse.json({ success: true, method: "SQL_DIRECTO" });
    }

  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("❌ [API-PROFILE-SAVE-FATAL]:", err);
    return NextResponse.json({ 
      success: false, 
      error: "FALLO_TOTAL",
      details: err.message 
    }, { status: 500 });
  }
}
