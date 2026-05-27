import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";
import { getOrCreateActiveAsamblea, parseAsambleaState, saveAsambleaState, AsambleaPoder } from "@/lib/asamblea";
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
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const junta = await getOrCreateActiveAsamblea();
    const state = parseAsambleaState(junta);

    return NextResponse.json({
      success: true,
      poderes: state.poderes
    });

  } catch (error: any) {
    console.error("GET Poderes Error:", error);
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

    const body = await req.json();
    const { otorganteId, apoderadoId, documentoUrl } = body;

    if (!otorganteId || !apoderadoId || !documentoUrl) {
      return NextResponse.json({ error: "Parámetros incompletos" }, { status: 400 });
    }

    const junta = await getOrCreateActiveAsamblea();
    const state = parseAsambleaState(junta);

    // Fetch user details for names and tower/apto
    const users = await db.usuario.findMany({
      where: { id: { in: [otorganteId, apoderadoId] } }
    });

    const otorgante = users.find((u: any) => u.id === otorganteId);
    const apoderado = users.find((u: any) => u.id === apoderadoId);

    if (!otorgante || !apoderado) {
      return NextResponse.json({ error: "Otorgante o Apoderado no encontrado" }, { status: 404 });
    }

    const otorganteApto = `${otorgante.torre ? `T${otorgante.torre}` : ""} ${otorgante.apto ? `Apto ${otorgante.apto}` : ""}`.trim() || "N/A";

    const newPoder: AsambleaPoder = {
      id: `pdr_${Date.now()}`,
      otorganteId,
      otorganteNombre: otorgante.nombre,
      otorganteApto,
      apoderadoId,
      apoderadoNombre: apoderado.nombre,
      documentoUrl,
      verificado: false, // Must be verified by the admin
      creadoEn: new Date().toISOString()
    };

    state.poderes.push(newPoder);
    await saveAsambleaState(junta.id, state);

    return NextResponse.json({
      success: true,
      poderes: state.poderes
    });

  } catch (error: any) {
    console.error("POST Poderes Error:", error);
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
    const { powerId, verificado, rechazado } = body;

    if (!powerId) {
      return NextResponse.json({ error: "powerId es requerido" }, { status: 400 });
    }

    const junta = await getOrCreateActiveAsamblea();
    const state = parseAsambleaState(junta);

    const index = state.poderes.findIndex(p => p.id === powerId);
    if (index === -1) {
      return NextResponse.json({ error: "Poder no encontrado" }, { status: 404 });
    }

    if (rechazado) {
      // Remove power if rejected
      state.poderes.splice(index, 1);
    } else {
      // Verify power
      state.poderes[index].verificado = verificado !== undefined ? verificado : true;
    }

    await saveAsambleaState(junta.id, state);

    return NextResponse.json({
      success: true,
      poderes: state.poderes
    });

  } catch (error: any) {
    console.error("PUT Poderes Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
