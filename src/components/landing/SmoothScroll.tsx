"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * Smooth scroll for the landing (same feel as libellula.vercel.app).
 * Lenis drives the scroll; we hand its RAF to the GSAP ticker so every
 * ScrollTrigger stays perfectly in sync (scrub/pin included). Mounted only
 * on the landing page, so the in-app dashboard keeps native scrolling.
 */
export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // ponytail: respect reduced-motion — no inertia for users who opt out.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    lenis.on("scroll", ScrollTrigger.update);

    const ticker = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(ticker);
    gsap.ticker.lagSmoothing(0);

    // The pinned DoorHero and late-loading images change the total scroll
    // height AFTER downstream ScrollTriggers are created, leaving their start
    // positions stale (reveals never fire → sections stuck invisible). Recalc
    // all trigger positions once things settle.
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener("load", refresh);
    const timers = [setTimeout(refresh, 600), setTimeout(refresh, 2000)];

    return () => {
      window.removeEventListener("load", refresh);
      timers.forEach(clearTimeout);
      gsap.ticker.remove(ticker);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
