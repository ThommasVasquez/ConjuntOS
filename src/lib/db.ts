import { Pool, neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

export const runtime = "edge";

// CONFIGURACIÓN DE RED (Soporta WebSocket para PG sobre HTTP/WS)
neonConfig.useSecureWebSocket = true;

/**
 * URL DE NEON (HARDCODED) - Siempre como respaldo o fuente principal.
 * Agregamos '?pgbouncer=true&connection_limit=1' para compatibilidad con el motor de Prisma en el Edge.
 */
const BASE_NEON_URL = "postgresql://neondb_owner:Md5891129Ae%23%241129@ep-small-night-a5qgq9x4.us-east-2.aws.neon.tech/neondb?sslmode=require";

// Singleton cliente
let prismaInstance: any = null;

export async function getPrisma() {
  if (prismaInstance) return prismaInstance;

  // Lógica de descubrimiento de URL con inyección de flags de compatibilidad
  let rawUrl = process.env.DATABASE_URL || BASE_NEON_URL;
  
  // Limpieza básica y aseguramiento de parámetros pgbouncer para el Edge
  let url = rawUrl.includes('?') 
    ? `${rawUrl}&pgbouncer=true&connection_limit=1` 
    : `${rawUrl}?pgbouncer=true&connection_limit=1`;

  // --- SHIM DE PROCESO (Última línea de defensa) ---
  const g = globalThis as any;
  if (!g.process) g.process = { env: {} };
  if (!g.process.env) g.process.env = {};
  g.process.env.DATABASE_URL = url;

  try {
    const pool = new Pool({ 
        connectionString: url,
        ssl: { rejectUnauthorized: false }
    });

    // @ts-expect-error - Prisma Neon adapter type mismatch
    const adapter = new PrismaNeon(pool);
    
    /**
     * PRISMA 7.6.0 + CLOUDFLARE EDGE:
     * El 'adapter' maneja la query, pero el Query Engine WASM necesita la 'datasourceUrl'
     * con los flags de pgbouncer para inicializar correctamente los tipos y el esquema.
     */
    // @ts-ignore
    prismaInstance = new PrismaClient({ 
        adapter,
        datasourceUrl: url
    });
    
    return prismaInstance;
  } catch (error: any) {
    console.error("❌ ERROR EN LA CONEXIÓN DE COMPATIBILIDAD (v14):", error.message);
    throw error;
  }
}

// Singleton de acceso directo
const db: any = {
  get usuario() { return getPrisma().then(p => p.usuario); },
  get tramite() { return getPrisma().then(p => p.tramite); },
  get notificacion() { return getPrisma().then(p => p.notificacion); },
  get parqueadero() { return getPrisma().then(p => p.parqueadero); },
  get vehiculo() { return getPrisma().then(p => p.vehiculo); },
  get visita() { return getPrisma().then(p => p.visita); },
  get paquete() { return getPrisma().then(p => p.paquete); },
  get mascota() { return getPrisma().then(p => p.mascota); },
  get conjunto() { return getPrisma().then(p => p.conjunto); },
  get unidad() { return getPrisma().then(p => p.unidad); },
  get anuncio() { return getPrisma().then(p => p.anuncio); },
  get areaComun() { return getPrisma().then(p => p.areaComun); },
  get reserva() { return getPrisma().then(p => p.reserva); },
  get documento() { return getPrisma().then(p => p.documento); },
  get junta() { return getPrisma().then(p => p.junta); },
  get gasto() { return getPrisma().then(p => p.gasto); },
  get local() { return getPrisma().then(p => p.local); },
  get producto() { return getPrisma().then(p => p.producto); },
  get pedido() { return getPrisma().then(p => p.pedido); },
  get reciboPublico() { return getPrisma().then(p => p.reciboPublico); },
  get adSpace() { return getPrisma().then(p => p.adSpace); },
  get inmueble() { return getPrisma().then(p => p.inmueble); },
  get solicitudServicio() { return getPrisma().then(p => p.solicitudServicio); },
  get pqrs() { return getPrisma().then(p => p.solicitudServicio); },
  get registroParqueadero() { return getPrisma().then(p => p.registroParqueadero); },
  get rondaParqueadero() { return getPrisma().then(p => p.rondaParqueadero); },
  
  $connect: () => getPrisma().then(p => p.$connect()),
  $queryRaw: (q: any) => getPrisma().then(p => p.$queryRawUnsafe(q)),
};

export default db;
export const discoverUrl = async () => (process.env.DATABASE_URL || BASE_NEON_URL);
