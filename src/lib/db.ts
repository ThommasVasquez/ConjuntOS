import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool } from "@neondatabase/serverless";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

/**
 * Busca la DATABASE_URL en todas las capas posibles de Cloudflare/Next.js
 */
function getConnectionString(): string {
  // 1. Capa Global (Cloudflare Native)
  const g = globalThis as any;
  if (g.DATABASE_URL) return g.DATABASE_URL.trim();
  if (g.env?.DATABASE_URL) return g.env.DATABASE_URL.trim();

  // 2. Capa de Contexto (getRequestContext)
  try {
    const ctx = getRequestContext();
    const cfEnv = ctx?.env as { DATABASE_URL?: string };
    if (cfEnv?.DATABASE_URL) return cfEnv.DATABASE_URL.trim();
  } catch { /* Ignorar si no hay contexto */ }

  // 3. Capa de Proceso (Next.js Polyfill)
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL.trim();

  return "";
}

function createClient() {
  const url = getConnectionString();

  if (!url || url.length < 10) {
    // Si llegamos aquí, lanzamos un error explícito en lugar de devolver un cliente vacío
    // Esto evita que Prisma intente conectar a localhost:5432
    console.error("❌ CRITICAL: DATABASE_URL not found in any layer (Global, Env, Context)");
    throw new Error("DATABASE_URL_MISSING_IN_EDGE_RUNTIME");
  }

  try {
    // Usamos Pool para compatibilidad con PrismaNeon
    const pool = new Pool({ connectionString: url });
    const adapter = new PrismaNeon(pool as any);
    return new PrismaClient({ adapter });
  } catch (error) {
    console.error("🔥 Failed to initialize Prisma with Neon adapter:", error);
    throw error;
  }
}

// Singleton con persistencia en global para evitar múltiples conexiones en HMR
declare global {
  var prisma: PrismaClient | undefined;
}

const db = new Proxy({} as PrismaClient, {
  get: (target, prop) => {
    if (!globalThis.prisma) {
      globalThis.prisma = createClient();
    }
    
    const result = (globalThis.prisma as any)[prop];
    if (typeof result === "function") {
      return result.bind(globalThis.prisma);
    }
    return result;
  }
});

export default db;
