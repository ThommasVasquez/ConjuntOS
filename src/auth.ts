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
            
            // Log para telemetría en Cloudflare Dashboard
            console.log("🔐 Intentando login para:", email);
            
            const { default: db } = await import("@/lib/db");
            
            if (!process.env.DATABASE_URL) {
              console.error("❌ ERROR: DATABASE_URL no está configurada en Cloudflare.");
              return null;
            }

            // Buscar usuario
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const user = await db.usuario.findUnique({ where: { email } as any });
            
            if (!user) {
              console.warn("⚠️ Login fallido: Usuario no encontrado:", email);
              return null;
            }

            // Validar password
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const userPadded = user as any;
            if (userPadded.password && userPadded.password !== password) {
              console.warn("⚠️ Login fallido: Password incorrecto para:", email);
              return null;
            }
            if (!userPadded.password && password !== "123456") {
              console.warn("⚠️ Login fallido: Password default 123456 requerido para:", email);
              return null;
            }

            console.log("✅ Login exitoso para:", email);
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
