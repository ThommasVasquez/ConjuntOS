"use client";

import { useRef, type ElementType, type ReactNode } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);

/**
 * Line-by-line "revealing text" on scroll — the signature editorial effect
 * (same as libellula's headings). SplitText masks each line and slides it up
 * as the heading enters the viewport. The mask occludes lines regardless of
 * any parent fade, so this composes safely over existing section animations.
 */
export default function RevealText({
  as,
  className,
  children,
  stagger = 0.1,
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
  stagger?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const Tag = (as ?? "h2") as ElementType;

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const split = SplitText.create(el, { type: "lines", mask: "lines", autoSplit: true });
      gsap.from(split.lines, {
        yPercent: 115,
        opacity: 0,
        duration: 0.9,
        ease: "expo.out",
        stagger,
        scrollTrigger: { trigger: el, start: "top 88%", once: true },
      });

      return () => split.revert();
    },
    { scope: ref }
  );

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
