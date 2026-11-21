"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Image from "next/image";
import RevealText from "./RevealText";
import { Layers } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

export default function TeamSection() {
  const sectionRef = useRef<HTMLElement>(null);

  const modules = [
    {
      num: "01",
      title: "Control de Acceso",
      subtitle: "Seguridad y Citofonía Virtual",
      tag: "Seguridad 24/7",
      img: "/img/lobby-entrance.webp",
    },
    {
      num: "02",
      title: "Gestión Financiera",
      subtitle: "Pagos Nequi y Conciliación",
      tag: "Cero Mora",
      img: "/img/hero-admin.webp",
    },
    {
      num: "03",
      title: "Reservas de Áreas",
      subtitle: "Piscinas, Salones y Gimnasio",
      tag: "Sin Filas",
      img: "/img/community.webp",
    },
  ];

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".team-header > *",
        { y: 30, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 1,
          stagger: 0.1,
          scrollTrigger: { trigger: ".team-header", start: "top 80%" },
        },
      );

      gsap.fromTo(
        ".team-card",
        { y: 60, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 1,
          stagger: 0.2,
          ease: "power3.out",
          scrollTrigger: { trigger: ".team-card-container", start: "top 75%" },
        },
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="modulos"
      className="py-28 px-6 md:px-16 bg-primary relative overflow-hidden"
    >
      {/* Top Section Divider Line with Center Gradient Node */}
      <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-accent/30 to-transparent pointer-events-none" />

      {/* Ambient background blur */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/5 blur-[160px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="team-header mb-16">
          {/* Section Index Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-bold tracking-widest uppercase mb-4">
            <Layers className="w-3.5 h-3.5" />
            03 • Módulos del Sistema
          </div>

          <RevealText
            as="h2"
            className="text-3xl md:text-5xl font-bold text-text font-[family-name:var(--font-serif)] max-w-3xl leading-tight"
          >
            Tecnología intuitiva que facilita la vida. Cada módulo es un compromiso con la tranquilidad.
          </RevealText>
        </div>

        <div className="team-card-container grid grid-cols-1 md:grid-cols-3 gap-8">
          {modules.map((mod, i) => (
            <div
              key={i}
              className="team-card relative h-[480px] rounded-[36px] overflow-hidden border border-text/10 shadow-2xl group transition-all duration-500 hover:border-accent/40 hover:shadow-[0_20px_50px_rgba(0,0,0,0.4)]"
            >
              <Image
                fill
                sizes="(max-width: 768px) 100vw, 33vw"
                src={mod.img}
                alt={mod.title}
                className="object-cover transition-transform duration-700 group-hover:scale-105"
              />

              {/* Number Badge Top Left */}
              <div className="absolute top-6 left-6 px-3.5 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white font-mono text-xs font-bold">
                {mod.num}
              </div>

              {/* Tag Top Right */}
              <div className="absolute top-6 right-6 px-3 py-1 rounded-full bg-accent/90 text-on-accent text-[10px] font-bold uppercase tracking-wider shadow-md">
                {mod.tag}
              </div>

              {/* Content Bottom Card Scrim */}
              <div className="absolute inset-x-0 bottom-0 h-52 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-col justify-end p-8 border-t border-white/5 backdrop-blur-[2px]">
                <h3 className="text-2xl font-bold text-white mb-1 group-hover:text-accent transition-colors duration-300">
                  {mod.title}
                </h3>
                <p className="text-sm text-white/80 font-light">
                  {mod.subtitle}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
