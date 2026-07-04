"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/dist/ScrollTrigger";
import { Vote, Sparkles, Siren, PhoneCall, Car, Scale } from "lucide-react";
import RevealText from "./RevealText";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const features = [
  {
    title: "Asamblea 100% en Vivo",
    description: "Video en tiempo real, voto ponderado por coeficiente de copropiedad (Ley 675), acta oficial redactada por IA y traducción simultánea. La asamblea, desde casa y sin papeleo.",
    icon: Vote,
    className: "md:col-span-2 md:row-span-2 bg-text/10 border-text/20",
    iconColor: "text-[#FFFFFF]"
  },
  {
    title: "Otto, tu Asistente con IA",
    description: "Resuelve dudas fundamentado en la Ley 675 de 2001 y te guía por cada módulo de la app.",
    icon: Sparkles,
    className: "bg-text/10 border-text/20",
    iconColor: "text-white/70"
  },
  {
    title: "Botón de Pánico (SOS)",
    description: "Alerta de emergencia con un toque; llega al instante a la seguridad de turno por push.",
    icon: Siren,
    className: "bg-text/10 border-text/20",
    iconColor: "text-white/70"
  },
  {
    title: "Portero en tu Celular",
    description: "Recibe la llamada de portería y abre la puerta estés donde estés, sin citófono físico.",
    icon: PhoneCall,
    className: "bg-text/10 border-text/20",
    iconColor: "text-white/70"
  },
  {
    title: "Parqueadero Inteligente",
    description: "Cupos de visitante con 2 horas de cortesía, cobro prorrateado y aprobación del residente.",
    icon: Car,
    className: "bg-text/10 border-text/20",
    iconColor: "text-white/70"
  },
  {
    title: "Cumplimiento Ley 675 Nativo",
    description: "Multas con cobro automático, comité de convivencia, actas de mediación y quórum — todo conforme a la norma colombiana de propiedad horizontal.",
    icon: Scale,
    className: "md:col-span-2 bg-text/10 border-text/20",
    iconColor: "text-white/70"
  }
];

export default function BentoFeatures() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(".feature-card", {
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 85%",
        },
        // immediateRender:false — cards render visible until the trigger fires,
        // so a stale/misfired ScrollTrigger can never leave them stuck invisible.
        immediateRender: false,
        y: 40,
        opacity: 0,
        duration: 0.8,
        stagger: 0.1,
        ease: "power3.out"
      });
    }, containerRef);
    
    return () => ctx.revert();
  }, []);

  return (
    <section ref={containerRef} className="py-24 px-6 bg-primary">
      <div className="max-w-6xl mx-auto space-y-16">
        <div className="space-y-4 text-center md:text-left">
          <RevealText as="h2" className="text-3xl md:text-5xl font-bold text-text tracking-tight font-[family-name:var(--font-serif)]">
            Lo que hace único a <span className="text-accent">ConjuntOS</span>
          </RevealText>
          <p className="text-text max-w-xl font-medium">
            No es otra app de anuncios. Es la única plataforma que lleva la asamblea, el cumplimiento de la Ley 675 y la inteligencia artificial al día a día de tu copropiedad.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {features.map((f, i) => (
            <div 
              key={i} 
              className={`feature-card group p-8 rounded-[32px] border backdrop-blur-sm transition-all hover:scale-[1.02] active:scale-[0.98] cursor-default ${f.className}`}
            >
              <div className={`w-12 h-12 rounded-2xl bg-text/5 flex items-center justify-center mb-6 border border-text/10 group-hover:rotate-6 transition-transform ${f.iconColor}`}>
                <f.icon className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-text mb-2">{f.title}</h3>
              <p className="text-text text-sm font-medium leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
