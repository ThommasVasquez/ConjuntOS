import { PrismaClient } from "@prisma/client/edge";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool, neonConfig } from "@neondatabase/serverless";

export const runtime = "edge";

// CONFIGURACIÓN ESTÁTICA DE ALTO NIVEL
neonConfig.useSecureWebSocket = true;

/**
 * REFORMA RADICAL: Bypasseamos el descubrimiento dinámico para asegurar estabilidad.
 */
const DEFAULT_URL = "postgresql://neondb_owner:Md5891129Ae%23%241129@ep-small-night-a5qgq9x4.us-east-2.aws.neon.tech/neondb?sslmode=require";

let prismaInstance: PrismaClient | null = null;

export async function getPrisma() {
  if (prismaInstance) return prismaInstance;

  // Prioridad 1: Entorno de Cloudflare o Vercel
  let url = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL || "";
  
  // Fallback si la URL del entorno está vacía o es inválida
  if (!url || url.length < 10 || url === "undefined") {
      url = DEFAULT_URL;
  }

  try {
    // Para depuración, vamos a parsear la URL manualmente y pasar los campos al Pool
    // Esto evita errores de parseo interno en el driver de Neon en el Edge
    const pool = new Pool({ 
        connectionString: url,
        ssl: { rejectUnauthorized: false }
    });

    // @ts-expect-error - Prisma Neon adapter type mismatch
    const adapter = new PrismaNeon(pool);
    prismaInstance = new PrismaClient({ adapter });
    
    return prismaInstance;
  } catch (error: any) {
    console.error("❌ ERROR CRÍTICO DE PRISMA:", error.message);
    throw error;
  }
}

// Singleton de acceso directo (Bypass Getters complejos)
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
export const discoverUrl = async () => DEFAULT_URL; // Mock para compatibilidad
