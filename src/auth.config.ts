import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  secret: process.env.AUTH_SECRET || "sb_secret_lzaYy86aeMAavECzFrBXww_RNjdfv2b_fallback",
  trustHost: true,
  callbacks: {
    authorized({ auth, request }) {
      // Allow POST requests (Server Actions / API) to pass through the middleware
      // real validation happens inside the handler via auth()
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
  providers: [], 
} satisfies NextAuthConfig;
