import { NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
       return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;
    const usuarioDelegate = await db.usuario;
    const user = await usuarioDelegate.findUnique({
       where: { id: userId },
       select: { conjuntoId: true }
    });

    if (!user) return NextResponse.json({ success: false, error: "Usuario no encontrado" }, { status: 404 });

    const areaComunDelegate = await db.areaComun;
    let areas = await areaComunDelegate.findMany({
      where: { conjuntoId: user.conjuntoId, activa: true }
    });

    // MOCK INJECTION: Si no hay áreas comunes registradas, sembramos de prueba temporalmente para demo
    if (areas.length === 0) {
       console.log(`💡 [API-AREAS]: Sembrando áreas demo para conjunto ${user.conjuntoId}`);
       const dbUrlFromDBContext = await (async () => {
         const { discoverUrl } = await import("@/lib/db");
         return discoverUrl();
       })();
       
       if(dbUrlFromDBContext){
            try {
              // Create demo areas
              const demoAreas = [
                {
                  conjuntoId: user.conjuntoId,
                  nombre: "Piscina Infinity",
                  descripcion: "Disfruta de una tarde relajante con vista panorámica y agua climatizada.",
                  capacidadMax: 15,
                  imagenUrl: "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&q=80&w=1000",
                  requiereDeposito: false,
                  horaApertura: "08:00",
                  horaCierre: "20:00",
                  diasDisponibles: "1,2,3,4,5,6,0", // Sun-Sat
                  duracionSlot: 120, // 2 hours
                },
                {
                  conjuntoId: user.conjuntoId,
                  nombre: "Gym Premium",
                  descripcion: "Equipamiento de última generación para tu rutina diaria de entrenamiento.",
                  capacidadMax: 10,
                  imagenUrl: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&q=80&w=1000",
                  requiereDeposito: false,
                  horaApertura: "05:00",
                  horaCierre: "23:00",
                  diasDisponibles: "1,2,3,4,5,6,0",
                  duracionSlot: 60, // 1 hour
                },
                {
                  conjuntoId: user.conjuntoId,
                  nombre: "Salón Comunal Deluxe",
                  descripcion: "El lugar perfecto para tus eventos especiales y reuniones importantes.",
                  capacidadMax: 50,
                  imagenUrl: "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&q=80&w=1000",
                  requiereDeposito: true,
                  depositoMonto: 80000,
                  horaApertura: "10:00",
                  horaCierre: "23:59",
                  diasDisponibles: "5,6,0", // Vie, Sab, Dom
                  duracionSlot: 240, // 4 hours
                }
              ];

              await areaComunDelegate.createMany({ data: demoAreas });
              areas = await areaComunDelegate.findMany({ where: { conjuntoId: user.conjuntoId, activa: true } });
            } catch (err) {
              console.error("Error creating demo areas", err);
              throw new Error("No se pudieron inicializar las áreas comunes. Intenta de nuevo.");
            }
       }
    }

    return NextResponse.json({ success: true, data: areas });

  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("❌ [API-AREAS]:", errorMsg);
    return NextResponse.json({ success: false, error: "Error recuperando áreas comunes", details: errorMsg }, { status: 500 });
  }
}
