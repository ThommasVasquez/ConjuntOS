import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  secret: process.env.AUTH_SECRET || "sb_secret_lzaYy86aeMAavECzFrBXww_RNjdfv2b_fallback",
  trustHost: true,
  callbacks: {
    authorized({ auth, request }) {
      const { nextUrl } = request;
      const isLoggedIn = !!auth?.user;

      // 1. Define Public Paths
      const publicPaths = ["/", "/login", "/about", "/pricing", "/contact"];
      const isPublicPath = publicPaths.includes(nextUrl.pathname) || 
                          nextUrl.pathname.startsWith("/api") || 
                          nextUrl.pathname.includes("."); // Matches static files

      // 2. Allow POST requests (Server Actions) to pass through
      if (request.method === "POST") return true;

      // 3. Logic:
      // If it's a public path, anyone can enter
      if (isPublicPath) return true;

      // If it's a protected path and NOT logged in, redirect to login
      if (!isLoggedIn) return false;

      return true;
    },
  },
  providers: [], 
} satisfies NextAuthConfig;
