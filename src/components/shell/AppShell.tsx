"use client";

import React, { ReactNode, useEffect, useRef } from "react";
import TopBar from "./TopBar";
import BottomNav from "./BottomNav";
import { useAuth } from "@/hooks/useAuth";
import { useHasInternet } from "@/hooks/useHasInternet";

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
        className="bg-accent text-white text-[11px] font-bold px-5 py-2.5 rounded-full active:scale-95 transition-transform"
      >
        Reintentar
      </button>
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const authOffline = useAuth((s) => s.authOffline);
  const online = useHasInternet();

  if (authOffline || !online) return <OfflineScreen online={online} />;

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

      <TopBar />
      
      {/* Contenido principal con padding safe area top and bottom */}
      <main 
        ref={containerRef}
        className="flex-1 overflow-y-auto page-content text-text mb-[80px] relative" 
      >
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
