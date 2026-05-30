import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";
import { getOrCreateActiveAsamblea, parseAsambleaState, saveAsambleaState, ResidentOpinion } from "@/lib/asamblea";
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
    const junta = await getOrCreateActiveAsamblea();
    const state = parseAsambleaState(junta);
    return NextResponse.json({ success: true, opiniones: state.opiniones });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  injectDbEnv();

  try {
    let body: any = {};
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      body = await req.json().catch(() => ({}));
    }
    const { contenido, usuarioId } = body;

    const session = await auth();
    if (!session?.user?.id && !usuarioId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const targetUserId = usuarioId || session?.user?.id;

    if (!contenido || contenido.trim() === "") {
      return NextResponse.json({ error: "El contenido no puede estar vacío" }, { status: 400 });
    }

    const junta = await getOrCreateActiveAsamblea();
    const state = parseAsambleaState(junta);

    // Fetch user details for tower/apartment info
    const userDetail = await db.usuario.findFirst({
      where: { id: targetUserId }
    });

    const aptoText = userDetail ? `${userDetail.torre ? `T${userDetail.torre}` : ""} ${userDetail.apto ? `Apto ${userDetail.apto}` : ""}`.trim() : "";

    const newOpinion: ResidentOpinion = {
      id: `opn_${Date.now()}`,
      usuarioId: targetUserId,
      nombre: userDetail?.nombre || session?.user?.name || "Residente",
      apto: aptoText || "N/A",
      contenido: contenido.trim(),
      creadoEn: new Date().toISOString()
    };

    // Store a maximum of 100 opinions in state to keep JSON size under control
    state.opiniones.push(newOpinion);
    if (state.opiniones.length > 100) {
      state.opiniones.shift();
    }
    
    await saveAsambleaState(junta.id, state);

    return NextResponse.json({ success: true, opiniones: state.opiniones });
  } catch (error: any) {
    console.error("POST Opiniones Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
