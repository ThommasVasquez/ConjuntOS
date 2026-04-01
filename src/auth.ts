import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { z } from "zod";

interface GlobalWithEnv {
  DATABASE_URL?: string;
  env?: { DATABASE_URL?: string };
  __lastAuthStep?: string;
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
        const g = globalThis as unknown as GlobalWithEnv;
        try {
          const parsedCredentials = z
            .object({ email: z.string().email(), password: z.string().min(6) })
            .safeParse(credentials);

          if (parsedCredentials.success) {
            const { email, password } = parsedCredentials.data;
            const normalizedEmail = email.toLowerCase().trim();
            
            console.log("🔐 [AUTH-DIAGNOSTIC] Iniciando authorize para:", normalizedEmail);
            g.__lastAuthStep = "DIAGNOSTIC_STARTED";
            
            // 1. Detección y Fijación de DATABASE_URL en el Edge
            let dbUrl = (process.env.DATABASE_URL || "").trim();
            
            if (!dbUrl) {
                dbUrl = (g.DATABASE_URL || g.env?.DATABASE_URL || "").trim();
                g.__lastAuthStep = dbUrl ? "DB_URL_FOUND_IN_GLOBAL" : "DB_URL_NOT_FOUND_ANYWHERE";
            } else {
                g.__lastAuthStep = "DB_URL_FOUND_IN_PROCESS_ENV";
            }

            if (dbUrl) {
               (globalThis as unknown as { DATABASE_URL: string }).DATABASE_URL = dbUrl;
               if (g.env) g.env.DATABASE_URL = dbUrl;
               process.env.DATABASE_URL = dbUrl;
            }

            if (!dbUrl) {
               console.error("❌ [AUTH-DIAGNOSTIC] FALLO CRÍTICO: No se encuentra DATABASE_URL en authorize.");
               return null;
            }

            // 2. Importar DB tras fijar la URL
            const { default: db } = await import("@/lib/db");
            g.__lastAuthStep = "DB_MODULE_IMPORTED";
            
            try {
              // Buscar usuario
              const userRes = await db.usuario.findUnique({ 
                where: { email: normalizedEmail } 
              });
              
              const user = userRes as { 
                id: string; 
                nombre: string; 
                email: string; 
                rol: string; 
                password?: string;
              } | null;

              g.__lastAuthStep = user ? "USER_FOUND_IN_DB" : "USER_NOT_FOUND_IN_DB";
              console.log("🔍 [AUTH-DIAGNOSTIC] Resultado búsqueda usuario:", user ? "ENCONTRADO" : "NO ENCONTRADO");
              
              // BOOTSTRAP: Si es el usuario maestro y no existe en la DB, lo creamos
              if (!user && normalizedEmail === "thommy@example.com") {
                console.log("🛠️ [AUTH-DIAGNOSTIC] BOOTSTRAP: Master user no encontrado. Intentando crear...");
                g.__lastAuthStep = "BOOTSTRAP_START";
                
                try {
                  let conjunto = await db.conjunto.findFirst();
                  if (!conjunto) {
                    conjunto = await db.conjunto.create({
                      data: {
                        nombre: "Residencial Horizonte",
                        subdominio: "demo",
                        direccion: "Calle Digital 101",
                        ciudad: "Nube"
                      }
                    });
                  }

                  const newUser = await db.usuario.create({
                    data: {
                      id: "master_thommy",
                      nombre: "ThommyEnergy",
                      email: "thommy@example.com",
                      rol: "SUPER_ADMIN",
                      password: "Md5891129Ae$",
                      conjuntoId: conjunto.id,
                      genero: "femenino",
                      activo: true
                    }
                  });
                  g.__lastAuthStep = "BOOTSTRAP_SUCCESS";
                  return {
                    id: newUser.id,
                    name: newUser.nombre,
                    email: newUser.email,
                    role: newUser.rol,
                  };
                } catch (bootstrapError) {
                  g.__lastAuthStep = `BOOTSTRAP_ERROR: ${bootstrapError instanceof Error ? bootstrapError.message : "unknown"}`;
                  console.error("🔥 [AUTH-DIAGNOSTIC] Error en Bootstrap:", bootstrapError);
                }
              }

              if (!user) return null;

              // 3. Validar password
              const dbPassword = (user.password || "").trim();
              const inputPassword = password.trim();
              const isPasswordMatch = inputPassword === dbPassword;
              
              g.__lastAuthStep = isPasswordMatch ? "PASSWORD_MATCH_SUCCESS" : `PASSWORD_MISMATCH (Input:${inputPassword.length}, DB:${dbPassword.length})`;

              if (!isPasswordMatch) {
                console.warn("⚠️ [AUTH-DIAGNOSTIC] Login fallido: Las contraseñas no coinciden para:", normalizedEmail);
                return null;
              }

              console.log("✅ [AUTH-DIAGNOSTIC] Login exitoso para:", normalizedEmail);
              g.__lastAuthStep = "LOGIN_SUCCESS_READY_TO_RETURN";
              return {
                id: user.id,
                name: user.nombre,
                email: user.email,
                role: user.rol,
              };

            } catch (dbError) {
               console.error("🔥 [AUTH-DIAGNOSTIC] Error al consultar la DB:", dbError);
               g.__lastAuthStep = `DB_QUERY_ERROR: ${dbError instanceof Error ? dbError.message : "unknown"}`;
               return null;
            }
          } else {
            g.__lastAuthStep = "ZOD_VALIDATION_FAILED";
            return null;
          }
        } catch (error) {
          console.error("🔥 [AUTH-DIAGNOSTIC] CRÍTICO: Error en authorize:", error);
          g.__lastAuthStep = `GLOBAL_AUTHORIZE_ERROR: ${error instanceof Error ? error.message : "unknown"}`;
          return null;
        }
      },
    }),
  ],
  debug: true,
  logger: {
    error: (code, ...args) => console.error(`❌ [AUTH-EVENT-ERROR] ${code}:`, ...args),
    warn: (code, ...args) => console.warn(`⚠️ [AUTH-EVENT-WARN] ${code}:`, ...args),
    debug: (code, ...args) => console.log(`🔍 [AUTH-EVENT-DEBUG] ${code}:`, ...args),
  }
});
