import { NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;

    if (!session || role !== "SUPER_ADMIN") {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const {
      nombre,
      nit,
      subdominio,
      direccion,
      ciudad,
      representanteLegal,
      notariaEscritura,
      numeroEscritura,
      fechaEscritura,
      matriculaInmobiliaria,
      totalUnidades,
      logoUrl,
      colorPrimario
    } = body;

    if (!nombre || !subdominio || !direccion || !ciudad || !nit) {
      return NextResponse.json({ success: false, error: "Faltan campos obligatorios" }, { status: 400 });
    }

    // Clean subdominio
    const cleanSubdomain = subdominio.toLowerCase().trim().replace(/[^a-z0-9-]/g, "");

    // Check if subdominio already exists
    const existing = await db.conjunto.findUnique({
      where: { subdominio: cleanSubdomain }
    });

    if (existing) {
      return NextResponse.json({ success: false, error: "El subdominio ya está registrado" }, { status: 400 });
    }

    // Create the Conjunto
    const newConjunto = await db.conjunto.create({
      data: {
        nombre,
        nit,
        subdominio: cleanSubdomain,
        direccion,
        ciudad,
        representanteLegal: representanteLegal || null,
        notariaEscritura: notariaEscritura || null,
        numeroEscritura: numeroEscritura || null,
        fechaEscritura: fechaEscritura ? new Date(fechaEscritura) : null,
        matriculaInmobiliaria: matriculaInmobiliaria || null,
        totalUnidades: totalUnidades ? parseInt(totalUnidades, 10) : 1,
        logoUrl: logoUrl || null,
        colorPrimario: colorPrimario || "#1E3A5F"
      }
    });

    return NextResponse.json({ success: true, data: newConjunto });
  } catch (error: any) {
    console.error("❌ [API-SUPERADMIN-CONJUNTOS] error:", error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;

    if (!session || role !== "SUPER_ADMIN") {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
    }

    const conjuntos = await db.conjunto.findMany({
      orderBy: { creadoEn: "desc" }
    });

    return NextResponse.json({ success: true, data: conjuntos });
  } catch (error: any) {
    console.error("❌ [API-SUPERADMIN-CONJUNTOS] GET error:", error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
