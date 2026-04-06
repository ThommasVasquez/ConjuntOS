import { Pool, neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client/edge";

export const runtime = "edge";

// CONFIGURACIÓN DE RED (Soporta Supabase Pooler a través del driver Neon)
neonConfig.useSecureWebSocket = true;

// Singleton cliente
let prismaInstance: any = null;

export async function getPrisma() {
  if (prismaInstance) return prismaInstance;

  // RESTRICCIÓN: Usamos ÚNICAMENTE la variable de entorno ya configurada en el sistema.
  // Se ha verificado en fases previas que está saludable.
  const url = process.env.DATABASE_URL || "";

  if (!url) {
    throw new Error("❌ DATABASE_URL_MISSING_IN_ENVIRONMENT");
  }

  try {
    const pool = new Pool({ 
        connectionString: url,
        ssl: { rejectUnauthorized: false }
    });

    // Adaptador de Prisma (Neon es compatible con Supabase Postgres sobre WS)
    // @ts-expect-error - Prisma Neon adapter type mismatch
    const adapter = new PrismaNeon(pool);
    
    /**
     * MÁXIMA SIMPLICIDAD: No pasamos 'datasourceUrl' ni 'datasources' al constructor.
     * Al pasar el 'adapter', Prisma 7.x delega la gestión de la conexión.
     */
    prismaInstance = new PrismaClient({ adapter });
    
    return prismaInstance;
  } catch (error: any) {
    console.error("❌ ERROR EN LA CONEXIÓN DE ENTORNO PURO:", error.message);
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
export const discoverUrl = async () => process.env.DATABASE_URL;
