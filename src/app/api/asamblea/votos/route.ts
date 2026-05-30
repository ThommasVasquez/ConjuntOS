import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";
import { getOrCreateActiveAsamblea, parseAsambleaState, saveAsambleaState, AsambleaVoto } from "@/lib/asamblea";
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

// Helper to generate a hex SHA-256 signature hash
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function GET(req: NextRequest) {
  injectDbEnv();

  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const votacionId = searchParams.get("votacionId");

    if (!votacionId) {
      return NextResponse.json({ error: "votacionId es requerido" }, { status: 400 });
    }

    const junta = await getOrCreateActiveAsamblea();
    const state = parseAsambleaState(junta);

    const votacion = state.votaciones.find(v => v.id === votacionId);
    if (!votacion) {
      return NextResponse.json({ error: "Votación no encontrada" }, { status: 404 });
    }

    // Consolidated calculations
    const results: Record<string, { count: number, coefficient: number }> = {};
    votacion.opciones.forEach(op => {
      results[op] = { count: 0, coefficient: 0 };
    });

    let totalVotedCoefficient = 0;
    votacion.votos.forEach(v => {
      if (results[v.respuesta]) {
        results[v.respuesta].count += 1;
        results[v.respuesta].coefficient += v.coeficiente;
      } else {
        results[v.respuesta] = { count: 1, coefficient: v.coeficiente };
      }
      totalVotedCoefficient += v.coeficiente;
    });

    return NextResponse.json({
      success: true,
      votacion,
      results,
      totalVotedCoefficient
    });

  } catch (error: any) {
    console.error("GET Votos Error:", error);
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
    const { votacionId, respuesta } = body;

    if (!votacionId || !respuesta) {
      return NextResponse.json({ error: "Parámetros incompletos" }, { status: 400 });
    }

    const junta = await getOrCreateActiveAsamblea();
    const state = parseAsambleaState(junta);

    const votIndex = state.votaciones.findIndex(v => v.id === votacionId);
    if (votIndex === -1) {
      return NextResponse.json({ error: "Votación no encontrada" }, { status: 404 });
    }

    const votacion = state.votaciones[votIndex];
    if (!votacion.activa) {
      return NextResponse.json({ error: "Esta votación ya está cerrada o no se ha activado" }, { status: 400 });
    }

    if (!votacion.opciones.includes(respuesta)) {
      return NextResponse.json({ error: "Opción de voto inválida" }, { status: 400 });
    }

    // Fetch user and all other users to calculate coefficients
    const users = await db.usuario.findMany({
      where: { conjuntoId: junta.conjuntoId }
    });

    const voter = users.find((u: any) => u.id === session.user.id);
    if (!voter) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const units = await db.unidad.findMany({
      where: { conjuntoId: junta.conjuntoId }
    });

    // 1. Calculate base coefficient
    let baseCoefficient = 0;
    if (voter.unidadId) {
      const u = units.find((x: any) => x.id === voter.unidadId);
      if (u) {
        baseCoefficient = parseFloat(u.coeficiente) || 0;
      }
    }

    // 2. Accumulate coefficient from validated powers represented by this user
    let representedCoefficient = 0;
    const validatedPowers = state.poderes.filter(
      (p: any) => p.apoderadoId === voter.id && p.verificado
    );

    validatedPowers.forEach((pow: any) => {
      const otorgante = users.find((u: any) => u.id === pow.otorganteId);
      if (otorgante && otorgante.unidadId) {
        const u = units.find((x: any) => x.id === otorgante.unidadId);
        if (u) {
          representedCoefficient += parseFloat(u.coeficiente) || 0;
        }
      }
    });

    const totalCoefficient = baseCoefficient + representedCoefficient;

    // Apto reference
    const aptoText = voter.unidadId
      ? `${voter.torre ? `T${voter.torre}` : ""} ${voter.apto ? `Apto ${voter.apto}` : ""}`.trim()
      : "N/A";

    const timestamp = new Date().toISOString();
    // Cryptographic signature hash representing legal proof
    const signaturePlaintext = `${voter.id}:${votacionId}:${respuesta}:${totalCoefficient}:${timestamp}`;
    const hashFirma = await sha256(signaturePlaintext);

    const newVoto: AsambleaVoto = {
      usuarioId: voter.id,
      nombre: voter.nombre,
      apto: aptoText,
      respuesta,
      coeficiente: totalCoefficient || 0.01, // fallback
      esVirtual: true,
      hashFirma,
      creadoEn: timestamp
    };

    // Enforce that voters can only vote once per poll (no re-voting/vote changes)
    const alreadyVoted = votacion.votos.some(v => v.usuarioId === voter.id);
    if (alreadyVoted) {
      return NextResponse.json({ error: "Ya has registrado tu voto. Solo se permite votar una vez por encuesta." }, { status: 400 });
    }
    votacion.votos.push(newVoto);

    state.votaciones[votIndex] = votacion;
    await saveAsambleaState(junta.id, state);

    return NextResponse.json({
      success: true,
      votos: votacion.votos
    });

  } catch (error: any) {
    console.error("POST Votos Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
