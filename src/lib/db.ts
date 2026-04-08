import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const runtime = "edge";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://zudntuczwfhmyqgzcvrc.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_secret_lzaYy86aeMAavECzFrBXww_RNjdfv2b";

// CLIENTE SUPABASE (Estable en Cloudflare Edge)
const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }
});

// GLOBAL ERROR TRACKER
declare global {
  var __DB_LAST_ERROR__: any;
}

const logError = (table: string, method: string, e: any) => {
  const errorObj = {
    table, method, 
    error: e?.message || String(e),
    details: e?.details || null,
    hint: e?.hint || null,
    code: e?.code || "UNKNOWN",
    driver: "supabase-js",
    at: new Date().toISOString()
  };
  globalThis.__DB_LAST_ERROR__ = errorObj;
  console.error(`❌ DB_TRACE [${table}.${method}]:`, errorObj.error, errorObj.details, errorObj.hint);
};

/**
 * SHADOW PRISMA CLIENT (v32.0 - Supabase Native)
 * Simula la interfaz de Prisma pero usa Supabase JS Client internamente.
 */
class ModelProxy {
  constructor(private tableName: string) {}

  private async hydrate(item: any, include: any) {
    if (!item) return null;
    const newItem = { ...item };
    const tableMap: Record<string, string> = {
      usuario: "Usuario", a_usuario: "Usuario", aprobadoPor: "Usuario", propietario: "Usuario", solicitante: "Usuario",
      conjunto: "Conjunto", unidad: "Unidad", parqueadero: "Parqueadero", vehiculo: "Vehiculo",
      reserva: "Reserva", mascota: "Mascota", tramite: "Tramite", pago: "Pago", reciboPublico: "ReciboPublico",
      area: "AreaComun", areaComun: "AreaComun",
      vehiculos: "Vehiculo", mascotas: "Mascota", visitas: "Visita", tramites: "Tramite", notificaciones: "Notificacion", pagos: "Pago", recibos: "ReciboPublico"
    };

    for (const relation of Object.keys(include)) {
      const targetTable = tableMap[relation];
      if (!targetTable) {
        console.warn(`[DB-PROXY]: Skipping unknown relation '${relation}'`);
        continue;
      }
      
      const isPlural = relation.endsWith('s') || ['mascotas', 'vehiculos', 'visitas', 'tramites', 'notificaciones'].includes(relation);
      
      try {
        if (isPlural) {
          const foreignKeyInTarget = `${this.tableName.toLowerCase()}Id`;
          const nestedArgs = typeof include[relation] === 'object' ? include[relation] : {};
          
          let query = supabase.from(targetTable).select("*").eq(foreignKeyInTarget, newItem.id);
          
          if (nestedArgs.where) {
            Object.keys(nestedArgs.where).forEach(key => {
              const val = nestedArgs.where[key];
              if (val !== undefined) query = query.eq(key, val);
            });
          }
          
          if (nestedArgs.orderBy) {
            const k = Object.keys(nestedArgs.orderBy)[0];
            const desc = nestedArgs.orderBy[k] === 'desc';
            query = query.order(k, { ascending: !desc });
          }
          
          const { data, error } = await query.limit(nestedArgs.take || 100);
          newItem[relation] = error ? [] : data;
        } else {
          const foreignKeyInSource = `${relation}Id`;
          const idToFetch = newItem[foreignKeyInSource] || 
                           (relation === 'usuario' ? newItem['usuarioId'] : 
                           (relation === 'conjunto' ? newItem['conjuntoId'] : null));
                           
          if (idToFetch) {
            const { data, error } = await supabase.from(targetTable).select("*").eq("id", idToFetch).maybeSingle();
            let relatedItem = data;
            
            if (relatedItem && typeof include[relation] === 'object' && include[relation].select) {
               const selectFields = include[relation].select;
               const filtered: any = {};
               Object.keys(selectFields).forEach(f => { if (selectFields[f]) filtered[f] = relatedItem[f]; });
               relatedItem = filtered;
            }
            newItem[relation] = relatedItem;
          } else { 
            newItem[relation] = null; 
          }
        }
      } catch (e) {
        console.warn(`⚠️ Hydration failure on ${targetTable} for ${relation}:`, e);
        newItem[relation] = isPlural ? [] : null;
      }
    }
    return newItem;
  }

  private applyFilters(query: any, where: any) {
    if (!where) return query;
    
    let currentQuery = query;
    Object.keys(where).forEach(key => {
      const val = where[key];
      if (val === undefined) return;

      if (key === 'OR' && Array.isArray(val)) {
        // Simple OR implementation for Supabase: .or('col1.eq.val1,col2.eq.val2')
        const orConditions = val.map(cond => {
          const k = Object.keys(cond)[0];
          const v = cond[k];
          if (typeof v === 'object') {
            const op = Object.keys(v)[0];
            const innerVal = v[op];
            return `${k}.${op}.${innerVal}`;
          }
          return `${k}.eq.${v}`;
        }).join(',');
        currentQuery = currentQuery.or(orConditions);
      } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        Object.keys(val).forEach(op => {
          const innerVal = val[op];
          if (op === 'gte') currentQuery = currentQuery.gte(key, innerVal);
          else if (op === 'lte') currentQuery = currentQuery.lte(key, innerVal);
          else if (op === 'gt') currentQuery = currentQuery.gt(key, innerVal);
          else if (op === 'lt') currentQuery = currentQuery.lt(key, innerVal);
          else if (op === 'not') currentQuery = currentQuery.neq(key, innerVal);
          else if (op === 'in') currentQuery = currentQuery.in(key, Array.isArray(innerVal) ? innerVal : [innerVal]);
        });
      } else {
        currentQuery = currentQuery.eq(key, val);
      }
    });
    return currentQuery;
  }

  async findUnique(args: any) {
    try {
      let query = supabase.from(this.tableName).select("*");
      query = this.applyFilters(query, args.where);
      const { data, error } = await query.maybeSingle();

      if (error) throw error;
      let item = data;
      if (item && args.include) item = await this.hydrate(item, args.include);
      if (item && args.select) {
        const filtered: any = {};
        Object.keys(args.select).forEach(f => { if (args.select[f]) filtered[f] = item[f]; });
        return filtered;
      }
      return item;
    } catch (e: any) { logError(this.tableName, "findUnique", e); throw e; }
  }

  async findFirst(args: any = {}) {
    try {
      let query = supabase.from(this.tableName).select("*");
      query = this.applyFilters(query, args.where);
      const { data, error } = await query.limit(1).maybeSingle();

      if (error) throw error;
      let item = data;
      if (item && args.include) item = await this.hydrate(item, args.include);
      if (item && args.select) {
        const filtered: any = {};
        Object.keys(args.select).forEach(f => { if (args.select[f]) filtered[f] = item[f]; });
        return filtered;
      }
      return item;
    } catch (e: any) { logError(this.tableName, "findFirst", e); throw e; }
  }

  async findMany(args: any = {}) {
    try {
      let query = supabase.from(this.tableName).select("*");
      
      if (args.where) {
        query = this.applyFilters(query, args.where);
      }

      if (args.orderBy) {
        const k = Object.keys(args.orderBy)[0];
        const desc = args.orderBy[k] === 'desc';
        query = query.order(k, { ascending: !desc });
      } else {
        query = query.order('id', { ascending: false });
      }

      if (args.take) query = query.limit(args.take);
      else query = query.limit(200);

      if (args.skip) {
        // Supabase uses range for skip/take
        const from = args.skip;
        const to = from + (args.take || 200) - 1;
        query = query.range(from, to);
      }

      const { data, error } = await query;
      if (error) throw error;

      let items = data || [];
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
    } catch (e: any) { logError(this.tableName, "findMany", e); throw e; }
  }

  async upsert(args: any) {
    const { where, update, create } = args;
    const key = Object.keys(where)[0];
    const value = where[key];
    const existing = await this.findUnique({ where: { [key]: value } });
    if (existing) return await this.update({ where: { [key]: value }, data: update });
    else return await this.create({ data: create });
  }

  async count(args: any = {}) {
    try {
      let query = supabase.from(this.tableName).select('*', { count: 'exact', head: true });
      if (args.where) query = this.applyFilters(query, args.where);
      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    } catch (e: any) { logError(this.tableName, "count", e); throw e; }
  }

  async create(args: any) {
    try {
      const data = { ...args.data };
      // Unified ID generation (matching cuid-like patterns used previously)
      if (!data.id) {
        data.id = `cl${Math.random().toString(36).substring(2, 11)}`;
      }
      
      // Only add timestamps if the table supports them according to schema.prisma
      const tablesWithTimestamps = ["Reserva", "Tramite", "Inmueble", "Conjunto", "Usuario", "Notificacion", "Visita", "Vehiculo", "Mascota", "Parqueadero"];
      const tablesWithUpdated = ["Tramite", "Inmueble"];

      if (tablesWithTimestamps.includes(this.tableName)) {
        data.creadoEn = data.creadoEn || new Date().toISOString();
      }
      
      if (tablesWithUpdated.includes(this.tableName)) {
        data.actualizadoEn = new Date().toISOString();
      }

      const { data: created, error } = await supabase
        .from(this.tableName)
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return created;
    } catch (e: any) { logError(this.tableName, "create", e); throw e; }
  }

  async update(args: any) {
    try {
      const data = { ...args.data };
      
      // Only update 'actualizadoEn' for tables that support it
      const tablesWithUpdated = ["Tramite", "Inmueble"];
      if (tablesWithUpdated.includes(this.tableName)) {
        data.actualizadoEn = new Date().toISOString();
      }

      const { data: updated, error } = await supabase
        .from(this.tableName)
        .update(data)
        .match(args.where)
        .select()
        .single();

      if (error) throw error;
      return updated;
    } catch (e: any) { logError(this.tableName, "update", e); throw e; }
  }

  async createMany(args: any) {
    try {
      const dataArr = Array.isArray(args.data) ? args.data : [args.data];
      const items = dataArr.map((item: any) => {
        const data = { ...item };
        if (!data.id) data.id = `cl${Math.random().toString(36).substring(2, 11)}`;
        return data;
      });

      const { data, error } = await supabase
        .from(this.tableName)
        .insert(items)
        .select();

      if (error) throw error;
      return { count: data?.length || 0 };
    } catch (e: any) { logError(this.tableName, "createMany", e); throw e; }
  }

  async aggregate(args: any) {
    // Basic implementation for sum/count
    try {
      if (args._sum) {
        const fieldStr = Object.keys(args._sum)[0];
        const { data, error } = await supabase.from(this.tableName).select(fieldStr).match(args.where || {});
        if (error) throw error;
        const total = (data || []).reduce((acc: number, curr: any) => acc + (parseFloat(curr[fieldStr]) || 0), 0);
        return { _sum: { [fieldStr]: total } };
      }
      return { _sum: {} };
    } catch (e: any) { logError(this.tableName, "aggregate", e); throw e; }
  }

  async deleteMany(args: any = {}) {
    try {
      let query = supabase.from(this.tableName).delete();
      if (args.where) {
        // Handle 'in' operator for Concepto or IDs
        for (const key of Object.keys(args.where)) {
          const val = args.where[key];
          if (typeof val === 'object' && val.in) {
            query = query.in(key, val.in);
          } else {
            query = query.eq(key, val);
          }
        }
      }
      const { data, error } = await query.select();
      if (error) throw error;
      return { count: data?.length || 0 };
    } catch (e: any) { logError(this.tableName, "deleteMany", e); throw e; }
  }
}

// Singleton cache for model proxies to save CPU/Memory on Cloudflare Edge
const proxyCache: Record<string, ModelProxy> = {};

const getModel = (name: string) => {
  if (!proxyCache[name]) proxyCache[name] = new ModelProxy(name);
  return proxyCache[name];
};

const db: any = {
  usuario: getModel("Usuario"),
  tramite: getModel("Tramite"),
  notificacion: getModel("Notificacion"),
  conjunto: getModel("Conjunto"),
  unidad: getModel("Unidad"),
  vehiculo: getModel("Vehiculo"),
  parqueadero: getModel("Parqueadero"),
  mascota: getModel("Mascota"),
  registroParqueadero: getModel("RegistroParqueadero"),
  anuncio: getModel("Anuncio"),
  perfil: getModel("Perfil"),
  visitante: getModel("Visitante"),
  visita: getModel("Visita"),
  paquete: getModel("Paquete"),
  areaComun: getModel("AreaComun"),
  reserva: getModel("Reserva"),
  pago: getModel("Pago"),
  reciboPublico: getModel("ReciboPublico"),
  getLastError: () => globalThis.__DB_LAST_ERROR__,
};

export default db;
export const discoverUrl = async () => SUPABASE_URL;
export { supabase };
