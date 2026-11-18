import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { QR_BANNER_TARGET_URL } from "@/lib/qr-config";

/**
 * Simplified middleware for Rust-backend auth.
 * Checks for `ec_session` httpOnly cookie (set by the Rust backend on login).
 * Public paths are allowed without auth; everything else redirects to /login.
 */

const PUBLIC_PATHS = ["/about", "/pricing", "/contact", "/privacidad", "/proteccion-datos", "/qr"];

// Landing page moved to separate project (landing/).
// Root "/" now redirects to /login.

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = req.cookies.get("ec_session")?.value;

  // Dynamic QR banner redirect — 302 with no-store so reprogramming takes effect immediately
  if (pathname === "/qr" || pathname === "/qr/") {
    const res = NextResponse.redirect(QR_BANNER_TARGET_URL, 302);
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    return res;
  }

  // Authenticated user on "/login" → redirect to dashboard.
  // "/" stays the public landing page for everyone, logged in or not.
  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL("/inicio", req.url));
  }

  // Allow public paths (landing, about, pricing, contact)
  if (pathname === "/" || pathname === "/login" || PUBLIC_PATHS.some((p) => pathname === p)) {
    return NextResponse.next();
  }

  // Asamblea uses device-pairing auth; kiosko is a dedicated reception tablet
  if (pathname.startsWith("/asamblea") || pathname.startsWith("/kiosko")) {
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
    "/((?!api|_next/static|_next/image|img/|.*\\.png|.*\\.svg|.*\\.jpg|.*\\.webp|favicon\\.ico|manifest\\.json|sw\\.js|workbox-.*\\.js).*)",
  ],
};
