import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface SearchContext {
  userName?: string;
  totalDebt?: number;
  pagos?: { concepto: string; monto: number; estado: string }[];
  paquetes?: { remitente?: string; estado?: string }[];
  reservas?: { area?: string; fechaInicio?: string }[];
  anuncios?: { titulo: string; contenido: string; categoria?: string }[];
}

interface SearchBody {
  query: string;
  context?: SearchContext;
}

const SYSTEM_PROMPT = `Eres el asistente de ConjuntOS, una plataforma de gestión residencial para conjuntos cerrados en Colombia. 
Tu nombre es "Asistente ConjuntOS" y tu misión es ayudar a los residentes con información sobre su hogar.

MÓDULOS DISPONIBLES EN LA PLATAFORMA:
- Pagos: Cuotas de administración, sanciones, recibos públicos (agua, gas, energía)
- Reservas: Salón Social, Cancha de Tenis, Gimnasio, BBQ, Piscina
- Parqueadero: Estado y asignación de cupos de parqueo
- Paquetería: Paquetes y correspondencia en portería
- PQRS: Peticiones, Quejas, Reclamos y Sugerencias
- Visitas: Registro de visitantes y autorizaciones de ingreso
- Citofonía: Comunicación con la portería
- Cartelera: Anuncios y novedades del conjunto
- Inmobiliaria: Apartamentos en venta o arriendo en el conjunto

REGLAS IMPORTANTES:
1. Responde SIEMPRE en español, de forma amable y concisa (máximo 3 oraciones)
2. Si tienes datos del contexto del usuario, úsalos para personalizar la respuesta
3. Si necesitas dirigir al usuario a un módulo, di exactamente qué módulo usar
4. Si no sabes algo específico, indica cómo el usuario puede encontrarlo
5. Usa emojis con moderación para hacer las respuestas más amigables
6. Nunca inventes datos concretos (montos, fechas) que no estén en el contexto`;

function buildUserPrompt(query: string, context: SearchContext): string {
  const parts: string[] = [`El residente pregunta: "${query}"\n`];
  
  if (context.userName) parts.push(`Nombre del residente: ${context.userName}`);
  if (context.totalDebt !== undefined) {
    parts.push(`Deuda actual: $${context.totalDebt.toLocaleString("es-CO")} COP`);
  }
  if (context.pagos?.length) {
    const pending = context.pagos.filter(p => p.estado === "PENDIENTE");
    if (pending.length > 0) {
      parts.push(`Pagos pendientes: ${pending.map(p => `${p.concepto} ($${p.monto.toLocaleString()})`).join(", ")}`);
    }
  }
  if (context.paquetes?.length) {
    parts.push(`Paquetes en portería: ${context.paquetes.length}`);
  }
  if (context.reservas?.length) {
    parts.push(`Próximas reservas: ${context.reservas.map(r => r.area || "área").join(", ")}`);
  }
  if (context.anuncios?.length) {
    const recent = context.anuncios.slice(0, 3);
    parts.push(`Anuncios recientes:\n${recent.map(a => `- ${a.titulo}: ${a.contenido.substring(0, 80)}...`).join("\n")}`);
  }

  return parts.join("\n");
}

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("NO_KEY");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 256,
          topK: 40,
          topP: 0.95
        }
      })
    }
  );

  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "No pude generar una respuesta.";
}

function getMockResponse(query: string, context: SearchContext): string {
  const q = query.toLowerCase();
  
  if (q.includes("pag") || q.includes("debo") || q.includes("cuota") || q.includes("administrac")) {
    if (context.totalDebt && context.totalDebt > 0) {
      return `Hola ${context.userName || "residente"} 👋 Tienes una deuda pendiente de **$${context.totalDebt.toLocaleString("es-CO")} COP**. Puedes ver el detalle y pagar desde el módulo de **Pagos**.`;
    }
    return `¡Perfecto, estás al día! 🎉 Puedes consultar tus recibos en el módulo de **Pagos** para ver el historial completo.`;
  }
  if (q.includes("paquete") || q.includes("encomienda") || q.includes("portería") || q.includes("llegó")) {
    const count = context.paquetes?.length || 0;
    return count > 0
      ? `Tienes **${count} paquete(s) esperándote** en portería 📦. Ve al módulo de **Paquetería** para ver los detalles y coordinar la entrega.`
      : `No tenemos paquetes registrados en portería ahora mismo. La portería te notificará cuando llegue algo 📬.`;
  }
  if (q.includes("reserva") || q.includes("salón") || q.includes("salon") || q.includes("cancha") || q.includes("gimnasio") || q.includes("piscina")) {
    return `Puedes reservar las áreas comunes (Salón Social, Cancha, Gimnasio, BBQ) desde el módulo de **Reservas**. La disponibilidad se actualiza en tiempo real 📅.`;
  }
  if (q.includes("visita") || q.includes("invitado") || q.includes("ingreso") || q.includes("autoriza")) {
    return `Para autorizar el ingreso de visitas al conjunto, usa el módulo de **Visitantes**. Puedes registrar la placa del vehículo y datos del invitado 🚗.`;
  }
  if (q.includes("parqueo") || q.includes("parqueadero") || q.includes("carro") || q.includes("moto")) {
    return `El estado de tu parqueadero y los registros de ingreso/salida están en el módulo de **Parqueadero** 🅿️.`;
  }
  if (q.includes("queja") || q.includes("petición") || q.includes("problema") || q.includes("pqr")) {
    return `Para reportar un problema o hacer una solicitud a administración, usa el módulo de **PQRS**. Tu solicitud quedará registrada y monitoreada 📋.`;
  }
  if (q.includes("asamblea") || q.includes("reunión") || q.includes("reunion") || q.includes("junta")) {
    const anuncio = context.anuncios?.find(a => a.titulo.toLowerCase().includes("asamblea") || a.contenido.toLowerCase().includes("asamblea"));
    if (anuncio) {
      return `📢 Hay una asamblea programada: **${anuncio.titulo}**. ${anuncio.contenido.substring(0, 100)}... Revisa la **Cartelera** para más detalles.`;
    }
    return `Puedes consultar las próximas asambleas y circulares en la **Cartelera** del conjunto 📋.`;
  }
  if (q.includes("vender") || q.includes("arrendar") || q.includes("alquiler") || q.includes("inmueble")) {
    return `¿Quieres publicar tu apartamento? En el módulo de **Inmobiliaria** puedes poner en venta o arriendo tu unidad y llegar a todos los residentes 🏠.`;
  }
  
  return `Hola ${context.userName || "residente"} 👋 Puedo ayudarte con información sobre tus **pagos, reservas, paquetería, visitas, parqueadero y más**. ¡Escríbeme tu pregunta específica!`;
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const body: SearchBody = await req.json();
    const { query, context = {} } = body;

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ success: false, error: "Query muy corto" }, { status: 400 });
    }

    // Intentar con Gemini primero, caer en mock si no hay key o falla
    let answer: string;
    let source: "gemini" | "mock" = "gemini";

    try {
      const userPrompt = buildUserPrompt(query, context);
      answer = await callGemini(userPrompt);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("⚠️ [SEARCH-API]: Gemini no disponible, usando mock.", msg);
      answer = getMockResponse(query, context);
      source = "mock";
    }

    return NextResponse.json({
      success: true,
      data: {
        answer,
        source,
        query
      }
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.error("❌ [SEARCH-API]:", msg);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
