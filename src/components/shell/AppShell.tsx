"use client";

import React, { ReactNode, useRef } from "react";
import TopBar from "./TopBar";
import BottomNav from "./BottomNav";
import { Toaster } from "sonner";

export default function AppShell({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="app-shell flex flex-col min-h-screen">
      <TopBar />
      
      {/* Contenido principal con padding safe area top and bottom */}
      <main 
        ref={containerRef}
        className="flex-1 overflow-y-auto page-content text-text mb-[80px]" 
      >
        {children}
      </main>

      <BottomNav />
      <Toaster position="top-center" theme="dark" richColors />
    </div>
  );
}
