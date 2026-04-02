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

    // 1. Obtener el conjuntoId del usuario
    let conjuntoId = "";
    try {
      const usuarioDelegate = await db.usuario;
      const user = await usuarioDelegate.findUnique({
        where: { id: userId },
        select: { conjuntoId: true }
      });
      if (user) conjuntoId = user.conjuntoId;
    } catch (dbErr) {
      console.warn("⚠️ [API-ANUNCIOS]: Prisma falló al obtener conjuntoId, intentando SQL...", dbErr);
      // SQL Fallback para conjuntoId
      const { Pool } = await import("@neondatabase/serverless");
      const { discoverUrl } = await import("@/lib/db");
      const url = await discoverUrl();
      const pool = new Pool({ connectionString: url });
      const res = await pool.query('SELECT "conjuntoId" FROM "Usuario" WHERE id = $1', [userId]);
      if (res.rows.length > 0) conjuntoId = res.rows[0].conjuntoId;
    }

    if (!conjuntoId) {
      return NextResponse.json({ success: false, error: "Conjunto no encontrado" }, { status: 404 });
    }

    // 2. Obtener anuncios (Capa 1: Prisma)
    try {
      const anuncioDelegate = await db.anuncio;
      const anuncios = await anuncioDelegate.findMany({
        where: { conjuntoId },
        orderBy: [{ fijado: "desc" }, { publicadoEn: "desc" }]
      });

      // Si no hay anuncios, sembrar uno básico (Solo Thommy/Milo)
      if (anuncios.length === 0) {
        await anuncioDelegate.create({
          data: {
            conjuntoId,
            titulo: "¡Bienvenidos a la Nueva Cartelera!",
            contenido: "Esta es la primera publicación oficial en tiempo real desde la base de datos de ConjuntoApp. Aquí encontrarás noticias, mantenimientos y eventos importantes.",
            tipo: 'GENERAL',
            fijado: true,
            archivosUrl: ""
          }
        });
        const fresh = await anuncioDelegate.findMany({ where: { conjuntoId } });
        return NextResponse.json({ success: true, data: fresh });
      }

      return NextResponse.json({ success: true, data: anuncios });
    } catch (prismaErr) {
      console.warn("⚠️ [API-ANUNCIOS]: Prisma falló, intentando SQL Directo...", prismaErr);
    }

    // 3. SQL DIRECTO (Salvavidas - Capa 2)
    try {
      const { Pool } = await import("@neondatabase/serverless");
      const { discoverUrl } = await import("@/lib/db");
      const url = await discoverUrl();
      const pool = new Pool({ connectionString: url });
      
      const res = await pool.query(`
        SELECT * FROM "Anuncio" 
        WHERE "conjuntoId" = $1 
        ORDER BY fijado DESC, "publicadoEn" DESC
      `, [conjuntoId]);
      
      return NextResponse.json({ success: true, data: res.rows });
    } catch (sqlErr: unknown) {
      const err = sqlErr as { message?: string };
      console.error("❌ [API-ANUNCIOS-FATAL]:", err);
      return NextResponse.json({ success: false, error: "Fatal database error", details: err.message }, { status: 500 });
    }

  } catch (error: unknown) {
    const err = error as { message?: string };
    return NextResponse.json({ success: false, error: "Error interno", details: err.message }, { status: 500 });
  }
}
