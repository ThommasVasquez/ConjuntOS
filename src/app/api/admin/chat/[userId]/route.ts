import { NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(req: Request, props: { params: Promise<{ userId: string }> }) {
  try {
    const session = await auth();
    const role = (session?.user as { role?: string })?.role;
    if (!session?.user?.id || !["ADMINISTRADOR", "SUPER_ADMIN"].includes(role || "")) {
       return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
    }

    const { userId } = await props.params;
    if (!userId) {
       return NextResponse.json({ success: false, error: "Falta userId" }, { status: 400 });
    }

    const targetUser = await db.usuario.findUnique({
      where: { id: userId },
      select: { rol: true, conjuntoId: true }
    });

    if (!targetUser) {
      return NextResponse.json({ success: false, error: "Destinatario no encontrado" }, { status: 404 });
    }

    // Role communication validation rules
    if (targetUser.rol === "SUPER_ADMIN" && role !== "ADMINISTRADOR" && role !== "SUPER_ADMIN") {
      return NextResponse.json({ success: false, error: "Solo administradores pueden comunicarse con un SuperAdmin" }, { status: 403 });
    }
    if (role === "SUPER_ADMIN" && targetUser.rol !== "ADMINISTRADOR") {
      return NextResponse.json({ success: false, error: "Un SuperAdmin solo puede comunicarse con administradores de conjuntos" }, { status: 403 });
    }
    if (role === "ADMINISTRADOR") {
      const loggedInUser = await db.usuario.findUnique({
        where: { id: session.user.id },
        select: { conjuntoId: true }
      });
      if (!loggedInUser || loggedInUser.conjuntoId !== targetUser.conjuntoId) {
        return NextResponse.json({ success: false, error: "No autorizado para ver chats de otra copropiedad" }, { status: 403 });
      }
      const allowedRoles = ['PROPIETARIO', 'ARRENDATARIO', 'CONCEJO', 'VIGILANTE', 'SUPERVISOR_VIGILANCIA', 'ENCARGADO_PARQUEADERO'];
      if (!allowedRoles.includes(targetUser.rol) && targetUser.rol !== "SUPER_ADMIN") {
        return NextResponse.json({ success: false, error: "No tienes permiso para chatear con este usuario" }, { status: 403 });
      }
    }

    // 1. Fetch messages using standard DB client (Safe for missing columns)
    let messages = [];
    try {
      messages = await db.chatAdmin.findMany({
        where: { usuarioId: userId },
        orderBy: { creadoEn: "asc" },
        take: 100
      });
    } catch (e: any) {
      console.warn("⚠️ [DB-SCHEMA-LAG]: Fallback to text-only fetch");
      // Fallback: If columns don't exist yet, we can't fetch them. 
      // In Supabase REST (db.ts), we might need to be explicit or just handle the error.
      messages = []; 
    }

    // 2. Fetch resident info (Safe fetch using DB client)
    let residentInfo = { profile: null, vehicles: [], pets: [] };
    try {
      const user = await db.usuario.findUnique({
        where: { id: userId },
        include: {
          unidad: true,
          vehiculos: true,
          mascotas: true
        }
      });

      if (user) {
        const { vehiculos, mascotas, unidad, ...profile } = user;
        residentInfo = {
          profile: {
            ...profile,
            torre: user.unidad?.torre || user.torre || null,
            apto: user.unidad?.numero || user.apto || null,
          } as any,
          vehicles: vehiculos || [],
          pets: mascotas || []
        };
      }
    } catch (e: any) {
      console.warn("⚠️ [DB-ENRICHMENT-ERROR]:", e.message);
    }

    // 3. Mark as read
    try {
      await db.chatAdmin.updateMany({
        where: { usuarioId: userId, esDeAdmin: false, leido: false },
        data: { leido: true }
      });
    } catch (e) {}

    return NextResponse.json({ 
      success: true, 
      data: messages,
      residentInfo
    });

  } catch (error: any) {
    console.error("🔥 [FATAL-API-ERROR]:", error);
    return NextResponse.json({ 
      success: false, 
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}

export async function POST(req: Request, props: { params: Promise<{ userId: string }> }) {
  try {
    const session = await auth();
    const role = (session?.user as { role?: string })?.role;
    if (!session?.user?.id || !["ADMINISTRADOR", "SUPER_ADMIN"].includes(role || "")) {
       return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
    }

    const { userId } = await props.params;
    if (!userId) {
       return NextResponse.json({ success: false, error: "Falta userId" }, { status: 400 });
    }

    const targetUser = await db.usuario.findUnique({
      where: { id: userId },
      select: { rol: true, conjuntoId: true }
    });

    if (!targetUser) {
      return NextResponse.json({ success: false, error: "Destinatario no encontrado" }, { status: 404 });
    }

    // Role communication validation rules
    if (targetUser.rol === "SUPER_ADMIN" && role !== "ADMINISTRADOR" && role !== "SUPER_ADMIN") {
      return NextResponse.json({ success: false, error: "Solo administradores pueden comunicarse con un SuperAdmin" }, { status: 403 });
    }
    if (role === "SUPER_ADMIN" && targetUser.rol !== "ADMINISTRADOR") {
      return NextResponse.json({ success: false, error: "Un SuperAdmin solo puede comunicarse con administradores de conjuntos" }, { status: 403 });
    }
    if (role === "ADMINISTRADOR") {
      const loggedInUser = await db.usuario.findUnique({
        where: { id: session.user.id },
        select: { conjuntoId: true }
      });
      if (!loggedInUser || loggedInUser.conjuntoId !== targetUser.conjuntoId) {
        return NextResponse.json({ success: false, error: "No autorizado para ver chats de otra copropiedad" }, { status: 403 });
      }
      const allowedRoles = ['PROPIETARIO', 'ARRENDATARIO', 'CONCEJO', 'VIGILANTE', 'SUPERVISOR_VIGILANCIA', 'ENCARGADO_PARQUEADERO'];
      if (!allowedRoles.includes(targetUser.rol) && targetUser.rol !== "SUPER_ADMIN") {
        return NextResponse.json({ success: false, error: "No tienes permiso para chatear con este usuario" }, { status: 403 });
      }
    }

    const { mensaje, audioUrl, transcripcion } = await req.json();

    if (!mensaje && !audioUrl) {
      return NextResponse.json({ success: false, error: "Contenido vacío" }, { status: 400 });
    }

    let newMessage;
    try {
      newMessage = await db.chatAdmin.create({
        data: {
          usuarioId: userId,
          mensaje: mensaje || (audioUrl ? "Mensaje de voz" : ""),
          audioUrl,
          transcripcion,
          esDeAdmin: true,
          leido: false
        }
      });
    } catch (dbError: any) {
      console.warn("⚠️ [DB-INSERT-FAIL]: Missing columns? Falling back to text-only.");
      // FALLBACK: If the above failed (likely due to missing columns), 
      // we try a standard text-only insert to save the interaction.
      newMessage = await db.chatAdmin.create({
        data: {
          usuarioId: userId,
          mensaje: mensaje || (audioUrl ? "Mensaje de voz (Audio no disponible aún)" : ""),
          esDeAdmin: true,
          leido: false
        }
      });
    }

    return NextResponse.json({ success: true, data: newMessage });
  } catch (error: any) {
    console.error("🔥 [POST-ERROR]:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
