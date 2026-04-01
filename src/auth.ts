import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { z } from "zod";

interface GlobalWithEnv {
  DATABASE_URL?: string;
  env?: { DATABASE_URL?: string };
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
        try {
          const parsedCredentials = z
            .object({ email: z.string().email(), password: z.string().min(6) })
            .safeParse(credentials);

          if (parsedCredentials.success) {
            const { email, password } = parsedCredentials.data;
            const normalizedEmail = email.toLowerCase().trim();
            
            console.log("🔐 [AUTH-DIAGNOSTIC] Iniciando authorize para:", normalizedEmail);
            
            // 1. Detección y Fijación de DATABASE_URL en el Edge
            let dbUrl = (process.env.DATABASE_URL || "").trim();
            const g = globalThis as unknown as GlobalWithEnv;
            
            if (!dbUrl) {
                dbUrl = (g.DATABASE_URL || g.env?.DATABASE_URL || "").trim();
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
                conjuntoId: string;
              } | null;

              console.log("🔍 [AUTH-DIAGNOSTIC] Resultado búsqueda usuario:", user ? "ENCONTRADO" : "NO ENCONTRADO");
              
              // BOOTSTRAP: Si es el usuario maestro y no existe en la DB, lo creamos
              if (!user && normalizedEmail === "thommy@example.com") {
                console.log("🛠️ [AUTH-DIAGNOSTIC] BOOTSTRAP: Master user no encontrado. Intentando crear...");
                
                try {
                  let conjunto = await db.conjunto.findFirst();
                  if (!conjunto) {
                    console.log("🛠️ [AUTH-DIAGNOSTIC] Creando conjunto inicial...");
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
                  console.log("✅ [AUTH-DIAGNOSTIC] BOOTSTRAP: Master user creado satisfactoriamente.");
                  return {
                    id: newUser.id,
                    name: newUser.nombre,
                    email: newUser.email,
                    role: newUser.rol,
                  };
                } catch (bootstrapError) {
                  console.error("🔥 [AUTH-DIAGNOSTIC] Error en Bootstrap:", bootstrapError);
                }
              }

              if (!user) {
                console.warn("⚠️ [AUTH-DIAGNOSTIC] Login fallido: El usuario no existe en la DB:", normalizedEmail);
                return null;
              }

              // 3. Validar password
              const dbPassword = (user.password || "").trim();
              const inputPassword = password.trim();
              
              const isPasswordMatch = inputPassword === dbPassword;
              
              console.log("🔍 [AUTH-DIAGNOSTIC] Verificando password para:", user.nombre);
              console.log(`🔍 [AUTH-DIAGNOSTIC] DebuMatch: ${isPasswordMatch} | InpLen: ${inputPassword.length} | DbLen: ${dbPassword.length}`);

              if (!isPasswordMatch) {
                console.warn("⚠️ [AUTH-DIAGNOSTIC] Login fallido: Las contraseñas no coinciden para:", normalizedEmail);
                return null;
              }

              console.log("✅ [AUTH-DIAGNOSTIC] Login exitoso para:", normalizedEmail);
              return {
                id: user.id,
                name: user.nombre,
                email: user.email,
                role: user.rol,
              };

            } catch (dbError) {
               console.error("🔥 [AUTH-DIAGNOSTIC] Error al consultar la DB:", dbError);
               return null;
            }
          } else {
            console.warn("⚠️ [AUTH-DIAGNOSTIC] Zod validation failed for credentials:", parsedCredentials.error.format());
            return null;
          }
        } catch (error) {
          console.error("🔥 [AUTH-DIAGNOSTIC] CRÍTICO: Error en authorize:", error);
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
