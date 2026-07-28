"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import Image from "next/image";

export default function SplashScreen() {
  const containerRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const splashSrc = isDark ? "/SplashBLACK.png" : "/SplashWHITE.png";

  useEffect(() => {
    const hasShown = sessionStorage.getItem("conjuntos_splash_shown");
    if (hasShown) {
      setIsVisible(true);
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        onComplete: () => {
          sessionStorage.setItem("conjuntos_splash_shown", "true");
          gsap.to(containerRef.current, {
            opacity: 0,
            pointerEvents: "none",
            duration: 0.8,
            ease: "power2.inOut",
            onComplete: () => setIsVisible(false)
          });
        }
      });

      gsap.set(logoRef.current, { scale: 0.85, opacity: 0, filter: "blur(12px)" });

      tl.to(logoRef.current, {
        opacity: 1,
        scale: 1,
        filter: "blur(0px)",
        duration: 1,
        ease: "power4.out",
        delay: 0.3
      })
      .to(logoRef.current, {
        filter: "drop-shadow(0 0 28px rgba(255,255,255,0.15))",
        duration: 1.5,
        repeat: 0,
        yoyo: true
      })
      .to({}, { duration: 0.5 });

    }, containerRef);

    return () => ctx.revert();
  }, []);

  if (!isVisible) return null;

  return (
    <div 
      ref={containerRef} 
      className={`fixed inset-0 ${isDark ? 'bg-[#000000]' : 'bg-[#ffffff]'} flex flex-col items-center justify-center overflow-hidden`}
      style={{ zIndex: 999999 }}
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-info/8 blur-[120px] rounded-full" />
      
      <div className="relative flex flex-col items-center">
        <div ref={logoRef} className="relative w-[95vw] max-w-[700px] aspect-[3/1]">
          <Image 
            src={splashSrc}
            alt="ConjuntOS"
            fill
            className="object-contain"
            priority
            sizes="(max-width: 700px) 95vw, 700px"
          />
        </div>
      </div>
    </div>
  );
}
