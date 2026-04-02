import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  trustHost: true,
  // No callbacks needed; login handled via Server Action.
  providers: [], // Configured in auth.ts
} satisfies NextAuthConfig;
