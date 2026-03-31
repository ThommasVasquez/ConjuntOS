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
  
  if (!connectionString || connectionString.trim() === "") {
    console.error("❌ ERROR CRÍTICO: La DATABASE_URL es nula o vacía en el Runtime.");
    throw new Error("Missing DATABASE_URL");
  }

  // Verificación de seguridad en logs (solo longitud y protocolo)
  console.log(`🔌 Iniciando conexión Neon. Longitud URL: ${connectionString.length}. Protocolo: ${connectionString.split(':')[0]}`);
  
  try {
    const pool = new Pool({ 
      connectionString: connectionString,
      connectionTimeoutMillis: 10000,
    });
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adapter = new PrismaNeon(pool as any);
    const client = new PrismaClient({ adapter });
    
    if (process.env.NODE_ENV !== "production") {
      globalThis.prisma = client;
    }
    
    return client;
  } catch (err) {
    console.error("🔥 Error al crear el cliente Prisma con Neon Adapter:", err);
    throw err;
  }
}

// Exportamos un proxy que inicializa el cliente solo cuando se usa una propiedad (ej: db.usuario)
const db = new Proxy({} as PrismaClient, {
  get: (target, prop) => {
    // Si la propiedad es una de las funciones de Prisma, obtenemos el cliente
    const client = getPrismaClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (client as any)[prop];
    
    // Si el resultado es una función (como count o findUnique), necesitamos bindearla al cliente
    if (typeof result === "function") {
      return result.bind(client);
    }
    
    return result;
  }
});

export default db;
