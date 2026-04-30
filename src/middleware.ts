import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req: NextRequest & { auth: any }) => {
  const url = req.nextUrl;
  const hostname = req.headers.get("host") || "";

  // 1. Subdomain Routing: If user is on app.conjuntos.app and at root, show /inicio (the app dashboard)
  if (hostname.includes("app.conjuntos.app")) {
    if (url.pathname === "/") {
      return NextResponse.rewrite(new URL("/inicio", req.url));
    }
  }

  // 2. Allow normal NextAuth flow
  return auth(req as any);
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
