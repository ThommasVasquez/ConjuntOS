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
 * Busca la cadena de conexión en todas las fuentes del Edge.
 */
function findConnectionStringSync(): string {
  if (_connectionString) return _connectionString;

  const g = globalThis as { DATABASE_URL?: string; env?: { DATABASE_URL?: string } };
  const getUrl = (v: unknown) => (typeof v === 'string' ? v.trim() : "");

  const url = sanitizeUrl(
    getUrl(process.env.DATABASE_URL) || 
    getUrl(g.DATABASE_URL) || 
    getUrl(g.env?.DATABASE_URL) || 
    ""
  );

  if (url) _connectionString = url;
  return url;
}

/**
 * Singleton de Prisma para el Edge.
 */
export function getPrismaClient(): PrismaClient {
  const url = findConnectionStringSync();
  
  if (!url) {
    globalThis.__prismaError = "MISSING_DATABASE_URL";
    throw new Error("CRITICAL: DATABASE_URL is not defined.");
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
  setConnectionString,
};

export default db;
