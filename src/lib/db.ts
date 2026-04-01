import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

/**
 * Corrige URLs que contienen caracteres especiales (como %) en la contraseña.
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

function findConnectionString(): string {
  const g = globalThis as unknown as { 
    DATABASE_URL?: string; 
    env?: { DATABASE_URL?: string } 
  };
  
  if (g.DATABASE_URL) return sanitizeUrl(g.DATABASE_URL.trim());
  if (g.env?.DATABASE_URL) return sanitizeUrl(g.env.DATABASE_URL.trim());

  try {
    const ctx = getRequestContext();
    const cfEnv = ctx?.env as { DATABASE_URL?: string };
    if (cfEnv?.DATABASE_URL) return sanitizeUrl(cfEnv.DATABASE_URL.trim());
  } catch { /* Contexto no listo */ }

  if (process.env.DATABASE_URL) return sanitizeUrl(process.env.DATABASE_URL.trim());
  return "";
}

function initPrisma(url: string): PrismaClient {
  console.log("🔌 Inicializando Prisma con Adaptador PG Directo y SSL Flexible");
  try {
    // Configuramos SSL flexible para evitar el Error 526 en Cloudflare/Supabase
    const pool = new Pool({ 
      connectionString: url,
      ssl: { rejectUnauthorized: false }
    });
    const adapter = new PrismaPg(pool);
    return new PrismaClient({ adapter });
  } catch (error) {
    console.error("🔥 Error crítico en initPrisma (PG Adapter):", error);
    throw error;
  }
}

declare global {
  /* eslint-disable no-var */
  var __prismaInstance: PrismaClient | undefined;
  var __prismaUrl: string | undefined;
}

const db = new Proxy({} as PrismaClient, {
  get: (target, prop) => {
    const currentUrl = findConnectionString();
    
    if (!globalThis.__prismaInstance || (currentUrl && globalThis.__prismaUrl !== currentUrl)) {
      if (currentUrl && currentUrl.length > 10) {
        globalThis.__prismaInstance = initPrisma(currentUrl);
        globalThis.__prismaUrl = currentUrl;
      }
    }
    
    if (!globalThis.__prismaInstance) {
      if (prop === "usuario" || prop === "conjunto") {
        throw new Error("DB_NOT_READY_YET");
      }
      return (target as any)[prop];
    }

    const client = globalThis.__prismaInstance as unknown as Record<string, unknown>;
    const result = client[prop as string];
    
    if (typeof result === "function") {
      return result.bind(globalThis.__prismaInstance);
    }
    return result;
  }
});

export default db;
