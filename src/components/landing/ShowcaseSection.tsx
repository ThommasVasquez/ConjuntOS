"use client";

import { useEffect, useRef } from "react";
import { CheckCircle2 } from "lucide-react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export default function ShowcaseSection() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(".showcase-left",
        { x: -50, opacity: 0 },
        { x: 0, opacity: 1, duration: 1, ease: "power3.out", scrollTrigger: { trigger: ".showcase-left", start: "top 80%" } }
      );
      
      gsap.fromTo(".showcase-right",
        { x: 50, opacity: 0 },
        { x: 0, opacity: 1, duration: 1, ease: "power3.out", scrollTrigger: { trigger: ".showcase-right", start: "top 80%" } }
      );

      gsap.fromTo(".showcase-float",
        { y: 30, opacity: 0, scale: 0.9 },
        { y: 0, opacity: 1, scale: 1, duration: 0.8, delay: 0.4, ease: "back.out(1.5)", scrollTrigger: { trigger: ".showcase-right", start: "top 70%" } }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="py-24 px-6 md:px-16 bg-[#000000]">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-16">
        
        <div className="showcase-left flex-1 flex flex-col justify-between">
          <div className="mb-12 max-w-md">
            <p className="text-sm font-semibold text-neutral-500 uppercase tracking-widest mb-4">Integraciones</p>
            <h2 className="text-2xl md:text-4xl font-bold text-white font-[family-name:var(--font-montserrat)] leading-tight">
              Nuestra plataforma está definida por ecosistemas perfectamente conectados que irradian eficiencia, seguridad y confianza.
            </h2>
          </div>

          <div className="relative rounded-[32px] overflow-hidden bg-neutral-200 shadow-xl h-[400px]">
            <img src="https://images.unsplash.com/photo-1556910103-1c02745a872f?auto=format&fit=crop&w=800&q=80" alt="Lobby System" className="w-full h-full object-cover" />
            <div className="absolute bottom-0 inset-x-0 bg-[#000000]/90 backdrop-blur-md p-6 flex items-center justify-between border-t border-white/5">
              <div>
                <p className="text-sm text-neutral-500 mb-1">Integración Directa</p>
                <h4 className="font-bold text-white text-lg">Pagos Automatizados PSE</h4>
              </div>
              <div className="w-12 h-12 bg-[#FFFFFF]/10 rounded-full flex items-center justify-center">
                <CheckCircle2 className="text-[#FFFFFF] w-6 h-6" />
              </div>
            </div>
          </div>
        </div>

        <div className="showcase-right flex-1 relative">
          <div className="rounded-[32px] overflow-hidden h-full min-h-[600px] bg-neutral-200 shadow-xl">
            <img src="https://images.unsplash.com/photo-1542181961-9590d0c79227?auto=format&fit=crop&w=800&q=80" alt="Smart Access" className="w-full h-full object-cover" />
          </div>
          
          <div className="showcase-float absolute bottom-8 right-8 bg-[#000000]/80 border border-white/10 backdrop-blur-xl p-4 rounded-2xl shadow-2xl flex items-center gap-4 w-72">
            <div className="w-12 h-12 rounded-full bg-black flex items-center justify-center overflow-hidden border border-white/5">
              <img src="https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=100&q=80" alt="Avatar" className="w-full h-full object-cover opacity-80" />
            </div>
            <div>
              <p className="font-bold text-white text-sm">Control de Accesos</p>
              <p className="text-xs text-neutral-500">20+ Opciones configurables</p>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
