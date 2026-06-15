import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { auth } from "@/auth";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const currentUserId = (session.user as any).id;

    // Get the current user
    const { data: currentUser, error: userError } = await supabase
      .from("Usuario")
      .select("conjuntoId, rol")
      .eq("id", currentUserId)
      .maybeSingle();

    if (userError || !currentUser) {
      return NextResponse.json({ success: false, error: "Usuario no encontrado" }, { status: 404 });
    }

    const allowedRoles = ["ADMINISTRADOR", "SUPER_ADMIN", "CONCEJO", "VIGILANTE", "SUPERVISOR_VIGILANCIA", "ENCARGADO_PARQUEADERO"];
    if (!allowedRoles.includes(currentUser.rol)) {
      return NextResponse.json({ success: false, error: "Permiso denegado" }, { status: 403 });
    }

    // Fetch residents in same conjunto
    const { data: residents, error: residentsError } = await supabase
      .from("Usuario")
      .select("id, nombre, unidadId")
      .eq("conjuntoId", currentUser.conjuntoId)
      .in("rol", ["PROPIETARIO", "ARRENDATARIO"])
      .eq("activo", true)
      .limit(500);

    if (residentsError) throw residentsError;

    // Enrich with Unidad data (torre + numero)
    const enriched = await Promise.all((residents || []).map(async (r: any) => {
      if (!r.unidadId) return { id: r.id, nombre: r.nombre, torre: null, numero: null };
      const { data: unidad } = await supabase
        .from("Unidad")
        .select("torre, numero")
        .eq("id", r.unidadId)
        .maybeSingle();
      return { id: r.id, nombre: r.nombre, torre: unidad?.torre || null, numero: unidad?.numero || null };
    }));

    // Sort by torre then numero
    enriched.sort((a: any, b: any) => {
      const t = (a.torre || "").localeCompare(b.torre || "");
      return t !== 0 ? t : (a.numero || "").localeCompare(b.numero || "");
    });

    return NextResponse.json({ success: true, data: enriched });
  } catch (error: any) {
    console.error("❌ [API-DIRECTORY] GET error:", error.message);
    return NextResponse.json({ success: false, error: "Error en el servidor" }, { status: 500 });
  }
}

