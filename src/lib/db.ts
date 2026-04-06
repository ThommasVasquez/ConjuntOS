import { neon } from "@neondatabase/serverless";
import { PrismaClient } from "@prisma/client";

export const runtime = "edge";

const NEON_URL = "postgresql://neondb_owner:Md5891129Ae%23%241129@ep-small-night-a5qgq9x4.us-east-2.aws.neon.tech/neondb?sslmode=require";

// ESTRATEGIA DE CONEXIÓN (v30.0)
// Forzamos Neon Edge vía HTTP Fetch para evitar errores DNS de Supabase y Handshakes WebSocket.
const getStableUrl = () => {
  const envUrl = (process.env.DATABASE_URL || "").trim();
  // Bypass Nuclear: Si detectamos Supabase o falta de URL, forzamos Neon.
  const isSupabase = envUrl.includes("supabase.com") || envUrl.includes("pooler");
  const baseUrl = (!envUrl || isSupabase || !envUrl.includes("neon.tech"))
    ? NEON_URL
    : envUrl;
  
  // Limpieza de parámetros para asegurar compatibilidad con HTTP driver
  return baseUrl.split('?')[0] + "?sslmode=require";
};

const url = getStableUrl();

// Cliente HTTP Fetch (Estable en Cloudflare)
const sql = neon(url);

// GLOBAL ERROR TRACKER
declare global {
  var __DB_LAST_ERROR__: any;
}

const logError = (table: string, method: string, e: any, query: string, params: any) => {
  const errorObj = {
    table, method, error: e.message, 
    driver: "neon-http-fetch",
    host: url.split('@')[1]?.split('?')[0] || "unknown",
    at: new Date().toISOString()
  };
  globalThis.__DB_LAST_ERROR__ = errorObj;
  console.error(`❌ DB_TRACE [${table}.${method}]:`, errorObj.error);
};

/**
 * SHADOW PRISMA CLIENT (v31.0)
 * Auth Probe: Sonda técnica para identificar variancia de contraseña en Neon.
 */
class ModelProxy {
  constructor(private tableName: string) {}

  private buildWhere(where: any = {}) {
    const keys = Object.keys(where);
    if (keys.length === 0) return { sql: "", params: [] };

    const params: any[] = [];
    const clauses = keys.map((k) => {
      const val = where[k];
      if (val !== null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
        const op = Object.keys(val)[0];
        const opMap: any = { gte: '>=', lte: '<=', gt: '>', lt: '<', not: '!=', equals: '=' };
        if (op === 'in') {
          const inList = val[op] as any[];
          const placeholders = inList.map((_, idx) => `$${params.length + idx + 1}`).join(", ");
          params.push(...inList);
          return `"${k}" IN (${placeholders})`;
        }
        params.push(val[op]);
        return `"${k}" ${opMap[op] || '='} $${params.length}`;
      }
      params.push(val);
      if (val === null) return `"${k}" IS NULL`;
      return `"${k}" = $${params.length}`;
    });
    return { sql: ` WHERE ` + clauses.join(" AND "), params };
  }

  async findUnique(args: any) {
    const { sql: whereSql, params } = this.buildWhere(args.where);
    const query = `SELECT * FROM "${this.tableName}"${whereSql} LIMIT 1`;
    try {
      const rows = await sql.query(query, params);
      let item = rows[0] || null;
      if (item && args.include) item = await this.hydrate(item, args.include);
      if (item && args.select) {
         const filtered: any = {};
         Object.keys(args.select).forEach(f => { if (args.select[f]) filtered[f] = item[f]; });
         return filtered;
      }
      return item;
    } catch (e: any) { logError(this.tableName, "findUnique", e, query, params); throw e; }
  }

  async findFirst(args: any = {}) {
    const { sql: whereSql, params } = this.buildWhere(args.where);
    const query = `SELECT * FROM "${this.tableName}"${whereSql} LIMIT 1`;
    try {
      const rows = await sql.query(query, params);
      let item = rows[0] || null;
      if (item && args.include) item = await this.hydrate(item, args.include);
      if (item && args.select) {
         const filtered: any = {};
         Object.keys(args.select).forEach(f => { if (args.select[f]) filtered[f] = item[f]; });
         return filtered;
      }
      return item;
    } catch (e: any) { logError(this.tableName, "findFirst", e, query, params); throw e; }
  }

  async findMany(args: any = {}) {
    const { sql: whereSql, params } = this.buildWhere(args.where);
    let query = `SELECT * FROM "${this.tableName}"${whereSql}`;
    if (args.orderBy) {
      const k = Object.keys(args.orderBy)[0];
      const dir = typeof args.orderBy[k] === 'string' ? args.orderBy[k].toUpperCase() : 'DESC';
      query += ` ORDER BY "${k}" ${dir}`;
    } else { query += ` ORDER BY id DESC`; }
    if (args.take) query += ` LIMIT ${args.take}`;
    else query += ` LIMIT 200`;
    if (args.skip) query += ` OFFSET ${args.skip}`;
    try {
      const rows = await sql.query(query, params);
      let items = [...rows];
      if (items.length > 0 && args.include) items = await Promise.all(items.map(item => this.hydrate(item, args.include)));
      if (items.length > 0 && args.select) {
         items = items.map(item => {
           const filtered: any = {};
           Object.keys(args.select).forEach(f => { if (args.select[f]) filtered[f] = item[f]; });
           return filtered;
         });
      }
      return items;
    } catch (e: any) { logError(this.tableName, "findMany", e, query, params); throw e; }
  }

  async upsert(args: any) {
    const { where, update, create } = args;
    const key = Object.keys(where)[0];
    const value = where[key];
    const existing = await this.findUnique({ where: { [key]: value } });
    if (existing) return await this.update({ where: { [key]: value }, data: update });
    else return await this.create({ data: create });
  }

  async aggregate(args: any) {
    const { sql: whereSql, params } = this.buildWhere(args.where);
    const sum = args._sum || {};
    let sumClauses = Object.keys(sum).map(k => `SUM("${k}") as "${k}"`).join(", ");
    if (!sumClauses) sumClauses = "COUNT(*) as count";
    const query = `SELECT ${sumClauses} FROM "${this.tableName}"${whereSql}`;
    try {
      const rows = await sql.query(query, params);
      const result: any = rows[0] || {};
      const response: any = { _sum: {} };
      Object.keys(sum).forEach(k => { response._sum[k] = parseFloat(result[k]) || 0; });
      return response;
    } catch (e: any) { logError(this.tableName, "aggregate", e, query, params); throw e; }
  }

  private async hydrate(item: any, include: any) {
    const newItem = { ...item };
    const tableMap: Record<string, string> = {
      usuario: "Usuario", aprobadoPor: "Usuario", propietario: "Usuario", solicitante: "Usuario",
      conjunto: "Conjunto", unidad: "Unidad", parqueadero: "Parqueadero", vehiculo: "Vehiculo",
      reserva: "Reserva", mascota: "Mascota", tramite: "Tramite",
      vehiculos: "Vehiculo", mascotas: "Mascota", visitas: "Visita", tramites: "Tramite", notificaciones: "Notificacion"
    };

    for (const relation of Object.keys(include)) {
      const targetTable = tableMap[relation];
      if (!targetTable) continue;
      const isPlural = relation.endsWith('s') || ['mascotas', 'vehiculos', 'visitas', 'tramites', 'notificaciones'].includes(relation);
      
      if (isPlural) {
        const foreignKeyInTarget = `${this.tableName.toLowerCase()}Id`;
        const nestedArgs = typeof include[relation] === 'object' ? include[relation] : {};
        let q = `SELECT * FROM "${targetTable}" WHERE "${foreignKeyInTarget}" = $1`;
        const subParams = [newItem.id];
        
        if (nestedArgs.where) {
           const subWhere = this.buildWhere(nestedArgs.where);
           q += subWhere.sql.replace(" WHERE ", " AND ").split('$').map((s, i) => i === 0 ? s : (parseInt(s) + 1).toString()).join('$');
           subParams.push(...Object.values(nestedArgs.where));
        }
        if (nestedArgs.orderBy) {
           const k = Object.keys(nestedArgs.orderBy)[0];
           const d = typeof nestedArgs.orderBy[k] === 'string' ? nestedArgs.orderBy[k].toUpperCase() : 'DESC';
           q += ` ORDER BY "${k}" ${d}`;
        }
        q += ` LIMIT ${nestedArgs.take || 100}`;
        try {
          const res = await sql.query(q, subParams);
          newItem[relation] = res;
        } catch (e) { newItem[relation] = []; }
      } else {
        const foreignKeyInSource = `${relation}Id`;
        const idToFetch = newItem[foreignKeyInSource] || (relation === 'usuario' ? newItem['usuarioId'] : (relation === 'conjunto' ? newItem['conjuntoId'] : null));
        if (idToFetch) {
          try {
            const rows = await sql.query(`SELECT * FROM "${targetTable}" WHERE id = $1`, [idToFetch]);
            let relatedItem = rows[0] || null;
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
    }
    return newItem;
  }

  async create(args: any) {
    const data = { ...args.data };
    if (!data.id) data.id = `${this.tableName.toLowerCase().substring(0, 2)}_${Math.random().toString(36).substring(2, 11)}`;
    data.creadoEn = data.creadoEn || new Date();
    data.actualizadoEn = new Date();
    const columns = Object.keys(data).map(c => `"${c}"`).join(", ");
    const placeholders = Object.keys(data).map((_, i) => `$${i + 1}`).join(", ");
    const values = Object.values(data);
    const q = `INSERT INTO "${this.tableName}" (${columns}) VALUES (${placeholders}) RETURNING *`;
    try {
      const rows = await sql.query(q, values);
      return rows[0];
    } catch (e: any) { logError(this.tableName, "create", e, q, values); throw e; }
  }

  async update(args: any) {
    const { where, data } = args;
    const whereKey = Object.keys(where)[0];
    const whereValue = where[whereKey];
    data.actualizadoEn = new Date();
    const setClause = Object.keys(data).map((c, i) => `"${c}" = $${i + 2}`).join(", ");
    const values = [whereValue, ...Object.values(data)];
    const q = `UPDATE "${this.tableName}" SET ${setClause} WHERE "${whereKey}" = $1 RETURNING *`;
    try {
      const rows = await sql.query(q, values);
      return rows[0];
    } catch (e: any) { logError(this.tableName, "update", e, q, values); throw e; }
  }

  async count(args: any = {}) {
    const { sql: whereSql, params } = this.buildWhere(args.where);
    const query = `SELECT COUNT(*) FROM "${this.tableName}"${whereSql}`;
    try {
      const rows = await sql.query(query, params);
      return parseInt((rows[0] as any).count);
    } catch (e: any) { logError(this.tableName, "count", e, query, params); throw e; }
  }
}

const db: any = {
  usuario: new ModelProxy("Usuario"), tramite: new ModelProxy("Tramite"),
  notificacion: new ModelProxy("Notificacion"), conjunto: new ModelProxy("Conjunto"),
  unidad: new ModelProxy("Unidad"), vehiculo: new ModelProxy("Vehiculo"),
  parqueadero: new ModelProxy("Parqueadero"), mascota: new ModelProxy("Mascota"),
  registroParqueadero: new ModelProxy("RegistroParqueadero"), anuncio: new ModelProxy("Anuncio"),
  areaComun: new ModelProxy("AreaComun"), reserva: new ModelProxy("Reserva"),
  solicitudServicio: new ModelProxy("SolicitudServicio"), pago: new ModelProxy("Pago"),
  gasto: new ModelProxy("Gasto"), local: new ModelProxy("Local"),
  inmueble: new ModelProxy("Inmueble"), junta: new ModelProxy("Junta"),
  visita: new ModelProxy("Visita"), paquete: new ModelProxy("Paquete"),
  rondaParqueadero: new ModelProxy("RondaParqueadero"),
  $connect: async () => {},
  $disconnect: async () => {},
  getLastError: () => globalThis.__DB_LAST_ERROR__,
  $queryRawUnsafe: async (qStr: string, ...vals: any[]) => {
    try { return await sql.query(qStr, vals); }
    catch (e: any) { logError("RAW", "queryRaw", e, qStr, vals); throw e; }
  }
};

export default db;
export const discoverUrl = async () => url;
export { PrismaClient };
