import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { z } from "zod";

// Helper for consistent auth logging
const authLog = (step: string, details: string = "", email: string = "") => {
  console.log(`🔑 [AUTH-LOG] ${step}: ${details} (${email})`);
};

export const { auth, signIn, signOut, handlers } = NextAuth({
  ...authConfig,
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "sb_secret_lzaYy86aeMAavECzFrBXww_RNjdfv2b_fallback",
  trustHost: true,
  session: { 
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  providers: [
    Credentials({
      async authorize(credentials) {
        const emailInput = (credentials?.email as string) || "unknown";
        
        try {
          authLog("AUTHORIZE_STARTED", "Validation init", emailInput);
          
          const parsedCredentials = z
            .object({ 
              email: z.string().min(3), 
              password: z.string().min(6)
            })
            .safeParse(credentials);

          if (!parsedCredentials.success) {
            authLog("ZOD_VALIDATION_FAILED", "Invalid format", emailInput);
            return null;
          }

          let email = parsedCredentials.data.email;
          const { password } = parsedCredentials.data;
          if (!email.includes('@')) {
             email = `${email.trim()}@example.com`;
          }
          const normalizedEmail = email.toLowerCase().trim();
          
          // Import DB layer (Next.js Edge dynamic import)
          const db = (await import("@/lib/db")).default;
          
          let finalUser = await db.usuario.findFirst({
            where: { email: normalizedEmail }
          });

          // Bootstrap Demo Users if missing
          const demoUsers: Record<string, {rol: string, nombre: string}> = {
            "thommy@example.com": { rol: "SUPER_ADMIN", nombre: "Thommy Master" },
            "milo@enconjunto.com": { rol: "ADMINISTRADOR", nombre: "Milo Admin" },
            "admin@example.com": { rol: "ADMINISTRADOR", nombre: "Marta Admin" }
          };

          if (!finalUser && demoUsers[normalizedEmail]) {
             authLog("BOOTSTRAP_TRIGGERED", "Creating demo user", normalizedEmail);
             try {
               await db.conjunto.upsert({
                 where: { id: "demo_id" },
                 create: {
                   id: "demo_id",
                   nombre: "Residencial Horizonte",
                   subdominio: "demo",
                   direccion: "Digital",
                   ciudad: "Nube",
                   nit: "800123456-1"
                 },
                 update: {}
               });
               
               finalUser = await db.usuario.upsert({
                 where: { email: normalizedEmail },
                 create: {
                   email: normalizedEmail,
                   password: password.trim(),
                   rol: demoUsers[normalizedEmail].rol,
                   nombre: demoUsers[normalizedEmail].nombre,
                   conjuntoId: "demo_id",
                   activo: true
                 },
                 update: { password: password.trim() }
               });
             } catch (err: any) {
                authLog("BOOTSTRAP_FAILED", err.message, normalizedEmail);
             }
          }

          if (!finalUser) {
            authLog("USER_NOT_FOUND", "Account missing", normalizedEmail);
            return null;
          }

          const dbPassword = (finalUser.password || "").trim();
          if (password.trim() !== dbPassword) {
            authLog("PASSWORD_MISMATCH", "Incorrect creds", normalizedEmail);
            return null;
          }

          authLog("LOGIN_SUCCESS", "Success", normalizedEmail);
          return { 
             id: finalUser.id, 
             name: finalUser.nombre, 
             email: finalUser.email, 
             role: finalUser.rol 
          } as any;

        } catch (error: any) {
          authLog("CRITICAL_ERROR", error.message, emailInput);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
  debug: true,
  logger: {
    error: (code, ...args) => console.error(`❌ [AUTH-EVENT-ERROR] ${code}:`, ...args),
  }
});
