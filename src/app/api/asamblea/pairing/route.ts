import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// Helper to inject DB URL context for Cloudflare Edge
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
  
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  
  if (!code) {
    return NextResponse.json({ success: false, error: "Falta el código de vinculación" }, { status: 400 });
  }

  try {
    // Find the pairing session stored as a Tramite of type OTRO
    const pairingTramites = await db.tramite.findMany({
      where: { tipo: "OTRO" }
    });

    // Find the specific one by matching the code in the JSON description
    const found = pairingTramites.find((t: any) => {
      try {
        const payload = JSON.parse(t.descripcion);
        return payload.codigo === code;
      } catch {
        return false;
      }
    });

    if (!found) {
      return NextResponse.json({ success: true, status: "EXPIRADO" });
    }

    const payload = JSON.parse(found.descripcion);
    const expiraEn = new Date(payload.expiraEn);
    
    if (new Date() > expiraEn) {
      // Clean up expired
      await db.tramite.deleteMany({ where: { id: found.id } });
      return NextResponse.json({ success: true, status: "EXPIRADO" });
    }

    if (found.estado === "APROBADO") {
      // Vincualdo successfully!
      // Delete the pairing request after retrieving it to avoid reusing credentials
      await db.tramite.deleteMany({ where: { id: found.id } });
      return NextResponse.json({
        success: true,
        status: "VINCULADO",
        email: payload.email,
        password: payload.password,
        usuarioId: payload.usuarioId
      });
    }

    return NextResponse.json({ success: true, status: "PENDIENTE" });

  } catch (error: any) {
    console.error("Error checking pairing code:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  injectDbEnv();

  try {
    const body = await req.json();
    const { action, code, email, password, usuarioId } = body;

    if (action === "create") {
      // Web browser requesting a code
      const generatedPin = Math.floor(100000 + Math.random() * 900000).toString();
      const expiraEn = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes expiration
      
      const payload = {
        codigo: generatedPin,
        estado: "PENDIENTE",
        expiraEn
      };

      // Create a dummy user link or default to "demo_id"
      await db.tramite.create({
        data: {
          conjuntoId: "demo_id",
          usuarioId: "usr_01ovtd", // Fallback system admin or dummy resident user
          tipo: "OTRO",
          estado: "PENDIENTE",
          descripcion: JSON.stringify(payload)
        }
      });

      return NextResponse.json({ success: true, code: generatedPin });
    }

    if (action === "authorize") {
      // Mobile app authorizing the web session using the PIN
      if (!code || !email || !password) {
        return NextResponse.json({ success: false, error: "Datos de vinculación incompletos" }, { status: 400 });
      }

      const pairingTramites = await db.tramite.findMany({
        where: { tipo: "OTRO", estado: "PENDIENTE" }
      });

      const found = pairingTramites.find((t: any) => {
        try {
          const payload = JSON.parse(t.descripcion);
          return payload.codigo === code;
        } catch {
          return false;
        }
      });

      if (!found) {
        return NextResponse.json({ success: false, error: "Código incorrecto o expirado" }, { status: 404 });
      }

      const payload = JSON.parse(found.descripcion);
      const expiraEn = new Date(payload.expiraEn);
      
      if (new Date() > expiraEn) {
        await db.tramite.deleteMany({ where: { id: found.id } });
        return NextResponse.json({ success: false, error: "El código ha expirado" }, { status: 400 });
      }

      // Update state to APROBADO and store credentials
      const updatedPayload = {
        ...payload,
        email,
        password,
        usuarioId,
        estado: "VINCULADO"
      };

      await db.tramite.update({
        where: { id: found.id },
        data: {
          estado: "APROBADO",
          descripcion: JSON.stringify(updatedPayload)
        }
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: "Acción no reconocida" }, { status: 400 });

  } catch (error: any) {
    console.error("Error in pairing API:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
