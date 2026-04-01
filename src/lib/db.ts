import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

/**
 * Escapa el carácter '%' en la contraseña para que URL lo acepte.
 */
export function sanitizeUrl(baseUrl: string): string {
  if (!baseUrl) return "";
  try {
    const parts = baseUrl.match(/^(postgresql:\/\/)([^:]+):(.+)(@.+)$/);
    if (parts) {
      const [, protocol, user, password, rest] = parts;
      const safePassword = password.replace(/%/g, "%25");
      return `${protocol}${user}:${safePassword}${rest}`;
    }
    return baseUrl;
  } catch {
    return baseUrl;
  }
}

/**
 * Busca la cadena de conexión en todas las fuentes posibles del Edge.
 */
function findConnectionString(): string {
  // 1. globalThis.DATABASE_URL (Inyectado por algunos entornos)
  const g = globalThis as unknown as { 
    DATABASE_URL?: string; 
    env?: { DATABASE_URL?: string } 
  };
  if (g.DATABASE_URL) return sanitizeUrl(g.DATABASE_URL.trim());
  if (g.env?.DATABASE_URL) return sanitizeUrl(g.env.DATABASE_URL.trim());

  // 2. Cloudflare Request Context (Recomendado para Pages/Workers)
  try {
    const ctx = getRequestContext();
    const env = ctx?.env as { DATABASE_URL?: string };
    if (env?.DATABASE_URL) {
       return sanitizeUrl(env.DATABASE_URL.trim());
    }
  } catch { /* No estamos en un contexto de petición */ }

  // 3. process.env (Fallback para local u otros entornos Next.js)
  if (process.env.DATABASE_URL) {
     return sanitizeUrl(process.env.DATABASE_URL.trim());
  }
  
  return "";
}

/**
 * Singleton de Prisma para el Edge.
 */
export function getPrismaClient(): PrismaClient {
  const url = findConnectionString();
  
  if (!url) {
    throw new Error("DATABASE_URL_NOT_FOUND");
  }

  if (globalThis.__prismaInstance && globalThis.__prismaUrl === url) {
    return globalThis.__prismaInstance;
  }

  console.log("🔌 [DB] Inicializando nueva instancia de Prisma (Neon Serverless)");
  
  neonConfig.useSecureWebSocket = true;
  
  const pool = new Pool({ 
    connectionString: url,
    ssl: { rejectUnauthorized: false }
  });
  
  // @ts-expect-error - Discrepancia de tipos entre Neon y Prisma (Edge)
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
}

/**
 * Exportamos un objeto que imita el cliente pero llama a getPrismaClient()
 * Mapeado a los modelos reales definidos en schema.prisma
 */
const db = {
  get conjunto() { return getPrismaClient().conjunto; },
  get usuario() { return getPrismaClient().usuario; },
  get unidad() { return getPrismaClient().unidad; },
  get areaComun() { return getPrismaClient().areaComun; },
  get reserva() { return getPrismaClient().reserva; },
  get anuncio() { return getPrismaClient().anuncio; },
  get documento() { return getPrismaClient().documento; },
  get junta() { return getPrismaClient().junta; },
  get pago() { return getPrismaClient().pago; },
  get gasto() { return getPrismaClient().gasto; },
  get local() { return getPrismaClient().local; },
  get producto() { return getPrismaClient().producto; },
  get pedido() { return getPrismaClient().pedido; },
  get solicitudServicio() { return getPrismaClient().solicitudServicio; },
  get reciboPublico() { return getPrismaClient().reciboPublico; },
  get adSpace() { return getPrismaClient().adSpace; },
  
  $queryRaw: (query: unknown) => getPrismaClient().$queryRawUnsafe(query as string),
  $executeRaw: (query: unknown) => getPrismaClient().$executeRawUnsafe(query as string),
  $connect: () => getPrismaClient().$connect(),
  $disconnect: () => getPrismaClient().$disconnect(),
};

export default db;
