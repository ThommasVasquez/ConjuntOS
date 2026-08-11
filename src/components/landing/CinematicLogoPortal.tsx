"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";

interface CinematicLogoPortalProps {
  onComplete?: () => void;
  alwaysShow?: boolean;
}

export default function CinematicLogoPortal({
  onComplete,
  alwaysShow = true,
}: CinematicLogoPortalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgGroupRef = useRef<SVGGElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Detect system browser theme preference (dark or light)
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDarkMode(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setIsDarkMode(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

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

    // Set initial webpage scale & blur for depth effect through the window
    const mainElement = document.querySelector("main");
    if (mainElement) {
      gsap.set(mainElement, {
        scale: 0.88,
        filter: "blur(10px)",
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

      // ── Step 1: Smooth Fade-In at Exact Centered Standard Size ──
      // Focal transform center is pinned exactly at the main castle window: (233.5px, 114px)
      gsap.set(containerRef.current, { opacity: 1, pointerEvents: "all" });
      gsap.set(svgGroupRef.current, {
        scale: 1,
        opacity: 0,
        transformOrigin: "233.5px 114px",
      });
      gsap.set(glowRef.current, { opacity: 0, scale: 1 });
      gsap.set(textRef.current, { opacity: 0, y: 0 });

      tl.to(svgGroupRef.current, {
        opacity: 1,
        duration: 0.5,
        ease: "power2.out",
      })
        .to(
          glowRef.current,
          {
            opacity: 1,
            duration: 0.5,
            ease: "power2.out",
          },
          "-=0.5"
        )
        .to(
          textRef.current,
          {
            opacity: 1,
            duration: 0.4,
            ease: "power2.out",
          },
          "-=0.3"
        )

        // ── Step 2: Clean Centered Pause at Standard Size (0.4s hold) ──
        .to({}, { duration: 0.4 })

        // ── Step 3: Camera Zooms Straight INTO the Main Castle Window ──
        .to(textRef.current, {
          opacity: 0,
          duration: 0.25,
          ease: "power1.in",
        })
        .to(
          svgGroupRef.current,
          {
            scale: 56, // Native vector camera zoom focused directly into (233.5px, 114px)
            duration: 1.15,
            ease: "power3.inOut",
          },
          "-=0.2"
        )
        .to(
          glowRef.current,
          {
            scale: 18,
            opacity: 0,
            duration: 0.85,
            ease: "power2.in",
          },
          "-=1.15"
        )

        // As the window expands, the webpage comes forward seamlessly
        .to(
          mainElement,
          {
            scale: 1,
            filter: "blur(0px)",
            duration: 1.05,
            ease: "power2.out",
          },
          "-=0.95"
        )

        // Fade out overlay cleanly as the window portal encompasses the viewport
        .to(
          containerRef.current,
          {
            opacity: 0,
            duration: 0.3,
            ease: "power2.inOut",
          },
          "-=0.3"
        );
    });

    return () => ctx.revert();
  }, [alwaysShow, onComplete]);

  if (!isVisible) return null;

  const textFill = isDarkMode ? "#FFFFFF" : "#111213";

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-[999999] flex items-center justify-center overflow-hidden transition-colors select-none ${
        isDarkMode ? "bg-[#050505] text-white" : "bg-[#ffffff] text-slate-900"
      }`}
      style={{ opacity: 1 }}
    >
      {/* Background Ambient Glow */}
      <div
        ref={glowRef}
        className="absolute w-[400px] h-[400px] sm:w-[600px] sm:h-[600px] rounded-full pointer-events-none blur-[100px]"
        style={{
          background: isDarkMode
            ? "radial-gradient(circle, rgba(0,157,241,0.45) 0%, rgba(87,191,0,0.3) 50%, transparent 75%)"
            : "radial-gradient(circle, rgba(0,157,241,0.35) 0%, rgba(87,191,0,0.25) 50%, transparent 75%)",
        }}
      />

      {/* Full Viewport SVG Portal Mask & Complete Attached Logo (viewBox="0 0 517.15 325.73") */}
      <svg
        viewBox="0 0 517.15 325.73"
        className="fixed inset-0 w-full h-full max-w-full max-h-full pointer-events-none z-10"
        preserveAspectRatio="xMidYMid meet"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Mask Layer: Opaque backdrop overlay everywhere EXCEPT the main castle window cutout */}
          <mask
            id="window-portal-cutout"
            maskUnits="userSpaceOnUse"
            x="-2000"
            y="-2000"
            width="4810"
            height="4810"
          >
            {/* Opaque cover everywhere */}
            <rect x="-2000" y="-2000" width="4810" height="4810" fill="white" />
            {/* Cutout Hole shaped exactly like the Castle's Main Window (Center: 233.5px, 114px) */}
            <path
              fill="black"
              d="M221.01,129.56c-.14-11.98-1.51-24.65,6.8-29.98,3.7-2.37,8.53-2.95,12.73-.85,3.43,1.72,5.15,5.48,5.22,9.21l.23,14.08-24.98,7.53Z"
            />
          </mask>
        </defs>

        {/* Scalable Vector Group: Camera zooms directly into the Castle Window (233.5px, 114px) */}
        <g
          ref={svgGroupRef}
          style={{ transformOrigin: "233.5px 114px" }}
          className="drop-shadow-[0_0_35px_rgba(0,157,241,0.45)]"
        >
          {/* Main Castle Body */}
          <path
            fill={textFill}
            d="M255.67,10.23c-2.57,5.03-7.5-.37-9.98-.01-3.32.48-5.3,12.87-19.48,12.92,6.21,5.4,13.88-.76,19.56-2.25,5.52,2.78,11.87,7.02,18.76,1.43l-.15,17.07-8.56,3.27-.12,21.36-11.04,3.7-.23-21.31-17.71,6.02-.17,21.95-12.6,4.09-.13-21.58-16.95,5.56.02,166.16,71.99-24.16.45-203.45c-6.29,1.76-10.97,3.98-13.65,9.23ZM221.01,129.56c-.14-11.98-1.51-24.65,6.8-29.98,3.7-2.37,8.53-2.95,12.73-.85,3.43,1.72,5.15,5.48,5.22,9.21l.23,14.08-24.98,7.53Z"
          />

          {/* Right Castle Side Piece */}
          <path
            fill={textFill}
            d="M313.1,130.3l-21.73-10.58c-1.11-9.65-.78-21.44,6.47-24.03,3.79-1.35,7.48-.13,10.35,2.62,3.31,3.17,4.53,7.73,5.03,12.36l-.13,19.64Z"
          />

          {/* Castle Flags / Roof Points */}
          <polygon
            fill={textFill}
            points="301.46 72.67 285.82 65.36 300.66 52.78 301.46 72.67"
          />
          <polygon
            fill={textFill}
            points="322.96 81.73 309.05 75.32 322.83 63.69 322.96 81.73"
          />

          {/* Right Small Window Cutout */}
          <path
            fill={textFill}
            d="M199.28,232.71c-.09,3.34-2.03,5.23-4.68,5.26s-4.61-1.84-4.87-4.84,1.24-5.54,4.18-5.87,5.46,1.81,5.36,5.45Z"
          />

          {/* Text: "Conjunt" */}
          <path
            fill={textFill}
            d="M33.3,289.59c6.8.1,12.32-1.66,18.85-3.65v12.9c-19.16,7.31-42.71,4.39-49.4-15.97-3.51-10.67-3.72-22.22-.29-32.85,7.1-22.03,31.79-26.59,52.44-16.58l-4.87,12.37c-4.35-2.22-8.75-4.05-13.71-4.75-7.89-1.11-15.06,2.89-18.04,10.52-3.29,8.45-3.24,18.11-.62,26.81,2.1,6.97,8.03,11.37,15.65,11.19Z"
          />
          <path
            fill={textFill}
            d="M111.74,261.75c-3.36-9.67-11.74-14.96-21.74-15.41-11.07-.49-20.72,5.41-24.04,16.19-2.45,7.94-2.42,16.46.31,24.31,3.68,10.57,13.51,16.19,24.48,15.53,9.55-.58,17.46-5.48,20.86-15.01,2.99-8.4,2.96-17.48.14-25.6ZM103.74,285.14c-2.06,6.56-7.64,10.45-14.88,10.41-7.32-.04-12.72-4.08-14.68-10.66-2.03-6.8-2.06-14.24-.14-21.01,1.96-6.92,7.46-10.47,14.42-10.63,7.15-.17,13.19,3.35,15.33,10.46,2.08,6.89,2.11,14.5-.06,21.43Z"
          />
          <path
            fill={textFill}
            d="M152.62,253.16c-9.43.13-15.77,5.67-15.86,14.96l-.31,33.23h-8.17s0-53.85,0-53.85c2.3-.45,4.32-.42,6.69-.07l1.72,7.31c4.49-6.9,12.28-8.63,20.03-8.3,9.75.42,16.59,6.83,16.63,16.83l.17,38.05-8.21.04-.08-36.59c-.02-7.52-5.19-11.72-12.62-11.62Z"
          />
          <path
            fill={textFill}
            d="M176.44,324.66c-.48-2.41-.32-4.34-.15-6.91,2.57.65,4.8,1.1,7.47,1.03,3.91-.1,6.52-3.06,6.52-7.1l.09-64.29,8.24.03-.22,64.85c-.02,5.76-3.33,10.7-8.5,12.44-4.33,1.46-8.56,1.24-13.45-.06Z"
          />
          <path
            fill={textFill}
            d="M252.37,247.4l8.15.03v53.84s-6.83.05-6.83.05l-1.29-7.5c-4.59,7.16-12.55,9.01-20.65,8.43-9.24-.67-16.19-6.41-16.25-16.13l-.27-38.69,8.31-.06.13,36.82c.01,3.51,1.44,7.65,4.68,9.43,5.36,2.93,12.86,2.66,17.93-.84,4.14-2.85,5.77-8.17,5.81-13.08l.27-32.29Z"
          />
          <path
            fill={textFill}
            d="M301.84,253.16c-9.14.28-15.32,5.56-15.41,14.72l-.33,33.49-8.17-.04v-53.84c2.4-.46,4.17-.3,6.57-.18l1.55,7.72c5.94-9.59,21.51-11.07,30.39-5.32,4.49,2.91,6.45,8.38,6.49,13.68l.25,37.98-8.2-.02-.11-36.54c-.02-7.7-5.43-11.88-13.03-11.65Z"
          />
          <path
            fill={textFill}
            d="M364.72,294.71l.06,6.21c-3.81,1.45-7.53,1.61-11.57,1.28-7.1-.58-12.32-5.87-12.39-13.17l-.31-35.38-6.98-.13c-.92-.02-1.06-2.32-.58-3.31,1.04-2.13,6.9-2.55,7.46-4.28l3.51-10.78c1.57-.45,2.98-.42,4.79-.2l.03,12.3h15.62s0,6.35,0,6.35l-15.66.02.15,33.48c.01,3.1,1.67,6.27,4.43,7.49,3.61,1.61,7.35,1.21,11.44.12Z"
          />

          {/* Text: "O" in Green (#57bf00) */}
          <path
            fill="#57bf00"
            d="M439.34,249.07c-5.57-18.47-25.22-23.98-43.23-19.57-10.06,2.46-17.81,9.71-20.82,19.76-5.78,19.34-1.87,44.99,19.28,51.31,18.04,5.39,38.98-.14,44.86-19.54,3.15-10.39,3.06-21.54-.08-31.96ZM424.04,277.28c-2.22,8.22-8.9,12.42-16.82,12.33-7.68-.08-14.04-4.05-16.35-11.65-2.45-8.05-2.46-17.06-.08-25.09,2.39-8.07,9.05-12.21,17.1-12.01,7.68.19,13.74,4.1,16.02,11.83,2.28,7.72,2.35,16.41.14,24.59Z"
          />

          {/* Text: "S" in Cyan (#009df1) */}
          <path
            fill="#009df1"
            d="M486.31,299.98c-11.29,3.94-23.11,2.76-33.98-1.77l-.06-14.19c10.9,5.17,29.26,10.06,31.77.22.81-3.19-.56-6.62-3.89-8.38l-16.5-8.72c-10.52-5.56-13.77-18.54-7.52-28.85,7.34-12.1,29.39-10.92,42.7-4.1l-4.79,11.58c-9.81-4.43-23.81-7.38-25.87,1.28-.83,3.49.97,6.67,4.3,8.42l16.03,8.44c7.62,4.01,11.54,11.35,10.57,19.91-.83,7.36-5.13,13.49-12.77,16.16Z"
          />

          {/* ® Mark */}
          <path
            fill={textFill}
            d="M517.15,218.66c0,4.93-3.87,8.8-8.9,8.8s-8.96-3.87-8.96-8.8,3.97-8.69,8.96-8.69,8.9,3.87,8.9,8.69ZM501.52,218.66c0,3.87,2.86,6.94,6.78,6.94s6.62-3.07,6.62-6.89-2.81-7-6.68-7-6.73,3.13-6.73,6.94ZM506.87,223.21h-2.01v-8.69c.79-.16,1.91-.27,3.34-.27,1.64,0,2.38.27,3.02.64.48.37.85,1.06.85,1.91,0,.95-.74,1.7-1.8,2.01v.11c.85.32,1.33.95,1.59,2.12.26,1.32.42,1.85.64,2.17h-2.17c-.26-.32-.42-1.11-.69-2.12-.16-.95-.69-1.38-1.8-1.38h-.95v3.5ZM506.92,218.29h.95c1.11,0,2.01-.37,2.01-1.27,0-.79-.58-1.33-1.85-1.33-.53,0-.9.05-1.11.11v2.49Z"
          />
        </g>
      </svg>

      {/* Footer Branding Text */}
      <div
        ref={textRef}
        className="absolute bottom-8 px-4 text-center tracking-widest text-[11px] sm:text-xs uppercase font-bold text-text-muted/80 z-20 pointer-events-none"
      >
        <span>
          ConjuntOS® Powered by ENERGYSOFTmedia® | Software con Energía! ⚡️
        </span>
      </div>
    </div>
  );
}
