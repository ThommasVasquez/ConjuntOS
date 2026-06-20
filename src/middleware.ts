import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Simplified middleware for Rust-backend auth.
 * Checks for `ec_session` httpOnly cookie (set by the Rust backend on login).
 * Public paths are allowed without auth; everything else redirects to /login.
 */

const PUBLIC_PATHS = ["/about", "/pricing", "/contact"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = req.cookies.get("ec_session")?.value;

  // Authenticated user on "/" or "/login" → redirect to dashboard.
  // The client-side dashboard will re-route role-specific views (e.g.
  // HUESPED_TEMPORAL → /mi-estancia).
  if ((pathname === "/" || pathname === "/login") && session) {
    return NextResponse.redirect(new URL("/inicio", req.url));
  }

  // Allow public paths (landing, about, pricing, contact)
  if (pathname === "/" || pathname === "/login" || PUBLIC_PATHS.some((p) => pathname === p)) {
    return NextResponse.next();
  }

  // Asamblea uses device-pairing auth; let client handle
  if (pathname.startsWith("/asamblea")) {
    return NextResponse.next();
  }

  // Protected routes: require auth cookie
  if (!session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api (proxied to Rust backend)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, manifest.json, sw.js, public assets
     */
    "/((?!api|_next/static|_next/image|favicon\\.ico|favicon\\.svg|solo-light\\.svg|solo-dark\\.svg|solo\\.svg|logo\\.svg|logo-vertical\\.svg|logo-verticalW\\.svg|ConjuntOS_Vertical\\.svg|SplashWHITE\\.png|SplashBLACK\\.png|logo\\.png|manifest\\.json|sw\\.js|workbox-.*\\.js).*)",
  ],
};
