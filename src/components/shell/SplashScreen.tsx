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
        {/* ConjuntOS Horizontal Logo — white on black, blue+green preserved */}
        <svg 
          ref={logoRef}
          viewBox="0 0 810 810" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          className="w-[90vw] max-w-[440px] h-auto text-white drop-shadow-2xl"
        >
          <path d="M125.88,331l-.35,156.76-55.46,18.61v-128.02s13.05-4.29,13.05-4.29l.1,16.62,9.71-3.15.13-16.91,13.65-4.64.18,16.42,8.51-2.85.09-16.46,6.6-2.52.11-13.15c-5.31,4.31-10.2,1.04-14.45-1.1-4.38,1.15-10.28,5.9-15.07,1.74,10.93-.04,12.46-9.58,15.01-9.95,1.91-.28,5.71,3.88,7.69,0s5.67-5.76,10.51-7.11Z" fill="currentColor" />
          <path fill="#57bf00" d="M660.69,442.35c-5.87,19.4-26.81,24.93-44.86,19.54-21.15-6.32-25.06-31.96-19.28-51.31,3-10.05,10.75-17.3,20.82-19.76,18.02-4.41,37.67,1.09,43.23,19.57,3.14,10.42,3.23,21.57.08,31.96Z" />
          <path fill="#009df1" d="M707.57,461.31c-11.29,3.94-23.11,2.76-33.98-1.77l-.06-14.19c10.9,5.17,29.26,10.06,31.77.22.81-3.19-.56-6.62-3.89-8.38l-16.5-8.72c-10.52-5.56-13.77-18.54-7.52-28.85,7.34-12.1,29.39-10.92,42.7-4.1l-4.79,11.58c-9.81-4.43-23.81-7.38-25.87,1.28-.83,3.49.97,6.67,4.3,8.42l16.03,8.44c7.62,4.01,11.54,11.35,10.57,19.91-.83,7.36-5.13,13.49-12.77,16.16Z" />
          <path fill="currentColor" d="M254.57,450.91c6.8.1,12.32-1.66,18.85-3.65v12.9c-19.16,7.31-42.71,4.39-49.4-15.97-3.51-10.67-3.72-22.22-.29-32.85,7.1-22.03,31.79-26.59,52.44-16.58l-4.87,12.37c-4.35-2.22-8.75-4.05-13.71-4.75-7.89-1.11-15.06,2.89-18.04,10.52-3.29,8.45-3.24,18.11-.62,26.81,2.1,6.97,8.03,11.37,15.65,11.19Z" />
          <path fill="currentColor" d="M332.87,448.67c-3.4,9.53-11.31,14.43-20.86,15.01-10.97.67-20.8-4.95-24.48-15.53-2.73-7.85-2.75-16.37-.31-24.31,3.32-10.77,12.97-16.68,24.04-16.19,10.01.45,18.38,5.74,21.74,15.41,2.82,8.11,2.85,17.2-.14,25.6Z" />
          <path fill="currentColor" d="M373.89,414.48c-9.43.13-15.77,5.67-15.86,14.96l-.31,33.23h-8.17s0-53.85,0-53.85c2.3-.45,4.32-.42,6.69-.07l1.72,7.31c4.49-6.9,12.28-8.63,20.03-8.3,9.75.42,16.59,6.83,16.63,16.83l.17,38.05-8.21.04-.08-36.59c-.02-7.52-5.19-11.72-12.62-11.62Z" />
          <path fill="currentColor" d="M473.63,408.72l8.15.03v53.84s-6.83.05-6.83.05l-1.29-7.5c-4.59,7.16-12.55,9.01-20.65,8.43-9.24-.67-16.19-6.41-16.25-16.13l-.27-38.69,8.31-.06.13,36.82c.01,3.51,1.44,7.65,4.68,9.43,5.36,2.93,12.86,2.66,17.93-.84,4.14-2.85,5.77-8.17,5.81-13.08l.27-32.29Z" />
          <path fill="currentColor" d="M523.11,414.48c-9.14.28-15.32,5.56-15.41,14.72l-.33,33.49-8.17-.04v-53.84c2.4-.46,4.17-.3,6.57-.18l1.55,7.72c5.94-9.59,21.51-11.07,30.39-5.32,4.49,2.91,6.45,8.38,6.49,13.68l.25,37.98-8.2-.02-.11-36.54c-.02-7.7-5.43-11.88-13.03-11.65Z" />
          <path fill="currentColor" d="M585.99,456.04l.06,6.21c-3.81,1.45-7.53,1.61-11.57,1.28-7.1-.58-12.32-5.87-12.39-13.17l-.31-35.38-6.98-.13c-.92-.02-1.06-2.32-.58-3.31,1.04-2.13,6.9-2.55,7.46-4.28l3.51-10.78c1.57-.45,2.98-.42,4.79-.2l.03,12.3h15.62s0,6.35,0,6.35l-15.66.02.15,33.48c.01,3.1,1.67,6.27,4.43,7.49,3.61,1.61,7.35,1.21,11.44.12Z" />
          <path fill="currentColor" d="M397.71,485.99c-.48-2.41-.32-4.34-.15-6.91,2.57.65,4.8,1.1,7.47,1.03,3.91-.1,6.52-3.06,6.52-7.1l.09-64.29,8.24.03-.22,64.85c-.02,5.76-3.33,10.7-8.5,12.44-4.33,1.46-8.56,1.24-13.45-.06Z" />
          <path fill="currentColor" d="M159.62,430.62l-16.74-8.15c-.86-7.43-.6-16.52,4.99-18.52,2.92-1.04,5.77-.1,7.98,2.01,2.55,2.44,3.49,5.96,3.88,9.52l-.1,15.13Z" />
          <path fill="currentColor" d="M125.54,487.75l.35-156.76-.35,156.76Z" />
          <polygon fill="currentColor" points="150.64 386.22 138.6 380.58 150.03 370.89 150.64 386.22" />
          <path fill="currentColor" d="M420.55,394.04c-.09,3.34-2.03,5.23-4.68,5.26s-4.61-1.84-4.87-4.84,1.24-5.54,4.18-5.87,5.46,1.81,5.36,5.45Z" />
          <polygon fill="currentColor" points="167.21 393.2 156.49 388.26 167.11 379.3 167.21 393.2" />
          <path fill="currentColor" d="M107.91,424.25l-19.25,5.8c-.1-9.23-1.16-18.99,5.24-23.1,2.85-1.83,6.57-2.27,9.81-.65,2.64,1.32,3.97,4.22,4.02,7.1l.18,10.85Z" />
          <path fill="currentColor" d="M645.31,438.6c-2.22,8.22-8.9,12.42-16.82,12.33-7.68-.08-14.04-4.05-16.35-11.65-2.45-8.05-2.46-17.06-.08-25.09s9.05-12.21,17.1-12.01c7.68.19,13.74,4.1,16.02,11.83s2.35,16.41.14,24.59Z" />
          <path fill="currentColor" d="M310.13,456.88c-7.32-.04-12.72-4.08-14.68-10.66s-2.06-14.24-.14-21.01,7.46-10.47,14.42-10.63,13.19,3.35,15.33,10.46,2.11,14.5-.06,21.43c-2.06,6.56-7.64,10.45-14.88,10.41Z" />
          <text transform="translate(718.39 407.59)" fill="currentColor" fontFamily="MyriadPro-Regular, 'Myriad Pro'" fontSize="53"><tspan x="0" y="0">®</tspan></text>
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
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #009df2;
          animation: dot-wave 1.4s ease-in-out infinite;
        }
        .dots-loader .dot:nth-child(1) { animation-delay: 0s; }
        .dots-loader .dot:nth-child(2) { animation-delay: 0.18s; }
        .dots-loader .dot:nth-child(3) { animation-delay: 0.36s; }
        .dots-loader .dot:nth-child(4) { animation-delay: 0.54s; }
        @keyframes dot-wave {
          0%, 60%, 100% {
            background: #009df2;
            box-shadow: none;
            transform: scale(1);
          }
          30% {
            background: #3fe5e0;
            box-shadow: 0 0 16px 6px rgba(63, 229, 224, 0.55);
            transform: scale(1.15);
          }
        }
      `}} />
    </div>
  );
}
