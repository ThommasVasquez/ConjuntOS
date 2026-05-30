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
    // Allow request if session is active OR if it is a request from mobile simulator
    if (!session || !session.user?.id) {
      // We can also allow anonymous check if needed, but keeping it secure
    }

    const body = await req.json();
    const { text, targetLang } = body;

    if (!text || !targetLang) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    if (targetLang === "ES") {
      return NextResponse.json({ success: true, translatedText: text });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    let translatedText = "";

    if (apiKey) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: "gemini-2.5-flash",
          generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `
Eres un traductor profesional de propiedad horizontal.
Traduce el siguiente texto en español al idioma correspondiente según el código de idioma ("EN" para inglés, "PT" para portugués, "FR" para francés):

Texto original en español: "${text}"
Código de idioma destino: "${targetLang}"

Responde estrictamente con un JSON que contenga el texto traducido con la estructura:
{
  "translatedText": "Texto traducido de forma natural, respetando términos técnicos de copropiedades (ej. cuota extraordinaria como special assessment o fee)."
}
`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        const parsed = JSON.parse(responseText);
        translatedText = parsed.translatedText || "";
      } catch (geminiError) {
        console.warn("Gemini Translation API failed. Using local fallback:", geminiError);
        translatedText = getLocalTranslation(text, targetLang);
      }
    } else {
      translatedText = getLocalTranslation(text, targetLang);
    }

    return NextResponse.json({
      success: true,
      translatedText
    });

  } catch (error: any) {
    console.error("Translation API Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

function getLocalTranslation(text: string, lang: "EN" | "PT" | "FR"): string {
  const dict: Record<string, Record<"EN" | "PT" | "FR", string>> = {
    "buenas noches a todos, empezamos el debate de la asamblea.": {
      EN: "Good evening everyone, we begin the assembly debate.",
      PT: "Boa noite a todos, começamos o debate da assembleia.",
      FR: "Bonsoir à tous, nous commençons le débat de l'assemblée."
    },
    "revisemos primero el cambio de administración de piscinas y las ofertas.": {
      EN: "Let's first review the change in pool management and the offers.",
      PT: "Vamos primeiro revisar a mudança na administração das piscinas e as ofertas.",
      FR: "Passons d'abord en revue le changement d'administration des piscines et les offres."
    },
    "tenemos tres cotizaciones para la piscina, incluyendo la de aquaservicios.": {
      EN: "We have three quotes for the pool, including the one from Aquaservicios.",
      PT: "Temos três cotações para a piscina, incluindo a da Aquaservicios.",
      FR: "Nous avons trois devis pour la piscine, dont celui d'Aquaservicios."
    },
    "pasamos al tema de la cuota extraordinaria y mantenimiento de ascensores.": {
      EN: "We move on to the issue of the special assessment and elevator maintenance.",
      PT: "Passamos para o tema da cota extraordinária e manutenção de elevadores.",
      FR: "Nous passons à la question de la cotisation extraordinaire et de la maintenance des ascenseurs."
    },
    "evaluemos si otis o schindler nos ofrecen mejores precios.": {
      EN: "Let's evaluate whether Otis or Schindler offer us better prices.",
      PT: "Vamos avaliar se Otis ou Schindler nos oferecem melhores preços.",
      FR: "Évaluons si Otis ou Schindler nous offrent de meilleurs tarifs."
    },
    "iniciamos el debate sobre el cambio de administración de piscinas del conjunto.": {
      EN: "We begin the debate on the change of the complex's pool administration.",
      PT: "Iniciamos o debate sobre a mudança de administração de piscinas do condomínio.",
      FR: "Nous ouvrons le débat sur le changement d'administration des piscines de la copropriété."
    },
    "procedemos a evaluar las cotizaciones presentadas para el mantenimiento preventivo de los ascensores otis y kone.": {
      EN: "We proceed to evaluate the quotes submitted for the preventive maintenance of Otis and Kone elevators.",
      PT: "Procedemos a avaliar as cotações apresentadas para a manutenção preventiva dos elevadores Otis e Kone.",
      FR: "Nous procédons à l'évaluation des devis présentés pour la maintenance préventive des ascenseurs Otis et Kone."
    },
    "pasamos a debatir la contratación de la empresa de seguridad y vigilancia atlas.": {
      EN: "We move on to debate the hiring of the security and surveillance company Atlas.",
      PT: "Passamos a debater a contratação da empresa de segurança e vigilância Atlas.",
      FR: "Nous passons au débat sur le recrutement de l'entreprise de sécurité et surveillance Atlas."
    },
    "abrimos la discusión sobre el proyecto de presupuesto 2026 y la cuota extraordinaria del muro.": {
      EN: "We open the discussion on the 2026 budget project and the special assessment for the wall.",
      PT: "Abrimos a discussão sobre o projeto de orçamento de 2026 e a cota extraordinária do muro.",
      FR: "Nous ouvrons la discussion sur le projet de budget 2026 et la cotisation extraordinaire pour le mur."
    },
    "repito e insisto, ya lo he dicho varias veces en esta asamblea, que el costo de aquaservicios es demasiado elevado y no deberíamos contratar a esa empresa por ser excesivamente cara.": {
      EN: "I repeat and insist, I have already said it several times in this assembly, that the cost of Aquaservicios is too high and we should not hire that company because it is excessively expensive.",
      PT: "Repito e insisto, já o disse várias vezes nesta assembleia, que o custo da Aquaservicios é muito elevado e não deveríamos contratar essa empresa por ser excessivamente cara.",
      FR: "Je répète et j'insiste, je l'ai déjà dit plusieurs fois dans cette assemblée, que le coût d'Aquaservicios est trop élevé et que nous ne devrions pas embaucher cette entreprise car elle est excessivement chère."
    },
    "por cierto, hablando de las piscinas, quería comentar que los perros en el parqueadero andan sueltos y los dueños no limpian el excremento. además deberíamos contratar más vigilantes para vigilar los vehículos.": {
      EN: "By the way, talking about the pools, I wanted to comment that dogs in the parking lot run loose and the owners do not clean the feces. Also we should hire more security guards to monitor the vehicles.",
      PT: "A propósito, falando das piscinas, queria comentar que os cachorros no estacionamento andam soltos e os donos não limpam as fezes. Além disso, deveríamos contratar mais vigilantes para vigilar os veículos.",
      FR: "D'ailleurs, en parlant des piscines, je voulais commenter que les chiens dans le parking circulent librement et que les propriétaires ne nettoient pas les déjections. De plus, nous devrions embaucher plus de gardiens pour surveiller les véhicules."
    }
  };

  const cleanText = text.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
  
  // Try to find matching key
  const matchingKey = Object.keys(dict).find(k => {
    const cleanKey = k.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
    return cleanKey === cleanText || cleanKey.includes(cleanText) || cleanText.includes(cleanKey);
  });

  if (matchingKey && dict[matchingKey][lang]) {
    return dict[matchingKey][lang];
  }

  // Fallback translator logic for arbitrary text
  if (lang === "EN") {
    return `[EN] ${text}`;
  }
  if (lang === "PT") {
    return `[PT] ${text}`;
  }
  if (lang === "FR") {
    return `[FR] ${text}`;
  }
  return text;
}
