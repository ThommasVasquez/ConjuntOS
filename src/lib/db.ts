import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool } from "@neondatabase/serverless";

// Declaración global para evitar múltiples instancias en desarrollo
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Función para obtener la instancia de la base de datos (Lazy Loading)
function getPrismaClient(): PrismaClient {
  if (globalThis.prisma) return globalThis.prisma;

  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.error("❌ ERROR CRÍTICO: La variable DATABASE_URL es nula en el momento de la inicialización.");
    // No devolvemos error aquí para no romper el build, pero fallará en tiempo de ejecución con un mensaje claro
    return new PrismaClient(); 
  }

  console.log("🔌 Conectando a Supabase vía Neon Adapter (Lazy)...");
  
  const pool = new Pool({ connectionString });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adapter = new PrismaNeon(pool as any);
  
  const client = new PrismaClient({ adapter });
  
  if (process.env.NODE_ENV !== "production") {
    globalThis.prisma = client;
  }
  
  return client;
}

// Exportamos un proxy que inicializa el cliente solo cuando se usa una propiedad (ej: db.usuario)
const db = new Proxy({} as PrismaClient, {
  get: (target, prop) => {
    const client = getPrismaClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (client as any)[prop];
  }
});

export default db;
