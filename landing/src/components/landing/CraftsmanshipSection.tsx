"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Image from "next/image";
import RevealText from "./RevealText";
import { ShieldCheck, Cpu } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

export default function CraftsmanshipSection() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".craft-text > *",
        { x: -40, opacity: 0 },
        {
          x: 0,
          opacity: 1,
          duration: 1,
          stagger: 0.2,
          ease: "power3.out",
          scrollTrigger: { trigger: ".craft-text", start: "top 80%" },
        },
      );

      gsap.fromTo(
        ".craft-img-1",
        { y: -40, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 1.2,
          ease: "power3.out",
          scrollTrigger: { trigger: ".craft-img-1", start: "top 85%" },
        },
      );

      gsap.fromTo(
        ".craft-img-2",
        { y: 40, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 1.2,
          ease: "power3.out",
          scrollTrigger: { trigger: ".craft-img-2", start: "top 85%" },
        },
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="beneficios"
      className="py-28 px-6 md:px-16 bg-text/[0.03] relative border-t border-b border-text/10 overflow-hidden"
    >
      {/* Top Section Divider Line */}
      <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-text/20 to-transparent pointer-events-none" />

      {/* Subtle Background Radial Grid Pattern for Section Contrast */}
      <div className="absolute inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:32px_32px] pointer-events-none opacity-40" />

      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-16 relative z-10">
        <div className="craft-text flex-1 space-y-6">
          {/* Section Index Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-text/10 border border-text/15 text-text text-xs font-bold tracking-widest uppercase">
            <Cpu className="w-3.5 h-3.5 text-accent" />
            02 • Ingeniería & Calidad
          </div>

          <RevealText
            as="h2"
            className="text-4xl md:text-5xl font-bold text-text font-[family-name:var(--font-serif)] tracking-tight"
          >
            Innovación<br />y Calidad Nativa
          </RevealText>
          <p className="text-text/80 text-lg max-w-md leading-relaxed font-light">
            El detalle de cada función está cuidadosamente pensado por nuestro
            equipo para brindarte la máxima fiabilidad, como una obra de arte
            creada para perdurar.
          </p>

          <div className="pt-4 flex flex-wrap gap-4">
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-text/5 border border-text/10 text-xs font-semibold text-text">
              <ShieldCheck className="w-4 h-4 text-accent" />
              100% Cumplimiento Ley 675
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-text/5 border border-text/10 text-xs font-semibold text-text">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              Disponibilidad Cloud 99.9%
            </div>
          </div>
        </div>

        <div className="flex-1 relative h-[500px] w-full">
          <div className="craft-img-1 absolute top-0 left-0 w-3/5 h-64 rounded-[32px] border border-text/15 shadow-2xl z-10 overflow-hidden backdrop-blur-md">
            <Image
              fill
              sizes="(max-width: 768px) 60vw, 360px"
              src="/img/craft-tablet.webp"
              alt="Tecnología de gestión residencial"
              className="object-cover"
              unoptimized
            />
          </div>
          <div className="craft-img-2 absolute bottom-0 right-0 w-3/5 h-[350px] rounded-[32px] border border-text/15 shadow-2xl overflow-hidden backdrop-blur-md">
            <Image
              fill
              sizes="(max-width: 768px) 60vw, 360px"
              src="/img/hero-admin.webp"
              alt="Equipo de administración"
              className="object-cover"
              unoptimized
            />
          </div>
        </div>
      </div>
    </section>
  );
}
