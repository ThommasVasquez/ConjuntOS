"use client";

import { useViewTransition } from "@/components/providers/ViewTransitionContext";
import { Search, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { useAuth } from "@/hooks/useAuth";
import ThemeToggle from "./ThemeToggle";

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
      <div className={`transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] flex items-center px-8 relative overflow-visible ${
        scrolled 
          ? "liquid-glass rounded-full py-2.5 shadow-[0_20px_50px_rgba(0,0,0,0.5)]" 
          : "bg-transparent py-6 border-transparent rounded-none"
      }`}>
        {/* Specular Edge Highlight */}
        {scrolled && (
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none rounded-t-full" />
        )}
        
        {/* 1. Logo Container (Icon-Only Castle Emblem) */}
        <div className="transition-all duration-700 flex items-center w-10">
          <div 
            onClick={() => navigate("/")} 
            className="flex items-center justify-center cursor-pointer group"
          >
            <div className="h-10 w-10 flex items-center justify-center">
              <img 
                src="/solo-light.svg" 
                alt="ConjuntOS" 
                className="w-full h-full object-contain drop-shadow-[0_0_12px_rgba(255,255,255,0.3)] transition-transform duration-300 group-hover:scale-105"
              />
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
                  const sectionId = item.toLowerCase().replace(/á/g, 'a');
                  const element = document.getElementById(sectionId);
                  if (element) {
                    element.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
                className="text-sm font-medium text-text-muted hover:text-text transition-colors relative py-1 group"
              >
                {item}
                <span className="absolute bottom-0 left-0 w-0 h-[2px] bg-accent transition-all duration-300 group-hover:w-full" />
              </button>
            ))}
          </div>
        </div>

        {/* 3. Action Controls Container (Right side) */}
        <div className="flex items-center gap-4 justify-end">
          {/* Quick Search Launcher */}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-search-modal'))}
            className="p-2.5 rounded-full text-text-muted hover:text-text hover:bg-surface/50 transition-all border border-transparent hover:border-white/10 group"
            title="Buscar o consultar IA..."
          >
            <Search className="w-4 h-4 transition-transform group-hover:scale-110" />
          </button>

          <ThemeToggle />

          {/* "Ir a la App" / "Ingresar" Button with 360° Organic Orbiting Green/Aqua Conic Halo */}
          <button
            onClick={() => navigate(user ? "/inicio" : "/login")}
            className="relative group rounded-full font-semibold text-xs transition-all duration-300 active:scale-95"
          >
            {/* 1. Orbiting Conic Organic Halo Glow (Unclipped Ambient Glow) */}
            <div className="absolute -inset-2 rounded-full overflow-hidden opacity-80 group-hover:opacity-100 transition-opacity duration-500 blur-md group-hover:blur-lg pointer-events-none">
              <div 
                className="w-[250%] h-[250%] -translate-x-1/3 -translate-y-1/3 animate-[spin_4s_linear_infinite]"
                style={{
                  background: 'conic-gradient(from 0deg at 50% 50%, #009df1 0%, #57bf00 35%, #06b6d4 70%, #009df1 100%)',
                }}
              />
            </div>

            {/* 2. Organic Orbiting Conic Border Ring Container */}
            <div className="relative rounded-full p-[1.5px] overflow-hidden shadow-[0_0_20px_rgba(0,157,241,0.4)]">
              {/* Rotating Conic Light Beam for Border */}
              <div 
                className="absolute -inset-[150%] animate-[spin_4s_linear_infinite]"
                style={{
                  background: 'conic-gradient(from 0deg at 50% 50%, #009df1 0%, #57bf00 35%, #06b6d4 70%, #009df1 100%)',
                }}
              />

              {/* Inner Dark Pill Content */}
              <span className="relative block px-5 py-2.5 rounded-full bg-[#0a0f1d] group-hover:bg-[#070b16] transition-all duration-300">
                <span className="relative text-white font-bold tracking-wide flex items-center gap-1.5 drop-shadow-[0_0_10px_rgba(0,157,241,0.9)]">
                  {user ? "Ir a la App" : "Ingresar"}
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1 text-[#57bf00]" />
                </span>
              </span>
            </div>
          </button>
        </div>
      </div>
    </nav>
  );
}
