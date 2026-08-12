"use client";

import { useViewTransition } from "@/components/providers/ViewTransitionContext";
import { Search, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/components/providers/ThemeContext";
import ThemeToggle from "./ThemeToggle";

/**
 * High-Precision Vector Castle Emblem
 * Light mode: Solid Black Castle (#111213) with transparent window cutout
 * Dark mode: Solid White Castle (#FFFFFF) with transparent window cutout
 */
function CastleIcon({ isDark }: { isDark: boolean }) {
  const fill = isDark ? "#FFFFFF" : "#111213";
  return (
    <svg
      viewBox="170 0 160 250"
      className="w-full h-full object-contain"
      fill="none"
      shapeRendering="geometricPrecision"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g>
        {/* Main Castle Body with fillRule="evenodd" cutout window */}
        <path
          fill={fill}
          fillRule="evenodd"
          clipRule="evenodd"
          d="M255.67,10.23c-2.57,5.03-7.5-.37-9.98-.01-3.32.48-5.3,12.87-19.48,12.92,6.21,5.4,13.88-.76,19.56-2.25,5.52,2.78,11.87,7.02,18.76,1.43l-.15,17.07-8.56,3.27-.12,21.36-11.04,3.7-.23-21.31-17.71,6.02-.17,21.95-12.6,4.09-.13-21.58-16.95,5.56.02,166.16,71.99-24.16.45-203.45c-6.29,1.76-10.97,3.98-13.65,9.23ZM221.01,129.56c-.14-11.98-1.51-24.65,6.8-29.98,3.7-2.37,8.53-2.95,12.73-.85,3.43,1.72,5.15,5.48,5.22,9.21l.23,14.08-24.98,7.53Z"
        />

        {/* Right Castle Side Piece */}
        <path
          fill={fill}
          fillRule="evenodd"
          clipRule="evenodd"
          d="M313.1,130.3l-21.73-10.58c-1.11-9.65-.78-21.44,6.47-24.03,3.79-1.35,7.48-.13,10.35,2.62,3.31,3.17,4.53,7.73,5.03,12.36l-.13,19.64Z"
        />

        {/* Castle Flags / Roof Points */}
        <polygon
          fill={fill}
          points="301.46 72.67 285.82 65.36 300.66 52.78 301.46 72.67"
        />
        <polygon
          fill={fill}
          points="322.96 81.73 309.05 75.32 322.83 63.69 322.96 81.73"
        />

        {/* Right Small Window Cutout */}
        <path
          fill={fill}
          fillRule="evenodd"
          clipRule="evenodd"
          d="M199.28,232.71c-.09,3.34-2.03,5.23-4.68,5.26s-4.61-1.84-4.87-4.84,1.24-5.54,4.18-5.87,5.46,1.81,5.36,5.45Z"
        />
      </g>
    </svg>
  );
}

export default function Navbar() {
  const { navigate } = useViewTransition();
  const { user } = useAuth();
  const { theme } = useTheme();
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

  const isDark = theme === "dark";

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
        
        {/* 1. Logo Container (Theme-Aware Icon Emblem: Attached Black Castle in Light Mode, Inverted White Castle in Dark Mode - 30% Larger) */}
        <div className="transition-all duration-700 flex items-center w-12">
          <div 
            onClick={() => navigate("/")} 
            className="flex items-center justify-center cursor-pointer group"
          >
            <div className="h-12 w-12 flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
              <CastleIcon isDark={isDark} />
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
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280%] aspect-square rounded-full overflow-hidden opacity-80 group-hover:opacity-100 transition-opacity duration-500 blur-md group-hover:blur-lg pointer-events-none">
              <div 
                className="w-full h-full animate-[spin_5s_linear_infinite]"
                style={{
                  background: 'conic-gradient(from 0deg, #009df1 0%, #57bf00 25%, #009df1 50%, #57bf00 75%, #009df1 100%)',
                }}
              />
            </div>

            {/* 2. Organic Orbiting Conic Border Ring Container */}
            <div className="relative rounded-full p-[1.5px] overflow-hidden shadow-[0_0_20px_rgba(0,157,241,0.4)]">
              {/* Rotating Conic Light Beam for Border */}
              <div 
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300%] aspect-square animate-[spin_5s_linear_infinite] pointer-events-none"
                style={{
                  background: 'conic-gradient(from 0deg, #009df1 0%, #57bf00 25%, #009df1 50%, #57bf00 75%, #009df1 100%)',
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
