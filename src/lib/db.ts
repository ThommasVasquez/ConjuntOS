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
 * SHADOW PRISMA CLIENT (v21.0)
 * Full Mock Support: Implementado 'aggregate' (_sum), 'count' con filtros y expansión total de modelos.
 */
class ModelProxy {
  constructor(private tableName: string) {}

  async findUnique(args: any) {
    const where = args.where;
    const key = Object.keys(where)[0];
    const value = where[key];
    const query = `SELECT * FROM "${this.tableName}" WHERE "${key}" = $1 LIMIT 1`;
    const res = await pool.query(query, [value]);
    let item = res.rows[0] || null;
    
    if (item && args.include) {
      item = await this.hydrate(item, args.include);
    }
    
    // Aplicar select si existe (incluso tras hidratación)
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
    const keys = Object.keys(where);
    const values = Object.values(where);
    
    if (keys.length > 0) {
      query += ` WHERE ` + keys.map((k, i) => `"${k}" = $${i + 1}`).join(" AND ");
    }
    
    query += ` LIMIT 1`;
    const res = await pool.query(query, values);
    let item = res.rows[0] || null;

    if (item && args.include) {
      item = await this.hydrate(item, args.include);
    }
    
    if (item && args.select) {
       const filtered: any = {};
       Object.keys(args.select).forEach(f => { if (args.select[f]) filtered[f] = item[f]; });
       return filtered;
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
      // Manejar orderBy objeto (asc/desc)
      const orderVal = args.orderBy[orderKey];
      const orderDir = typeof orderVal === 'string' ? orderVal.toUpperCase() : 'DESC';
      query += ` ORDER BY "${orderKey}" ${orderDir}`;
    } else {
      query += ` ORDER BY id DESC`; 
    }
    
    if (args.take) query += ` LIMIT ${args.take}`;
    else query += ` LIMIT 200`;
    
    const res = await pool.query(query, values);
    let items = res.rows;

    if (items.length > 0 && args.include) {
      items = await Promise.all(items.map(item => this.hydrate(item, args.include)));
    }

    if (items.length > 0 && args.select) {
       items = items.map(item => {
         const filtered: any = {};
         Object.keys(args.select).forEach(f => { if (args.select[f]) filtered[f] = item[f]; });
         return filtered;
       });
    }
    return items;
  }

  async upsert(args: any) {
    const { where, update, create } = args;
    const key = Object.keys(where)[0];
    const value = where[key];
    const existing = await this.findUnique({ where: { [key]: value } });
    if (existing) return await this.update({ where: { [key]: value }, data: update });
    else return await this.create({ data: create });
  }

  /**
   * MÉTODO AGGREGATE (v21):
   * Soporta _sum para sumas financieras (Recaudo, Gastos)
   */
  async aggregate(args: any) {
    const where = args.where || {};
    const sum = args._sum || {};
    const keys = Object.keys(where);
    const values = Object.values(where);
    
    let sumClauses = Object.keys(sum).map(k => `SUM("${k}") as "${k}"`).join(", ");
    if (!sumClauses) sumClauses = "COUNT(*) as count";

    let query = `SELECT ${sumClauses} FROM "${this.tableName}"`;
    if (keys.length > 0) {
      // Manejar gte/lte básicos en 'where' para fechas
      query += ` WHERE ` + keys.map((k, i) => {
         if (typeof where[k] === 'object') {
            const op = Object.keys(where[k])[0];
            const opMap: any = { gte: '>=', lte: '<=', gt: '>', lt: '<' };
            values[i] = where[k][op];
            return `"${k}" ${opMap[op] || '='} $${i + 1}`;
         }
         return `"${k}" = $${i + 1}`;
      }).join(" AND ");
    }
    
    const res = await pool.query(query, values);
    const result = res.rows[0];
    
    const response: any = { _sum: {} };
    Object.keys(sum).forEach(k => {
       response._sum[k] = parseFloat(result[k]) || 0;
    });
    return response;
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
      const idToFetch = newItem[foreignKey] || (relation === 'usuario' ? newItem['usuarioId'] : (relation === 'conjunto' ? newItem['conjuntoId'] : null));
      
      if (idToFetch) {
        try {
          const res = await pool.query(`SELECT * FROM "${targetTable}" WHERE id = $1`, [idToFetch]);
          let relatedItem = res.rows[0] || null;
          if (relatedItem && typeof include[relation] === 'object' && include[relation].select) {
             const selectedFields = include[relation].select;
             const filtered: any = {};
             Object.keys(selectedFields).forEach(f => { if (selectedFields[f]) filtered[f] = relatedItem[f]; });
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

  /**
   * COUNT FILTRADO (v21):
   * Soporta 'where' básico.
   */
  async count(args: any = {}) {
    const where = args.where || {};
    const keys = Object.keys(where);
    const values = Object.values(where);
    let query = `SELECT COUNT(*) FROM "${this.tableName}"`;
    if (keys.length > 0) {
       query += ` WHERE ` + keys.map((k, i) => `"${k}" = $${i + 1}`).join(" AND ");
    }
    const res = await pool.query(query, values);
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
  // Modelos nuevos v21
  pago: new ModelProxy("Pago"),
  gasto: new ModelProxy("Gasto"),
  local: new ModelProxy("Local"),
  inmueble: new ModelProxy("Inmueble"),
  junta: new ModelProxy("JuntaDirectiva"),
  visita: new ModelProxy("Visita"),
  paquete: new ModelProxy("Paquete"),
  rondaParqueadero: new ModelProxy("RondaParqueadero"),
  
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
