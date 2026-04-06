import { PrismaClient } from "@prisma/client/edge";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool, neonConfig } from "@neondatabase/serverless";

export const runtime = "edge";

/**
 * Escapa el carácter '%' en la contraseña para que URL lo acepte.
 */
export function sanitizeUrl(baseUrl: string): string {
  if (!baseUrl || typeof baseUrl !== 'string') return "";
  const raw = baseUrl.trim();
  
  if (raw.includes("%23") || raw.includes("%24") || raw.includes("%25")) {
    return raw;
  }
  
  try {
    const parts = raw.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.+?)(@.+)$/);
    if (parts) {
      const [, protocol, user, password, rest] = parts;
      const safePassword = password
        .replace(/%/g, "%25")
        .replace(/\$/g, "%24")
        .replace(/#/g, "%23");
      return `${protocol}${user}:${safePassword}${rest}`;
    }
  } catch { /* Fallback */ }
  return raw;
}

/**
 * Descubrimiento agresivo de DATABASE_URL en el Edge.
 */
export async function discoverUrl(): Promise<string> {
  const g = globalThis as { DATABASE_URL?: string; env?: { DATABASE_URL?: string }; __DATABASE_URL_CACHE__?: string };
  
  if (g.__DATABASE_URL_CACHE__ && g.__DATABASE_URL_CACHE__ !== "undefined" && g.__DATABASE_URL_CACHE__.length > 10) {
    return g.__DATABASE_URL_CACHE__;
  }

  // 1. Prioridad: process.env (Suele ser inyectado por Vercel/Local)
  let url = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL || "";

  // 2. Fallback: Cloudflare Request Context (Vital para Pages/Workers)
  if (!url || url === "undefined" || url === "null") {
    try {
      const { getRequestContext } = await import("@cloudflare/next-on-pages");
      const ctx = getRequestContext();
      url = (ctx as any)?.env?.DATABASE_URL || "";
    } catch { /* Ignorar */ }
  }

  // 3. Fallback Extremadamente Agresivo: Atributos directos de globalThis o process
  if (!url || url === "undefined" || url === "null") {
      url = (process.env as any).DATABASE_URL || (globalThis as any).DATABASE_URL || "";
  }

  // 4. Fallback de emergencia final (Garantía de Host para Neon)
  if (!url || url === "undefined" || url === "null" || url.length < 10) {
    console.warn("⚠️ Utilizando DATABASE_URL de emergencia por falta de variable de entorno en Edge.");
    url = "postgresql://neondb_owner:Md5891129Ae%23%241129@ep-small-night-a5qgq9x4.us-east-2.aws.neon.tech/neondb?sslmode=require";
  }

  const sanitized = sanitizeUrl(url);
  if (sanitized && sanitized.length > 10) {
      g.__DATABASE_URL_CACHE__ = sanitized;
  }
  
  return sanitized;
}

/**
 * Singleton de Prisma para el Edge.
 */
let prisma: PrismaClient | null = null;

export async function getPrisma() {
  if (prisma) return prisma;
  const url = await discoverUrl();
  try {
    neonConfig.useSecureWebSocket = true;
    neonConfig.fetchConnectionCache = true;
    const pool = new Pool({ connectionString: url });
    // @ts-expect-error - Incompatibilidad de tipos Neon/Prisma
    const adapter = new PrismaNeon(pool);
    prisma = new PrismaClient({ adapter });
    return prisma;
  } catch (error) {
    console.error("❌ Prisma Edge Boot Error:", error);
    prisma = null;
    throw error;
  }
}

export function setConnectionString(url: string) {
  if (url) (globalThis as { __DATABASE_URL_CACHE__?: string }).__DATABASE_URL_CACHE__ = sanitizeUrl(url);
}

// Singleton de acceso a modelos
const db = {
  get usuario() { return getPrisma().then(p => p.usuario); },
  get pago() { return getPrisma().then(p => p.pago); },
  get conjunto() { return getPrisma().then(p => p.conjunto); },
  get unidad() { return getPrisma().then(p => p.unidad); },
  get anuncio() { return getPrisma().then(p => p.anuncio); },
  get areaComun() { return getPrisma().then(p => p.areaComun); },
  get reserva() { return getPrisma().then(p => p.reserva); },
  get documento() { return getPrisma().then(p => p.documento); },
  get junta() { return getPrisma().then(p => p.junta); },
  get gasto() { return getPrisma().then(p => p.gasto); },
  get local() { return getPrisma().then(p => p.local); },
  get producto() { return getPrisma().then(p => p.producto); },
  get pedido() { return getPrisma().then(p => p.pedido); },
  get reciboPublico() { return getPrisma().then(p => p.reciboPublico); },
  get adSpace() { return getPrisma().then(p => p.adSpace); },
  get inmueble() { return getPrisma().then(p => p.inmueble); },
  get pqrs() { return getPrisma().then(p => p.solicitudServicio); },
  get solicitudServicio() { return getPrisma().then(p => p.solicitudServicio); },
  // Models successfully generated in Prisma Client
  get visita() { return getPrisma().then(p => p.visita); },
  get paquete() { return getPrisma().then(p => p.paquete); },
  get vehiculo() { return getPrisma().then(p => p.vehiculo); },
  get parqueadero() { return getPrisma().then(p => p.parqueadero); },
  get registroParqueadero() { return getPrisma().then(p => p.registroParqueadero); },
  get rondaParqueadero() { return getPrisma().then(p => p.rondaParqueadero); },
  get mascota() { return getPrisma().then(p => p.mascota); },
  get tramite() { return getPrisma().then(p => p.tramite); },
  get notificacion() { return getPrisma().then(p => p.notificacion); },
  
  $connect: () => getPrisma().then(p => p.$connect()),
  $disconnect: () => getPrisma().then(p => p.$disconnect()),
  $queryRaw: (q: unknown) => getPrisma().then(p => p.$queryRawUnsafe(q as string)),
  $executeRaw: (q: unknown) => getPrisma().then(p => p.$executeRawUnsafe(q as string)),
};

export default db;
