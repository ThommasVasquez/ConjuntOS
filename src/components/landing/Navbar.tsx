"use client";

import { useViewTransition } from "@/components/providers/ViewTransitionContext";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";

import Image from "next/image";

export default function Navbar() {
  const { navigate } = useViewTransition();
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
          ? "bg-white/[0.08] border-[1.5px] border-white/30 rounded-full py-2.5 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.6),inset_0_1px_2px_rgba(255,255,255,0.4)]" 
          : "bg-transparent py-6 border-transparent rounded-none"
      }`}>
        {/* Lens Refraction Simulation */}
        {scrolled && (
          <div 
            className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,_rgba(255,255,255,0.15),_transparent_60%)] pointer-events-none" 
          />
        )}
        
        {/* Specular Edge Highlight */}
        {scrolled && (
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/50 to-transparent pointer-events-none" />
        )}
        
        {/* 1. Logo Container (Fixed width to balance right side) */}
        <div className={`transition-all duration-700 flex items-center ${scrolled ? "w-[120px]" : "w-[180px]"}`}>
          <div 
            onClick={() => navigate("/")} 
            className="flex items-center cursor-pointer group"
          >
            <div className={`transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] flex items-center justify-center text-black dark:text-white ${
              scrolled ? "h-10 w-10" : "h-10 w-[120px]"
            }`}>
              {scrolled ? (
                <Image 
                  src="/solo.svg" 
                  alt="ConjuntOS" 
                  width={40} 
                  height={40} 
                  className="w-full h-full object-contain"
                />
              ) : (
                <svg viewBox="0 0 540 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full object-contain">
                  <path d="M40 70V160H80V30L72 30V38H64V30L56 38V46H40" fill="currentColor"/>
                  <path d="M50 82C50 78.6863 52.6863 76 56 76C59.3137 76 62 78.6863 62 82V98H50V82Z" className="fill-white dark:fill-[#05020a]"/>
                  <path d="M76 30V6C76 6 70 3 64 7.5C58 12 52 9 52 9L53.5 18C53.5 18 59.5 21 65.5 16.5C71.5 12 76 15 76 15" fill="currentColor"/>
                  <path d="M88 78V110H104V58L96 58V66H88" fill="currentColor" fillOpacity="0.85"/>
                  <path d="M92 82C92 80.3431 93.3431 79 95 79C96.6569 79 98 80.3431 98 82V89H92V82Z" className="fill-white dark:fill-[#05020a]"/>
                  <text x="135" y="122" fill="currentColor" style={{ fontFamily: 'var(--font-plus-jakarta), sans-serif', fontWeight: 700, fontSize: '72px', letterSpacing: '-0.03em' }}>
                    Conjunt<tspan style={{ fontWeight: 800 }}>OS</tspan><tspan dy="-34" style={{ fontSize: '22px', fontWeight: 400 }}>®</tspan>
                  </text>
                </svg>
              )}
            </div>
          </div>
        </div>

        {/* 2. Links Container (Center, takes all remaining space) */}
        <div className="flex-1 flex justify-center items-center">
          <div className="hidden md:flex items-center gap-8">
            {["Acerca", "Módulos", "Beneficios", "Pricing", "Soporte"].map((item) => (
              <button 
                key={item}
                className={`transition-all duration-500 text-[11px] font-medium tracking-tight uppercase ${
                  scrolled ? "text-white/50 hover:text-white" : "text-white/70 hover:text-white tracking-widest"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {/* 3. Actions Container (Fixed width to balance left side) */}
        <div className={`transition-all duration-700 flex items-center justify-end gap-6 ${scrolled ? "w-[120px]" : "w-[180px]"}`}>
          <button className="text-white/50 hover:text-white transition-colors duration-300">
            <Search size={16} strokeWidth={2.5} />
          </button>
          <div className="h-4 w-[1px] bg-white/10 mx-1" />
          <button 
            onClick={() => window.location.href = "https://app.conjuntos.app/login"} 
            className={`transition-all duration-700 px-5 py-1.5 rounded-full text-[11px] font-bold tracking-tight whitespace-nowrap ${
              scrolled 
                ? "text-white bg-white/10 hover:bg-white hover:text-black" 
                : "text-white border border-white/20 hover:bg-white hover:text-black"
            }`}
          >
            Ingresar
          </button>
        </div>

      </div>
    </nav>
  );
}
