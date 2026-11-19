"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useTheme } from "@/components/providers/ThemeContext";

interface PullToRefreshLogoProps {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
}

const PULL_THRESHOLD = 72;
const MAX_PULL = 120;

/**
 * Threads-inspired Pull-to-Refresh using the official horizontal ConjuntOS® vector logo.
 *
 * - As the user pulls down, the SVG strokes progressively trace/draw themselves from
 *   left to right (Tower -> C-o-n-j-u-n-t -> green O -> blue S -> ®), then the fill
 *   smoothly materializes as the threshold is reached.
 * - While refreshing, a traveling light-beam stroke animation loops across the logo
 *   contours just like Instagram Threads.
 */
export default function PullToRefreshLogo({ onRefresh, children }: PullToRefreshLogoProps) {
  const { theme } = useTheme();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const startYRef = useRef<number | null>(null);
  const startXRef = useRef<number | null>(null);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const lastHapticStepRef = useRef(0);
  const hapticLabelRef = useRef<HTMLLabelElement | null>(null);
  const hapticInputRef = useRef<HTMLInputElement | null>(null);

  // Set raw HTML `switch` attribute directly on the DOM node so iOS 17.4+/18 WebKit
  // treats it as a native UISwitch control wired to the Taptic Engine.
  useEffect(() => {
    if (hapticInputRef.current) {
      hapticInputRef.current.setAttribute("switch", "");
    }
  }, []);

  const triggerHaptic = useCallback((step: number, isThresholdSnap = false) => {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        if (isThresholdSnap) {
          navigator.vibrate([16, 26, 22]);
        } else {
          // Progressive micro-pulse: 4ms up to 14ms as you pull deeper
          const duration = Math.min(15, Math.round(3 + step * 1.6));
          navigator.vibrate(duration);
        }
        return;
      }
      // iOS 17.4+ / iOS 18 WebKit Taptic Engine switch fallback
      if (hapticLabelRef.current) {
        hapticLabelRef.current.click();
        if (isThresholdSnap) {
          setTimeout(() => hapticLabelRef.current?.click(), 55);
        }
      }
    } catch {
      // Ignore on unsupported devices
    }
  }, []);

  const getScrollTop = useCallback(() => {
    if (typeof window === "undefined") return 0;
    const scroller = wrapperRef.current?.closest(".page-content") as HTMLElement | null;
    return (scroller ? scroller.scrollTop : 0) + window.scrollY;
  }, []);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (getScrollTop() > 2) {
        startYRef.current = null;
        return;
      }
      startYRef.current = e.touches[0].clientY;
      startXRef.current = e.touches[0].clientX;
      lastHapticStepRef.current = 0;
      setIsDragging(true);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (refreshingRef.current || startYRef.current === null || startXRef.current === null) return;

      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      const dy = currentY - startYRef.current;
      const dx = Math.abs(currentX - startXRef.current);

      if (dx > dy && pullRef.current === 0) {
        startYRef.current = null;
        setIsDragging(false);
        return;
      }

      if (dy > 0 && getScrollTop() <= 2) {
        const damped = Math.min(MAX_PULL, Math.pow(dy, 0.82) * 1.32);
        pullRef.current = damped;
        setPullDistance(damped);

        // Progressive haptic ticks across 8 stages as the logo traces itself
        const norm = Math.min(1, Math.max(0, (damped - 6) / (PULL_THRESHOLD - 6)));
        const currentStep = Math.floor(norm * 8);
        if (currentStep > lastHapticStepRef.current) {
          lastHapticStepRef.current = currentStep;
          triggerHaptic(currentStep, currentStep >= 8);
        } else if (currentStep < lastHapticStepRef.current) {
          lastHapticStepRef.current = currentStep;
        }

        if (damped > 8 && e.cancelable) {
          e.preventDefault();
        }
      } else if (pullRef.current > 0) {
        pullRef.current = 0;
        lastHapticStepRef.current = 0;
        setPullDistance(0);
      }
    };

    const handleTouchEnd = async () => {
      if (startYRef.current === null || refreshingRef.current) return;
      startYRef.current = null;
      startXRef.current = null;
      setIsDragging(false);

      const finalPull = pullRef.current;
      if (finalPull >= PULL_THRESHOLD) {
        // Direct user-activation gesture on touchend for iOS Taptic Engine
        triggerHaptic(8, true);
        refreshingRef.current = true;
        setIsRefreshing(true);
        pullRef.current = 76;
        setPullDistance(76);

        const minDelay = new Promise((r) => setTimeout(r, 950));
        try {
          await Promise.all([Promise.resolve(onRefresh()), minDelay]);
        } catch {
          // ignore refresh errors
        } finally {
          refreshingRef.current = false;
          setIsRefreshing(false);
          pullRef.current = 0;
          setPullDistance(0);
        }
      } else {
        pullRef.current = 0;
        setPullDistance(0);
      }
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });
    el.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
      el.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [getScrollTop, onRefresh, triggerHaptic]);

  // Normalized pull progress [0..1]
  const progress = isRefreshing
    ? 1
    : Math.min(1, Math.max(0, (pullDistance - 6) / (PULL_THRESHOLD - 6)));

  // Staggered path progress helper (draws left-to-right like Threads)
  const segProgress = (start: number, end: number) => {
    if (isRefreshing) return 1;
    return Math.min(1, Math.max(0, (progress - start) / (end - start)));
  };

  // Fill materializes smoothly during the final 35% of the pull
  const fillAlpha = isRefreshing
    ? 0.92
    : Math.min(1, Math.max(0, (progress - 0.62) / 0.38));

  const inkColor = theme === "light" ? "#111213" : "#FFFFFF";
  const greenColor = "#57BF00";
  const blueColor = "#009DF1";

  const pathStyle = (segStart: number, segEnd: number, color: string) => {
    const p = segProgress(segStart, segEnd);
    return {
      stroke: color,
      strokeWidth: isRefreshing ? 3.2 : 2.8,
      strokeLinecap: "round" as const,
      strokeLinejoin: "round" as const,
      strokeDasharray: isRefreshing ? "32 68" : "100",
      strokeDashoffset: isRefreshing ? undefined : `${(1 - p) * 100}`,
      fill: color,
      fillOpacity: fillAlpha,
      transition: isDragging
        ? "fill-opacity 0.12s ease"
        : "stroke-dashoffset 0.25s ease, fill-opacity 0.25s ease",
    };
  };

  return (
    <div ref={wrapperRef} className="relative w-full overscroll-y-contain">
      {/* iOS 17.4+/18 WebKit Taptic Engine switch actuator (must stay in viewport with non-zero box & opacity > 0) */}
      <label
        ref={hapticLabelRef}
        htmlFor="ptr-haptic-switch"
        aria-hidden="true"
        className="fixed top-0 left-0 w-10 h-6 opacity-[0.001] pointer-events-none -z-10"
      >
        <input
          id="ptr-haptic-switch"
          ref={hapticInputRef}
          type="checkbox"
          tabIndex={-1}
          readOnly
          className="w-10 h-6"
        />
      </label>
      <style>{`
        @keyframes threads-wave {
          0% { stroke-dashoffset: 100; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes threads-breathe {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 8px rgba(87,191,0,0.28)); }
          50% { transform: scale(1.045); filter: drop-shadow(0 0 14px rgba(0,157,241,0.45)); }
        }
        .threads-refresh-active path,
        .threads-refresh-active polygon {
          animation: threads-wave 0.85s linear infinite;
          fill-opacity: 0.22 !important;
        }
        .threads-refresh-active {
          animation: threads-breathe 1.1s ease-in-out infinite;
        }
      `}</style>

      <div
        className="w-full overflow-hidden flex flex-col items-center justify-center pointer-events-none select-none"
        style={{
          height: `${pullDistance}px`,
          opacity: Math.min(1, pullDistance / 24),
          transition: isDragging
            ? "none"
            : "height 0.38s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.25s ease",
        }}
      >
        <div
          className={`flex items-center justify-center ${
            isRefreshing ? "threads-refresh-active" : ""
          }`}
          style={{
            transform: isRefreshing
              ? undefined
              : `scale(${0.86 + progress * 0.14})`,
            filter:
              !isRefreshing && progress >= 0.98
                ? "drop-shadow(0 0 10px rgba(87, 191, 0, 0.35)) drop-shadow(0 0 14px rgba(0, 157, 241, 0.3))"
                : undefined,
            transition: isDragging ? "none" : "transform 0.25s ease",
          }}
        >
          <svg
            viewBox="64 324 695 170"
            className="w-[176px] h-[44px] overflow-visible"
          >
            {/* 1. Torre principal + ventana en arco (cutout real con evenodd) */}
            <path
              pathLength={100}
              fillRule="evenodd"
              style={pathStyle(0.0, 0.45, inkColor)}
              d="M125.88,331l-.35,156.76-55.46,18.61v-128.02s13.05-4.29,13.05-4.29l.1,16.62,9.71-3.15.13-16.91,13.65-4.64.18,16.42,8.51-2.85.09-16.46,6.6-2.52.11-13.15c-5.31,4.31-10.2,1.04-14.45-1.1-4.38,1.15-10.28,5.9-15.07,1.74,10.93-.04,12.46-9.58,15.01-9.95,1.91-.28,5.71,3.88,7.69,0s5.67-5.76,10.51-7.11Z M107.91,424.25l-19.25,5.8c-.1-9.23-1.16-18.99,5.24-23.1,2.85-1.83,6.57-2.27,9.81-.65,2.64,1.32,3.97,4.22,4.02,7.1l.18,10.85Z"
            />
            {/* Detalles laterales de la torre */}
            <polygon
              pathLength={100}
              style={pathStyle(0.1, 0.48, inkColor)}
              points="150.64 386.22 138.6 380.58 150.03 370.89 150.64 386.22"
            />
            <polygon
              pathLength={100}
              style={pathStyle(0.14, 0.5, inkColor)}
              points="167.21 393.2 156.49 388.26 167.11 379.3 167.21 393.2"
            />
            <path
              pathLength={100}
              style={pathStyle(0.16, 0.52, inkColor)}
              d="M159.62,430.62l-16.74-8.15c-.86-7.43-.6-16.52,4.99-18.52,2.92-1.04,5.77-.1,7.98,2.01,2.55,2.44,3.49,5.96,3.88,9.52l-.1,15.13Z"
            />

            {/* 2. C */}
            <path
              pathLength={100}
              style={pathStyle(0.2, 0.58, inkColor)}
              d="M254.57,450.91c6.8.1,12.32-1.66,18.85-3.65v12.9c-19.16,7.31-42.71,4.39-49.4-15.97-3.51-10.67-3.72-22.22-.29-32.85,7.1-22.03,31.79-26.59,52.44-16.58l-4.87,12.37c-4.35-2.22-8.75-4.05-13.71-4.75-7.89-1.11-15.06,2.89-18.04,10.52-3.29,8.45-3.24,18.11-.62,26.81,2.1,6.97,8.03,11.37,15.65,11.19Z"
            />

            {/* 3. o (con cutout real) */}
            <path
              pathLength={100}
              fillRule="evenodd"
              style={pathStyle(0.26, 0.64, inkColor)}
              d="M332.87,448.67c-3.4,9.53-11.31,14.43-20.86,15.01-10.97.67-20.8-4.95-24.48-15.53-2.73-7.85-2.75-16.37-.31-24.31,3.32-10.77,12.97-16.68,24.04-16.19,10.01.45,18.38,5.74,21.74,15.41,2.82,8.11,2.85,17.2-.14,25.6Z M310.13,456.88c-7.32-.04-12.72-4.08-14.68-10.66s-2.06-14.24-.14-21.01,7.46-10.47,14.42-10.63,13.19,3.35,15.33,10.46,2.11,14.5-.06,21.43c-2.06,6.56-7.64,10.45-14.88,10.41Z"
            />

            {/* 4. n */}
            <path
              pathLength={100}
              style={pathStyle(0.32, 0.7, inkColor)}
              d="M373.89,414.48c-9.43.13-15.77,5.67-15.86,14.96l-.31,33.23h-8.17s0-53.85,0-53.85c2.3-.45,4.32-.42,6.69-.07l1.72,7.31c4.49-6.9,12.28-8.63,20.03-8.3,9.75.42,16.59,6.83,16.63,16.83l.17,38.05-8.21.04-.08-36.59c-.02-7.52-5.19-11.72-12.62-11.62Z"
            />

            {/* 5. j + punto */}
            <path
              pathLength={100}
              style={pathStyle(0.38, 0.74, inkColor)}
              d="M397.71,485.99c-.48-2.41-.32-4.34-.15-6.91,2.57.65,4.8,1.1,7.47,1.03,3.91-.1,6.52-3.06,6.52-7.1l.09-64.29,8.24.03-.22,64.85c-.02,5.76-3.33,10.7-8.5,12.44-4.33,1.46-8.56,1.24-13.45-.06Z"
            />
            <path
              pathLength={100}
              style={pathStyle(0.4, 0.75, inkColor)}
              d="M420.55,394.04c-.09,3.34-2.03,5.23-4.68,5.26s-4.61-1.84-4.87-4.84,1.24-5.54,4.18-5.87,5.46,1.81,5.36,5.45Z"
            />

            {/* 6. u */}
            <path
              pathLength={100}
              style={pathStyle(0.44, 0.8, inkColor)}
              d="M473.63,408.72l8.15.03v53.84s-6.83.05-6.83.05l-1.29-7.5c-4.59,7.16-12.55,9.01-20.65,8.43-9.24-.67-16.19-6.41-16.25-16.13l-.27-38.69,8.31-.06.13,36.82c.01,3.51,1.44,7.65,4.68,9.43,5.36,2.93,12.86,2.66,17.93-.84,4.14-2.85,5.77-8.17,5.81-13.08l.27-32.29Z"
            />

            {/* 7. n */}
            <path
              pathLength={100}
              style={pathStyle(0.5, 0.85, inkColor)}
              d="M523.11,414.48c-9.14.28-15.32,5.56-15.41,14.72l-.33,33.49-8.17-.04v-53.84c2.4-.46,4.17-.3,6.57-.18l1.55,7.72c5.94-9.59,21.51-11.07,30.39-5.32,4.49,2.91,6.45,8.38,6.49,13.68l.25,37.98-8.2-.02-.11-36.54c-.02-7.7-5.43-11.88-13.03-11.65Z"
            />

            {/* 8. t */}
            <path
              pathLength={100}
              style={pathStyle(0.56, 0.9, inkColor)}
              d="M585.99,456.04l.06,6.21c-3.81,1.45-7.53,1.61-11.57,1.28-7.1-.58-12.32-5.87-12.39-13.17l-.31-35.38-6.98-.13c-.92-.02-1.06-2.32-.58-3.31,1.04-2.13,6.9-2.55,7.46-4.28l3.51-10.78c1.57-.45,2.98-.42,4.79-.2l.03,12.3h15.62s0,6.35,0,6.35l-15.66.02.15,33.48c.01,3.1,1.67,6.27,4.43,7.49,3.61,1.61,7.35,1.21,11.44.12Z"
            />

            {/* 9. O (Verde ConjuntOS #57BF00 con cutout real) */}
            <path
              pathLength={100}
              fillRule="evenodd"
              style={pathStyle(0.62, 0.96, greenColor)}
              d="M660.69,442.35c-5.87,19.4-26.81,24.93-44.86,19.54-21.15-6.32-25.06-31.96-19.28-51.31,3-10.05,10.75-17.3,20.82-19.76,18.02-4.41,37.67,1.09,43.23,19.57,3.14,10.42,3.23,21.57.08,31.96Z M645.31,438.6c-2.22,8.22-8.9,12.42-16.82,12.33-7.68-.08-14.04-4.05-16.35-11.65-2.45-8.05-2.46-17.06-.08-25.09s9.05-12.21,17.1-12.01c7.68.19,13.74,4.1,16.02,11.83s2.35,16.41.14,24.59Z"
            />

            {/* 10. S (Azul ConjuntOS #009DF1) */}
            <path
              pathLength={100}
              style={pathStyle(0.68, 1.0, blueColor)}
              d="M707.57,461.31c-11.29,3.94-23.11,2.76-33.98-1.77l-.06-14.19c10.9,5.17,29.26,10.06,31.77.22.81-3.19-.56-6.62-3.89-8.38l-16.5-8.72c-10.52-5.56-13.77-18.54-7.52-28.85,7.34-12.1,29.39-10.92,42.7-4.1l-4.79,11.58c-9.81-4.43-23.81-7.38-25.87,1.28-.83,3.49.97,6.67,4.3,8.42l16.03,8.44c7.62,4.01,11.54,11.35,10.57,19.91-.83,7.36-5.13,13.49-12.77,16.16Z"
            />

            {/* 11. ® */}
            <text
              transform="translate(718.39 407.59)"
              fill={inkColor}
              fillOpacity={fillAlpha}
              fontSize="44"
              fontWeight="700"
              fontFamily="system-ui, sans-serif"
            >
              ®
            </text>
          </svg>
        </div>
      </div>

      {children}
    </div>
  );
}
