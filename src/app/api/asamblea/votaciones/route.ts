import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";
import { getOrCreateActiveAsamblea, parseAsambleaState, saveAsambleaState, AsambleaVotacion } from "@/lib/asamblea";
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

function sanitizeVotaciones(votaciones: AsambleaVotacion[], currentUserId: string): AsambleaVotacion[] {
  return votaciones.map(vot => {
    if (vot.esSecreto) {
      return {
        ...vot,
        votos: vot.votos.map(v => {
          if (v.usuarioId === currentUserId) {
            return v;
          }
          return {
            ...v,
            nombre: "Voto Anónimo",
            apto: "Apto -",
            usuarioId: "anonymous"
          };
        })
      };
    }
    return vot;
  });
}

export async function GET(req: NextRequest) {
  injectDbEnv();

  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const junta = await getOrCreateActiveAsamblea();
    const state = parseAsambleaState(junta);

    return NextResponse.json({
      success: true,
      votaciones: sanitizeVotaciones(state.votaciones, session.user.id)
    });

  } catch (error: any) {
    console.error("GET Votaciones Error:", error);
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
    const { titulo, descripcion, opciones, formula, esSecreto } = body;

    if (!titulo) {
      return NextResponse.json({ error: "El título es requerido" }, { status: 400 });
    }

    const junta = await getOrCreateActiveAsamblea();
    const state = parseAsambleaState(junta);

    const newVotacion: AsambleaVotacion = {
      id: `vt_${Date.now()}`,
      titulo,
      descripcion,
      opciones: opciones && opciones.length > 0 ? opciones : ["SI", "NO", "ABSTENCION"],
      activa: false,
      votos: [],
      creadoEn: new Date().toISOString(),
      formula: formula || 'MAYORIA_SIMPLE',
      esSecreto: !!esSecreto
    };

    state.votaciones.push(newVotacion);
    await saveAsambleaState(junta.id, state);

    return NextResponse.json({
      success: true,
      votaciones: sanitizeVotaciones(state.votaciones, session.user.id)
    });

  } catch (error: any) {
    console.error("POST Votaciones Error:", error);
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
    const { votacionId, activa } = body;

    if (!votacionId) {
      return NextResponse.json({ error: "votacionId es requerido" }, { status: 400 });
    }

    const junta = await getOrCreateActiveAsamblea();
    const state = parseAsambleaState(junta);

    const index = state.votaciones.findIndex(v => v.id === votacionId);
    if (index === -1) {
      return NextResponse.json({ error: "Votación no encontrada" }, { status: 404 });
    }

    if (activa) {
      // Set all other votations to inactive
      state.votaciones = state.votaciones.map(v => ({ ...v, activa: false }));
      state.votaciones[index].activa = true;
    } else {
      state.votaciones[index].activa = false;
    }

    await saveAsambleaState(junta.id, state);

    return NextResponse.json({
      success: true,
      votaciones: sanitizeVotaciones(state.votaciones, session.user.id)
    });

  } catch (error: any) {
    console.error("PUT Votaciones Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
