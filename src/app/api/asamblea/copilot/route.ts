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
    const { agendaItem, opiniones, transcripcion } = body;

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

    const transcripcionVozText = transcripcion 
      ? `Lo que se ha hablado recientemente en voz alta (Transcripción de voz): "${transcripcion}"`
      : "No hay transcripción de voz reciente.";

    const prompt = `
Eres un Copiloto Experto en Mediación y Convivencia en Propiedad Horizontal.
Tu tarea es guiar al Administrador del conjunto residencial para llevar a cabo una asamblea ordenada, constructiva y eficiente.

INFORMACIÓN CONTRACTUAL DE LICITACIONES Y COTIZACIONES DEL CONJUNTO (Base de conocimientos):
1. Licitación de Mantenimiento de Piscinas (Cambio de administración de piscina):
   - Licitante A: Aquaservicios S.A.S. - Oferta: $4,800,000 COP/mes (incluye químicos completos y salvavidas los fines de semana).
   - Licitante B: Piscilimpio del Norte - Oferta: $5,200,000 COP/mes (químicos incluidos, salvavidas permanente 12 horas/día).
   - Licitante C: Pool-Master Ltda - Oferta: $4,500,000 COP/mes (salvavidas solo domingos, insumos químicos facturados por separado).
2. Licitación de Mantenimiento de Ascensores:
   - Otis Elevadores: $1,200,000 COP/mes por mantenimiento preventivo integral.
   - Schindler Colombia: $1,050,000 COP/mes (cobertura básica, repuestos no incluidos).
   - Kone Elevadores: $1,350,000 COP/mes (mantenimiento preventivo y correctivo con repuestos 100% cubiertos).
3. Licitación de Seguridad y Vigilancia:
   - Vigilancia Atlas: $16,500,000 COP/mes por 2 puestos de 24 horas (personal certificado, armamento no letal).
   - Seguridad Coopsentinel: $15,800,000 COP/mes (cooperativa de vigilancia, puestos 24h).
4. Proyecto de Presupuesto 2026:
   - Incremento propuesto en cuota ordinaria de administración: 8.5% (pasa de $320,000 COP a $347,200 COP mensual).
   - Cuota extraordinaria única para reparación de fachada/muro: $150,000 COP por apartamento.

Punto del orden del día activo:
- Título: "${agendaItem.titulo}"
- Descripción: "${agendaItem.descripcion || 'Sin descripción'}"

Opiniones y comentarios de los residentes en tiempo real:
${recentOpinionsText}

${transcripcionVozText}

Genera una respuesta en formato JSON con la siguiente estructura:
{
  "guiaTeleprompter": "Un guión en primera persona para que el administrador lo lea o lo use de guía en voz alta. Debe ser empático, claro, firme y enfocado en avanzar de forma constructiva. Máximo 4-5 párrafos breves.",
  "sugerencias": [
    "Sugerencia 1 (Si la transcripción o el punto del día menciona piscinas, ascensores, seguridad o presupuesto, debes incluir explícitamente la comparación de licitantes, ofertas de contrato y precios aquí, por ejemplo: 'Licitantes Piscina: Aquaservicios ($4.8M/mes), Piscilimpio ($5.2M/mes)')",
    "Sugerencia 2 (Camino a seguir recomendado o consejo para responder a las inquietudes)",
    "Sugerencia 3 (Idea para conciliar o proponer votación sobre el tema)"
  ],
  "resumenSentimiento": "Un resumen ejecutivo brevísimo (2-3 frases) que analice el tono de las opiniones de los residentes y destaque los puntos de mayor acuerdo o conflicto.",
  "alertaModeracion": null | {
    "type": "REPETICION" | "DIVAGACION",
    "mensaje": "Explicación breve en español sobre qué regla infringió el orador en su habla actual (transcripcion).",
    "sugerenciaAccion": "Acción recomendada en español para el administrador (ej: 'Sugiera pasar a votación' o 'Sugiera registrar el tema en proposiciones y varios')"
  }
}

REGLAS DE MODERACIÓN DE LA REUNIÓN (CRÍTICO):
1. **REPETICIÓN**: Compara lo que el orador expresa en "transcripcion" con el historial de "opiniones". Si el orador está insistiendo en argumentos o quejas similares que ya fueron expuestos anteriormente, marca "alertaModeracion" con el tipo "REPETICION".
2. **DIVAGACIÓN**: Compara "transcripcion" con el punto activo de la agenda ("agendaItem"). Si el orador habla de un tema que no tiene relación directa con el punto en discusión (ej: si discuten piscinas y el orador habla de mascotas o del parqueadero), marca "alertaModeracion" con el tipo "DIVAGACION".
3. **CASO CORRECTO**: Si el orador habla al grano, de manera relevante al tema actual y sin repetir argumentos previos, "alertaModeracion" debe ser estrictamente null.

INSTRUCCIONES CRITICALES DE DATOS:
- Si se menciona "piscina" o "piscinas" en el punto o en la transcripción, es OBLIGATORIO que en la sugerencia 1 detalles las 3 ofertas de piscinas y sus precios.
- Si se menciona "ascensor" o "ascensores", es OBLIGATORIO detallar las 3 cotizaciones de ascensores y sus precios.
- Si se menciona "seguridad" o "vigilancia", detalla los licitantes de vigilancia y precios.
- Si se menciona "presupuesto" o "cuota", detalla el aumento propuesto (8.5%) y/o la cuota extraordinaria ($150,000 COP).
- Asegúrate de que la respuesta sea un JSON válido y esté en español.
`;

    let parsedJson;
    try {
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      parsedJson = JSON.parse(responseText);
    } catch (geminiError) {
      console.warn("Gemini Copilot API failed or rate-limited. Using local fallback:", geminiError);
      
      const textToAnalyze = `${agendaItem.titulo} ${agendaItem.descripcion || ''} ${recentOpinionsText} ${transcripcion || ''}`.toLowerCase();
      
      let localSugerencias = [
        "Reitere que las opiniones y sugerencias de todos los vecinos son tomadas en cuenta.",
        "Sugiera crear una comisión técnica si el debate requiere análisis de costos detallados.",
        "Proponga abrir una votación formal para definir el rumbo del tema."
      ];
      
      let localGuia = `Continuamos con la discusión del punto: "${agendaItem.titulo}". Estimados copropietarios, les recuerdo que disponemos de un tiempo limitado para este debate. Les solicito mantener la cordialidad y ser concisos en sus intervenciones para avanzar de manera constructiva.`;
      
      let localResumen = "Debate activo con posturas diversas. Se recomienda moderar los tiempos de palabra.";

      if (textToAnalyze.includes("piscina")) {
        localSugerencias = [
          "Licitantes Piscina: Aquaservicios ($4.8M/mes con químicos), Piscilimpio ($5.2M/mes con salvavidas 12h), Pool-Master ($4.5M/mes sin químicos).",
          "Se aconseja descartar Pool-Master ya que facturar insumos químicos por separado suele incrementar el costo real final en un 25%.",
          "Se recomienda proponer una votación entre la Opción A (más económica) y la Opción B (salvavidas permanente)."
        ];
        localGuia = "Estimados copropietarios, respecto a la administración de las piscinas, contamos con tres ofertas: Aquaservicios por $4.8M mensuales químicos incluidos, Piscilimpio por $5.2M con salvavidas permanente, y Pool-Master por $4.5M más químicos. Les sugiero que votemos entre las dos primeras opciones para asegurar el suministro de químicos estable.";
        localResumen = "Gran interés en el mantenimiento de piscinas. La principal preocupación es la seguridad de los niños y el costo final de los insumos químicos.";
      } else if (textToAnalyze.includes("ascensor")) {
        localSugerencias = [
          "Mantenimiento de Ascensores: Otis Elevadores ($1.2M/mes integral), Schindler ($1.05M/mes básico, sin repuestos), Kone ($1.35M/mes 100% cubierto).",
          "Recomiende la opción de Kone o Otis debido a que Schindler no incluye repuestos y el conjunto tiene equipos de más de 8 años.",
          "Proponga abrir una votación para decidir si se prefiere cobertura básica o integral."
        ];
        localGuia = "Copropietarios, para los ascensores tenemos las cotizaciones de Otis por $1.2M preventivo integral, Schindler por $1.05M básico, y Kone por $1.35M con repuestos incluidos. Dado que nuestros ascensores tienen cierta antigüedad, sugiero considerar la cobertura integral para evitar sobrecostos.";
        localResumen = "Preocupación generalizada por la seguridad de los ascensores y las fallas recurrentes en horas pico.";
      } else if (textToAnalyze.includes("seguridad") || textToAnalyze.includes("vigilancia")) {
        localSugerencias = [
          "Vigilancia 2026: Atlas Ltda ($16.5M/mes, 2 puestos 24h, personal certificado), Coopsentinel ($15.8M/mes, cooperativa).",
          "Sugiera verificar las pólizas de responsabilidad civil y certificaciones de la Superintendencia antes de elegir.",
          "Proponga una mesa de seguridad trimestral para evaluar el desempeño de la empresa elegida."
        ];
        localGuia = "Pasamos a la contratación de seguridad. Tenemos las ofertas de Atlas por $16.5M mensuales y Coopsentinel por $15.8M. Ambas cumplen los requisitos de ley. Abramos el debate para conocer sus opiniones sobre la continuidad del personal actual.";
        localResumen = "Los residentes solicitan mayor control en el parqueadero y cámaras adicionales en el perímetro del conjunto.";
      } else if (textToAnalyze.includes("presupuesto") || textToAnalyze.includes("cuota")) {
        localSugerencias = [
          "Presupuesto 2026: Incremento ordinario del 8.5% (Nueva cuota: $347,200 COP). Cuota extraordinaria propuesta: $150,000 COP única.",
          "Explique que el incremento del 8.5% está ajustado al IPC proyectado más 2 puntos para el mantenimiento de zonas comunes.",
          "Someter a votación de manera separada: 1) Aprobación del incremento de administración, 2) Aprobación de la cuota extraordinaria para el muro."
        ];
        localGuia = "Estimados vecinos, el presupuesto para este año contempla un incremento ordinario del 8.5% para cubrir el incremento del salario mínimo del personal de aseo y vigilancia. Adicionalmente, proponemos una cuota única de $150 mil pesos para reparar el muro de la fachada. Abramos las votaciones individuales.";
        localResumen = "Consenso favorable respecto a la administración ordinaria, pero resistencia inicial por la cuota extraordinaria del muro.";
      }

      // Local fallback analyzer for moderation alerts
      let localAlerta = null;
      if (transcripcion) {
        const transLower = transcripcion.toLowerCase();
        const agendaTitleLower = agendaItem.titulo.toLowerCase();
        
        // Repetition detection (e.g. key words like "insisto", "ya lo he dicho", "repito")
        if (transLower.includes("insisto") || transLower.includes("ya lo he dicho") || transLower.includes("repito") || transLower.includes("muy caro") || transLower.includes("muy costosa")) {
          localAlerta = {
            type: "REPETICION",
            mensaje: "El orador está repitiendo que el costo del contrato es demasiado elevado.",
            sugerenciaAccion: "Sugiera cerrar el debate de manera formal y proceder directamente a la votación."
          };
        } 
        // Divagation detection (e.g. talking about parkings or pets during swimming pool debate)
        else if (transLower.includes("perro") || transLower.includes("mascota") || transLower.includes("parqueadero") || transLower.includes("estacionamiento")) {
          if (agendaTitleLower.includes("piscina") || agendaTitleLower.includes("ascensor") || agendaTitleLower.includes("presupuesto")) {
            localAlerta = {
              type: "DIVAGACION",
              mensaje: "El orador se desvió del tema activo para hablar de mascotas o parqueaderos.",
              sugerenciaAccion: "Indíquele que ese tema corresponde al punto 6 de Proposiciones y Varios."
            };
          }
        }
      }

      parsedJson = {
        guiaTeleprompter: localGuia,
        sugerencias: localSugerencias,
        resumenSentimiento: localResumen,
        alertaModeracion: localAlerta
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
