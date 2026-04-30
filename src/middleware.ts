import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const hostname = req.headers.get("host") || "";

  // 1. App Subdomain Logic
  if (hostname.includes("app.conjuntos.app")) {
    // If user hits the root of the app subdomain
    if (nextUrl.pathname === "/") {
      if (!isLoggedIn) {
        // Force redirect to login if accessing the app domain unauthenticated
        const loginUrl = new URL("/login", nextUrl.origin);
        return Response.redirect(loginUrl);
      }
      // If logged in, show the main dashboard
      return NextResponse.rewrite(new URL("/inicio", req.url));
    }
  }

  // 2. Default behavior: Let authConfig handle the rest of the protection
  return; 
});

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (logo.png, etc.)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|logo.png|manifest.json|favicon.svg).*)",
  ],
};
