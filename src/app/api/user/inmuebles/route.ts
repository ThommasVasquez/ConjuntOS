import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// ── Rich Mock Listings — static strings only (Edge-safe) ─────────────────────
const MOCK_INMUEBLES = [
  {
    id: "mock_1",
    titulo: "Apartamento Moderno con Vista Panorámica",
    descripcion: "Hermoso apartamento completamente remodelado en Torre B, piso 8. Incluye cocina integral, closets empotrados, parqueadero cubierto y depósito. Vista a zona verde del conjunto.",
    precio: 420000000,
    tipoNegocio: "VENTA",
    tipoUnidad: "APARTAMENTO",
    habitaciones: 3,
    banos: 2,
    area: 78,
    imagenes: "[\"https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&q=80&w=1000\"]",
    estado: "DISPONIBLE",
    destacado: true,
    usuario_nombre: "Familia Rodríguez",
    usuario_avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=200",
    usuario_telefono: "3001234567",
    creadoEn: "2026-04-01T10:00:00.000Z"
  },
  {
    id: "mock_2",
    titulo: "Apto 2 Alcobas en Arriendo — Listo para Estrenar",
    descripcion: "Apartamento en primer piso con jardín privado, ideal para mascotas. Piso en porcelanato, acabados modernos. Zonas comunes: piscina, gym y salón comunal incluidos.",
    precio: 1450000,
    tipoNegocio: "ALQUILER",
    tipoUnidad: "APARTAMENTO",
    habitaciones: 2,
    banos: 2,
    area: 62,
    imagenes: "[\"https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&q=80&w=1000\"]",
    estado: "DISPONIBLE",
    destacado: false,
    usuario_nombre: "Carlos Medina",
    usuario_avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200",
    usuario_telefono: "3109876543",
    creadoEn: "2026-04-02T10:00:00.000Z"
  },
  {
    id: "mock_3",
    titulo: "Parqueadero Cubierto Torre A — Disponible ya",
    descripcion: "Cupo de parqueadero cerrado de 12.5m² en sótano 1, frente a ascensor. Ideal para carro mediano. Administración incluida. Contrato mínimo 6 meses.",
    precio: 250000,
    tipoNegocio: "ALQUILER",
    tipoUnidad: "PARQUEADERO",
    habitaciones: 0,
    banos: 0,
    area: 12,
    imagenes: "[\"https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&q=80&w=1000\"]",
    estado: "DISPONIBLE",
    destacado: false,
    usuario_nombre: "Martha Jiménez",
    usuario_avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200",
    usuario_telefono: "3205554433",
    creadoEn: "2026-04-03T10:00:00.000Z"
  },
  {
    id: "mock_4",
    titulo: "Habitación Amoblada con Baño Privado",
    descripcion: "Habitación independiente con baño privado, A/C, escritorio y WiFi en apartamento compartido. Cocina equipada, lavandería y acceso a todas las zonas comunes del conjunto.",
    precio: 750000,
    tipoNegocio: "ALQUILER",
    tipoUnidad: "LOCAL",
    habitaciones: 1,
    banos: 1,
    area: 18,
    imagenes: "[\"https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&q=80&w=1000\"]",
    estado: "DISPONIBLE",
    destacado: false,
    usuario_nombre: "Diana López",
    usuario_avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=200",
    usuario_telefono: "3152223344",
    creadoEn: "2026-04-04T10:00:00.000Z"
  },
  {
    id: "mock_5",
    titulo: "Apto 3 Alcobas en Venta — Negociable",
    descripcion: "Gran oportunidad: 95m², 3 alcobas, 2 baños, cocina abierta y balcón con vista a la montaña. Incluye parqueadero y depósito. Conjunto con vigilancia 24 horas. Escritura disponible.",
    precio: 580000000,
    tipoNegocio: "VENTA",
    tipoUnidad: "APARTAMENTO",
    habitaciones: 3,
    banos: 2,
    area: 95,
    imagenes: "[\"https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=80&w=1000\"]",
    estado: "DISPONIBLE",
    destacado: true,
    usuario_nombre: "Roberto Salcedo",
    usuario_avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=200",
    usuario_telefono: "3001112233",
    creadoEn: "2026-04-05T10:00:00.000Z"
  },
  {
    id: "mock_6",
    titulo: "Estudio Compacto en Arriendo — Amoblado",
    descripcion: "Acogedor estudio de 38m² totalmente amoblado. Incluye sofá-cama, minicocina, TV y baño completo. Servicios de agua y administración incluidos. Ideal para ejecutivo.",
    precio: 980000,
    tipoNegocio: "ALQUILER",
    tipoUnidad: "APARTAMENTO",
    habitaciones: 1,
    banos: 1,
    area: 38,
    imagenes: "[\"https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&q=80&w=1000\"]",
    estado: "DISPONIBLE",
    destacado: false,
    usuario_nombre: "Valentina Torres",
    usuario_avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=200",
    usuario_telefono: "3189990011",
    creadoEn: "2026-04-06T10:00:00.000Z"
  },
  {
    id: "mock_7",
    titulo: "Parqueadero Doble en Venta",
    descripcion: "Dos cupos de parqueadero contiguos en sótano 2. Caben dos carros o un carro grande. Vigilancia 24/7, portón eléctrico. Escritura disponible. Excelente inversión.",
    precio: 85000000,
    tipoNegocio: "VENTA",
    tipoUnidad: "PARQUEADERO",
    habitaciones: 0,
    banos: 0,
    area: 25,
    imagenes: "[\"https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&q=80&w=1000\"]",
    estado: "DISPONIBLE",
    destacado: false,
    usuario_nombre: "Inversiones Mora",
    usuario_avatar: "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=200",
    usuario_telefono: "3044445566",
    creadoEn: "2026-04-07T10:00:00.000Z"
  },
  {
    id: "mock_8",
    titulo: "Habitación con Terraza Privada",
    descripcion: "Habitación premium de 22m² con acceso a terraza exclusiva de 15m², perfecta para home office o descanso. Baño compartido con solo 1 persona. Ambiente tranquilo y seguro.",
    precio: 900000,
    tipoNegocio: "ALQUILER",
    tipoUnidad: "LOCAL",
    habitaciones: 1,
    banos: 1,
    area: 22,
    imagenes: "[\"https://images.unsplash.com/photo-1560185007-cde436f6a4d0?auto=format&fit=crop&q=80&w=1000\"]",
    estado: "DISPONIBLE",
    destacado: false,
    usuario_nombre: "Ana Gómez",
    usuario_avatar: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&q=80&w=200",
    usuario_telefono: "3167778899",
    creadoEn: "2026-04-08T10:00:00.000Z"
  }
];

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const tipo = searchParams.get("tipo");
    const tipoUnidad = searchParams.get("tipoUnidad");
    const habitaciones = searchParams.get("habs");

    // Try real DB first
    try {
      const { supabase } = await import("@/lib/db");
      const userId = session.user.id;

      const { data: user } = await supabase
        .from("Usuario")
        .select("conjuntoId")
        .eq("id", userId)
        .single();

      if (user?.conjuntoId) {
        let query = supabase
          .from("Inmueble")
          .select("*, usuario:Usuario(nombre, avatar, telefono)")
          .eq("conjuntoId", user.conjuntoId)
          .eq("estado", "DISPONIBLE")
          .order("creadoEn", { ascending: false });

        if (tipo) query = query.eq("tipoNegocio", tipo);
        if (tipoUnidad) query = query.eq("tipoUnidad", tipoUnidad);
        if (habitaciones) query = query.eq("habitaciones", parseInt(habitaciones));

        const { data } = await query;
        if (data && data.length > 0) {
          return NextResponse.json({ success: true, data, source: "db" });
        }
      }
    } catch (err) {
      console.warn("⚠️ [INMUEBLES]: DB unavailable, using mock.", err instanceof Error ? err.message : err);
    }

    // Mock fallback with filtering
    let result = [...MOCK_INMUEBLES];
    if (tipo) result = result.filter(i => i.tipoNegocio === tipo);
    if (tipoUnidad) result = result.filter(i => i.tipoUnidad === tipoUnidad);
    if (habitaciones) result = result.filter(i => i.habitaciones === parseInt(habitaciones));

    return NextResponse.json({ success: true, data: result, source: "mock" });

  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("❌ [INMUEBLES-FATAL]:", err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const userId = session.user.id;
    const { titulo, descripcion, precio, tipoNegocio, tipoUnidad, habitaciones, banos, area, imagenes } = body;

    const { supabase } = await import("@/lib/db");

    const { data: user } = await supabase
      .from("Usuario")
      .select("conjuntoId")
      .eq("id", userId)
      .single();

    if (!user?.conjuntoId) {
      return NextResponse.json({ success: false, error: "Conjunto no encontrado" }, { status: 404 });
    }

    const id = `prop_${Math.random().toString(36).substring(7)}`;
    const { data, error } = await supabase.from("Inmueble").insert({
      id,
      conjuntoId: user.conjuntoId,
      usuarioId: userId,
      titulo,
      descripcion,
      precio: parseFloat(precio),
      tipoNegocio,
      tipoUnidad,
      habitaciones: parseInt(habitaciones),
      banos: parseInt(banos),
      area: parseFloat(area || 0),
      imagenes: JSON.stringify(imagenes || []),
      estado: "DISPONIBLE",
      destacado: false,
    }).select().single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data });

  } catch (error: unknown) {
    const err = error as { message?: string };
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
