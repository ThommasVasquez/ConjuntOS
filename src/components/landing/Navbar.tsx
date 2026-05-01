"use client";

import { useViewTransition } from "@/components/providers/ViewTransitionContext";
import { Search, ShoppingBag, User, Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import Image from "next/image";

export default function Navbar() {
  const { navigate } = useViewTransition();
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Entrance animation
    gsap.fromTo(navRef.current,
      { y: -100, opacity: 0 },
      { y: 0, opacity: 1, duration: 1.2, ease: "power4.out", delay: 0.5 }
    );
  }, []);

  return (
    <nav 
      ref={navRef}
      className="fixed top-6 left-1/2 -translate-x-1/2 w-[95%] max-w-5xl z-50"
    >
      <div className="bg-black/60 backdrop-blur-2xl border border-white/10 rounded-full px-8 py-2.5 flex items-center justify-between shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
        {/* Logo */}
        <div 
          onClick={() => navigate("/")} 
          className="flex items-center cursor-pointer group shrink-0"
        >
          <div className="h-8 w-8 text-white">
            <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
              <path d="M20 80V20H40V30L35 30V35H30V30L25 35V40H20" fill="currentColor"/>
              <path d="M45 20V10C45 10 40 8 35 11C30 14 25 12 25 12L26 18C26 18 31 20 36 17C41 14 45 16 45 16" fill="currentColor"/>
            </svg>
          </div>
        </div>

        {/* Links (Center) */}
        <div className="hidden md:flex items-center gap-8">
          {["Acerca", "Módulos", "Beneficios", "Pricing", "Soporte"].map((item) => (
            <button 
              key={item}
              className="text-white/50 hover:text-white text-[11px] font-medium tracking-tight transition-all duration-300"
            >
              {item}
            </button>
          ))}
        </div>

        {/* Actions (Right) */}
        <div className="flex items-center gap-6">
          <button className="text-white/50 hover:text-white transition-colors duration-300">
            <Search size={16} strokeWidth={2.5} />
          </button>
          <button className="text-white/50 hover:text-white transition-colors duration-300">
            <ShoppingBag size={16} strokeWidth={2.5} />
          </button>
          <div className="h-4 w-[1px] bg-white/10 mx-1" />
          <button 
            onClick={() => window.location.href = "https://app.conjuntos.app/login"} 
            className="text-white bg-white/10 hover:bg-white hover:text-black px-5 py-1.5 rounded-full text-[11px] font-bold tracking-tight transition-all duration-300"
          >
            Ingresar
          </button>
        </div>
      </div>
    </nav>
  );
}
