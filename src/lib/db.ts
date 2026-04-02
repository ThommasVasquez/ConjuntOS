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
    const raw = baseUrl.trim();
    // Usamos un esquema soportado (http) para parsear sin errores
    const asHttp = raw.replace(/^(postgres(?:ql)?):\/\//, "http://");
    const parsed = new URL(asHttp);
    
    let password = parsed.password;
    if (password && !password.includes("%25")) {
      // Reemplazamos % literal por su versión codificada
      password = password.replace(/%/g, "%25");
    }
    
    const protocol = raw.startsWith("postgresql") ? "postgresql://" : "postgres://";
    const user = parsed.username;
    const host = parsed.host;
    const path = parsed.pathname;
    const search = parsed.search;
    
    return `${protocol}${user}:${password}@${host}${path}${search}`;
  } catch { return baseUrl; }
}

/**
 * Busca la cadena de conexión en todas las fuentes del Edge.
 */
function findConnectionStringSync(): string {
  const g = globalThis as { DATABASE_URL?: string; env?: { DATABASE_URL?: string } };
  const getUrl = (v: unknown) => (typeof v === 'string' ? v.trim() : "");

  return sanitizeUrl(
    getUrl(process.env.DATABASE_URL) || 
    getUrl(g.DATABASE_URL) || 
    getUrl(g.env?.DATABASE_URL) || 
    ""
  );
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
};

export default db;
