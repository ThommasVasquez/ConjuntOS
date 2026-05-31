import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";
import { getOrCreateActiveAsamblea, parseAsambleaState, saveAsambleaState, LiveSubtitle } from "@/lib/asamblea";
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
    return NextResponse.json({ success: true, subtitulos: state.subtitulos || [] });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  injectDbEnv();

  try {
    const body = await req.json();
    const { text, speaker, usuarioId } = body;

    const session = await auth();
    // Allow if it has usuarioId (simulator) or session user ID
    const targetUserId = usuarioId || session?.user?.id;
    if (!targetUserId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const junta = await getOrCreateActiveAsamblea();
    const state = parseAsambleaState(junta);

    // Verify if the targetUserId is allowed to speak (is admin OR active speaker)
    const isAdmin = (session?.user as any)?.role === "ADMINISTRADOR" || (session?.user as any)?.role === "SUPER_ADMIN" || targetUserId === "usr_thommyadmin" || targetUserId === "usr_thommy";
    const isActiveSpeaker = state.turnos.some(t => t.usuarioId === targetUserId && t.estado === "HABLANDO");

    if (!isAdmin && !isActiveSpeaker) {
      return NextResponse.json({ error: "No tienes permiso para transmitir subtítulos" }, { status: 403 });
    }

    const newSub: LiveSubtitle = {
      id: `sub_${Date.now()}`,
      speaker: speaker || session?.user?.name || "Orador",
      text: text,
      timestamp: new Date().toLocaleTimeString()
    };

    // We store the last subtitle (keeping array of 1 for active subtitle)
    state.subtitulos = [newSub];
    await saveAsambleaState(junta.id, state);

    return NextResponse.json({ success: true, subtitulos: state.subtitulos });
  } catch (error: any) {
    console.error("POST Subtitulos Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
