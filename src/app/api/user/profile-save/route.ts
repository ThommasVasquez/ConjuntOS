import { NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let userId: string | undefined;
  let name: string | undefined;
  let gender: string | undefined;

  try {
    const session = await auth();
    userId = session?.user?.id;
    if (!userId) {
       return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    name = body.name;
    gender = body.gender;
    const { phone, avatar } = body;

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

  } catch (error: unknown) {
    const err = error as { code?: string; message?: string; stack?: string };
    console.warn("⚠️ [API-PROFILE-SAVE-PRISMA-FALLING]: Intentando SQL Directo...", err.message);
    
    // INTENTO DE SQL DIRECTO (Salvavidas máximo)
    try {
      const { Pool } = await import("@neondatabase/serverless");
      const { discoverUrl } = await import("@/lib/db");
      const url = await discoverUrl();
      
      const pool = new Pool({ 
        connectionString: url
      });
      
      await pool.query({
        text: `UPDATE "Usuario" SET nombre = $1, genero = $2 WHERE id = $3`,
        values: [name, gender, userId]
      });
      
      return NextResponse.json({ success: true, method: "SQL_DIRECTO" });
    } catch (sqlError: unknown) {
      const sqlErr = sqlError as { message?: string; stack?: string };
      console.error("❌ [API-PROFILE-SAVE-FATAL]:", sqlErr);
      return NextResponse.json({ 
        success: false, 
        error: "FALLO_TOTAL",
        details: sqlErr.message,
        original_prisma_error: err.message,
        stack: sqlErr.stack
      }, { status: 500 });
    }
  }
}
