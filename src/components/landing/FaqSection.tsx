"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Minus } from "lucide-react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export default function FaqSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(1);
  const sectionRef = useRef<HTMLElement>(null);

  const faqs = [
    { q: "¿Cuánto tarda la implementación en mi conjunto?", a: "Típicamente, el proceso de onboarding y configuración inicial toma entre 3 a 5 días hábiles, incluyendo la capacitación al personal administrativo y guardas de seguridad." },
    { q: "¿Puedo integrar el sistema con talanqueras existentes?", a: "Sí, ConjuntOS ofrece APIs y hardware compatible para integrarse con la mayoría de sistemas de acceso vehicular existentes." },
    { q: "¿Qué pasa si un residente no tiene smartphone?", a: "El sistema permite a la administración generar pines manuales o usar el sistema de citofonía tradicional a la par, garantizando cobertura total." },
    { q: "¿El pago por la pasarela PSE tiene costos extra?", a: "Manejamos una tarifa plana muy competitiva por transacción que puede ser asumida por el conjunto o por el residente, según la decisión de la asamblea." }
  ];

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(".faq-left",
        { y: 50, opacity: 0 },
        { y: 0, opacity: 1, duration: 1, ease: "power3.out", scrollTrigger: { trigger: ".faq-left", start: "top 80%" } }
      );
      
      gsap.fromTo(".faq-img",
        { scale: 0.8, opacity: 0, rotation: -10 },
        { scale: 1, opacity: 1, rotation: 3, duration: 1, ease: "back.out(1.5)", scrollTrigger: { trigger: ".faq-left", start: "top 70%" } }
      );

      gsap.fromTo(".faq-item",
        { x: 30, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.6, stagger: 0.1, ease: "power2.out", scrollTrigger: { trigger: ".faq-right", start: "top 85%" } }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="py-24 px-6 md:px-16 bg-[#05020a]">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-16 items-start">
        
        <div className="faq-left flex-1 relative pb-20 lg:pb-0">
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-4">FAQ</p>
          <h2 className="text-3xl md:text-5xl font-bold text-white font-[family-name:var(--font-montserrat)] max-w-md leading-tight mb-8">
            Si tienes alguna duda sobre el proceso de implementación, estamos listos para ayudarte en cada paso.
          </h2>
          
          <div className="faq-img absolute -bottom-10 right-10 lg:bottom-0 lg:right-20 w-48 h-48 rounded-[24px] overflow-hidden shadow-2xl rotate-3">
            <img src="https://images.unsplash.com/photo-1574362848149-11496d93a7c7?auto=format&fit=crop&w=400&q=80" alt="Customer support" className="w-full h-full object-cover" />
          </div>
        </div>

        <div className="faq-right flex-1 w-full pt-8 lg:pt-0">
          <div className="flex flex-col gap-4">
            {faqs.map((faq, idx) => (
              <div 
                key={idx} 
                className="faq-item border-b border-white/10 py-6 cursor-pointer"
                onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
              >
                <div className="flex items-center justify-between gap-4">
                  <h4 className={`text-lg font-bold transition-colors ${openIdx === idx ? "text-[#3b82f6]" : "text-white"}`}>
                    {faq.q}
                  </h4>
                  {openIdx === idx ? <Minus className="w-5 h-5 flex-shrink-0 text-[#3b82f6]" /> : <Plus className="w-5 h-5 flex-shrink-0 text-white" />}
                </div>
                {openIdx === idx && (
                  <p className="mt-4 text-gray-400 leading-relaxed pr-8 animate-in fade-in slide-in-from-top-2 duration-300">
                    {faq.a}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
