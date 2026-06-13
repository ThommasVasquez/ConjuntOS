"use client";

import React, { ReactNode, useRef } from "react";
import TopBar from "./TopBar";
import BottomNav from "./BottomNav";

export default function AppShell({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="app-shell flex flex-col min-h-screen relative overflow-hidden">
      {/* GLOBAL BACKGROUND ELEMENTS (PREMIUM DESIGN SYSTEM) */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-primary transition-colors duration-300">
        {/* Ambient Orbs - Extremely Subtle */}
        <div className="absolute top-[-10%] right-[-10%] w-full h-[70%] bg-primary-light/5 dark:bg-[#FAFAFA]/5 blur-[120px] rounded-full transition-colors duration-300" />
        <div className="absolute bottom-[-15%] left-[-15%] w-full h-[70%] bg-accent/5 dark:bg-[#3f3f46]/5 blur-[120px] rounded-full transition-colors duration-300" />
        
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
