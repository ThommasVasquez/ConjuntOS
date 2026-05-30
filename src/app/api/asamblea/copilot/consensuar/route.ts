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
    
    const recentOpinionsText = opiniones && opiniones.length > 0
      ? opiniones.map((o: any) => `- [${o.apto || "Residente"} - ${o.nombre}]: "${o.contenido}"`).join("\n")
      : "No hay opiniones o comentarios registrados todavía.";

    const transcripcionVozText = transcripcion 
      ? `Discurso o habla del orador activo: "${transcripcion}"`
      : "No hay transcripción de voz reciente.";

    let proposal = {
      titulo: "",
      descripcion: "",
      opciones: ["SI", "NO", "ABSTENCION"]
    };

    if (apiKey) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: "gemini-2.5-flash",
          generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `
Eres un Copiloto Experto en Mediación y Convivencia en Propiedad Horizontal.
Tu tarea es analizar las opiniones expresadas en el chat y el discurso hablado por los residentes para redactar una propuesta de votación formal e imparcial que intente conciliar las posturas del debate en curso.

INFORMACIÓN CONTRACTUAL DE LICITACIONES Y COTIZACIONES DEL CONJUNTO (Base de conocimientos):
1. Licitación de Mantenimiento de Piscinas:
   - Aquaservicios S.A.S.: $4,800,000 COP/mes (incluye químicos y salvavidas los fines de semana).
   - Piscilimpio del Norte: $5,200,000 COP/mes (químicos incluidos, salvavidas permanente 12 horas/día).
   - Pool-Master Ltda: $4,500,000 COP/mes (salvavidas solo domingos, químicos facturados por separado).
2. Mantenimiento de Ascensores:
   - Otis Elevadores: $1,200,000 COP/mes preventivo integral.
   - Schindler Colombia: $1,050,000 COP/mes (básico, repuestos no incluidos).
   - Kone Elevadores: $1,350,000 COP/mes (mantenimiento preventivo y correctivo con repuestos cubiertos).
3. Licitación de Seguridad y Vigilancia:
   - Vigilancia Atlas: $16,500,000 COP/mes por 2 puestos de 24 horas.
   - Seguridad Coopsentinel: $15,800,000 COP/mes.
4. Proyecto de Presupuesto 2026:
   - Incremento ordinario: 8.5% (pasa de $320,000 COP a $347,200 COP).
   - Cuota extraordinaria única: $150,000 COP por apartamento.

Punto del orden del día activo:
- Título: "${agendaItem.titulo}"
- Descripción: "${agendaItem.descripcion || 'Sin descripción'}"

Opiniones y comentarios de los residentes en tiempo real:
${recentOpinionsText}

${transcripcionVozText}

Genera una respuesta en formato JSON con la siguiente estructura:
{
  "titulo": "Título formal y conciso para la propuesta de votación (máximo 60 caracteres)",
  "descripcion": "Descripción detallada de la propuesta que refleja los términos de consenso o acuerdo y atiende a las preocupaciones de los copropietarios (máximo 250 caracteres)",
  "opciones": ["SI", "NO", "ABSTENCION"] (pueden ser modificadas si el debate sugiere elegir entre proveedores específicos como ["AQUASERVICIOS", "PISCILIMPIO", "POOL-MASTER"])
}

Asegúrate de que la respuesta sea un JSON válido y esté en español.
`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        proposal = JSON.parse(responseText);
      } catch (geminiError) {
        console.warn("Gemini Consensus API failed. Using local fallback:", geminiError);
        proposal = getLocalFallback(agendaItem.titulo, recentOpinionsText, transcripcion);
      }
    } else {
      proposal = getLocalFallback(agendaItem.titulo, recentOpinionsText, transcripcion);
    }

    return NextResponse.json({
      success: true,
      proposal
    });

  } catch (error: any) {
    console.error("Consensus AI Route Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

function getLocalFallback(agendaTitle: string, opinionsText: string, transcription: string) {
  const textToAnalyze = `${agendaTitle} ${opinionsText} ${transcription || ""}`.toLowerCase();

  if (textToAnalyze.includes("piscina")) {
    // Check if residents are leaning towards Aquaservicios or Piscilimpio or Pool-Master
    let desc = "¿Aprueba contratar a Aquaservicios S.A.S. por $4,800,000 COP/mes (químicos y salvavidas de fin de semana) bajo la condición de negociar un 5% de descuento en el primer trimestre?";
    if (textToAnalyze.includes("piscilimpio")) {
      desc = "¿Aprueba contratar a Piscilimpio del Norte por $5,200,000 COP/mes con salvavidas de 12 horas diarias permanentes?";
    }
    return {
      titulo: "Contratación de Servicio de Piscina 2026",
      descripcion: desc,
      opciones: ["SI", "NO", "ABSTENCION"]
    };
  }
  
  if (textToAnalyze.includes("ascensor")) {
    return {
      titulo: "Contratación de Mantenimiento de Ascensores",
      descripcion: "¿Aprueba la contratación de Otis Elevadores bajo modalidad de mantenimiento preventivo integral por un valor mensual de $1,200,000 COP?",
      opciones: ["SI", "NO", "ABSTENCION"]
    };
  }

  if (textToAnalyze.includes("seguridad") || textToAnalyze.includes("vigilancia")) {
    return {
      titulo: "Contratación de Vigilancia y Seguridad Privada",
      descripcion: "¿Aprueba la contratación de Vigilancia Atlas por un valor mensual de $16,500,000 COP para cubrir 2 puestos de vigilancia 24 horas?",
      opciones: ["SI", "NO", "ABSTENCION"]
    };
  }

  if (textToAnalyze.includes("presupuesto") || textToAnalyze.includes("cuota")) {
    // If they suggest a different budget or complain about cost
    let pct = "8.5%";
    if (textToAnalyze.includes("bajar") || textToAnalyze.includes("reducir") || textToAnalyze.includes("alto")) {
      pct = "7.0%";
    }
    return {
      titulo: `Aprobación de Incremento de Cuota Ordinaria en ${pct}`,
      descripcion: `¿Aprueba ajustar el incremento de la cuota ordinaria de administración en un ${pct} mensual para la vigencia del año 2026?`,
      opciones: ["SI", "NO", "ABSTENCION"]
    };
  }

  return {
    titulo: `Votación de Consenso: ${agendaTitle.substring(0, 30)}`,
    descripcion: `Propuesta redactada automáticamente para dirimir la discusión del punto "${agendaTitle}". ¿Aprueba la moción planteada?`,
    opciones: ["SI", "NO", "ABSTENCION"]
  };
}
