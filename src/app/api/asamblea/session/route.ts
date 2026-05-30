import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";
import { getOrCreateActiveAsamblea, parseAsambleaState, saveAsambleaState } from "@/lib/asamblea";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function injectDbEnv() {
  try {
    const ctx = getRequestContext();
    const envUrl = (ctx?.env as { DATABASE_URL?: string })?.DATABASE_URL || "";
    if (envUrl) {
      (globalThis as { DATABASE_URL?: string }).DATABASE_URL = envUrl;
      process.env.DATABASE_URL = envUrl;
    }
  } catch {}
}

export async function GET(req: NextRequest) {
  injectDbEnv();
  
  try {
    const session = await auth();
    const userRole = (session?.user as { role?: string })?.role;
    const isAdmin = userRole === "ADMINISTRADOR" || userRole === "SUPER_ADMIN";

    const junta = await getOrCreateActiveAsamblea();
    const state = parseAsambleaState(junta);

    const adminUser = await db.usuario.findFirst({
      where: {
        conjuntoId: junta.conjuntoId,
        rol: { in: ["ADMINISTRADOR", "SUPER_ADMIN"] }
      }
    });
    const adminUserId = adminUser?.id || null;

    return NextResponse.json({
      success: true,
      juntaId: junta.id,
      titulo: junta.titulo,
      activa: state.activa,
      ordenDia: state.ordenDia,
      itemActivoIndex: state.itemActivoIndex,
      isAdmin,
      user: session?.user || null,
      adminUserId
    });
  } catch (error: any) {
    console.error("GET Assembly Session Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  injectDbEnv();

  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const userRole = (session.user as { role?: string })?.role;
    if (userRole !== "ADMINISTRADOR" && userRole !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Privilegios insuficientes" }, { status: 403 });
    }

    const body = await req.json();
    const { activa, ordenDia, itemActivoIndex } = body;

    const junta = await getOrCreateActiveAsamblea();
    const state = parseAsambleaState(junta);

    if (activa !== undefined) state.activa = activa;
    if (ordenDia !== undefined) state.ordenDia = ordenDia;
    if (itemActivoIndex !== undefined) state.itemActivoIndex = itemActivoIndex;

    await saveAsambleaState(junta.id, state);

    return NextResponse.json({
      success: true,
      juntaId: junta.id,
      titulo: junta.titulo,
      activa: state.activa,
      ordenDia: state.ordenDia,
      itemActivoIndex: state.itemActivoIndex
    });
  } catch (error: any) {
    console.error("POST Assembly Session Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
