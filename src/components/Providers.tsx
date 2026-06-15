"use client";

import { AuthProvider } from "./providers/AuthProvider";
import { ViewTransitionProvider } from "./providers/ViewTransitionContext";
import { ThemeProvider } from "./providers/ThemeContext";
import { CallProvider } from "./providers/CallContext";
import { WebSocketProvider } from "./providers/WebSocketProvider";

// ─── Runtime URL patch for next-auth v5 ──────────────────────────────────────
// next-auth@5.0.0-beta.30 reads process.env.NEXTAUTH_URL at MODULE LOAD TIME
// to set __NEXTAUTH.baseUrl and __NEXTAUTH.basePath. When NEXTAUTH_URL is set to
// the production domain (app.conjuntos.app), the built client bundle will make
// all /api/auth/* requests against that domain — even on preview deployments.
//
// The apiBaseUrl() function returns just `__NEXTAUTH.basePath` on the client,
// which becomes the fetch URL. When basePath = "/api/auth" (a relative URL),
// the browser resolves it relative to the page's origin — which should be
// correct. But if the Cloudflare custom domain alias causes the relative URL to
// resolve against app.conjuntos.app, we must use absolute URLs instead.
//
// We patch __NEXTAUTH synchronously here (module evaluation time, before any
// React rendering) so every subsequent _getSession call uses the right origin.
if (typeof window !== "undefined") {
  // Use a getter so the patch applies even if the __NEXTAUTH object is
  // replaced after our module loads.
  const origin = window.location.origin;
  const correctBase = `${origin}/api/auth`;

  // Direct patch if __NEXTAUTH is already defined (next-auth/react.js module ran first)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.__NEXTAUTH) {
    w.__NEXTAUTH.baseUrl = origin;
    w.__NEXTAUTH.basePath = correctBase;
    w.__NEXTAUTH.baseUrlServer = origin;
    w.__NEXTAUTH.basePathServer = correctBase;
  }

  // Intercept future assignments to __NEXTAUTH via Object.defineProperty
  // so if next-auth/react.js loads AFTER this module, our values still win.
  let _nextauth = w.__NEXTAUTH;
  Object.defineProperty(w, "__NEXTAUTH", {
    get() { return _nextauth; },
    set(val) {
      _nextauth = {
        ...val,
        baseUrl: origin,
        basePath: correctBase,
        baseUrlServer: origin,
        basePathServer: correctBase,
      };
    },
    configurable: true,
  });
}
// ─────────────────────────────────────────────────────────────────────────────

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <WebSocketProvider>
        <ThemeProvider>
          <CallProvider>
            <ViewTransitionProvider>
              {children}
            </ViewTransitionProvider>
          </CallProvider>
        </ThemeProvider>
      </WebSocketProvider>
    </AuthProvider>
  );
}
