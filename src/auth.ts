import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { z } from "zod";

export const { auth, signIn, signOut, handlers } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
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
            
            // Log para telemetría en Cloudflare Dashboard
            console.log("🔐 Proceso de Login -> Intentando para:", normalizedEmail);
            
            const { default: db } = await import("@/lib/db");
            
            if (!process.env.DATABASE_URL) {
              console.error("❌ ERROR: DATABASE_URL no está configurada en Cloudflare.");
              return null;
            }

            // Buscar usuario
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let user = await db.usuario.findUnique({ where: { email: normalizedEmail } as any });
            
            // BOOTSTRAP: Si es el usuario maestro y no existe en la DB, lo creamos
            if (!user && normalizedEmail === "thommy@example.com") {
              console.log("🛠️ BOOTSTRAP: Master user no encontrado. Creando...");
              
              let conjunto = await db.conjunto.findFirst();
              if (!conjunto) {
                conjunto = await db.conjunto.create({
                  data: {
                    nombre: "Conjunto Residencial Demo",
                    subdominio: "demo",
                    direccion: "Calle Digital 101",
                    ciudad: "Nube"
                  }
                });
              }

              user = await db.usuario.create({
                data: {
                  nombre: "ThommyEnergy",
                  email: "thommy@example.com",
                  rol: "SUPER_ADMIN",
                  password: "123456",
                  conjuntoId: conjunto.id,
                  genero: "femenino"
                }
              });
              console.log("✅ BOOTSTRAP: Usuario maestro creado con éxito.");
            }

            if (!user) {
              console.warn("⚠️ Login fallido: El usuario no existe en la DB:", normalizedEmail);
              return null;
            }

            console.log("👤 Usuario encontrado:", user.nombre, "| Rol:", user.rol);

            // Validar password
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const userPadded = user as any;
            
            const isPasswordMatch = userPadded.password 
              ? userPadded.password === password 
              : password === "123456";

            if (!isPasswordMatch) {
              console.warn("⚠️ Login fallido: Password incorrecto para:", normalizedEmail);
              return null;
            }

            console.log("✅ Login exitoso para:", normalizedEmail);
            return {
              id: user.id,
              name: user.nombre,
              email: user.email,
              image: user.avatar,
            };
          }
          return null;
        } catch (error) {
          console.error("🔥 ERROR CRÍTICO EN AUTENTICACIÓN:", error);
          return null;
        }
      },
    }),
  ],
  // Log de eventos de Auth.js
  debug: process.env.NODE_ENV === "development",
});
