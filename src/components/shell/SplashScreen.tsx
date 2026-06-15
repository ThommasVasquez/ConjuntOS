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
        filter: "drop-shadow(0 0 20px rgba(0,0,0,0.3))",
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
      className="fixed inset-0 bg-[#000000] flex flex-col items-center justify-center overflow-hidden"
      style={{ zIndex: 999999 }}
    >
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-[#FFFFFF]/10 blur-[100px] rounded-full" />
      
      <div className="relative flex flex-col items-center">
        {/* Precise Official Logo (Paths matched to provided image) */}
        <svg 
          ref={logoRef}
          width="320" 
          height="120" 
          viewBox="0 0 540 180" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          className="text-white drop-shadow-2xl"
        >
          <path d="M40 70V160H80V30L72 30V38H64V30L56 38V46H40" fill="currentColor"/>
          <path d="M50 82C50 78.6863 52.6863 76 56 76C59.3137 76 62 78.6863 62 82V98H50V82Z" fill="#000000"/>
          <path d="M76 30V6C76 6 70 3 64 7.5C58 12 52 9 52 9L53.5 18C53.5 18 59.5 21 65.5 16.5C71.5 12 76 15 76 15" fill="currentColor"/>
          <path d="M88 78V110H104V58L96 58V66H88" fill="currentColor" fillOpacity="0.85"/>
          <path d="M92 82C92 80.3431 93.3431 79 95 79C96.6569 79 98 80.3431 98 82V89H92V82Z" fill="#000000"/>

          <text 
            x="135" 
            y="122" 
            fill="currentColor" 
            style={{ 
              fontFamily: "'Plus Jakarta Sans', sans-serif", 
              fontWeight: 700, 
              fontSize: "72px", 
              letterSpacing: "-0.03em" 
            }}
          >
            Conjunt<tspan style={{ fontWeight: 800 }} fill="#57bf00">O</tspan><tspan style={{ fontWeight: 800 }} fill="#009df2">S</tspan><tspan dy="-34" style={{ fontSize: "22px", fontWeight: 400 }}>®</tspan>
          </text>
        </svg>

        <div 
          ref={textRef}
          className="mt-8 flex flex-col items-center"
        >
          {/* Loader de 4 puntos: el punto activo se ilumina en cian con halo y recorre de izquierda a derecha */}
          <div className="dots-loader">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .dots-loader {
          display: flex;
          align-items: center;
          gap: 22px;
        }
        .dots-loader .dot {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          /* Gota aqua en reposo: esfera glossy azul con highlight especular arriba */
          background:
            radial-gradient(circle at 50% 28%, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0) 30%),
            radial-gradient(circle at 50% 115%, #007ac2 0%, #009df2 55%, #0b6fae 100%);
          box-shadow: inset 0 -2px 4px rgba(0,0,0,0.25), inset 0 2px 3px rgba(255,255,255,0.35);
          animation: dot-wave 1.4s ease-in-out infinite;
        }
        .dots-loader .dot:nth-child(1) { animation-delay: 0s; }
        .dots-loader .dot:nth-child(2) { animation-delay: 0.18s; }
        .dots-loader .dot:nth-child(3) { animation-delay: 0.36s; }
        .dots-loader .dot:nth-child(4) { animation-delay: 0.54s; }
        @keyframes dot-wave {
          0%, 60%, 100% {
            background:
              radial-gradient(circle at 50% 28%, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0) 30%),
              radial-gradient(circle at 50% 115%, #007ac2 0%, #009df2 55%, #0b6fae 100%);
            box-shadow: inset 0 -2px 4px rgba(0,0,0,0.25), inset 0 2px 3px rgba(255,255,255,0.35);
            transform: scale(1);
          }
          30% {
            /* Gota encendida: cian luminoso, highlight fuerte y halo aqua exterior */
            background:
              radial-gradient(circle at 50% 26%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 34%),
              radial-gradient(circle at 50% 120%, #5cf2ec 0%, #3fe5e0 50%, #18b9d6 100%);
            box-shadow:
              inset 0 -2px 5px rgba(0,40,60,0.3),
              inset 0 2px 4px rgba(255,255,255,0.6),
              0 0 18px 7px rgba(63, 229, 224, 0.6);
            transform: scale(1.18) translateY(-1px);
          }
        }
      `}} />
    </div>
  );
}
