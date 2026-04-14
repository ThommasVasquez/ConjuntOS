"use client";

import React, { ReactNode, useRef } from "react";
import TopBar from "./TopBar";
import BottomNav from "./BottomNav";

export default function AppShell({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="app-shell flex flex-col min-h-screen relative overflow-hidden">
      {/* GLOBAL BACKGROUND ELEMENTS (PREMIUM DESIGN SYSTEM) */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Ambient Orbs */}
        <div className="absolute top-[-5%] right-[-10%] w-full h-[60%] bg-[#4C1D95]/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-10%] w-full h-[60%] bg-[#BE185D]/10 blur-[120px] rounded-full" />
        
        {/* Decorative Watermark Text */}
        <div className="absolute top-1/4 -left-10 text-[25vw] font-display font-black text-white/[0.02] select-none uppercase tracking-tighter leading-none whitespace-nowrap">
          CONJUNTOS
        </div>
      </div>

      <TopBar />
      
      {/* Contenido principal con padding safe area top and bottom */}
      <main 
        ref={containerRef}
        className="flex-1 overflow-y-auto page-content text-text mb-[80px] relative z-10" 
      >
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
