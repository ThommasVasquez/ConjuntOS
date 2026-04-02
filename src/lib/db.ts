import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool, neonConfig } from "@neondatabase/serverless";

export const runtime = "edge";

/**
 * Escapa el carácter '%' en la contraseña para que URL lo acepte.
 */
export function sanitizeUrl(baseUrl: string): string {
  if (!baseUrl) return "";
  try {
    const url = baseUrl.trim();
    if (url.includes(":") && !url.includes("%25")) {
      const parts = url.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.+)(@.+)$/);
      if (parts) {
        const [, protocol, user, password, rest] = parts;
        return `${protocol}${user}:${password.replace(/%/g, "%25")}${rest}`;
      }
    }
    return url;
  } catch { return baseUrl; }
}

/**
 * Busca de forma agresiva la cadena de conexión en el Edge de Cloudflare.
 * Se llama en cada inicialización de Pool para garantizar integridad en workers distribuidos.
 */
export async function findConnectionString(): Promise<string> {
  const g = globalThis as { DATABASE_URL?: string; env?: { DATABASE_URL?: string } };
  
  // 1. Prioridad: Contexto nativo de Cloudflare (RequestContext)
  try {
    const { getRequestContext: getCtx } = await import("@cloudflare/next-on-pages");
    const ctx = getCtx();
    const env = ctx?.env as { DATABASE_URL?: string };
    if (env?.DATABASE_URL) return sanitizeUrl(env.DATABASE_URL);
  } catch { /* Contexto no disponible */ }

  // 2. Prioridad: process.env (Next.js suele popularlo en Cloudflare)
  if (process.env.DATABASE_URL) return sanitizeUrl(process.env.DATABASE_URL);
  
  // 3. Fallback: globalThis
  if (g.DATABASE_URL) return sanitizeUrl(g.DATABASE_URL);
  if (g.env?.DATABASE_URL) return sanitizeUrl(g.env.DATABASE_URL);

  return "";
}

/**
 * Singleton de Prisma para el Edge.
 */
export async function getPrismaClient(): Promise<PrismaClient> {
  try {
    const url = await findConnectionString();
    
    if (!url) {
      const err = "CRITICAL: DATABASE_URL_NOT_FOUND_AT_RUNTIME";
      globalThis.__prismaError = err;
      throw new Error(err);
    }

    if (globalThis.__prismaInstance && globalThis.__prismaUrl === url) {
      return globalThis.__prismaInstance;
    }
    
    // Configuración específica para Neon Serverless en el Edge
    neonConfig.useSecureWebSocket = false;
    
    const pool = new Pool({ connectionString: url });
    // @ts-expect-error - PrismaNeon types complexity
    const adapter = new PrismaNeon(pool);
    const client = new PrismaClient({ adapter });
    
    globalThis.__prismaInstance = client;
    globalThis.__prismaUrl = url;
    
    return client;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    globalThis.__prismaError = msg;
    throw e;
  }
}

declare global {
  /* eslint-disable no-var */
  var __prismaInstance: PrismaClient | undefined;
  var __prismaUrl: string | undefined;
  var __prismaError: string | undefined;
}

// Mapeo de modelos basado en schema.prisma
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
};

export default db;
