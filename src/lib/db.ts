import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool } from "@neondatabase/serverless";

const prismaClientSingleton = () => {
  // Configuración del Pool para entornos Edge (Cloudflare/Neon/Supabase)
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.error("❌ ERROR CRÍTICO: La variable DATABASE_URL está vacía o no existe en Cloudflare.");
    return new PrismaClient(); // Fallback to avoid crash at init, but will fail queries
  }

  console.log("🔌 Inicializando Pool de Base de Datos para Cloudflare...");
  
  const pool = new Pool({ connectionString });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adapter = new PrismaNeon(pool as any);
  
  return new PrismaClient({ adapter });
};

declare global {
  // eslint-disable-next-line no-var
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

const db = globalThis.prisma ?? prismaClientSingleton();

export default db;

if (process.env.NODE_ENV !== "production") globalThis.prisma = db;
