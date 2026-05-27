import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { GoogleGenerativeAI } from "@google/generative-ai";
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

export async function POST(req: NextRequest) {
  injectDbEnv();

  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const userRole = (session.user as { role?: string })?.role;
    if (userRole !== "ADMINISTRADOR" && userRole !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Privilegios insuficientes" }, { status: 403 });
    }

    const body = await req.json();
    const { agendaItem, opiniones } = body;

    if (!agendaItem) {
      return NextResponse.json({ error: "Falta el punto del orden del día" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY no configurada en el servidor" }, { status: 500 });
    }

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

    const recentOpinionsText = opiniones && opiniones.length > 0
      ? opiniones.map((o: any) => `- [${o.apto || "Residente"} - ${o.nombre}]: "${o.contenido}"`).join("\n")
      : "No hay opiniones o comentarios registrados todavía para este punto.";

    const prompt = `
Eres un Copiloto Experto en Mediación y Convivencia en Propiedad Horizontal.
Tu tarea es guiar al Administrador del conjunto residencial para llevar a cabo una asamblea ordenada, constructiva y eficiente.

Punto del orden del día activo:
- Título: "${agendaItem.titulo}"
- Descripción: "${agendaItem.descripcion || 'Sin descripción'}"

Opiniones y comentarios de los residentes en tiempo real:
${recentOpinionsText}

Genera una respuesta en formato JSON con la siguiente estructura:
{
  "guiaTeleprompter": "Un guión en primera persona para que el administrador lo lea o lo use de guía en voz alta. Debe ser empático, claro, firme y enfocado en avanzar de forma constructiva. Máximo 4-5 párrafos breves.",
  "sugerencias": [
    "Sugerencia 1 basada en las preocupaciones o el tema (talking point)",
    "Sugerencia 2 (ej. cómo responder de forma conciliadora a las opiniones o quejas)",
    "Sugerencia 3 (idea para conciliar o proponer votación sobre el tema)"
  ],
  "resumenSentimiento": "Un resumen ejecutivo brevísimo (2-3 frases) que analice el tono de las opiniones de los residentes y destaque los puntos de mayor acuerdo o conflicto."
}

Asegúrate de que la respuesta sea un JSON válido y esté en español.
`;

    let parsedJson;
    try {
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      parsedJson = JSON.parse(responseText);
    } catch (geminiError) {
      console.warn("Gemini Copilot API failed or rate-limited. Using local fallback:", geminiError);
      parsedJson = {
        guiaTeleprompter: `Continuamos con la discusión del punto: "${agendaItem.titulo}". Estimados copropietarios, les recuerdo que disponemos de un tiempo limitado para este debate. Les solicito mantener la cordialidad y ser concisos en sus intervenciones para avanzar de manera constructiva.`,
        sugerencias: [
          "Reitere que las opiniones y sugerencias de todos los vecinos son tomadas en cuenta.",
          "Sugiera crear una comisión técnica si el debate requiere análisis de costos detallados.",
          "Proponga abrir una votación formal para definir el rumbo del tema."
        ],
        resumenSentimiento: "Debate activo con posturas diversas. Se recomienda moderar los tiempos de palabra."
      };
    }

    return NextResponse.json({
      success: true,
      copilotData: parsedJson
    });

  } catch (error: any) {
    console.error("Copilot AI Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
