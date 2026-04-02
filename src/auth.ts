import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { z } from "zod";
import { Pool, neonConfig } from "@neondatabase/serverless";

interface GlobalWithEnv {
  DATABASE_URL?: string;
  env?: { DATABASE_URL?: string };
  __lastAuthStep?: string;
}

interface AuthUser {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  password?: string;
  conjuntoId?: string;
}

// Función auxiliar para loguear en la DB de forma persistente (Raw SQL)
async function persistentLog(step: string, details: string = "", email: string = "") {
  try {
     const g = globalThis as unknown as GlobalWithEnv;
     const dbUrl = (process.env.DATABASE_URL || g.DATABASE_URL || g.env?.DATABASE_URL || "").trim();
     if (!dbUrl) return;

     // Escapar % si es necesario para el driver
     let sanitized = dbUrl;
     if (sanitized.includes(":") && !sanitized.includes("%25")) {
        const parts = sanitized.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.+)(@.+)$/);
        if (parts) {
          const [, protocol, user, password, rest] = parts;
          sanitized = `${protocol}${user}:${password.replace(/%/g, "%25")}${rest}`;
        }
     }

     neonConfig.useSecureWebSocket = false;
     const pool = new Pool({ connectionString: sanitized, ssl: { rejectUnauthorized: false } });
     
     await pool.query(
       'INSERT INTO "AuthDebug" (id, email, step, details) VALUES ($1, $2, $3, $4)', 
       [Math.random().toString(36).substring(7), email, step, details]
     );
     await pool.end();
  } catch (e) {
    console.error("❌ Error escribiendo log persistente:", e);
  }
}

export const { auth, signIn, signOut, handlers } = NextAuth({
  ...authConfig,
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  session: { 
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 días
  },
  providers: [
    Credentials({
      async authorize(credentials) {
        const emailInput = (credentials?.email as string) || "unknown";
        
        try {
          await persistentLog("AUTHORIZE_STARTED", "Iniciando validación de credenciales", emailInput);
          
          const parsedCredentials = z
            .object({ email: z.string().email(), password: z.string().min(6) })
            .safeParse(credentials);

          if (!parsedCredentials.success) {
            await persistentLog("ZOD_VALIDATION_FAILED", JSON.stringify(parsedCredentials.error.format()), emailInput);
            return null;
          }

          const { email, password } = parsedCredentials.data;
          const normalizedEmail = email.toLowerCase().trim();
          
          function sanitizeUrl(baseUrl: string): string {
            if (!baseUrl) return "";
            try {
              const raw = baseUrl.trim();
              const asHttp = raw.replace(/^(postgres(?:ql)?):\/\//, "http://");
              const parsed = new URL(asHttp);
              
              let password = parsed.password;
              if (password && !password.includes("%25")) {
                password = password.replace(/%/g, "%25");
              }
              
              const protocol = raw.startsWith("postgresql") ? "postgresql://" : "postgres://";
              const user = parsed.username;
              const host = parsed.host;
              const path = parsed.pathname;
              const search = parsed.search;
              
              return `${protocol}${user}:${password}@${host}${path}${search}`;
            } catch { return baseUrl; }
          }

          async function findConnectionString(): Promise<string> {
            const g = globalThis as { DATABASE_URL?: string; env?: { DATABASE_URL?: string } };
            
            // 1. Prioridad: Global seteado manualmente
            if (g.DATABASE_URL) return sanitizeUrl(g.DATABASE_URL.trim());
            
            // 2. Prioridad: Contexto de Cloudflare (RequestContext)
            try {
              const { getRequestContext: getCtx } = await import("@cloudflare/next-on-pages");
              const ctx = getCtx();
              const env = ctx?.env as { DATABASE_URL?: string };
              if (env?.DATABASE_URL) {
                 return sanitizeUrl(env.DATABASE_URL.trim());
              }
            } catch { /* No Request Context / Context not available */ }

            // 3. Prioridad: process.env (Variable de entorno estándar)
            if (process.env.DATABASE_URL) {
               return sanitizeUrl(process.env.DATABASE_URL.trim());
            }
            
            if (g.env?.DATABASE_URL) return sanitizeUrl(g.env.DATABASE_URL.trim());
            
            return "";
          }

          const dbUrl = await findConnectionString();

          if (dbUrl) {
               (globalThis as { DATABASE_URL?: string }).DATABASE_URL = dbUrl;
               process.env.DATABASE_URL = dbUrl;
          } else {
               await persistentLog("DATABASE_URL_MISSING", "No se encontró URL de conexión en ningún contexto", normalizedEmail);
               return null;
          }

          // 2. Importar DB
          const { default: db } = await import("@/lib/db");
          await persistentLog("PRISMA_CLIENT_READY", "Módulo DB cargado", normalizedEmail);
          
          try {
              const userRes = await db.usuario.findUnique({ 
                where: { email: normalizedEmail } as unknown as { email: string }
              });
              
              if (!userRes) {
                await persistentLog("USER_NOT_FOUND", "Usuario no existe en la base de datos", normalizedEmail);
                
                // BOOTSTRAP AUTO-RECOVERY
                if (normalizedEmail === "thommy@example.com") {
                   await persistentLog("BOOTSTRAP_TRIGGERED", "Intentando auto-creación del master", normalizedEmail);
                   try {
                     const conjunto = await db.conjunto.findFirst() || await db.conjunto.create({
                       data: { id: 'demo_id', nombre: 'Residencial Horizonte', subdominio: 'demo', direccion: 'Digital', ciudad: 'Nube' }
                     });
                     const newUser = await db.usuario.create({
                       data: { email: "thommy@example.com", password: "Md5891129Ae$", rol: "SUPER_ADMIN", conjuntoId: conjunto.id, nombre: "Thommy" }
                     });
                     await persistentLog("BOOTSTRAP_SUCCESS", "Usuario maestro creado con éxito", normalizedEmail);
                     return { id: newUser.id, name: newUser.nombre, email: newUser.email, role: newUser.rol };
                   } catch (err) {
                      await persistentLog("BOOTSTRAP_FAILED", (err as Error).message, normalizedEmail);
                   }
                }
                return null;
              }

              const user = userRes as unknown as AuthUser;
              await persistentLog("USER_FETCHED", `Usuario encontrado: ${user.nombre}`, normalizedEmail);

              // 3. Validar password
              const dbPassword = (user.password || "").trim();
              const inputPassword = password.trim();
              const isPasswordMatch = inputPassword === dbPassword;
              
              if (!isPasswordMatch) {
                await persistentLog("PASSWORD_MISMATCH", `InpLen: ${inputPassword.length}, DbLen: ${dbPassword.length}`, normalizedEmail);
                return null;
              }

              await persistentLog("LOGIN_SUCCESS", "Credenciales válidas, retornando usuario", normalizedEmail);
              return { id: user.id, name: user.nombre, email: user.email, role: user.rol };

          } catch (dbError) {
             await persistentLog("DB_QUERY_ERROR", (dbError as Error).message, normalizedEmail);
             return null;
          }
        } catch (error) {
          await persistentLog("CRITICAL_AUTHORIZE_ERROR", (error as Error).message, emailInput);
          return null;
        }
      },
    }),
  ],
  debug: true,
  logger: {
    error: (code, ...args) => console.error(`❌ [AUTH-EVENT-ERROR] ${code}:`, ...args),
  }
});
