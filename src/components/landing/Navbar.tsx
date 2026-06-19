"use client";

import { useViewTransition } from "@/components/providers/ViewTransitionContext";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { useAuth } from "@/hooks/useAuth";

export default function Navbar() {
  const { navigate } = useViewTransition();
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    
    // Initial entrance
    gsap.fromTo(navRef.current,
      { y: -100, opacity: 0 },
      { y: 0, opacity: 1, duration: 1.2, ease: "power4.out", delay: 0.5 }
    );

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav 
      ref={navRef}
      className={`fixed inset-x-0 mx-auto z-[100] transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] ${
        scrolled 
          ? "top-6 w-[95%] max-w-5xl" 
          : "top-0 w-full max-w-7xl px-6"
      }`}
    >
      <div className={`transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] flex items-center px-8 relative overflow-hidden ${
        scrolled 
          ? "liquid-glass rounded-full py-2.5 shadow-[0_20px_50px_rgba(0,0,0,0.5)]" 
          : "bg-transparent py-6 border-transparent rounded-none"
      }`}>
        {/* Specular Edge Highlight */}
        {scrolled && (
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none" />
        )}
        
        {/* 1. Logo Container (Fixed width to balance right side) */}
        <div className={`transition-all duration-700 flex items-center ${scrolled ? "w-[120px]" : "w-[180px]"}`}>
          <div 
            onClick={() => navigate("/")} 
            className="flex items-center cursor-pointer group"
          >
            <div className={`transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] flex items-center justify-center ${
              scrolled ? "h-10 w-10 text-white" : "h-10 w-[140px]"
            }`}>
              {scrolled ? (
                <img 
                  src="/solo-dark.svg" 
                  alt="ConjuntOS" 
                  className="w-full h-full object-contain"
                />
              ) : (
                <img 
                  src="/splash-white.png" 
                  alt="ConjuntOS" 
                  className="w-full h-full object-contain"
                />
              )}
            </div>
          </div>
        </div>

        {/* 2. Links Container (Center, takes all remaining space) */}
        <div className="flex-1 flex justify-center items-center">
          <div className="hidden md:flex items-center gap-8">
            {["Acerca", "Módulos", "Beneficios", "Asambleas", "Pricing", "Soporte"].map((item) => (
              <button 
                key={item}
                onClick={() => {
                  if (item === "Asambleas") navigate("/asamblea");
                }}
                className={`transition-all duration-500 text-[11px] font-bold tracking-widest uppercase hover:text-accent cursor-pointer ${
                  scrolled ? "text-white" : "text-white"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {/* 3. Actions Container (Fixed width to balance left side) */}
        <div className={`transition-all duration-700 flex items-center justify-end gap-6 ${scrolled ? "w-[120px]" : "w-[180px]"}`}>
          <button className="text-white hover:text-accent transition-colors duration-300">
            <Search size={16} strokeWidth={2.5} />
          </button>
          <div className="h-4 w-[1px] bg-white/10 mx-1" />
          <button 
            onClick={() => navigate(user ? "/inicio" : "/login")} 
            className={`transition-all duration-300 px-5 py-2 rounded-full text-[11px] font-bold tracking-widest uppercase whitespace-nowrap hover:scale-105 active:scale-95 shadow-[0_0_15px_rgba(0,0,0,0.3)] ${
              scrolled 
                ? "text-on-accent bg-white/5 border border-white/10 hover:bg-accent" 
                : "text-on-accent border border-white/20 hover:bg-accent hover:border-accent"
            }`}
          >
            {user ? "Mi Panel" : "Ingresar"}
          </button>
        </div>

      </div>
    </nav>
  );
}
