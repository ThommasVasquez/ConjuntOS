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
  
  // Si ya tiene caracteres escapados como %23 (#) o %24 ($), NO volver a escapar el símbolo %
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
  
  if (g.__DATABASE_URL_CACHE__) return g.__DATABASE_URL_CACHE__;

  let url = "";

  // 1. Prioridad: process.env (Vemos que esto SI funciona en otras rutas de este proyecto)
  url = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL || "";

  // 2. Fallback: Cloudflare Request Context
  if (!url) {
    try {
      const { getRequestContext } = await import("@cloudflare/next-on-pages");
      const ctx = getRequestContext();
      const env = (ctx?.env || {}) as Record<string, string>;
      url = env.DATABASE_URL || env.NEXT_PUBLIC_DATABASE_URL || "";
    } catch { /* Ignorar */ }
  }

  // 3. Otros fallbacks globales e Inyección Directa (Salvavidas Final)
  if (!url || url === "undefined") {
    console.warn("⚠️ DATABASE_URL no detectada en entorno. Usando fallback de emergencia.");
    url = g.DATABASE_URL || g.env?.DATABASE_URL || "postgresql://postgres.zudntuczwfhmyqgzcvrc:Md5891129Ae%23%241129@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
  }

  const sanitized = sanitizeUrl(url);
  if (sanitized) {
    g.__DATABASE_URL_CACHE__ = sanitized;
    const masked = sanitized.replace(/:([^@]+)@/, ":****@");
    console.log(`📡 DB_URL Configurada: ${masked.substring(0, 50)}...`);
  }
  
  return sanitized;
}

export function setConnectionString(url: string) {
  if (url) (globalThis as { __DATABASE_URL_CACHE__?: string }).__DATABASE_URL_CACHE__ = sanitizeUrl(url);
}


/**
 * Singleton de Prisma para el Edge.
 */
let prisma: PrismaClient | null = null;

export async function getPrisma() {
  if (prisma) return prisma;

  const url = await discoverUrl();
  if (!url) throw new Error("DATABASE_URL_NOT_FOUND");

  neonConfig.useSecureWebSocket = true;
  const pool = new Pool({ connectionString: url });
  // @ts-expect-error - Incompatibilidad de tipos entre versiones de Neon Serverless y PrismaNeon
  const adapter = new PrismaNeon(pool);
  prisma = new PrismaClient({ adapter });
  
  return prisma;
}

// Exportamos un objeto que resuelve los modelos de forma asíncrona
const db = {
  get usuario() { return getPrisma().then(p => p.usuario); },
  get pago() { return getPrisma().then(p => p.pago); },
  get conjunto() { return getPrisma().then(p => p.conjunto); },
  get unidad() { return getPrisma().then(p => p.unidad); },
  get pqrs() { return getPrisma().then(p => (p as unknown as { pQRS: unknown }).pQRS); },
  $connect: () => getPrisma().then(p => p.$connect()),
  $disconnect: () => getPrisma().then(p => p.$disconnect()),
};

export default db;
