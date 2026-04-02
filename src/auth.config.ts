import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  secret: process.env.AUTH_SECRET,
  callbacks: {
    authorized({ auth, request }) {
      const { nextUrl, headers } = request;
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname.startsWith('/login');
      
      // Permitir Server Actions sin redirección forzada del middleware 
      // (la validación de sesión se hace dentro de la acción)
      const isAction = headers.has("next-action");
      if (isAction) return true;

      if (!isOnLogin && !isLoggedIn) {
        return false; // Redirect to login
      }
      return true;
    },
  },
  providers: [], // Configured in auth.ts
} satisfies NextAuthConfig;
