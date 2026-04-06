import { PrismaClient } from "@prisma/client/edge";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool, neonConfig } from "@neondatabase/serverless";

export const runtime = "edge";

// CONFIGURACIÓN ESTÁTICA DE ALTO NIVEL
neonConfig.useSecureWebSocket = true;

/**
 * CONFIGURACIÓN DE PRECISIÓN: Descomponemos la URL para evitar errores de parseo en el Edge.
 */
const DB_CONFIG = {
    host: 'ep-small-night-a5qgq9x4.us-east-2.aws.neon.tech',
    user: 'neondb_owner',
    password: 'Md5891129Ae#$1129',
    database: 'neondb',
    port: 5432,
};

const NEON_URL = `postgresql://${DB_CONFIG.user}:${encodeURIComponent(DB_CONFIG.password)}@${DB_CONFIG.host}/${DB_CONFIG.database}?sslmode=require`;

// INYECCIÓN MANUAL (Para que el motor interno de Prisma no busque en el vacío)
// @ts-ignore
if (typeof process !== 'undefined') {
    // @ts-ignore
    process.env.DATABASE_URL = NEON_URL;
}

let prismaInstance: PrismaClient | null = null;

export async function getPrisma() {
  if (prismaInstance) return prismaInstance;

  try {
    // IMPORTANTE: Pasamos los campos de conexión uno por uno. 
    // Esto es mucho más robusto que pasar una URL larga en entornos aislados como Cloudflare.
    const pool = new Pool({ 
        host: DB_CONFIG.host,
        user: DB_CONFIG.user,
        password: DB_CONFIG.password,
        database: DB_CONFIG.database,
        port: DB_CONFIG.port,
        ssl: { rejectUnauthorized: false }
    });

    // @ts-expect-error - Prisma Neon adapter type mismatch
    const adapter = new PrismaNeon(pool);
    
    // Inicialización limpia: El adaptador ya tiene los datos masticados
    prismaInstance = new PrismaClient({ adapter });
    
    return prismaInstance;
  } catch (error: any) {
    console.error("❌ ERROR CRÍTICO EN CONEXIÓN DE PRECISIÓN:", error.message);
    throw error;
  }
}

// Singleton de acceso directo
const db = {
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
export const discoverUrl = async () => NEON_URL;
