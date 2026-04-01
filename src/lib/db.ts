import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool } from "@neondatabase/serverless";
import { getRequestContext } from "@cloudflare/next-on-pages";

// Forzamos que Prisma no use procesos de Node
export const runtime = "edge";

// Función interna para crear el cliente de forma dinámica
function createDynamicClient() {
  let connectionString = "";

  // 1. Intentar obtenerlo del contexto oficial de Cloudflare (Secrets)
  try {
    const ctx = getRequestContext();
    const cfEnv = ctx?.env as { DATABASE_URL?: string };
    if (cfEnv?.DATABASE_URL) {
      connectionString = cfEnv.DATABASE_URL.trim();
      console.log("🏙️ DATABASE_URL obtenida vía getRequestContext (Cloudflare Context)");
    }
  } catch {
    // No estamos en Cloudflare o no hay contexto disponible aún
  }

  // 2. Fallback a process.env (Next.js polyfill)
  if (!connectionString) {
    connectionString = (process.env.DATABASE_URL || "").trim();
    if (connectionString) {
      console.log("⚙️ DATABASE_URL obtenida vía process.env (Next.js Polyfill)");
    }
  }

  if (!connectionString || connectionString.length < 10) {
    console.warn("⚠️ Advertencia: No se pudo localizar DATABASE_URL en ninguna capa.");
    return new PrismaClient();
  }

  try {
    const pool = new Pool({ 
      connectionString,
      connectionTimeoutMillis: 20000,
    });
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adapter = new PrismaNeon(pool as any);
    return new PrismaClient({ adapter });
  } catch (err) {
    console.error("🔥 Error inicializando Neon/Prisma:", err);
    return new PrismaClient();
  }
}

// Singleton con persistencia en global para desarrollo, pero detección dinámica
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// El export principal es ahora un Proxy que decide qué instancia devolver
const db = new Proxy({} as PrismaClient, {
  get: (target, prop) => {
    // Si no hay instancia global, la creamos en caliente
    if (!globalThis.prisma) {
      globalThis.prisma = createDynamicClient();
    }
    
    // Obtenemos la propiedad del cliente (usuario, unidad, etc.)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (globalThis.prisma as any)[prop];
    
    // Bind obligatorio para mantener el contexto de Prisma
    if (typeof result === "function") {
      return result.bind(globalThis.prisma);
    }
    
    return result;
  }
});

export default db;
