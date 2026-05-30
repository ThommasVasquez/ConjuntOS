import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";
import { getOrCreateActiveAsamblea, parseAsambleaState, saveAsambleaState, AsambleaAsistencia } from "@/lib/asamblea";
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

    // Fetch all units in the residential complex to calculate coefficients
    const units = await db.unidad.findMany({
      where: { conjuntoId: junta.conjuntoId }
    });

    const totalUnitsCount = units.length;
    const totalCoefficient = units.reduce((acc: number, u: any) => acc + (parseFloat(u.coeficiente) || 0), 0);

    // Fetch all users to map present users to units and coefficients
    const users = await db.usuario.findMany({
      where: { conjuntoId: junta.conjuntoId }
    });

    // Calculate present coefficients
    let presentCoefficient = 0;
    const presentUnitIds = new Set<string>();

    state.asistencias.forEach((asist: AsambleaAsistencia) => {
      const user = users.find((u: any) => u.id === asist.usuarioId);
      if (user && user.unidadId) {
        presentUnitIds.add(user.unidadId);
      }

      // Also count represented units via validated powers
      const representedPowers = state.poderes.filter(
        (p: any) => p.apoderadoId === asist.usuarioId && p.verificado
      );
      representedPowers.forEach((pow: any) => {
        const otorgante = users.find((u: any) => u.id === pow.otorganteId);
        if (otorgante && otorgante.unidadId) {
          presentUnitIds.add(otorgante.unidadId);
        }
      });
    });

    // Sum coefficients of present units
    presentUnitIds.forEach((uid: string) => {
      const unit = units.find((u: any) => u.id === uid);
      if (unit) {
        presentCoefficient += parseFloat(unit.coeficiente) || 0;
      }
    });

    // Return assistance and calculations
    return NextResponse.json({
      success: true,
      asistencias: state.asistencias,
      totalUnits: totalUnitsCount,
      totalCoefficient,
      presentCoefficient,
      quorumPercentage: totalCoefficient > 0 ? (presentCoefficient / totalCoefficient) * 100 : 0
    });

  } catch (error: any) {
    console.error("GET Asistencia Error:", error);
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
    const { usuarioId, tipo } = body; // tipo: "PRESENCIAL" | "VIRTUAL"

    const junta = await getOrCreateActiveAsamblea();
    const state = parseAsambleaState(junta);

    const userRole = (session.user as { role?: string })?.role;
    const isAdmin = userRole === "ADMINISTRADOR" || userRole === "SUPER_ADMIN";

    // Target user check-in details
    let targetUserId = session.user.id;
    let checkinType: 'PRESENCIAL' | 'VIRTUAL' = "VIRTUAL";

    if (isAdmin && usuarioId) {
      // Admin checking in another user manually (presential or virtual)
      targetUserId = usuarioId;
      checkinType = tipo || "PRESENCIAL";
    }

    // Check if already checked in
    const isAlreadyPresent = state.asistencias.some(a => a.usuarioId === targetUserId);
    if (isAlreadyPresent) {
      return NextResponse.json({ success: false, error: "El usuario ya registró asistencia", asistencias: state.asistencias });
    }

    // Fetch user details for apartment mapping
    const userDetail = await db.usuario.findFirst({
      where: { id: targetUserId }
    });

    if (!userDetail) {
      return NextResponse.json({ success: false, error: "Usuario no encontrado" }, { status: 404 });
    }

    const aptoText = `${userDetail.torre ? `T${userDetail.torre}` : ""} ${userDetail.apto ? `Apto ${userDetail.apto}` : ""}`.trim() || "N/A";

    // Client metadata
    const ip = req.headers.get("x-forwarded-for") || (req as any).ip || "127.0.0.1";
    const dispositivo = req.headers.get("user-agent") || "Web Client";

    const newAsistencia: AsambleaAsistencia = {
      usuarioId: targetUserId,
      nombre: userDetail.nombre,
      apto: aptoText,
      tipo: checkinType,
      verificado: true,
      creadoEn: new Date().toISOString(),
      ip,
      dispositivo
    };

    state.asistencias.push(newAsistencia);
    await saveAsambleaState(junta.id, state);

    return NextResponse.json({
      success: true,
      asistencias: state.asistencias
    });

  } catch (error: any) {
    console.error("POST Asistencia Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
