import { NextResponse } from "next/server";
import db from "@/lib/db";
import { auth } from "@/auth";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const currentUserId = session.user.id;

    // Get the current user to verify their role and conjuntoId
    const currentUser = await db.usuario.findUnique({
      where: { id: currentUserId },
      select: { conjuntoId: true, rol: true }
    });

    if (!currentUser) {
      return NextResponse.json({ success: false, error: "Usuario no encontrado" }, { status: 404 });
    }

    const allowedRoles = ["ADMINISTRADOR", "SUPER_ADMIN", "CONCEJO", "VIGILANTE", "SUPERVISOR_VIGILANCIA", "ENCARGADO_PARQUEADERO"];
    if (!allowedRoles.includes(currentUser.rol)) {
      return NextResponse.json({ success: false, error: "Permiso denegado" }, { status: 403 });
    }

    // Fetch only residents in the same conjunto with limited fields to comply with Habeas Data
    const residents = await db.usuario.findMany({
      where: {
        conjuntoId: currentUser.conjuntoId,
        rol: { in: ["PROPIETARIO", "ARRENDATARIO"] },
        activo: true
      },
      select: {
        id: true,
        nombre: true,
        unidad: {
          select: {
            numero: true,
            torre: true
          }
        }
      },
      orderBy: [
        { unidad: { torre: "asc" } },
        { unidad: { numero: "asc" } }
      ]
    });

    return NextResponse.json({ success: true, data: residents });
  } catch (error: any) {
    console.error("❌ [API-DIRECTORY] GET error:", error.message);
    return NextResponse.json({ success: false, error: "Error en el servidor" }, { status: 500 });
  }
}
