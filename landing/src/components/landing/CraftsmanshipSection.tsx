"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Image from "next/image";
import RevealText from "./RevealText";

gsap.registerPlugin(ScrollTrigger);

export default function CraftsmanshipSection() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(".craft-text > *", 
        { x: -40, opacity: 0 },
        { 
          x: 0, opacity: 1, duration: 1, stagger: 0.2, ease: "power3.out",
          scrollTrigger: { trigger: ".craft-text", start: "top 80%" }
        }
      );

      gsap.fromTo(".craft-img-1",
        { y: -40, opacity: 0 },
        { y: 0, opacity: 1, duration: 1.2, ease: "power3.out", scrollTrigger: { trigger: ".craft-img-1", start: "top 85%" } }
      );
      
      gsap.fromTo(".craft-img-2",
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 1.2, ease: "power3.out", scrollTrigger: { trigger: ".craft-img-2", start: "top 85%" } }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="py-24 px-6 md:px-16 bg-primary">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-16">
        
        <div className="craft-text flex-1 space-y-6">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-accent"></div>
            <span className="text-sm font-semibold text-text/70 uppercase tracking-widest">Nuestra esencia</span>
          </div>
          <RevealText as="h2" className="text-4xl md:text-5xl font-bold text-text font-[family-name:var(--font-serif)]">
            Innovación<br/>y Calidad
          </RevealText>
          <p className="text-text/70 text-lg max-w-sm">
            El detalle de cada función está cuidadosamente pensado por nuestro equipo para brindarte la máxima fiabilidad, como una obra de arte creada para perdurar.
          </p>
        </div>

        <div className="flex-1 relative h-[500px] w-full">
          <div className="craft-img-1 absolute top-0 left-0 w-3/5 h-64 rounded-[32px] shadow-lg z-10 overflow-hidden">
            <Image fill sizes="(max-width: 768px) 60vw, 360px" src="/img/craft-tablet.webp" alt="Tecnología de gestión residencial" className="object-cover" unoptimized />
          </div>
          <div className="craft-img-2 absolute bottom-0 right-0 w-3/5 h-[350px] rounded-[32px] shadow-lg overflow-hidden">
            <Image fill sizes="(max-width: 768px) 60vw, 360px" src="/img/hero-admin.webp" alt="Equipo de administración" className="object-cover" unoptimized />
          </div>
        </div>

      </div>
    </section>
  );
}
