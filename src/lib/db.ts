import { neonConfig, neon } from "@neondatabase/serverless";

export const runtime = "edge";

// CONFIGURACIÓN DE RED NEON
neonConfig.useSecureWebSocket = true;

const NEON_URL = "postgresql://neondb_owner:Md5891129Ae%23%241129@ep-small-night-a5qgq9x4.us-east-2.aws.neon.tech/neondb?sslmode=require";

let prismaInstance: any = null;

export async function getPrisma() {
  if (prismaInstance) return prismaInstance;

  try {
    // --- SHIM GLOBAL: El "Truco Maestro" para Cloudflare Edge ---
    // Forzamos la variable de entorno en el objeto global para que el motor de Prisma la vea.
    const g = globalThis as any;
    if (!g.process) g.process = { env: {} };
    if (!g.process.env) g.process.env = {};
    g.process.env.DATABASE_URL = NEON_URL;
    // -------------------------------------------------------------

    // IMPORTACIÓN DINÁMICA: Si importamos Prisma AFTER el shim, el motor verá la URL!
    const [{ PrismaClient }, { PrismaNeon }] = await Promise.all([
        import("@prisma/client/edge"),
        import("@prisma/adapter-neon")
    ]);

    // Usar NEON (Fetch Driver) para máxima compatibilidad con el Edge de Cloudflare
    const sql = neon(NEON_URL);
    
    // @ts-expect-error - Prisma Neon adapter type mismatch
    const adapter = new PrismaNeon(sql);
    
    // Inicialización limpia
    prismaInstance = new PrismaClient({ adapter });
    
    return prismaInstance;
  } catch (error: any) {
    console.error("❌ ERROR EN LA IMPORTACIÓN NUCLEAR DE PRISMA:", error.message);
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
