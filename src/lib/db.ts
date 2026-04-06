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
 * SHADOW PRISMA CLIENT (v20.0)
 * Approvals Module Support: Implementado 'upsert' y modelos faltantes (mascota, registroParqueadero).
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
    // Simple filter if select is present
    if (item && args.select) {
       const filtered: any = {};
       Object.keys(args.select).forEach(f => { if (args.select[f]) filtered[f] = item[f]; });
       return filtered;
    }
    return item;
  }

  async findFirst(args: any = {}) {
    const where = args.where || {};
    let query = `SELECT * FROM "${this.tableName}"`;
    const keys = Object.keys(where).filter(k => k !== 'LOWER'); // Basic lower support check
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
      // Intentar ordenar por creadoEn si existe
      query += ` ORDER BY id DESC`; 
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
   * MÉTODO UPSERT (v20):
   * Útil para mudanzas y creación/actualización de inquilinos.
   */
  async upsert(args: any) {
    const { where, update, create } = args;
    const key = Object.keys(where)[0];
    const value = where[key];
    
    // 1. Intentar buscar
    const existing = await this.findUnique({ where: { [key]: value } });
    
    if (existing) {
      // 2. Actualizar
      return await this.update({ where: { [key]: value }, data: update });
    } else {
      // 3. Crear
      return await this.create({ data: create });
    }
  }

  private async hydrate(item: any, include: any) {
    const newItem = { ...item };
    const tableMap: Record<string, string> = {
      usuario: "Usuario",
      aprobadoPor: "Usuario",
      propietario: "Usuario",
      solicitante: "Usuario",
      conjunto: "Conjunto",
      unidad: "Unidad",
      parqueadero: "Parqueadero",
      vehiculo: "Vehiculo",
      reserva: "Reserva",
      mascota: "Mascota"
    };

    for (const relation of Object.keys(include)) {
      const targetTable = tableMap[relation];
      if (!targetTable) continue;

      const foreignKey = `${relation}Id`;
      const idToFetch = newItem[foreignKey] || (relation === 'usuario' ? newItem['usuarioId'] : null);
      
      if (idToFetch) {
        try {
          const res = await pool.query(`SELECT * FROM "${targetTable}" WHERE id = $1`, [idToFetch]);
          let relatedItem = res.rows[0] || null;
          
          if (relatedItem && typeof include[relation] === 'object' && include[relation].select) {
             const selectedFields = include[relation].select;
             const filtered: any = {};
             Object.keys(selectedFields).forEach(f => {
               if (selectedFields[f]) filtered[f] = relatedItem[f];
             });
             relatedItem = filtered;
          }
          newItem[relation] = relatedItem;
        } catch (e) { newItem[relation] = null; }
      } else { newItem[relation] = null; }
    }
    return newItem;
  }

  async create(args: any) {
    const data = { ...args.data };
    if (!data.id) data.id = `${this.tableName.toLowerCase().substring(0, 2)}_${Math.random().toString(36).substring(2, 11)}`;
    if (!data.creadoEn) data.creadoEn = new Date();
    if (!data.actualizadoEn) data.actualizadoEn = new Date();

    const columns = Object.keys(data).map(c => `"${c}"`).join(", ");
    const placeholders = Object.keys(data).map((_, i) => `$${i + 1}`).join(", ");
    const values = Object.values(data);
    const res = await pool.query(`INSERT INTO "${this.tableName}" (${columns}) VALUES (${placeholders}) RETURNING *`, values);
    return res.rows[0];
  }

  async update(args: any) {
    const { where, data } = args;
    const whereKey = Object.keys(where)[0];
    const whereValue = where[whereKey];
    data.actualizadoEn = new Date();
    const setClause = Object.keys(data).map((c, i) => `"${c}" = $${i + 2}`).join(", ");
    const values = [whereValue, ...Object.values(data)];
    const res = await pool.query(`UPDATE "${this.tableName}" SET ${setClause} WHERE "${whereKey}" = $1 RETURNING *`, values);
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
  mascota: new ModelProxy("Mascota"),
  registroParqueadero: new ModelProxy("RegistroParqueadero"),
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
