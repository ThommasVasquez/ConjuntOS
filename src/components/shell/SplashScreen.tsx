"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";

export default function SplashScreen() {
  const containerRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<SVGSVGElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Check if splash was already shown in this session
    const hasShown = sessionStorage.getItem("conjuntos_splash_shown");
    if (hasShown) {
      setIsVisible(true); // Still mount it to handle the fade-out logic quickly
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        onComplete: () => {
          sessionStorage.setItem("conjuntos_splash_shown", "true");
          // Final fade out of the entire container
          gsap.to(containerRef.current, {
            opacity: 0,
            pointerEvents: "none",
            duration: 0.8,
            ease: "power2.inOut",
            onComplete: () => setIsVisible(false)
          });
        }
      });

      // Initial state
      gsap.set(logoRef.current, { scale: 0.8, opacity: 0, filter: "blur(10px)" });
      gsap.set(textRef.current, { y: 20, opacity: 0 });

      // Animation Sequence
      tl.to(logoRef.current, {
        opacity: 1,
        scale: 1,
        filter: "blur(0px)",
        duration: 1,
        ease: "power4.out",
        delay: 0.3
      })
      .to(textRef.current, {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: "power3.out"
      }, "-=0.4")
      .to(logoRef.current, {
        filter: "drop-shadow(0 0 20px rgba(16, 185, 129, 0.4))",
        duration: 1.5,
        repeat: 0,
        yoyo: true
      })
      // Pause slightly at the end
      .to({}, { duration: 0.5 });

    }, containerRef);

    return () => ctx.revert();
  }, []);

  if (!isVisible) return null;

  return (
    <div 
      ref={containerRef} 
      className="fixed inset-0 z-[9999] bg-[#05020a] flex flex-col items-center justify-center overflow-hidden"
    >
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-emerald-500/10 blur-[100px] rounded-full" />
      
      <div className="relative flex flex-col items-center">
        {/* Vectorized Castle Logo */}
        <svg 
          ref={logoRef}
          width="120" 
          height="120" 
          viewBox="0 0 100 100" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          className="text-white drop-shadow-2xl"
        >
          {/* Main Tower */}
          <path 
            d="M30 40V90H50V20L45 20V25H40V20L35 25V30H30" 
            fill="currentColor"
            className="opacity-90"
          />
          {/* Window */}
          <path 
            d="M36 48C36 45.7909 37.7909 44 40 44C42.2091 44 44 45.7909 44 48V58H36V48Z" 
            fill="#05020a"
          />
          {/* Flag */}
          <path 
            d="M48 20V5C48 5 44 3 40 6C36 9 32 7 32 7L33 13C33 13 37 15 41 12C45 9 48 11 48 11" 
            fill="currentColor"
          />
          {/* Side Tower */}
          <path 
            d="M55 45V65H65V35L60 35V40H55" 
            fill="currentColor"
            className="opacity-70"
          />
          {/* Side Window */}
          <path 
            d="M58 48C58 46.8954 58.8954 46 60 46C61.1046 46 62 46.8954 62 48V53H58V48Z" 
            fill="#05020a"
          />
        </svg>

        <div 
          ref={textRef}
          className="mt-8 flex flex-col items-center"
        >
          <h2 className="text-3xl font-black tracking-[0.3em] text-white uppercase bg-linear-to-b from-white to-white/40 bg-clip-text text-transparent">
            ConjuntOS
          </h2>
          <div className="mt-2 w-12 h-[1px] bg-white/20 relative overflow-hidden">
            <div className="absolute inset-0 bg-emerald-500 animate-loading-bar" />
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes loading-bar {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(0); }
          100% { transform: translateX(100%); }
        }
        .animate-loading-bar {
          animation: loading-bar 2s ease-in-out infinite;
        }
      `}} />
    </div>
  );
}
