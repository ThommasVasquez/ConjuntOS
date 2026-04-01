import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool } from "@neondatabase/serverless";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

/**
 * Corrige URLs que contienen caracteres especiales (como %) en la contraseña.
 * Muchos usuarios de Supabase tienen este problema porque sus contraseñas autogeneradas
 * rompen el estándar de URL de Node/Edge.
 */
export function sanitizeUrl(baseUrl: string): string {
  if (!baseUrl) return "";
  
  try {
    // Intentamos parsear de forma normal primero
    new URL(baseUrl);
    return baseUrl;
  } catch {
    // Si falla, es probable que haya un % sin escapar en la contraseña
    // Formato: postgresql://user:password@host:port/db
    const parts = baseUrl.match(/^(postgresql:\/\/)([^:]+):(.+)(@.+)$/);
    if (parts) {
      const [, protocol, user, password, rest] = parts;
      // Escapamos solo la contraseña (el % debe ser %25)
      const safePassword = password.replace(/%/g, "%25");
      return `${protocol}${user}:${safePassword}${rest}`;
    }
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
  console.log(`🔌 Inicializando Prisma con URL Sanitizada (Len: ${url.length})`);
  try {
    const pool = new Pool({ connectionString: url });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adapter = new PrismaNeon(pool as any);
    return new PrismaClient({ adapter });
  } catch (error) {
    console.error("🔥 Error crítico en initPrisma:", error);
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
      } else {
        if (prop === "usuario" || prop === "conjunto") {
          throw new Error("DATABASE_URL_NOT_AVAILABLE_YET");
        }
      }
    }
    
    if (!globalThis.__prismaInstance) {
      throw new Error("PRISMA_NOT_INITIALIZED");
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
