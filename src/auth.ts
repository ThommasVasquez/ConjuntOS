import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { z } from "zod";

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
            
            const { default: db } = await import("@/lib/db");
            console.log("🔍 [AUTH-DIAGNOSTIC] db importado correctamente.");

            // Detección robusta de URL de base de datos para el Edge
            let dbUrl = process.env.DATABASE_URL || "";
            if (!dbUrl) {
               console.warn("⚠️ [AUTH-DIAGNOSTIC] DATABASE_URL no está en process.env. Verificando globalThis.env...");
               const g = globalThis as unknown as { DATABASE_URL?: string, env?: { DATABASE_URL?: string } };
               dbUrl = g.DATABASE_URL || g.env?.DATABASE_URL || "";
            }

            if (!dbUrl) {
               console.error("❌ [AUTH-DIAGNOSTIC] FALLO CRÍTICO: No se encuentra DATABASE_URL.");
               return null;
            }

            if (!process.env.AUTH_SECRET && !process.env.NEXTAUTH_SECRET) {
              console.error("❌ [AUTH-DIAGNOSTIC] ERROR: No hay AUTH_SECRET ni NEXTAUTH_SECRET en el entorno. La sesión fallará.");
            }

            // Buscar usuario
            console.log("🔍 [AUTH-DIAGNOSTIC] Buscando usuario en DB...");
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              let user = await db.usuario.findUnique({ where: { email: normalizedEmail } as any });
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
                  console.log("🛠️ [AUTH-DIAGNOSTIC] ID de conjunto para usuario:", conjunto.id);

                  user = await db.usuario.create({
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
                } catch (bootstrapError) {
                  console.error("🔥 [AUTH-DIAGNOSTIC] Error en Bootstrap:", bootstrapError);
                  throw bootstrapError;
                }
              }

              if (!user) {
                console.warn("⚠️ [AUTH-DIAGNOSTIC] Login fallido: El usuario no existe en la DB:", normalizedEmail);
                return null;
              }

              console.log("👤 [AUTH-DIAGNOSTIC] Verificando password para:", user.nombre);

              // Validar password (con limpieza de espacios)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const userPadded = user as any;
              const inputPassword = password.trim();
              const dbPassword = (userPadded.password || "123456").trim();
              
              console.log("🔍 [AUTH-DIAGNOSTIC] Longitud pass (entrada):", inputPassword.length);
              console.log("🔍 [AUTH-DIAGNOSTIC] Longitud pass (DB):", dbPassword.length);

              const isPasswordMatch = inputPassword === dbPassword;

              if (!isPasswordMatch) {
                console.warn("⚠️ [AUTH-DIAGNOSTIC] Login fallido: Las contraseñas no coinciden para:", normalizedEmail);
                return null;
              }

              console.log("✅ [AUTH-DIAGNOSTIC] Login exitoso para:", normalizedEmail);
              return {
                id: user.id,
                name: user.nombre,
                email: user.email,
                role: user.rol, // Añadido para el JWT
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
          if (error instanceof Error) {
            console.error("🔥 [AUTH-DIAGNOSTIC] Mensaje:", error.message);
            console.error("🔥 [AUTH-DIAGNOSTIC] Stack:", error.stack);
          }
          return null;
        }
      },
    }),
  ],
  // Log de eventos de Auth.js
  debug: true, // Activamos depuración total en producción para este diagnóstico
  logger: {
    error: (code, ...args) => console.error(`❌ [AUTH-EVENT-ERROR] ${code}:`, ...args),
    warn: (code, ...args) => console.warn(`⚠️ [AUTH-EVENT-WARN] ${code}:`, ...args),
    debug: (code, ...args) => console.log(`🔍 [AUTH-EVENT-DEBUG] ${code}:`, ...args),
  }
});
