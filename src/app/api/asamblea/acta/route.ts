import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";
import { getOrCreateActiveAsamblea, parseAsambleaState, saveAsambleaState } from "@/lib/asamblea";
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

export async function GET(req: NextRequest) {
  injectDbEnv();

  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const junta = await getOrCreateActiveAsamblea();
    
    return NextResponse.json({
      success: true,
      titulo: junta.titulo,
      actaContent: junta.transcripcion || null,
      actaUrl: junta.actaUrl || null
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY no configurada" }, { status: 500 });
    }

    const junta = await getOrCreateActiveAsamblea();
    const state = parseAsambleaState(junta);

    // 1. Gather Quorum Metrics
    const totalUnits = state.asistencias.length;
    // Calculate total coefficients
    const units = await db.unidad.findMany({
      where: { conjuntoId: junta.conjuntoId }
    });
    const users = await db.usuario.findMany({
      where: { conjuntoId: junta.conjuntoId }
    });

    let presentCoefficient = 0;
    const presentUnitIds = new Set<string>();
    state.asistencias.forEach((asist: any) => {
      const user = users.find((u: any) => u.id === asist.usuarioId);
      if (user && user.unidadId) presentUnitIds.add(user.unidadId);

      const representedPowers = state.poderes.filter(
        (p: any) => p.apoderadoId === asist.usuarioId && p.verificado
      );
      representedPowers.forEach((pow: any) => {
        const otorgante = users.find((u: any) => u.id === pow.otorganteId);
        if (otorgante && otorgante.unidadId) presentUnitIds.add(otorgante.unidadId);
      });
    });

    presentUnitIds.forEach((uid: string) => {
      const unit = units.find((u: any) => u.id === uid);
      if (unit) presentCoefficient += parseFloat(unit.coeficiente) || 0;
    });

    // 2. Gather Votation Results
    const votacionesText = state.votaciones.map(v => {
      const votesSummary = v.opciones.map(op => {
        const matchingVotes = v.votos.filter(x => x.respuesta === op);
        const sumCoef = matchingVotes.reduce((acc, curr) => acc + curr.coeficiente, 0);
        return `- Opción "${op}": ${matchingVotes.length} votos (${(sumCoef * 100).toFixed(2)}% coeficiente)`;
      }).join("\n");
      return `Propuesta: "${v.titulo}"\n${votesSummary}`;
    }).join("\n\n");

    // 3. Gather Opinions Summary
    const opinionsText = state.opiniones.map(o => `[${o.apto || "Residente"} - ${o.nombre}]: "${o.contenido}"`).join("\n");

    // 4. Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
Eres un Secretario Jurídico Experto en Propiedad Horizontal. Tu labor es redactar el Acta Oficial de la Asamblea General Ordinaria de Copropietarios.
El documento debe tener validez legal, lenguaje formal, redacción impecable y estar estructurado en Markdown.

Detalles de la reunión:
- Asamblea: "${junta.titulo}"
- Conjunto Residencial ID: "${junta.conjuntoId}"
- Fecha: ${new Date(junta.fecha).toLocaleDateString()}
- Quórum verificado: ${state.asistencias.length} copropietarios presentes, sumando un coeficiente de ${(presentCoefficient * 100).toFixed(2)}% del total.
- Puntos del Orden del Día:
${state.ordenDia.map(i => `- ${i.titulo} (${i.estado})`).join("\n")}

Resultados de las Votaciones:
${votacionesText || "No se realizaron votaciones formalizadas en esta sesión."}

Resumen del Debate (Opiniones de los Residentes):
${opinionsText || "No se registraron comentarios de debate."}

Escribe el Acta Completa. Incluye las siguientes secciones numeradas de forma clara:
1. ENCABEZADO (Nombre del conjunto, fecha, hora de apertura, tipo de asamblea).
2. VERIFICACIÓN DE ASISTENCIA Y QUÓRUM (Registra el coeficiente total presente y si hay quórum de ley).
3. ELECCIÓN DE PRESIDENTE Y SECRETARIO (Menciona que se eligieron conforme al reglamento).
4. LECTURA Y DESARROLLO DEL ORDEN DEL DÍA (Detalla los puntos tratados y aprobados).
5. VOTACIONES Y DECISIONES ADOPTADAS (Ingresa los porcentajes detallados de los votos y si fueron aprobados o denegados).
6. PROPOSICIONES Y VARIOS (Resume brevemente las inquietudes o quejas del debate).
7. CIERRE Y FIRMAS (Hora de finalización y espacio para la firma del Presidente y Secretario).

Asegúrate de que toda la información provista esté fielmente registrada en el acta. Responde ÚNICAMENTE con el texto en Markdown estructurado, sin bloques de código con marcas triples ni introducciones superfluas.
`;

    let generatedMarkdown = "";
    try {
      const result = await model.generateContent(prompt);
      generatedMarkdown = result.response.text().trim();
    } catch (geminiError) {
      console.warn("Gemini Acta API failed or rate-limited. Using local fallback:", geminiError);
      
      const agendaList = state.ordenDia.map((i: any) => `- **${i.titulo}**: Estado: ${i.estado}`).join("\n");
      const votesFallback = votacionesText || "No se registraron votaciones formalizadas en esta sesión.";
      const opinionsFallback = opinionsText || "No se registraron comentarios de debate.";

      generatedMarkdown = `# ACTA OFICIAL DE LA ASAMBLEA GENERAL DE COPROPIETARIOS
**CONJUNTO RESIDENCIAL CONJUNTOS**

---

### 1. DATOS GENERALES
* **Tipo de Asamblea:** General Ordinaria (Virtual)
* **Fecha:** ${new Date(junta.fecha).toLocaleDateString()}
* **Plataforma:** Portal de Decisiones Distribuidas ConjuntOS

### 2. VERIFICACIÓN DE ASISTENCIA Y QUÓRUM
Se constató la asistencia de **${state.asistencias.length} copropietarios**, quienes representan un coeficiente total de copropiedad de **${(presentCoefficient * 100).toFixed(2)}%**. 
Conforme a la reglamentación legal vigente de propiedad horizontal, se declara que **${presentCoefficient >= 0.51 ? "CONSTITUYE" : "NO CONSTITUYE"}** quórum deliberatorio y decisorio reglamentario (Mínimo 51%).

### 3. DESARROLLO DEL ORDEN DEL DÍA
El orden del día se aprobó y evacuó en el siguiente orden:
${agendaList}

### 4. DECISIONES Y VOTACIONES REGISTRADAS
A continuación se detallan los resultados ponderados por coeficiente de cada una de las propuestas sometidas a escrutinio:

${votesFallback}

### 5. RESUMEN DEL DEBATE (INTERVENCIONES)
Se registraron los siguientes aportes y comentarios en el libro de actas digital:
${opinionsFallback}

---

### 6. CLAUSURA Y FIRMAS
Habiéndose desarrollado los puntos del orden del día y no habiendo más proposiciones, el moderador de la reunión levanta la sesión.

**Thommy Admin**
*Administrador y Secretario de la Asamblea*

**Dra. Carmen Cecilia**
*Presidenta del Consejo y Moderadora*
`;
    }

    // Save in DB under transcripcion (which holds minutes content) and mock a signed PDF URL
    await db.junta.update({
      where: { id: junta.id },
      data: {
        transcripcion: generatedMarkdown,
        actaUrl: `/api/asamblea/acta/download?id=${junta.id}` // mock signed endpoint
      }
    });

    return NextResponse.json({
      success: true,
      actaContent: generatedMarkdown,
      actaUrl: `/api/asamblea/acta/download?id=${junta.id}`
    });

  } catch (error: any) {
    console.error("POST Acta Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
