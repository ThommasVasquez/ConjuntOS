import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool } from "@neondatabase/serverless";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

/**
 * Intenta recuperar la URL de cualquier rincón del runtime
 */
function findConnectionString(): string {
  const g = globalThis as unknown as { 
    DATABASE_URL?: string; 
    env?: { DATABASE_URL?: string } 
  };
  
  if (g.DATABASE_URL) return g.DATABASE_URL.trim();
  if (g.env?.DATABASE_URL) return g.env.DATABASE_URL.trim();

  try {
    const ctx = getRequestContext();
    const cfEnv = ctx?.env as { DATABASE_URL?: string };
    if (cfEnv?.DATABASE_URL) return cfEnv.DATABASE_URL.trim();
  } catch { /* Contexto no listo */ }

  if (process.env.DATABASE_URL) return process.env.DATABASE_URL.trim();

  return "";
}

/**
 * Crea una instancia fresca de Prisma con el adaptador de Neon
 */
function initPrisma(url: string): PrismaClient {
  console.log(`🔌 Inicializando Prisma con URL (Len: ${url.length})`);
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

// Singleton con gestión de estado
declare global {
  /* eslint-disable no-var */
  var __prismaInstance: PrismaClient | undefined;
  var __prismaUrl: string | undefined;
}

const db = new Proxy({} as PrismaClient, {
  get: (target, prop) => {
    const currentUrl = findConnectionString();
    
    // Si no hay instancia O la URL ha cambiado/aparecido por fin
    if (!globalThis.__prismaInstance || (currentUrl && globalThis.__prismaUrl !== currentUrl)) {
      if (currentUrl && currentUrl.length > 10) {
        globalThis.__prismaInstance = initPrisma(currentUrl);
        globalThis.__prismaUrl = currentUrl;
      } else {
        // Si aún no hay URL, no podemos crear el cliente real
        // Devolvemos un error explícito si se intenta usar
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
