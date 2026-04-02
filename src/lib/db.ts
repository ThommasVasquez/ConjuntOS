import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool, neonConfig } from "@neondatabase/serverless";

export const runtime = "edge";

/**
 * Escapa el carácter '%' en la contraseña para que URL lo acepte.
 */
/**
 * Motor de sanitización universal (Maneja caracteres especiales en contraseñas)
 */
export function sanitizeUrl(baseUrl: string): string {
  if (!baseUrl || typeof baseUrl !== 'string') return "";
  const raw = baseUrl.trim();
  if (raw.includes("%25")) return raw; // Ya sanitizado
  
  try {
    // Regex de alto impacto para extraer el password y escaparlo sin Greedy match
    const parts = raw.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.+?)(@.+)$/);
    if (parts) {
      const [, protocol, user, password, rest] = parts;
      return `${protocol}${user}:${password.replace(/%/g, "%25")}${rest}`;
    }
  } catch { /* Fallback */ }
  return raw;
}

/**
 * Descubrimiento agresivo de DATABASE_URL en el Edge.
 */
export async function discoverUrl(): Promise<string> {
  const g = globalThis as { DATABASE_URL?: string; env?: { DATABASE_URL?: string }; __DATABASE_URL_CACHE__?: string };
  
  if (g.__DATABASE_URL_CACHE__) return g.__DATABASE_URL_CACHE__;

  let url = "";

  try {
    const { getRequestContext } = await import("@cloudflare/next-on-pages");
    const ctx = getRequestContext();
    const env = ctx?.env as { DATABASE_URL?: string };
    if (env?.DATABASE_URL) url = env.DATABASE_URL;
  } catch { /* Ignorar si no está disponible */ }

  // 2. Otras fuentes
  if (!url) {
    url = process.env.DATABASE_URL || g.DATABASE_URL || g.env?.DATABASE_URL || "";
  }

  const sanitized = sanitizeUrl(url);
  if (sanitized) g.__DATABASE_URL_CACHE__ = sanitized;
  return sanitized;
}

export function setConnectionString(url: string) {
  if (url) (globalThis as { __DATABASE_URL_CACHE__?: string }).__DATABASE_URL_CACHE__ = sanitizeUrl(url);
}


/**
 * Singleton de Prisma para el Edge (Asíncrono y Robusto).
 */
export async function getPrismaClient(): Promise<PrismaClient> {
  const url = await discoverUrl();
  
  if (!url || url === "undefined") {
    const err = "CRITICAL: DATABASE_URL_NOT_FOUND_IN_EDGE_CONTEXT";
    globalThis.__prismaError = err;
    throw new Error(err);
  }

  if (globalThis.__prismaInstance && globalThis.__prismaUrl === url) {
    return globalThis.__prismaInstance;
  }

  // Configuración de Neon Serverless
  neonConfig.useSecureWebSocket = false;
  
  const pool = new Pool({ 
    connectionString: url,
    ssl: { rejectUnauthorized: false }
  });

  // @ts-expect-error - PrismaNeon types
  const adapter = new PrismaNeon(pool);
  const client = new PrismaClient({ adapter });

  globalThis.__prismaInstance = client;
  globalThis.__prismaUrl = url;

  return client;
}

declare global {
  /* eslint-disable no-var */
  var __prismaInstance: PrismaClient | undefined;
  var __prismaUrl: string | undefined;
  var __prismaError: string | undefined;
}

// Mapeo de modelos basado en schema.prisma (Vuelven a ser asíncronos para seguridad total)
const db = {
  get conjunto() { return getPrismaClient().then(c => c.conjunto); },
  get usuario() { return getPrismaClient().then(c => c.usuario); },
  get unidad() { return getPrismaClient().then(c => c.unidad); },
  get areaComun() { return getPrismaClient().then(c => c.areaComun); },
  get reserva() { return getPrismaClient().then(c => c.reserva); },
  get anuncio() { return getPrismaClient().then(c => c.anuncio); },
  get documento() { return getPrismaClient().then(c => c.documento); },
  get junta() { return getPrismaClient().then(c => c.junta); },
  get pago() { return getPrismaClient().then(c => c.pago); },
  get gasto() { return getPrismaClient().then(c => c.gasto); },
  get local() { return getPrismaClient().then(c => c.local); },
  get producto() { return getPrismaClient().then(c => c.producto); },
  get pedido() { return getPrismaClient().then(c => c.pedido); },
  get solicitudServicio() { return getPrismaClient().then(c => c.solicitudServicio); },
  get reciboPublico() { return getPrismaClient().then(c => c.reciboPublico); },
  get adSpace() { return getPrismaClient().then(c => c.adSpace); },
  
  $queryRaw: (query: unknown) => getPrismaClient().then(c => c.$queryRawUnsafe(query as string)),
  $executeRaw: (query: unknown) => getPrismaClient().then(c => c.$executeRawUnsafe(query as string)),
  $connect: () => getPrismaClient().then(c => c.$connect()),
  $disconnect: () => getPrismaClient().then(c => c.$disconnect()),
  setConnectionString,
};

export default db;
