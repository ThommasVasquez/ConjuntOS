"use client";

import { useViewTransition } from "@/components/providers/ViewTransitionContext";
import { Search, ShoppingBag, User } from "lucide-react";
import { useEffect, useState } from "react";

import Image from "next/image";

export default function Navbar() {
  const { navigate } = useViewTransition();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${scrolled ? "bg-[#05020a]/90 backdrop-blur-md py-4 shadow-sm border-b border-white/5" : "bg-transparent py-6"}`}>
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        {/* Logo */}
        <div 
          onClick={() => navigate("/")} 
          className="flex items-center cursor-pointer group"
        >
          <div className="h-13 w-[156px] flex items-center text-white">
            <svg viewBox="0 0 540 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full object-contain">
              <path d="M40 70V160H80V30L72 30V38H64V30L56 38V46H40" fill="currentColor"/>
              <path d="M50 82C50 78.6863 52.6863 76 56 76C59.3137 76 62 78.6863 62 82V98H50V82Z" fill="#05020a"/>
              <path d="M76 30V6C76 6 70 3 64 7.5C58 12 52 9 52 9L53.5 18C53.5 18 59.5 21 65.5 16.5C71.5 12 76 15 76 15" fill="currentColor"/>
              <path d="M88 78V110H104V58L96 58V66H88" fill="currentColor" fillOpacity="0.85"/>
              <path d="M92 82C92 80.3431 93.3431 79 95 79C96.6569 79 98 80.3431 98 82V89H92V82Z" fill="#05020a"/>
              <text x="135" y="122" fill="currentColor" style={{ fontFamily: 'var(--font-plus-jakarta), sans-serif', fontWeight: 700, fontSize: '72px', letterSpacing: '-0.03em' }}>
                Conjunt<tspan style={{ fontWeight: 800 }}>OS</tspan><tspan dy="-34" style={{ fontSize: '22px', fontWeight: 400 }}>®</tspan>
              </text>
            </svg>
          </div>
        </div>

        {/* Links */}
        <div className="hidden md:flex items-center gap-6 ml-12">
          {["Acerca de", "Módulos", "Beneficios"].map((item) => (
            <button 
              key={item}
              className="text-white/70 hover:text-white text-[10px] font-bold tracking-widest uppercase transition-colors"
            >
              {item}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-6 ml-auto">
          <button className="text-white/80 hover:text-white text-[10px] font-bold tracking-widest uppercase transition-colors">Buscar</button>
          <button className="text-white/80 hover:text-white text-[10px] font-bold tracking-widest uppercase transition-colors">US</button>
          <button className="text-white/80 hover:text-white text-[10px] font-bold tracking-widest uppercase transition-colors">Bolsa</button>
          <button onClick={() => window.location.href = "https://app.conjuntos.app/login"} className="text-white hover:text-[#D946EF] text-[10px] font-bold tracking-widest uppercase transition-colors">Ingresar</button>
        </div>
      </div>
    </nav>
  );
}
