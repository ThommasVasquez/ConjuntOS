import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isPublicRoute = nextUrl.pathname === "/login";

      if (!isPublicRoute && !isLoggedIn) {
        return false; // Redirect to login
      }
      
      if (isPublicRoute && isLoggedIn) {
        return Response.redirect(new URL("/inicio", nextUrl));
      }

      return true;
    },
  },
  providers: [], // Configured in auth.ts
} satisfies NextAuthConfig;
