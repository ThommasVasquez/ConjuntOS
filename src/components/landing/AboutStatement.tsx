"use client";

import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);

/**
 * Scroll-driven word illumination (same effect as libellula's about statement):
 * each word starts dim (opacity 0.15) and lights up to full opacity word-by-word
 * as the section scrolls through the viewport (ScrollTrigger scrub + stagger).
 */
export default function AboutStatement() {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      const statement = el?.querySelector<HTMLElement>(".statement");
      if (!statement) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const split = SplitText.create(statement, { type: "words" });
      gsap.fromTo(
        split.words,
        { opacity: 0.15 },
        {
          opacity: 1,
          ease: "none",
          stagger: 0.08,
          scrollTrigger: {
            trigger: el,
            start: "top 72%",
            end: "bottom 62%",
            scrub: 0.5,
          },
        }
      );

      return () => split.revert();
    },
    { scope: ref }
  );

  return (
    <section ref={ref} className="bg-primary px-6 md:px-16 py-32 md:py-48">
      <div className="max-w-5xl mx-auto">
        <span className="text-accent text-xs font-bold tracking-[0.35em] uppercase mb-10 block">
          Nosotros
        </span>
        <h2 className="statement text-4xl md:text-6xl lg:text-7xl font-normal font-[family-name:var(--font-serif)] text-text leading-[1.18] tracking-tight">
          Cada conjunto es un hogar compartido: atención absoluta al detalle,
          tecnología que cuida cada rincón y decisiones transparentes, para que
          vivir en comunidad se sienta, simplemente, como un privilegio.
        </h2>
      </div>
    </section>
  );
}
