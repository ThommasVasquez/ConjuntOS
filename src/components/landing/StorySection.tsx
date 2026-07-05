"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import RevealText from "./RevealText";

gsap.registerPlugin(ScrollTrigger);

export default function StorySection() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Text animation
      gsap.fromTo(".story-text > *", 
        { y: 40, opacity: 0 },
        { 
          y: 0, opacity: 1, duration: 1, stagger: 0.2, ease: "power3.out",
          scrollTrigger: { trigger: ".story-text", start: "top 80%" }
        }
      );

      // Images stagger animation
      gsap.fromTo(".story-img",
        { y: 60, opacity: 0, scale: 0.95 },
        {
          y: 0, opacity: 1, scale: 1, duration: 1, stagger: 0.15, ease: "back.out(1.2)",
          scrollTrigger: { trigger: ".story-img-container", start: "top 75%" }
        }
      );

      // Scrub parallax — columns drift at different speeds as you scroll past.
      gsap.to(".story-col-a", {
        yPercent: -12, ease: "none",
        scrollTrigger: { trigger: sectionRef.current, start: "top bottom", end: "bottom top", scrub: true },
      });
      gsap.to(".story-col-b", {
        yPercent: 12, ease: "none",
        scrollTrigger: { trigger: sectionRef.current, start: "top bottom", end: "bottom top", scrub: true },
      });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="py-24 px-6 md:px-16 bg-primary relative overflow-hidden">
      {/* Background orbs */}
      <div className="absolute top-[-10%] right-[-10%] w-[400px] h-[400px] bg-text/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-text/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-16 relative z-10">
        
        <div className="story-text flex-1 space-y-6">
          <RevealText as="h2" className="text-3xl md:text-5xl font-bold text-text leading-tight font-[family-name:var(--font-serif)] tracking-tight max-w-xl">
            Una historia de comunidad, seguridad y tecnología — <span className="text-accent">creamos tranquilidad.</span>
          </RevealText>
          <p className="text-text text-base md:text-lg max-w-lg leading-relaxed font-light">
            Cada módulo está diseñado con técnicas probadas para asegurar que cada interacción sea no solo eficiente, sino construida para mejorar tu calidad de vida. Con cada línea de código, llevamos calidez, tradición y sostenibilidad a tu hogar.
          </p>
        </div>

        <div className="story-img-container flex-1 flex gap-4 h-[500px]">
          <div className="story-col-a flex flex-col gap-4 w-1/2 pt-12">
            <div className="story-img relative w-full h-1/2 overflow-hidden rounded-[32px] border border-text/10 shadow-2xl transition-all duration-500 hover:scale-[1.02] hover:border-accent/40">
              <Image src="/img/hero-residente.webp" alt="Interior de un hogar en el conjunto" fill className="object-cover" unoptimized />
            </div>
            <div className="story-img relative w-full h-1/2 overflow-hidden rounded-[32px] border border-text/10 shadow-2xl transition-all duration-500 hover:scale-[1.02] hover:border-accent/40">
              <Image src="/img/community.webp" alt="Comunidad residencial" fill className="object-cover" unoptimized />
            </div>
          </div>
          <div className="story-col-b flex flex-col gap-4 w-1/2 pb-12">
            <div className="story-img relative w-full h-1/2 overflow-hidden rounded-[32px] border border-text/10 shadow-2xl transition-all duration-500 hover:scale-[1.02] hover:border-accent/40">
              <Image src="/img/building.webp" alt="Edificio del conjunto residencial" fill className="object-cover" unoptimized />
            </div>
            <div className="story-img relative w-full h-1/2 overflow-hidden rounded-[32px] border border-text/10 shadow-2xl transition-all duration-500 hover:scale-[1.02] hover:border-accent/40">
              <Image src="/img/craft-tablet.webp" alt="Gestión desde una tablet" fill className="object-cover" unoptimized />
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
