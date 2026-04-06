import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { z } from "zod";
import { Pool, neonConfig } from "@neondatabase/serverless";

// Función auxiliar para loguear en la DB de forma persistente (Raw SQL)
async function persistentLog(step: string, details: string = "", email: string = "") {
  console.log(`[AUTH-LOG] ${step}: ${details} (${email})`);
}

export const { auth, signIn, signOut, handlers } = NextAuth({
  ...authConfig,
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  trustHost: true,
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
              email: z.string().min(3), 
              password: z.string().min(6),
              dbUrl: z.string().optional() 
            })
            .safeParse(credentials);

          if (!parsedCredentials.success) {
            await persistentLog("ZOD_VALIDATION_FAILED", JSON.stringify(parsedCredentials.error.format()), emailInput);
            return null;
          }

          let email = parsedCredentials.data.email;
          const { password, dbUrl: credDbUrl } = parsedCredentials.data;
          if (!email.includes('@')) {
             email = `${email.trim()}@example.com`;
          }
          
          const normalizedEmail = email.toLowerCase().trim();
          
          // 1. Descubrimiento e inyección centralizada (Prioridad total a la URL pasada en el objeto)
          const { discoverUrl } = await import("@/lib/db");
          const dbUrl = credDbUrl || await discoverUrl();
          
          if (!dbUrl) {
               await persistentLog("DATABASE_URL_MISSING", "No se encontró cadena de conexión", normalizedEmail);
               return null;
          }
          
          await persistentLog("DB_ACCESS_INIT", "Usando Pool para validación primaria", normalizedEmail);
          
          try {
                // MÉTODO ROBUSTO: Usar Pool directamente para evitar problemas de Prisma en el Edge
                neonConfig.useSecureWebSocket = false;
                const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
                
                let rows: any[] = [];
                try {
                  const res = await pool.query(
                    'SELECT id, email, password, rol, nombre, "conjuntoId" FROM "Usuario" WHERE LOWER(email) = $1 LIMIT 1',
                    [normalizedEmail]
                  );
                  rows = res.rows;
                } catch {
                  const res = await pool.query(
                    'SELECT id, email, password, rol, nombre, "conjuntoId" FROM usuario WHERE LOWER(email) = $1 LIMIT 1',
                    [normalizedEmail]
                  );
                  rows = res.rows;
                }
                
                let user = rows[0];

                // 2. Si no existe y es uno de los usuarios DEMO, creamos/buscamos vía RAW SQL
                const demoUsers: Record<string, {rol: string, nombre: string}> = {
                  "thommy@example.com": { rol: "SUPER_ADMIN", nombre: "Thommy Master" },
                  "milo@enconjunto.com": { rol: "ADMINISTRADOR", nombre: "Milo Admin" },
                  "thommyadmin@example.com": { rol: "ADMINISTRADOR", nombre: "Thommy Admin" },
                  "thommyvigilante@example.com": { rol: "VIGILANTE", nombre: "Thommy Vigilante" },
                  "thommyestacionamientos@example.com": { rol: "ENCARGADO_PARQUEADERO", nombre: "Thommy Parqueadero" },
                  "thommyresidente@example.com": { rol: "PROPIETARIO", nombre: "Thommy Residente" },
                  "vigilante@example.com": { rol: "VIGILANTE", nombre: "Carlos Guardia" },
                  "parqueadero@example.com": { rol: "ENCARGADO_PARQUEADERO", nombre: "Luis Parking" },
                  "admin@example.com": { rol: "ADMINISTRADOR", nombre: "Marta Admin" },
                  "residente@example.com": { rol: "PROPIETARIO", nombre: "Jorge Residente" }
                };

                if (!user && demoUsers[normalizedEmail]) {
                   await persistentLog("BOOTSTRAP_TRIGGERED", "Usuario demo no encontrado, creando vía Raw SQL", normalizedEmail);
                   try {
                     // Asegurar conjunto demo_id
                     await pool.query(
                       `INSERT INTO "Conjunto" (id, nombre, subdominio, direccion, ciudad, nit) 
                        VALUES ('demo_id', 'Residencial Horizonte', 'demo', 'Digital', 'Nube', '800123456-1') 
                        ON CONFLICT (id) DO NOTHING`
                     );
                     
                     const expectedPassword = normalizedEmail.startsWith("thommy") && normalizedEmail !== "thommy@example.com" ? "Md5891129Ae$" : password.trim();
                     const userId = `u_${Math.random().toString(36).substring(7)}`;
                     
                     await pool.query(
                       `INSERT INTO "Usuario" (id, email, password, rol, "conjuntoId", nombre, activo, "creadoEn") 
                        VALUES ($1, $2, $3, $4, 'demo_id', $5, true, NOW()) 
                        ON CONFLICT (email) DO UPDATE SET password = $3`,
                       [userId, normalizedEmail, expectedPassword, demoUsers[normalizedEmail].rol, demoUsers[normalizedEmail].nombre]
                     );
                     
                     const finalRes = await pool.query('SELECT id, email, rol, nombre FROM "Usuario" WHERE email = $1', [normalizedEmail]);
                     user = finalRes.rows[0];
                   } catch (err) {
                      await persistentLog("BOOTSTRAP_FAILED", (err as Error).message, normalizedEmail);
                   }
                }

                await pool.end();

                if (!user) {
                  await persistentLog("USER_NOT_FOUND", "Usuario no existe", normalizedEmail);
                  return null;
                }

                // 3. Validar password
                const dbPassword = (user.password || "").trim();
                const inputPassword = password.trim();
                if (inputPassword !== dbPassword) {
                  await persistentLog("PASSWORD_MISMATCH", "Contraseña incorrecta", normalizedEmail);
                  return null;
                }

                await persistentLog("LOGIN_SUCCESS", "Retornando usuario", normalizedEmail);
                return { id: user.id, name: user.nombre, email: user.email, role: user.rol };

          } catch (dbError) {
             await persistentLog("DB_QUERY_ERROR", (dbError as Error).message, normalizedEmail);
             return null;
          }
        } catch (error) {
          await persistentLog("CRITICAL_ERROR", (error as Error).message, emailInput);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
  },
  debug: true,
  logger: {
    error: (code, ...args) => console.error(`❌ [AUTH-EVENT-ERROR] ${code}:`, ...args),
  }
});
