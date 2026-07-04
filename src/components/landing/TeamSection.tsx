"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Image from "next/image";
import RevealText from "./RevealText";

gsap.registerPlugin(ScrollTrigger);

export default function TeamSection() {
  const sectionRef = useRef<HTMLElement>(null);

  const modules = [
    { title: "Control de Acceso", subtitle: "Seguridad y Citofonía", img: "/img/lobby-entrance.webp" },
    { title: "Gestión Financiera", subtitle: "Pagos y Reportes", img: "/img/hero-admin.webp" },
    { title: "Reservas", subtitle: "Zonas Comunes", img: "/img/community.webp" }
  ];

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(".team-header > *",
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 1, stagger: 0.1, scrollTrigger: { trigger: ".team-header", start: "top 80%" } }
      );

      gsap.fromTo(".team-card",
        { y: 60, opacity: 0 },
        { y: 0, opacity: 1, duration: 1, stagger: 0.2, ease: "power3.out", scrollTrigger: { trigger: ".team-card-container", start: "top 75%" } }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="py-24 px-6 md:px-16 bg-primary">
      <div className="max-w-7xl mx-auto">
        
        <div className="team-header mb-16">
          <p className="text-sm font-semibold text-text/70 uppercase tracking-widest mb-4">Módulos</p>
          <RevealText as="h2" className="text-3xl md:text-5xl font-bold text-text font-[family-name:var(--font-serif)] max-w-3xl leading-tight">
            Creemos en tecnología que facilita la vida. Cada módulo que desarrollamos es un compromiso con la tranquilidad.
          </RevealText>
        </div>

        <div className="team-card-container grid grid-cols-1 md:grid-cols-3 gap-6">
          {modules.map((mod, i) => (
            <div key={i} className="team-card relative h-[450px] rounded-[32px] overflow-hidden group">
              <Image fill sizes="(max-width: 768px) 100vw, 33vw" src={mod.img} alt={mod.title} className="object-cover transition-transform duration-700 group-hover:scale-105" />
              <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#000000] via-[#000000]/80 to-transparent flex flex-col justify-end p-8">
                <h3 className="text-xl font-bold text-white">{mod.title}</h3>
                <p className="text-sm text-white/70">{mod.subtitle}</p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
