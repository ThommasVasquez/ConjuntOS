import { NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
       return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const tipo = searchParams.get("tipo"); // VENTA, ALQUILER
    const habitaciones = searchParams.get("habs");

    // 1. Obtener conjuntoId del usuario
    const userId = session.user.id;
    let conjuntoId = "";
    
    try {
      const usuarioDelegate = await db.usuario;
      const u = await usuarioDelegate.findUnique({
        where: { id: userId },
        select: { conjuntoId: true }
      });
      if (u) conjuntoId = u.conjuntoId;
    } catch {
      // SQL Fallback for conjuntoId
      const { Pool } = await import("@neondatabase/serverless");
      const { discoverUrl } = await import("@/lib/db");
      const url = await discoverUrl();
      const pool = new Pool({ connectionString: url });
      const res = await pool.query('SELECT "conjuntoId" FROM "Usuario" WHERE id = $1', [userId]);
      if (res.rows.length > 0) conjuntoId = res.rows[0].conjuntoId;
      await pool.end();
    }

    if (!conjuntoId) return NextResponse.json({ success: false, error: "Conjunto no encontrado" }, { status: 404 });

    // 2. Obtener Inmuebles (Capa 1: Prisma)
    try {
      const inmuebleDelegate = await db.inmueble;
      const where: Record<string, unknown> = { conjuntoId, estado: 'DISPONIBLE' };
      if (tipo) where.tipoNegocio = tipo;
      if (habitaciones) where.habitaciones = parseInt(habitaciones);

      const items = await inmuebleDelegate.findMany({
        where: where as unknown as any,
        orderBy: { creadoEn: 'desc' },
        include: { usuario: { select: { nombre: true, avatar: true, telefono: true } } }
      });
      return NextResponse.json({ success: true, data: items });
    } catch (err: unknown) {
      const pErr = err as { message?: string };
      console.warn("⚠️ [API-INMUEBLES]: Prisma falló, intentando SQL...", pErr.message);
    }

    // 3. Capa 2: SQL Directo (Salvavidas)
    try {
      const { Pool } = await import("@neondatabase/serverless");
      const { discoverUrl } = await import("@/lib/db");
      const url = await discoverUrl();
      const pool = new Pool({ connectionString: url });
      
      let query = `
        SELECT i.*, u.nombre as "usuario_nombre", u.avatar as "usuario_avatar", u.telefono as "usuario_telefono"
        FROM "Inmueble" i
        JOIN "Usuario" u ON i."usuarioId" = u.id
        WHERE i."conjuntoId" = $1 AND i.estado = 'DISPONIBLE'
      `;
      const values: (string | number)[] = [conjuntoId];

      if (tipo) {
        values.push(tipo);
        query += ` AND i."tipoNegocio" = $${values.length}`;
      }
      if (habitaciones) {
        values.push(parseInt(habitaciones));
        query += ` AND i.habitaciones = $${values.length}`;
      }

      query += ` ORDER BY i."creadoEn" DESC`;

      const res = await pool.query(query, values);
      await pool.end();
      return NextResponse.json({ success: true, data: res.rows });
    } catch (sqlErr: unknown) {
      const sErr = sqlErr as { message?: string };
      console.error("❌ [API-INMUEBLES-FATAL]:", sErr);
      return NextResponse.json({ success: false, error: sErr.message }, { status: 500 });
    }

  } catch (error: unknown) {
    const err = error as { message?: string };
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
       return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const userId = session.user.id;
    const { titulo, descripcion, precio, tipoNegocio, tipoUnidad, habitaciones, banos, area, imagenes } = body;

    // Obtener conjuntoId
    let conjuntoId = "";
    const { Pool } = await import("@neondatabase/serverless");
    const { discoverUrl } = await import("@/lib/db");
    const url = await discoverUrl();
    const pool = new Pool({ connectionString: url });
    
    const uRes = await pool.query('SELECT "conjuntoId" FROM "Usuario" WHERE id = $1', [userId]);
    if (uRes.rows.length > 0) conjuntoId = uRes.rows[0].conjuntoId;

    if (!conjuntoId) return NextResponse.json({ success: false, error: "Conjunto no encontrado" }, { status: 404 });

    // Inserción vía SQL (Más robusto en el Edge para modelos nuevos)
    try {
      const res = await pool.query(`
        INSERT INTO "Inmueble" (
          id, "conjuntoId", "usuarioId", titulo, descripcion, precio, 
          "tipoNegocio", "tipoUnidad", habitaciones, banos, area, 
          imagenes, "actualizadoEn"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        RETURNING *
      `, [
        `prop_${Math.random().toString(36).substring(7)}`,
        conjuntoId,
        userId,
        titulo,
        descripcion,
        parseFloat(precio),
        tipoNegocio,
        tipoUnidad,
        parseInt(habitaciones),
        parseInt(banos),
        parseFloat(area || 0),
        JSON.stringify(imagenes || [])
      ]);
      await pool.end();
      return NextResponse.json({ success: true, data: res.rows[0] });
    } catch (err: unknown) {
      await pool.end();
      throw err;
    }
  } catch (error: unknown) {
    const err = error as { message?: string };
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
