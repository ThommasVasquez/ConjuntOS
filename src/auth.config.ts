import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  secret: process.env.AUTH_SECRET,
  callbacks: {
    authorized({ auth, request }) {
      // 🚀 FIX CRÍTICO 405: Permitir todos los POSTs (Server Actions) 
      // La seguridad real se valida dentro de la acción usando auth()
      if (request.method === "POST") return true;

      const { nextUrl } = request;
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname.startsWith('/login');

      if (!isOnLogin && !isLoggedIn) {
        return false; // Redirect to login
      }
      return true;
    },
  },
  providers: [], // Configured in auth.ts
} satisfies NextAuthConfig;
