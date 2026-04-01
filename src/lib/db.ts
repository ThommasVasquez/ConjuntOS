import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

/**
 * Escapa el carácter '%' en la contraseña para que URL lo acepte.
 * Además, fuerza el puerto de Pooling (6543) para Supabase en el Edge.
 */
export function sanitizeUrl(baseUrl: string): string {
  if (!baseUrl) return "";
  try {
    let url = baseUrl;
    
    // Si es Supabase y usa el puerto estándar 5432, lo cambiamos al 6543 (Session Pool)
    // Esto es CRUCIAL para evitar el error SSL 526 en Cloudflare Edge.
    if (url.includes("supabase.co") && url.includes(":5432")) {
      console.log("🔄 [DB] Corrigiendo puerto 5432 -> 6543 para Supabase Edge compatibility.");
      url = url.replace(":5432", ":6543");
    }

    const parts = url.match(/^(postgresql:\/\/)([^:]+):(.+)(@.+)$/);
    if (parts) {
      const [, protocol, user, password, rest] = parts;
      const safePassword = password.replace(/%/g, "%25");
      return `${protocol}${user}:${safePassword}${rest}`;
    }
    return url;
  } catch {
    return baseUrl;
  }
}

/**
 * Busca la cadena de conexión en todas las fuentes posibles del Edge.
 */
function findConnectionString(): string {
  const g = globalThis as unknown as { 
    DATABASE_URL?: string; 
    env?: { DATABASE_URL?: string } 
  };
  if (g.DATABASE_URL) return sanitizeUrl(g.DATABASE_URL.trim());
  if (g.env?.DATABASE_URL) return sanitizeUrl(g.env.DATABASE_URL.trim());

  try {
    const ctx = getRequestContext();
    const env = ctx?.env as { DATABASE_URL?: string };
    if (env?.DATABASE_URL) {
       return sanitizeUrl(env.DATABASE_URL.trim());
    }
  } catch { /* No Request Context */ }

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

  console.log("🔌 [DB] Conectando a:", url.split("@")[1]); // Log seguro sin password
  
  // Para Supabase en puerto 6543 (Transaction Mode / Session Pool), 
  // es vital que el WebSocket se maneje correctamente en el Edge.
  neonConfig.useSecureWebSocket = false; // A veces el handshake falla con true en el pool de Supabase
  
  const pool = new Pool({ 
    connectionString: url,
    // El puerto 6543 a menudo no requiere SSL estricto del driver ya que es un proxy
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
}

// Mapeo de modelos basado en schema.prisma
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
