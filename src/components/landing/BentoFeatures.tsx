"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/dist/ScrollTrigger";
import { Mic, Shield, CreditCard, Box, Calendar, MessageSquare } from "lucide-react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const features = [
  {
    title: "Citofonía Inteligente",
    description: "Mensajes de voz con transcripción automática en tiempo real.",
    icon: Mic,
    className: "md:col-span-2 md:row-span-2 bg-[#009df2]/10 border-[#009df2]/20",
    iconColor: "text-[#009df2]"
  },
  {
    title: "Pagos Transparentes",
    description: "Trazabilidad total de cuotas y certificados automáticos.",
    icon: CreditCard,
    className: "bg-blue-500/10 border-blue-500/20",
    iconColor: "text-blue-500"
  },
  {
    title: "Control de Accesos",
    description: "Pre-registro de visitantes y seguridad proactiva.",
    icon: Shield,
    className: "bg-blue-500/10 border-blue-500/20",
    iconColor: "text-blue-500"
  },
  {
    title: "Paquetería Digital",
    description: "Notificaciones instantáneas de tus entregas.",
    icon: Box,
    className: "bg-orange-500/10 border-orange-500/20",
    iconColor: "text-orange-500"
  },
  {
    title: "Reservas de Áreas",
    description: "Disponibilidad en tiempo real para tus zonas comunes.",
    icon: Calendar,
    className: "bg-rose-500/10 border-rose-500/20",
    iconColor: "text-rose-500"
  },
  {
    title: "Comunidad Conectada",
    description: "Clasificados y comunicaciones oficiales en HD.",
    icon: MessageSquare,
    className: "md:col-span-2 bg-indigo-500/10 border-indigo-500/20",
    iconColor: "text-indigo-500"
  }
];

export default function BentoFeatures() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(".feature-card", {
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 80%",
        },
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
    <section ref={containerRef} className="py-24 px-6 bg-[#0A0A0B]">
      <div className="max-w-6xl mx-auto space-y-16">
        <div className="space-y-4 text-center md:text-left">
          <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight">
            Todo lo que tu <span className="text-[#009df2]">Conjunto</span> necesita
          </h2>
          <p className="text-white/40 max-w-xl font-medium">
            Módulos integrados bajo una misma identidad visual. Eficiencia operativa envuelta en diseño de clase mundial.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {features.map((f, i) => (
            <div 
              key={i} 
              className={`feature-card group p-8 rounded-[32px] border backdrop-blur-sm transition-all hover:scale-[1.02] active:scale-[0.98] cursor-default ${f.className}`}
            >
              <div className={`w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-6 border border-white/10 group-hover:rotate-6 transition-transform ${f.iconColor}`}>
                <f.icon className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{f.title}</h3>
              <p className="text-white/40 text-sm font-medium leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
