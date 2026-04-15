import { NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(req: Request, props: { params: Promise<{ userId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
       return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { userId } = await props.params;
    if (!userId) {
       return NextResponse.json({ success: false, error: "Falta userId" }, { status: 400 });
    }

    // 1. Fetch messages using standard DB client
    const messages = await db.chatAdmin.findMany({
      where: { usuarioId: userId },
      orderBy: { creadoEn: "asc" },
      take: 100
    });

    // 2. Fetch resident info (Safe fetch using DB client)
    let residentInfo = { profile: null, vehicles: [], pets: [] };
    try {
      const user = await db.usuario.findUnique({
        where: { id: userId },
        include: {
          vehiculos: true,
          mascotas: true
        }
      });

      if (user) {
        const { vehiculos, mascotas, ...profile } = user;
        residentInfo = {
          profile: profile || null,
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
    if (!session?.user?.id) {
       return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { userId } = await props.params;
    const { mensaje } = await req.json();

    if (!mensaje) {
      return NextResponse.json({ success: false, error: "Mensaje vacío" }, { status: 400 });
    }

    const newMessage = await db.chatAdmin.create({
      data: {
        usuarioId: userId,
        mensaje,
        esDeAdmin: true,
        leido: false
      }
    });

    return NextResponse.json({ success: true, data: newMessage });
  } catch (error: any) {
    console.error("🔥 [POST-ERROR]:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
