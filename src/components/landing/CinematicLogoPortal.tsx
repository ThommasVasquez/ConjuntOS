"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { useTheme } from "@/components/providers/ThemeContext";

interface CinematicLogoPortalProps {
  onComplete?: () => void;
  alwaysShow?: boolean;
}

export default function CinematicLogoPortal({
  onComplete,
  alwaysShow = true,
}: CinematicLogoPortalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const portalLogoRef = useRef<HTMLDivElement>(null);
  const maskBgRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(true);

  const { theme } = useTheme();
  const isDark = theme === "dark";

  useEffect(() => {
    // Check if shown in session if alwaysShow is false
    if (!alwaysShow) {
      const hasShown = sessionStorage.getItem("conjuntos_cinematic_portal_shown");
      if (hasShown) {
        setIsVisible(false);
        onComplete?.();
        return;
      }
    }

    // Set initial webpage scale & blur for parallax entry
    const mainElement = document.querySelector("main");
    if (mainElement) {
      gsap.set(mainElement, {
        scale: 0.92,
        filter: "blur(12px)",
        transformOrigin: "center center",
      });
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        onComplete: () => {
          if (!alwaysShow) {
            sessionStorage.setItem("conjuntos_cinematic_portal_shown", "true");
          }
          // Restore webpage to normal scale and blur
          if (mainElement) {
            gsap.set(mainElement, {
              clearProps: "scale,filter,transformOrigin",
            });
          }
          setIsVisible(false);
          onComplete?.();
        },
      });

      // ── Sequence 1: Initial Centered Appearance (0.0s - 0.4s) ──
      gsap.set(containerRef.current, { opacity: 1, pointerEvents: "all" });
      gsap.set(portalLogoRef.current, {
        scale: 0.85,
        opacity: 0,
        filter: "blur(16px)",
        transformOrigin: "center center",
      });
      gsap.set(glowRef.current, { opacity: 0, scale: 0.8 });

      tl.to(portalLogoRef.current, {
        opacity: 1,
        scale: 1,
        filter: "blur(0px)",
        duration: 0.45,
        ease: "power3.out",
      })
        .to(
          glowRef.current,
          {
            opacity: 1,
            scale: 1.2,
            duration: 0.45,
            ease: "power2.out",
          },
          "-=0.4"
        )

        // ── Sequence 2: Brief Hold & Anticipation Pull-Back (0.45s - 0.75s) ──
        .to(portalLogoRef.current, {
          scale: 0.94,
          duration: 0.3,
          ease: "sine.inOut",
        })
        .to(
          glowRef.current,
          {
            scale: 0.9,
            duration: 0.3,
            ease: "sine.inOut",
          },
          "-=0.3"
        )

        // ── Sequence 3: Hyper-Speed Camera Zoom & Mask Portal Expansion (0.75s - 1.8s) ──
        .to(portalLogoRef.current, {
          scale: 85,
          duration: 1.15,
          ease: "expo.inOut",
        })
        .to(
          glowRef.current,
          {
            scale: 25,
            opacity: 0,
            duration: 0.8,
            ease: "power4.in",
          },
          "-=1.15"
        )

        // Reveal webpage through the expanding logo portal synchronously
        .to(
          mainElement,
          {
            scale: 1,
            filter: "blur(0px)",
            duration: 1.1,
            ease: "power3.out",
          },
          "-=1.0"
        )

        // Fade out overlay as logo edges cross the screen bounds (1.6s - 1.95s)
        .to(
          containerRef.current,
          {
            opacity: 0,
            duration: 0.35,
            ease: "power2.inOut",
          },
          "-=0.4"
        );
    });

    return () => ctx.revert();
  }, [alwaysShow, onComplete]);

  if (!isVisible) return null;

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-[999999] flex items-center justify-center overflow-hidden transition-colors select-none ${
        isDark ? "bg-[#050505]" : "bg-[#f8fafc]"
      }`}
      style={{ opacity: 1 }}
    >
      {/* Background Ambient Glow */}
      <div
        ref={glowRef}
        className="absolute w-[340px] h-[340px] sm:w-[480px] sm:h-[480px] rounded-full pointer-events-none blur-[90px]"
        style={{
          background: isDark
            ? "radial-gradient(circle, rgba(0,157,241,0.45) 0%, rgba(87,191,0,0.3) 50%, transparent 75%)"
            : "radial-gradient(circle, rgba(0,157,241,0.35) 0%, rgba(87,191,0,0.2) 50%, transparent 75%)",
        }}
      />

      {/* Center 3D Logo Element (Scales into Camera) */}
      <div
        ref={portalLogoRef}
        className="relative z-10 w-[140px] h-[140px] sm:w-[220px] sm:h-[220px] md:w-[260px] md:h-[260px] flex items-center justify-center transform-gpu"
        style={{ willChange: "transform, opacity, filter" }}
      >
        <svg
          viewBox="0 0 810 810"
          className="w-full h-full drop-shadow-[0_0_35px_rgba(0,157,241,0.5)]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Logo Main Emblem Paths */}
          <path
            fill={isDark ? "#FFFFFF" : "#0F172A"}
            d="M417.42,24.44l-1.49,673.91-238.44,80.01-.06-550.38,56.16-18.42.41,71.47,41.73-13.55.55-72.71,58.67-19.95.77,70.57,36.57-12.27.4-70.75,28.36-10.82.49-56.54c-22.83,18.53-43.84,4.47-62.14-4.73-18.81,4.93-44.21,25.36-64.79,7.46,46.98-.18,53.55-41.21,64.54-42.8,8.23-1.19,24.57,16.7,33.06.04,8.87-17.38,24.36-24.74,45.2-30.56Z"
          />
          <path
            fill="#57bf00"
            d="M1387.74,548.91c-5.87,19.4-26.81,24.93-44.86,19.54-21.15-6.32-25.06-31.96-19.28-51.31,3-10.05,10.75-17.3,20.82-19.76,18.02-4.41,37.67,1.09,43.23,19.57,3.14,10.42,3.23,21.57.08,31.96Z"
          />
          <path
            fill="#009df1"
            d="M1434.62,567.87c-11.29,3.94-23.11,2.76-33.98-1.77l-.06-14.19c10.9,5.17,29.26,10.06,31.77.22.81-3.19-.56-6.62-3.89-8.38l-16.5-8.72c-10.52-5.56-13.77-18.54-7.52-28.85,7.34-12.1,29.39-10.92,42.7-4.1l-4.79,11.58c-9.81-4.43-23.81-7.38-25.87,1.28-.83,3.49.97,6.67,4.3,8.42l16.03,8.44c7.62,4.01,11.54,11.35,10.57,19.91-.83,7.36-5.13,13.49-12.77,16.16Z"
          />
          <path
            fill={isDark ? "#FFFFFF" : "#0F172A"}
            d="M562.45,452.72l-71.97-35.04c-3.69-31.95-2.58-71.03,21.44-79.6,12.54-4.47,24.79-.42,34.3,8.66,10.98,10.49,15,25.61,16.67,40.93l-.43,65.05Z"
          />
          <polygon
            fill={isDark ? "#FFFFFF" : "#0F172A"}
            points="523.88 261.83 472.08 237.61 521.22 195.97 523.88 261.83"
          />
          <polygon
            fill={isDark ? "#FFFFFF" : "#0F172A"}
            points="595.1 291.86 549.02 270.61 594.68 232.11 595.1 291.86"
          />
          <path
            fill={isDark ? "#FFFFFF" : "#0F172A"}
            d="M340.17,425.35l-82.75,24.94c-.45-39.68-5.01-81.63,22.53-99.31,12.25-7.86,28.25-9.78,42.17-2.81,11.36,5.69,17.07,18.16,17.27,30.52l.77,46.65Z"
          />
        </svg>
      </div>

      {/* Decorative Loading Pulse Text (disappears before zoom) */}
      <div className="absolute bottom-12 flex flex-col items-center gap-2 tracking-widest text-[11px] uppercase font-bold text-text-muted/60 animate-pulse">
        <span>ConjuntOS</span>
      </div>
    </div>
  );
}
