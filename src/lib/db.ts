import { Pool, neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client/edge";

export const runtime = "edge";

// CONFIGURACIÓN DE RED NEON
neonConfig.useSecureWebSocket = true;

const NEON_URL = "postgresql://neondb_owner:Md5891129Ae%23%241129@ep-small-night-a5qgq9x4.us-east-2.aws.neon.tech/neondb?sslmode=require";

/**
 * --- EL HACK FINAL: GOD MODE SHIM ---
 * Usamos 'Object.defineProperty' sobre el objeto global 'process.env'.
 * Este es el método más agresivo para sobreescribir la base de datos en el Edge de Cloudflare
 * y engañar plenamente al motor interno de Prisma para que por fin vea la URL correcta.
 */
try {
  const g = globalThis as any;
  if (!g.process) g.process = { env: {} };
  if (!g.process.env) g.process.env = {};

  Object.defineProperty(g.process.env, 'DATABASE_URL', {
    value: NEON_URL,
    writable: true,
    configurable: true,
    enumerable: true
  });
  
  // También para la versión pública
  Object.defineProperty(g.process.env, 'NEXT_PUBLIC_DATABASE_URL', {
    value: NEON_URL,
    writable: true,
    configurable: true,
    enumerable: true
  });
} catch (e) {
  // Fallback silencioso si el objeto está sellado, pero usualmente esto funciona
  console.warn("⚠️ Fallo parcial al aplicar God Mode Shim");
}

// Singleton cliente
let prismaInstance: any = null;

export async function getPrisma() {
  if (prismaInstance) return prismaInstance;

  try {
    const pool = new Pool({ 
        connectionString: NEON_URL,
        ssl: { rejectUnauthorized: false }
    });

    // Adaptador de Prisma Neon
    // @ts-expect-error - Prisma Neon adapter type mismatch
    const adapter = new PrismaNeon(pool);
    
    // Inicialización limpia
    prismaInstance = new PrismaClient({ adapter });
    
    return prismaInstance;
  } catch (error: any) {
    console.error("❌ ERROR CRÍTICO EN GOD MODE PRISMA:", error.message);
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
export const discoverUrl = async () => NEON_URL;
