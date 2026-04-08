import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// ── Rich Mock Classifieds — static strings for Edge-safe execution ──────────────
const MOCK_CLASIFICADOS = [
  {
    id: "cls_1",
    titulo: "Cuidado de Niños y Tutorías",
    descripcion: "Residente de la Torre 5 ofrece servicio de babysitting y apoyo en tareas para niños de 3 a 10 años. Experiencia certificada y excelentes referencias internas.",
    precio: 25000,
    categoria: "CUIDADO",
    usuario_nombre: "Lucía Fernández",
    usuario_torre: "5",
    usuario_apto: "402",
    usuario_avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200",
    whatsapp: "3007654321",
    imagenUrl: "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?auto=format&fit=crop&q=80&w=800",
    creadoEn: "2026-04-05T09:00:00Z"
  },
  {
    id: "cls_2",
    titulo: "Venta de Empanadas y Antojos",
    descripcion: "¡Deliciosas empanadas recién hechas todos los viernes y sábados! Carne, pollo y queso. Pedidos con 30 min de anticipación. Entrega en portería o a domicilio interno.",
    precio: 3500,
    categoria: "GASTRONOMIA",
    usuario_nombre: "Doña Martha",
    usuario_torre: "2",
    usuario_apto: "101",
    usuario_avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=200",
    whatsapp: "3112223344",
    imagenUrl: "https://images.unsplash.com/photo-1628102422209-646df3c20202?auto=format&fit=crop&q=80&w=800",
    creadoEn: "2026-04-06T11:00:00Z"
  },
  {
    id: "cls_3",
    titulo: "Servicio Técnico de Computadores",
    descripcion: "Mantenimiento preventivo, limpieza de virus, instalación de software y hardware. Recojo y entrego en tu apartamento. Precios especiales para vecinos.",
    precio: 50000,
    categoria: "TECNOLOGIA",
    usuario_nombre: "Andrés Tech",
    usuario_torre: "Torre A",
    usuario_apto: "203",
    usuario_avatar: "https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&q=80&w=200",
    whatsapp: "3154445566",
    imagenUrl: "https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?auto=format&fit=crop&q=80&w=800",
    creadoEn: "2026-04-07T14:00:00Z"
  },
  {
    id: "cls_4",
    titulo: "Paseo de Perros (Mañana y Tarde)",
    descripcion: "Paseo personalizado para tu mascota. Grupos pequeños de máximo 3 perros para asegurar atención total. 45 minutos de caminata y juegos.",
    precio: 12000,
    categoria: "MASCOTAS",
    usuario_nombre: "Pedro Canino",
    usuario_torre: "Torre 3",
    usuario_apto: "505",
    usuario_avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200",
    whatsapp: "3209998877",
    imagenUrl: "https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&q=80&w=800",
    creadoEn: "2026-04-08T08:00:00Z"
  },
  {
    id: "cls_5",
    titulo: "Postres y Repostería Artesanal",
    descripcion: "Tortas de chocolate, cheesecake de frutos rojos y brownies melcochudos. Todo bajo pedido. Endulza tus tardes sin salir del conjunto.",
    precio: 8000,
    categoria: "GASTRONOMIA",
    usuario_nombre: "Sofi Bakery",
    usuario_torre: "Torre 1",
    usuario_apto: "304",
    usuario_avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=200",
    whatsapp: "3015550099",
    imagenUrl: "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&q=80&w=800",
    creadoEn: "2026-04-08T10:00:00Z"
  }
];

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
       return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    // Try real DB first (Local model in Prisma)
    try {
      const { supabase } = await import("@/lib/db");
      const userId = session.user.id;

      const { data: user } = await supabase
        .from("Usuario")
        .select("conjuntoId")
        .eq("id", userId)
        .single();

      if (user?.conjuntoId) {
        // We use 'Local' model for Classifieds/Entrepreneurships
        const { data } = await supabase
          .from("Local")
          .select("*, usuario:Usuario(nombre, avatar, telefono)")
          .eq("conjuntoId", user.conjuntoId)
          .eq("activo", true)
          .order("creadoEn", { ascending: false });

        if (data && data.length > 0) {
          return NextResponse.json({ success: true, data, source: "db" });
        }
      }
    } catch (err) {
      console.warn("⚠️ [CLASIFICADOS]: Database access failed, using fallback mocks.");
    }

    // Fallback: Return Mock Data
    return NextResponse.json({ 
      success: true, 
      data: MOCK_CLASIFICADOS, 
      source: "mock" 
    });

  } catch (error: any) {
    console.error("❌ [API-CLASIFICADOS-FATAL]:", error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
