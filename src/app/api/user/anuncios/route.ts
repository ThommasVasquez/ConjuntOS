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
      const usuarioDelegate = db.usuario;
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
      const anuncioDelegate = db.anuncio;
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
            contenido: "Esta es la primera publicación oficial en tiempo real desde la base de datos de ConjuntOS. Aquí encontrarás noticias, mantenimientos y eventos importantes.",
            tipo: 'GENERAL',
            fijado: true,
            archivosUrl: ""
          }
        });
        const fresh = await anuncioDelegate.findMany({ where: { conjuntoId } });
        return NextResponse.json({ success: true, data: fresh });
      }

      return NextResponse.json({ success: true, data: anuncios });
    } catch (prismaErr: unknown) {
      const pErr = prismaErr as { message?: string };
      console.warn("⚠️ [API-ANUNCIOS]: Prisma falló, intentando SQL Directo...", pErr.message);
    }

    // 3. SQL DIRECTO (Salvavidas - Capa 2)
    try {
      const { Pool } = await import("@neondatabase/serverless");
      const { discoverUrl } = await import("@/lib/db");
      const url = await discoverUrl();
      const pool = new Pool({ connectionString: url });
      
      // Ensure table exists (Harden)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "Anuncio" (
          "id" TEXT PRIMARY KEY,
          "conjuntoId" TEXT NOT NULL,
          "titulo" TEXT NOT NULL,
          "contenido" TEXT NOT NULL,
          "tipo" TEXT DEFAULT 'GENERAL',
          "imagenUrl" TEXT,
          "archivosUrl" TEXT DEFAULT '',
          "fijado" BOOLEAN DEFAULT false,
          "publicadoEn" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          "expiresEn" TIMESTAMP WITH TIME ZONE,
          "vistas" INTEGER DEFAULT 0
        )
      `);

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

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
       return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const role = (session.user as any)?.role;
    if (role !== "ADMINISTRADOR" && role !== "SUPER_ADMIN") {
       return NextResponse.json({ success: false, error: "Permisos insuficientes" }, { status: 403 });
    }

    const body = await req.json();
    const { titulo, contenido, tipo, imagenUrl, archivosUrl, fijado } = body;

    if (!titulo || !contenido || !tipo) {
       return NextResponse.json({ success: false, error: "Campos obligatorios faltantes" }, { status: 400 });
    }

    // Obtener conjuntoId del administrador
    const admin = await db.usuario.findUnique({
      where: { id: session.user.id },
      select: { conjuntoId: true }
    });

    if (!admin?.conjuntoId) {
       return NextResponse.json({ success: false, error: "Administrador sin conjunto asignado" }, { status: 400 });
    }

    const nuevoAnuncio = await db.anuncio.create({
      data: {
        conjuntoId: admin.conjuntoId,
        titulo,
        contenido,
        tipo, // TipoAnuncio enum
        imagenUrl: imagenUrl || null,
        archivosUrl: archivosUrl || "",
        fijado: fijado || false,
      }
    });

    // 🔔 Crear notificación automática para todos los residentes sobre la nueva circular / anuncio
    try {
      const residents = await db.usuario.findMany({
        where: {
          conjuntoId: admin.conjuntoId,
          rol: { in: ['PROPIETARIO', 'ARRENDATARIO', 'CONCEJO', 'VIGILANTE', 'ENCARGADO_PARQUEADERO'] }
        },
        select: { id: true }
      });

      if (residents.length > 0) {
        await Promise.all(
          residents.map(r => 
            db.notificacion.create({
              data: {
                usuarioId: r.id,
                tipo: 'INFO',
                titulo: `Nueva publicación: ${titulo}`,
                mensaje: contenido.substring(0, 100) + (contenido.length > 100 ? "..." : "")
              }
            })
          )
        );
      }
    } catch (notifErr: any) {
      console.warn("⚠️ Error al notificar a residentes sobre el anuncio:", notifErr.message);
    }

    return NextResponse.json({ success: true, data: nuevoAnuncio });
  } catch (error: any) {
    console.error("❌ [API-ANUNCIOS] POST error:", error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
       return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const role = (session.user as any)?.role;
    if (role !== "ADMINISTRADOR" && role !== "SUPER_ADMIN") {
       return NextResponse.json({ success: false, error: "Permisos insuficientes" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
       return NextResponse.json({ success: false, error: "ID del anuncio es requerido" }, { status: 400 });
    }

    // Validar que el anuncio pertenezca al conjunto del administrador
    const admin = await db.usuario.findUnique({
      where: { id: session.user.id },
      select: { conjuntoId: true }
    });

    if (!admin?.conjuntoId) {
       return NextResponse.json({ success: false, error: "Administrador sin conjunto asignado" }, { status: 400 });
    }

    const anuncio = await db.anuncio.findUnique({
      where: { id }
    });

    if (!anuncio) {
       return NextResponse.json({ success: false, error: "Anuncio no encontrado" }, { status: 404 });
    }

    if (anuncio.conjuntoId !== admin.conjuntoId) {
       return NextResponse.json({ success: false, error: "No autorizado para eliminar este anuncio" }, { status: 403 });
    }

    await db.anuncio.delete({
      where: { id }
    });

    return NextResponse.json({ success: true, message: "Anuncio eliminado con éxito" });
  } catch (error: any) {
    console.error("❌ [API-ANUNCIOS] DELETE error:", error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
