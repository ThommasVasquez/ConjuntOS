import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";
import { getOrCreateActiveAsamblea, parseAsambleaState, saveAsambleaState, SpeakingTurn } from "@/lib/asamblea";
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
    return NextResponse.json({ success: true, turnos: state.turnos });
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
    const { usuarioId } = body;

    const session = await auth();
    if (!session?.user?.id && !usuarioId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const targetUserId = usuarioId || session?.user?.id;

    const junta = await getOrCreateActiveAsamblea();
    const state = parseAsambleaState(junta);

    // Check if user already has a pending or active turn
    const hasTurn = state.turnos.some((t: SpeakingTurn) => 
      t.usuarioId === targetUserId && (t.estado === "PENDIENTE" || t.estado === "HABLANDO")
    );

    if (hasTurn) {
      return NextResponse.json({ success: false, error: "Ya tienes una solicitud de palabra activa" }, { status: 200 });
    }

    // Fetch user details to get tower/apartment info
    const userDetail = await db.usuario.findFirst({
      where: { id: targetUserId }
    });

    const aptoText = userDetail ? `${userDetail.torre ? `T${userDetail.torre}` : ""} ${userDetail.apto ? `Apto ${userDetail.apto}` : ""}`.trim() : "";

    const newTurn: SpeakingTurn = {
      id: `trn_${Date.now()}`,
      usuarioId: targetUserId,
      nombre: userDetail?.nombre || session?.user?.name || "Residente",
      apto: aptoText || "N/A",
      estado: "PENDIENTE",
      creadoEn: new Date().toISOString()
    };

    state.turnos.push(newTurn);
    await saveAsambleaState(junta.id, state);

    return NextResponse.json({ success: true, turnos: state.turnos });
  } catch (error: any) {
    console.error("POST Turnos Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
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
    const { turnId, estado } = body; // estado can be "HABLANDO", "COMPLETADO", "CANCELADO"

    if (!turnId || !estado) {
      return NextResponse.json({ error: "Parámetros incompletos" }, { status: 400 });
    }

    const junta = await getOrCreateActiveAsamblea();
    const state = parseAsambleaState(junta);

    const turnIndex = state.turnos.findIndex((t: SpeakingTurn) => t.id === turnId);
    if (turnIndex === -1) {
      return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });
    }

    if (estado === "HABLANDO") {
      // Set all other "HABLANDO" turns to "COMPLETADO"
      state.turnos = state.turnos.map((t: SpeakingTurn) => 
        t.estado === "HABLANDO" ? { ...t, estado: "COMPLETADO" as const } : t
      );
      state.turnos[turnIndex].estado = "HABLANDO";
      state.turnos[turnIndex].iniciadoHablarEn = new Date().toISOString();
    } else if (estado === "COMPLETADO") {
      state.turnos[turnIndex].estado = "COMPLETADO";
    } else if (estado === "CANCELADO") {
      // Remove or mark as completed
      state.turnos.splice(turnIndex, 1);
    }

    await saveAsambleaState(junta.id, state);

    return NextResponse.json({ success: true, turnos: state.turnos });
  } catch (error: any) {
    console.error("PUT Turnos Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
