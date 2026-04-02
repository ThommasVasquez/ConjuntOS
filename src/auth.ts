import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { z } from "zod";
import { Pool, neonConfig } from "@neondatabase/serverless";

// Función auxiliar para loguear en la DB de forma persistente (Raw SQL)
async function persistentLog(step: string, details: string = "", email: string = "") {
  try {
     const { discoverUrl } = await import("@/lib/db");
     const dbUrl = await discoverUrl();
     if (!dbUrl) return;

     // Configuración de Neon Serverless
     neonConfig.useSecureWebSocket = false;
     const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
     
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
            .object({ 
              email: z.string().email(), 
              password: z.string().min(6),
              dbUrl: z.string().optional() 
            })
            .safeParse(credentials);

          if (!parsedCredentials.success) {
            await persistentLog("ZOD_VALIDATION_FAILED", JSON.stringify(parsedCredentials.error.format()), emailInput);
            return null;
          }

          const { email, password, dbUrl: credDbUrl } = parsedCredentials.data;
          const normalizedEmail = email.toLowerCase().trim();
          
          // 1. Descubrimiento e inyección centralizada (Prioridad total a la URL pasada en el objeto)
          const { discoverUrl, setConnectionString } = await import("@/lib/db");
          const dbUrl = credDbUrl || await discoverUrl();
          
          if (dbUrl) {
               setConnectionString(dbUrl);
          } else {
               await persistentLog("DATABASE_URL_MISSING", "No se encontró cadena de conexión", normalizedEmail);
               return null;
          }
          
          await persistentLog("PRISMA_CLIENT_READY", "Módulo DB cargado", normalizedEmail);
          
          try {
                // FALLBACK DE EMERGENCIA: Usar Pool directamente si Prisma falla
                neonConfig.useSecureWebSocket = false;
                const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
                
                let rows: Record<string, unknown>[] = [];
                try {
                  // Intento 1: PascalCase (Estándar Prisma)
                  const res = await pool.query(
                    'SELECT id, email, password, rol, nombre, "conjuntoId" FROM "Usuario" WHERE LOWER(email) = $1 LIMIT 1',
                    [normalizedEmail]
                  );
                  rows = res.rows;
                } catch {
                  // Intento 2: lowercase (Estándar Postgres tradicional)
                  const res = await pool.query(
                    'SELECT id, email, password, rol, nombre, "conjuntoId" FROM usuario WHERE LOWER(email) = $1 LIMIT 1',
                    [normalizedEmail]
                  );
                  rows = res.rows;
                }
                await pool.end();
                
                const user = rows[0] as { id: string; email: string; password?: string; rol: string; nombre: string; conjuntoId?: string } | null;
                
                // 2. Si no existe y es el master, creamos/buscamos vía Prisma (o fallamos elegantemente)
                if (!user && normalizedEmail === "thommy@example.com") {
                   await persistentLog("BOOTSTRAP_TRIGGERED", "Usuario master no encontrado en Pool, intentando bootstrap vía Prisma", normalizedEmail);
                   try {
                     const { default: db } = await import("@/lib/db");
                     const conjunto = await (await db.conjunto).findFirst() || await (await db.conjunto).create({
                       data: { id: 'demo_id', nombre: 'Residencial Horizonte', subdominio: 'demo', direccion: 'Digital', ciudad: 'Nube' }
                     });
                     const newUser = await (await db.usuario).create({
                       data: { email: "thommy@example.com", password: "Md5891129Ae$", rol: "SUPER_ADMIN", conjuntoId: conjunto.id, nombre: "Thommy" }
                     });
                     await persistentLog("BOOTSTRAP_SUCCESS", "Usuario maestro creado con éxito", normalizedEmail);
                     return { id: newUser.id, name: newUser.nombre, email: newUser.email, role: newUser.rol };
                   } catch (err) {
                      await persistentLog("BOOTSTRAP_FAILED", (err as Error).message, normalizedEmail);
                   }
                }

                if (!user) {
                  await persistentLog("USER_NOT_FOUND", "Usuario no existe en la base de datos", normalizedEmail);
                  return null;
                }

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
