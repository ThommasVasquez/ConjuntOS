import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool, neonConfig } from "@neondatabase/serverless";

export const runtime = "edge";

/**
 * Escapa el carácter '%' en la contraseña para que URL lo acepte.
 */
export function sanitizeUrl(baseUrl: string): string {
  if (!baseUrl) return "";
  const raw = baseUrl.trim();
  if (!raw.includes(":") || raw.includes("%25")) return raw;
  
  try {
    // Regex simple para extraer el password y escaparlo
    const parts = raw.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.+)(@.+)$/);
    if (parts) {
      const [, protocol, user, password, rest] = parts;
      return `${protocol}${user}:${password.replace(/%/g, "%25")}${rest}`;
    }
  } catch { /* fallback */ }
  return raw;
}

let _connectionString: string | null = null;

export function setConnectionString(url: string) {
  if (url) {
    _connectionString = sanitizeUrl(url);
    // También popular globales para otros módulos
    const g = globalThis as { DATABASE_URL?: string };
    g.DATABASE_URL = _connectionString;
    process.env.DATABASE_URL = _connectionString;
  }
}


/**
 * Singleton de Prisma para el Edge (Asíncrono y Robusto).
 */
export async function getPrismaClient(): Promise<PrismaClient> {
  let url = _connectionString || "";

  if (!url) {
    const g = globalThis as { DATABASE_URL?: string; env?: { DATABASE_URL?: string } };
    
    // 1. Intentar el Contexto de Cloudflare (El más fiable en el Edge)
    try {
      const { getRequestContext } = await import("@cloudflare/next-on-pages");
      const ctx = getRequestContext();
      const env = ctx?.env as { DATABASE_URL?: string };
      if (env?.DATABASE_URL) url = sanitizeUrl(env.DATABASE_URL);
    } catch { /* Contexto no disponible */ }

    // 2. Fallbacks
    if (!url) {
      const getUrl = (v: unknown) => (typeof v === 'string' ? v.trim() : "");
      url = sanitizeUrl(
        getUrl(process.env.DATABASE_URL) || 
        getUrl(g.DATABASE_URL) || 
        getUrl(g.env?.DATABASE_URL) || 
        ""
      );
    }
  }
  
  if (!url || url === "undefined") {
    const err = "CRITICAL: DATABASE_URL_NOT_FOUND_IN_EDGE_CONTEXT";
    globalThis.__prismaError = err;
    throw new Error(err);
  }

  // Cachear para este worker
  _connectionString = url;

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
