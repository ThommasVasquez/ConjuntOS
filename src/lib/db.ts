import { Pool, neonConfig } from "@neondatabase/serverless";
import { PrismaClient } from "@prisma/client";

export const runtime = "edge";

// CONFIGURACIÓN DE RED
neonConfig.useSecureWebSocket = false;

const NEON_URL = "postgresql://neondb_owner:Md5891129Ae%23%241129@ep-small-night-a5qgq9x4.us-east-2.aws.neon.tech/neondb?sslmode=require";

// Obtenemos la URL con flags de pgbouncer
const rawUrl = process.env.DATABASE_URL || NEON_URL;
const url = rawUrl.includes('?') 
  ? `${rawUrl}&pgbouncer=true&connection_limit=1` 
  : `${rawUrl}?pgbouncer=true&connection_limit=1`;

// Pool compartido
const pool = new Pool({ 
  connectionString: url,
  ssl: { rejectUnauthorized: false }
});

/**
 * SHADOW PRISMA CLIENT (v19.0)
 * Safe Hydration: Restricted relationship lookup to prevent 500 errors on missing tables.
 */
class ModelProxy {
  constructor(private tableName: string) {}

  async findUnique(args: any) {
    const where = args.where;
    const key = Object.keys(where)[0];
    const value = where[key];
    const query = `SELECT * FROM "${this.tableName}" WHERE "${key}" = $1 LIMIT 1`;
    const res = await pool.query(query, [value]);
    const item = res.rows[0] || null;
    
    if (item && args.include) {
      return await this.hydrate(item, args.include);
    }
    return item;
  }

  async findFirst(args: any = {}) {
    const where = args.where || {};
    let query = `SELECT * FROM "${this.tableName}"`;
    const keys = Object.keys(where);
    const values = Object.values(where);
    
    if (keys.length > 0) {
      query += ` WHERE ` + keys.map((k, i) => `"${k}" = $${i + 1}`).join(" AND ");
    }
    
    query += ` LIMIT 1`;
    const res = await pool.query(query, values);
    const item = res.rows[0] || null;

    if (item && args.include) {
      return await this.hydrate(item, args.include);
    }
    return item;
  }

  async findMany(args: any = {}) {
    const where = args.where || {};
    let query = `SELECT * FROM "${this.tableName}"`;
    const keys = Object.keys(where);
    const values = Object.values(where);
    
    if (keys.length > 0) {
      query += ` WHERE ` + keys.map((k, i) => `"${k}" = $${i + 1}`).join(" AND ");
    }
    
    if (args.orderBy) {
      const orderKey = Object.keys(args.orderBy)[0];
      const orderDir = args.orderBy[orderKey].toUpperCase();
      query += ` ORDER BY "${orderKey}" ${orderDir}`;
    } else {
      query += ` ORDER BY "creadoEn" DESC` || "";
    }
    
    query += ` LIMIT 200`;
    
    const res = await pool.query(query, values);
    let items = res.rows;

    if (items.length > 0 && args.include) {
      items = await Promise.all(items.map(item => this.hydrate(item, args.include)));
    }
    return items;
  }

  /**
   * MÉTODO DE HIDRATACIÓN SEGURA (v19):
   * Solo intenta hidratar relaciones explícitamente mapeadas.
   */
  private async hydrate(item: any, include: any) {
    const newItem = { ...item };
    
    // Lista Blanca de Relaciones para evitar errores 500 por tablas inexistentes
    const tableMap: Record<string, string> = {
      usuario: "Usuario",
      aprobadoPor: "Usuario",
      propietario: "Usuario",
      solicitante: "Usuario",
      conjunto: "Conjunto",
      unidad: "Unidad",
      parqueadero: "Parqueadero",
      vehiculo: "Vehiculo",
      reserva: "Reserva"
    };

    for (const relation of Object.keys(include)) {
      const targetTable = tableMap[relation];
      if (!targetTable) continue; // Si no está mapeado, ignoramos para seguridad

      const foreignKey = `${relation}Id`;
      // Caso especial para relaciones con nombres distintos a la FK (ej: aprobadoPor -> aprobadoPorId)
      // Pero si no existe 'aprobadoPorId', intentamos buscar por 'usuarioId' si es relevante
      const idToFetch = newItem[foreignKey] || (relation === 'usuario' ? newItem['usuarioId'] : null);
      
      if (idToFetch) {
        try {
          const res = await pool.query(`SELECT * FROM "${targetTable}" WHERE id = $1`, [idToFetch]);
          newItem[relation] = res.rows[0] || null;
          
          if (newItem[relation] && typeof include[relation] === 'object' && include[relation].select) {
             const selectedFields = include[relation].select;
             const filtered: any = {};
             Object.keys(selectedFields).forEach(f => {
               if (selectedFields[f]) filtered[f] = newItem[relation][f];
             });
             // Aseguramos que 'nombre' siempre exista si es posible
             newItem[relation] = filtered;
          }
        } catch (e) {
          console.warn(`⚠️ Safe Hydration falló para ${relation}:`, e);
          newItem[relation] = null;
        }
      } else {
         newItem[relation] = null;
      }
    }
    return newItem;
  }

  async create(args: any) {
    const data = { ...args.data };
    if (!data.id) {
       data.id = `${this.tableName.toLowerCase().substring(0, 2)}_${Math.random().toString(36).substring(2, 11)}`;
    }
    if (!data.creadoEn) data.creadoEn = new Date();
    if (!data.actualizadoEn) data.actualizadoEn = new Date();

    const columns = Object.keys(data).map(c => `"${c}"`).join(", ");
    const placeholders = Object.keys(data).map((_, i) => `$${i + 1}`).join(", ");
    const values = Object.values(data);
    const query = `INSERT INTO "${this.tableName}" (${columns}) VALUES (${placeholders}) RETURNING *`;
    const res = await pool.query(query, values);
    return res.rows[0];
  }

  async update(args: any) {
    const { where, data } = args;
    const whereKey = Object.keys(where)[0];
    const whereValue = where[whereKey];
    data.actualizadoEn = new Date();
    const setClause = Object.keys(data).map((c, i) => `"${c}" = $${i + 2}`).join(", ");
    const values = [whereValue, ...Object.values(data)];
    const query = `UPDATE "${this.tableName}" SET ${setClause} WHERE "${whereKey}" = $1 RETURNING *`;
    const res = await pool.query(query, values);
    return res.rows[0];
  }

  async count() {
    const res = await pool.query(`SELECT COUNT(*) FROM "${this.tableName}"`);
    return parseInt(res.rows[0].count);
  }
}

// Interfaz DB compatible con Prisma
const db: any = {
  usuario: new ModelProxy("Usuario"),
  tramite: new ModelProxy("Tramite"),
  notificacion: new ModelProxy("Notificacion"),
  conjunto: new ModelProxy("Conjunto"),
  unidad: new ModelProxy("Unidad"),
  vehiculo: new ModelProxy("Vehiculo"),
  parqueadero: new ModelProxy("Parqueadero"),
  anuncio: new ModelProxy("Anuncio"),
  areaComun: new ModelProxy("AreaComun"),
  reserva: new ModelProxy("Reserva"),
  solicitudServicio: new ModelProxy("SolicitudServicio"),
  $connect: async () => {},
  $disconnect: async () => {},
  $queryRawUnsafe: async (sql: string, ...values: any[]) => {
    const res = await pool.query(sql, values);
    return res.rows;
  }
};

export default db;
export const discoverUrl = async () => url;
export { PrismaClient };
