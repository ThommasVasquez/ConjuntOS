import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

/**
 * Escapa el carácter '%' en la contraseña para que URL lo acepte.
 * Importante para contraseñas como "Md5891129Ae%ThommyEnergy%"
 */
export function sanitizeUrl(baseUrl: string): string {
  if (!baseUrl) return "";
  try {
    const parts = baseUrl.match(/^(postgresql:\/\/)([^:]+):(.+)(@.+)$/);
    if (parts) {
      const [, protocol, user, password, rest] = parts;
      // Convertimos % en %25 (su valor escapado)
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
  
  console.warn("🚨 [DB-DIAGNOSTIC] No se encontró DATABASE_URL en ninguna fuente conocida.");
  return "";
}

function initPrisma(url: string): PrismaClient {
  console.log("🔌 Inicializando Prisma con Neon Serverless (Edge Mode)");
  try {
    // Configuración para que el driver de Neon funcione con hosts externos como Supabase
    // Desactivamos el proxy interno de Neon que causa el error 1016
    neonConfig.useSecureWebSocket = true;
    
    const pool = new Pool({ 
      connectionString: url,
      // Desactivamos la validación estricta de SSL para el error 526
      ssl: { rejectUnauthorized: false }
    });
    
    // @ts-expect-error - El pool de Neon Serverless tiene una discrepancia interna de tipos con el adaptador de Prisma pero funciona correctamente
    const adapter = new PrismaNeon(pool);
    return new PrismaClient({ adapter });
  } catch (error) {
    console.error("🔥 Error crítico en initPrisma (Neon Edge):", error);
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
      return (target as unknown as Record<string, unknown>)[prop as string];
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
