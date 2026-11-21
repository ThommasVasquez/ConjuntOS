"use client";

import React, { ReactNode, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import BottomNav from "./BottomNav";
import PageSkeleton from "./PageSkeleton";
import PullToRefreshLogo from "./PullToRefreshLogo";
import { useAuth } from "@/hooks/useAuth";
import { useHasInternet } from "@/hooks/useHasInternet";
import { useNavFeedback } from "@/hooks/useNavFeedback";
import { invalidateApiCache } from "@/lib/api/client";
import InicioDashboard from "@/app/(app)/inicio/page";
import CitofoniaPage from "@/app/(app)/citofonia/page";
import VisitantesPage from "@/app/(app)/visitantes/page";
import PerfilPage from "@/app/(app)/perfil/page";

export const KEEP_ALIVE_TAB_PATHS = ["/inicio", "/citofonia", "/visitantes", "/perfil"] as const;

export function isKeepAliveTab(path: string): boolean {
  const clean = path.split("?")[0];
  return (KEEP_ALIVE_TAB_PATHS as readonly string[]).includes(clean);
}

export function switchKeepAliveTab(path: string): void {
  if (typeof window === "undefined") return;
  if (window.location.pathname + window.location.search === path) return;
  window.history.pushState(null, "", path);
  const scroller = document.querySelector(".page-content") as HTMLElement | null;
  if (scroller) scroller.scrollTop = 0;
  window.scrollTo(0, 0);
}

/**
 * Every page gates its data fetches on `user`, so when /auth/me fails for a
 * non-auth reason (offline, DNS, 530) nothing ever loads and the UI spins
 * forever. Show a retry screen instead. Expired/missing sessions never reach
 * here — checkAuth redirects those to /login.
 */
function OfflineScreen({ online }: { online: boolean }) {
  const checkAuth = useAuth((s) => s.checkAuth);

  // Retry by itself the moment the network comes back.
  useEffect(() => {
    if (online) checkAuth();
  }, [online, checkAuth]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-primary text-text px-8 text-center">
      <p className="font-display text-lg font-bold">
        {online ? "No pudimos conectar" : "Sin conexión a internet"}
      </p>
      <p className="text-text/60 text-xs max-w-xs">
        {online
          ? "El servidor no responde en este momento."
          : "Revisa tu conexión para continuar."}
      </p>
      <button
        onClick={() => checkAuth()}
        className="bg-accent text-on-accent text-[11px] font-bold px-5 py-2.5 rounded-full active:scale-95 transition-transform"
      >
        Reintentar
      </button>
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const checkAuth = useAuth((s) => s.checkAuth);
  const authOffline = useAuth((s) => s.authOffline);
  const online = useHasInternet();
  const pendingPath = useNavFeedback((s) => s.pendingPath);
  const setPendingPath = useNavFeedback((s) => s.setPendingPath);
  const [refreshKeys, setRefreshKeys] = useState<Record<string, number>>({});

  const handleGlobalRefresh = useCallback(async () => {
    invalidateApiCache();
    await checkAuth();
    setRefreshKeys((prev) => ({
      ...prev,
      [pathname]: (prev[pathname] ?? 0) + 1,
    }));
    router.refresh();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("conjuntos:refresh", { detail: { pathname } }));
    }
  }, [checkAuth, pathname, router]);

  // Clear optimistic skeleton the instant the destination route lands
  useEffect(() => {
    setPendingPath(null);
  }, [pathname, setPendingPath]);

  // Track which primary tabs have been mounted so they stay alive in memory
  // for 0ms instant tab switching.
  const [mountedTabs, setMountedTabs] = useState<Record<string, boolean>>(() => ({
    [pathname]: true,
  }));

  useEffect(() => {
    if (isKeepAliveTab(pathname) && !mountedTabs[pathname]) {
      setMountedTabs((prev) => ({ ...prev, [pathname]: true }));
    }
  }, [pathname, mountedTabs]);

  // Keep each core tab mounted once visited (lazy mount on first visit avoids
  // firing ~18-20 simultaneous API calls per user on app open under load spikes).

  if (authOffline || !online) return <OfflineScreen online={online} />;

  const activeIsKeepAlive = isKeepAliveTab(pathname);
  const isPending = Boolean(pendingPath && pendingPath !== pathname);

  return (
    <div className="app-shell flex flex-col relative overflow-hidden">
      {/* GLOBAL BACKGROUND ELEMENTS (PREMIUM DESIGN SYSTEM) */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-primary transition-colors duration-300">
        {/* Ambient Orbs - Extremely Subtle */}
        <div className="absolute top-[-10%] right-[-10%] w-full h-[70%] bg-primary-light/5 dark:bg-[#FFFFFF]/5 blur-[120px] rounded-full transition-colors duration-300" />
        <div className="absolute bottom-[-15%] left-[-15%] w-full h-[70%] bg-accent/5 dark:bg-[#262626]/5 blur-[120px] rounded-full transition-colors duration-300" />
        
        {/* Decorative Watermark Text - Minimal visibility (1%) */}
        <div className="absolute top-1/3 -left-10 text-[25vw] font-display font-black text-text/[0.01] select-none uppercase tracking-tighter leading-none whitespace-nowrap transition-colors duration-300">
          CONJUNTOS
        </div>
      </div>

      {/* Contenido principal con Keep-Alive Tab Deck + Pull-to-Refresh global + Skeleton inmediato */}
      <main 
        ref={containerRef}
        className="flex-1 overflow-y-auto page-content text-text mb-[80px] relative" 
      >
        <PullToRefreshLogo onRefresh={handleGlobalRefresh}>
          {isPending && <PageSkeleton path={pendingPath} />}

          {mountedTabs["/inicio"] && (
            <div className={!isPending && pathname === "/inicio" ? "block" : "hidden"}>
              <Suspense fallback={<PageSkeleton path="/inicio" />}>
                <InicioDashboard key={refreshKeys["/inicio"] ?? 0} />
              </Suspense>
            </div>
          )}
          {mountedTabs["/citofonia"] && (
            <div className={!isPending && pathname === "/citofonia" ? "block" : "hidden"}>
              <Suspense fallback={<PageSkeleton path="/citofonia" />}>
                <CitofoniaPage key={refreshKeys["/citofonia"] ?? 0} />
              </Suspense>
            </div>
          )}
          {mountedTabs["/visitantes"] && (
            <div className={!isPending && pathname === "/visitantes" ? "block" : "hidden"}>
              <Suspense fallback={<PageSkeleton path="/visitantes" />}>
                <VisitantesPage key={refreshKeys["/visitantes"] ?? 0} />
              </Suspense>
            </div>
          )}
          {mountedTabs["/perfil"] && (
            <div className={!isPending && pathname === "/perfil" ? "block" : "hidden"}>
              <Suspense fallback={<PageSkeleton path="/perfil" />}>
                <PerfilPage key={refreshKeys["/perfil"] ?? 0} />
              </Suspense>
            </div>
          )}

          {!isPending && !activeIsKeepAlive && (
            <div key={refreshKeys[pathname] ?? 0}>{children}</div>
          )}
        </PullToRefreshLogo>
      </main>

      <BottomNav />
    </div>
  );
}
