"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const features = [
  {
    name: "MATEO",
    role: "RESIDENTE",
    img: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=600",
    color: "bg-blue-500",
    details: "Torre A • Apartamento 402",
    quote: "SOLICITO MI PARQUEADERO EN SEGUNDOS"
  },
  {
    name: "VALENTINA",
    role: "ADMINISTRADORA",
    img: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=600",
    color: "bg-purple-500",
    details: "Gestión General de Asamblea",
    quote: "ORGANIZO ASAMBLEAS SIN CAOS NI PAPELEO"
  },
  {
    name: "CARLOS",
    role: "SEGURIDAD",
    img: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=600",
    color: "bg-red-500",
    details: "Control de Acceso Vehicular",
    quote: "SÉ EXACTAMENTE QUIÉN ENTRA Y SALE"
  },
  {
    name: "ELENA",
    role: "CONTADORA",
    img: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600",
    color: "bg-green-500",
    details: "Módulo de Cartera y Pagos",
    quote: "CARTERA AL DÍA CON PAGOS AUTOMÁTICOS"
  },
  {
    name: "JULIÁN",
    role: "VISITANTE",
    img: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=600",
    color: "bg-yellow-500",
    details: "Autorización QR Invitados",
    quote: "INGRESO RÁPIDO CON MI CÓDIGO QR"
  },
  {
    name: "SARA",
    role: "RESIDENTE",
    img: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=600",
    color: "bg-pink-500",
    details: "Reserva de Zonas Comunes",
    quote: "RESERVO EL GIMNASIO DESDE MI CELULAR"
  }
];

export default function FeaturesCollage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const [activeIndex, setActiveIndex] = useState(3); // Start with Elena (Index 3)

  // Initial scroll to center (Carlos) - ONLY ONCE ON MOUNT
  useEffect(() => {
    if (scrollRef.current) {
      const cardWidth = 336; // 256px (w-64) + 80px (gap-20)
      scrollRef.current.scrollLeft = (3 * cardWidth) + (cardWidth / 2) - 168; // Center Elena (Index 3)
      // Actually, simplified: 3 * 336 = 1008
      scrollRef.current.scrollLeft = 1008;
    }
  }, []);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Animation for quote change
      gsap.fromTo(headlineRef.current, 
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }
      );

      // Track scroll for scaling and active index
      const cards = gsap.utils.toArray(".feature-card") as HTMLElement[];
      const updateActive = () => {
        if (!scrollRef.current) return;
        const viewportCenter = window.innerWidth / 2;
        
        let closestIndex = activeIndex;
        let minDistance = Infinity;

        cards.forEach((card, index) => {
          const rect = card.getBoundingClientRect();
          const cardCenter = rect.left + rect.width / 2;
          const distance = Math.abs(viewportCenter - cardCenter);
          
          if (distance < minDistance) {
            minDistance = distance;
            closestIndex = index;
          }

          // Scale secondary cards
          const maxDistance = 400;
          const ratio = Math.min(distance / maxDistance, 1);
          const scale = 1 - ratio * 0.4;
          const opacity = 1 - ratio * 0.7;

          gsap.to(card, {
            scale: scale,
            opacity: opacity,
            duration: 0.2,
            overwrite: true
          });
        });

        if (closestIndex !== activeIndex) {
          setActiveIndex(closestIndex);
        }
      };

      scrollRef.current?.addEventListener("scroll", updateActive);
      window.addEventListener("resize", updateActive);
      
      // Run once to set initial scales
      updateActive();
    }, containerRef);

    return () => ctx.revert();
  }, [activeIndex]);

  const activeItem = features[activeIndex];

  return (
    <section ref={containerRef} className="relative py-16 bg-[#05020a] overflow-hidden">
      {/* Background Grid */}
      <div className="absolute inset-0 opacity-[0.05] pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

      <div className="max-w-full mx-auto relative flex flex-col pt-10">
        {/* Dynamic Testimonial Headline */}
        <div className="w-full flex justify-center py-6 px-6 relative z-40">
          <div className="flex flex-col items-center">
            <span className="text-white font-black tracking-[0.3em] text-sm mb-4 uppercase">TESTIMONIO REAL</span>
            <h2 
              ref={headlineRef} 
              key={activeIndex}
              className="text-[4.2vw] font-black italic text-white tracking-tighter text-center uppercase leading-[0.9]"
            >
              "{activeItem.quote}"
            </h2>
          </div>
        </div>

        {/* Navigation Arrows (Desktop Only) */}
        <div className="hidden md:flex absolute left-10 top-1/2 -translate-y-1/2 z-40">
          <button 
            onClick={() => scrollRef.current?.scrollBy({ left: -400, behavior: 'smooth' })}
            className="w-16 h-16 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 flex items-center justify-center text-white hover:bg-[#FF00E5] transition-all duration-300 group shadow-2xl"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="group-hover:-translate-x-1 transition-transform">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </div>
        <div className="hidden md:flex absolute right-10 top-1/2 -translate-y-1/2 z-40">
          <button 
            onClick={() => scrollRef.current?.scrollBy({ left: 400, behavior: 'smooth' })}
            className="w-16 h-16 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 flex items-center justify-center text-white hover:bg-[#FF00E5] transition-all duration-300 group shadow-2xl"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="group-hover:translate-x-1 transition-transform">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>

        {/* The Fixed Phone Mockup - Focal Point */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none">
          <div className="relative w-[300px] md:w-[380px] aspect-[9/19.5] bg-black rounded-[3.5rem] border-[10px] border-white/10 shadow-[0_40px_100px_rgba(0,0,0,0.8)] overflow-hidden">
             {/* Notch */}
             <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-7 bg-black rounded-b-3xl z-30" />
             
             {/* Dynamic Content */}
             <div className="absolute inset-0">
                <img 
                  key={activeItem.img} // Key forces reload animation
                  src={activeItem.img} 
                  className="w-full h-full object-cover transition-opacity duration-500 animate-in fade-in" 
                  alt="App Preview" 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/30" />
                <div className="absolute bottom-12 left-8 right-8 text-white text-center">
                   <h4 className="text-3xl font-black italic tracking-tighter mb-1 uppercase animate-in slide-in-from-bottom-2 duration-500">
                     {activeItem.name}
                   </h4>
                   <p className="text-[10px] text-white/70 font-medium tracking-widest uppercase mb-4">
                     {activeItem.role}
                   </p>
                   <div className="h-[1px] w-12 bg-[#FF00E5] mx-auto mb-4 shadow-[0_0_10px_rgba(255,0,229,0.5)]" />
                   <p className="text-[11px] text-white/50 italic leading-tight">
                     {activeItem.details}
                   </p>
                </div>
             </div>
          </div>
        </div>

        {/* Scrollable Background Track */}
        <div 
          ref={scrollRef}
          className="relative overflow-x-auto no-scrollbar snap-x snap-mandatory h-[700px] flex items-center z-10"
        >
          <div className="flex items-center gap-20 px-[50vw] min-w-max h-full">
            {features.map((f, i) => (
              <div 
                key={i}
                className={`feature-card snap-center shrink-0 w-48 md:w-64 ${
                   i % 2 === 0 ? 'translate-y-24' : '-translate-y-24'
                }`}
              >
                <div className="bg-white/5 backdrop-blur-2xl p-2.5 rounded-[32px] shadow-2xl border border-white/10 relative group">
                  <div className="relative aspect-[4/5.5] rounded-[24px] overflow-hidden mb-4">
                    <img src={f.img} alt={f.name} className="w-full h-full object-cover opacity-40 grayscale group-hover:grayscale-0 transition-all duration-500" />
                    <div className={`absolute bottom-4 left-4 ${f.color} text-white px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest`}>
                      {f.role}
                    </div>
                  </div>
                  <div className="px-4 pb-3 flex items-center justify-between">
                     <h4 className="font-black text-sm text-white tracking-tight uppercase italic">{f.name}</h4>
                     <div className="w-8 h-8 rounded-full bg-[#FF00E5] flex items-center justify-center text-white shadow-[0_0_15px_rgba(255,0,229,0.4)]">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="3"><path d="M2 6H10M10 6L6 2M10 6L6 10"/></svg>
                     </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Marquee Ticker */}
      <div className="mt-10 bg-white py-1.5 scale-105 border-y border-black z-50 relative shadow-[0_0_40px_rgba(0,0,0,0.1)]">
        <div className="flex whitespace-nowrap overflow-hidden">
          <div className="flex whitespace-nowrap animate-marquee items-center">
            {[1,2,3,4,5,6,7,8].map(i => (
              <div key={i} className="flex items-center gap-10 px-5">
                <span className="text-black font-black italic text-sm uppercase tracking-tighter">PRUEBA CONJUNTOS</span>
                <div className="w-2 h-2 rounded-full bg-black" />
                <span className="text-black font-black italic text-sm uppercase tracking-tighter">GESTIÓN INTELIGENTE</span>
                <div className="w-2 h-2 rounded-full bg-black" />
                <span className="text-black font-black italic text-sm uppercase tracking-tighter">COMUNIDAD ACTIVA</span>
                <div className="w-2 h-2 rounded-full bg-black" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-25%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
      `}</style>
    </section>
  );
}
