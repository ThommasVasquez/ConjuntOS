"use client";

import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Scroll-driven door intro (same effect as libellula.vercel.app): a pinned
 * section where two ornate door halves swing open on a 3D hinge as you scroll,
 * revealing a grand mansion courtyard behind. Door + mansion are Higgsfield
 * generated. Theme-neutral by design — it sits over imagery in both themes.
 */
export default function DoorHero() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) {
        // No scroll animation: show the doors already open on the reveal.
        gsap.set(".door-left", { rotateY: 110, opacity: 0 });
        gsap.set(".door-right", { rotateY: -110, opacity: 0 });
        gsap.set(".door-reveal", { opacity: 1, y: 0 });
        gsap.set(".door-cta", { opacity: 0 });
        return;
      }

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: root.current,
          start: "top top",
          end: "+=170%",
          scrub: 1,
          pin: true,
          anticipatePin: 1,
        },
      });

      tl.to(".door-left", { rotateY: 108, ease: "power1.inOut" }, 0)
        .to(".door-right", { rotateY: -108, ease: "power1.inOut" }, 0)
        .fromTo(".door-bg", { scale: 1.28 }, { scale: 1, ease: "none" }, 0)
        .to(".door-cta", { opacity: 0, y: -30, ease: "power1.in", duration: 0.35 }, 0)
        .fromTo(
          ".door-reveal",
          { opacity: 0, y: 40 },
          { opacity: 1, y: 0, ease: "power2.out", duration: 0.5 },
          0.55
        )
        // doors fade near fully-open so they don't clip back in on unpin
        .to([".door-left", ".door-right"], { opacity: 0, duration: 0.2 }, 0.8);
    },
    { scope: root }
  );

  return (
    <section ref={root} className="relative h-screen w-full overflow-hidden bg-black">
      {/* Mansion revealed behind the doors */}
      <div
        className="door-bg absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url(/img/mansion.webp)" }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-black/30" />

      {/* Reveal headline (appears as the doors open) */}
      <div className="door-reveal absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-6 opacity-0">
        <span className="text-white/70 text-[11px] md:text-xs font-bold tracking-[0.35em] uppercase mb-6">
          Bienvenido a ConjuntOS
        </span>
        <h1 className="text-white text-5xl md:text-8xl font-normal font-[family-name:var(--font-serif)] tracking-tight text-glow max-w-4xl leading-[1.05]">
          Donde vivir se convierte en <span className="italic">legado</span>
        </h1>
      </div>

      {/* The two door panels (3D hinge) */}
      <div className="absolute inset-0 z-20" style={{ perspective: "2200px" }}>
        <div
          className="door-left absolute inset-y-0 left-0 w-1/2 bg-cover shadow-[20px_0_60px_rgba(0,0,0,0.6)]"
          style={{
            transformOrigin: "left center",
            transformStyle: "preserve-3d",
            backgroundImage: "url(/img/door.webp)",
            backgroundSize: "200% 100%",
            backgroundPosition: "left center",
          }}
        />
        <div
          className="door-right absolute inset-y-0 right-0 w-1/2 bg-cover shadow-[-20px_0_60px_rgba(0,0,0,0.6)]"
          style={{
            transformOrigin: "right center",
            transformStyle: "preserve-3d",
            backgroundImage: "url(/img/door.webp)",
            backgroundSize: "200% 100%",
            backgroundPosition: "right center",
          }}
        />

        {/* Wordmark + prompt over the closed doors */}
        <div className="door-cta absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <h2 className="text-white text-6xl md:text-9xl font-normal font-[family-name:var(--font-serif)] tracking-tight text-glow">
            ConjuntOS
          </h2>
          <span className="mt-8 text-white/80 text-[11px] md:text-sm font-bold tracking-[0.4em] uppercase animate-pulse">
            Desliza para entrar
          </span>
        </div>
      </div>
    </section>
  );
}
