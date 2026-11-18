"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useTheme } from "@/components/providers/ThemeContext";

interface PullToRefreshLogoProps {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
}

const PULL_THRESHOLD = 68;
const MAX_PULL = 115;

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
      setIsDragging(true);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (refreshingRef.current || startYRef.current === null || startXRef.current === null) return;

      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      const dy = currentY - startYRef.current;
      const dx = Math.abs(currentX - startXRef.current);

      // Ignore horizontal swipes (e.g. carousels like Navegación rápida)
      if (dx > dy && pullRef.current === 0) {
        startYRef.current = null;
        setIsDragging(false);
        return;
      }

      if (dy > 0 && getScrollTop() <= 2) {
        const damped = Math.min(MAX_PULL, Math.pow(dy, 0.82) * 1.3);
        pullRef.current = damped;
        setPullDistance(damped);
        if (damped > 8 && e.cancelable) {
          e.preventDefault();
        }
      } else if (pullRef.current > 0) {
        pullRef.current = 0;
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
        refreshingRef.current = true;
        setIsRefreshing(true);
        pullRef.current = 78;
        setPullDistance(78);

        const minDelay = new Promise((r) => setTimeout(r, 750));
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
  }, [getScrollTop, onRefresh]);

  const progress = isRefreshing
    ? 1
    : Math.min(1, Math.max(0, (pullDistance - 8) / (PULL_THRESHOLD - 8)));

  const logoSrc = theme === "light" ? "/logo-vertical.svg" : "/logo-verticalW.svg";

  return (
    <div ref={wrapperRef} className="relative w-full overscroll-y-contain">
      {/* Pull-to-refresh Indicator with progressive ConjuntOS Logo fill */}
      <div
        className="w-full overflow-hidden flex flex-col items-center justify-end pointer-events-none select-none"
        style={{
          height: `${pullDistance}px`,
          opacity: Math.min(1, pullDistance / 28),
          transition: isDragging
            ? "none"
            : "height 0.35s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.25s ease",
        }}
      >
        <div
          className={`flex flex-col items-center justify-center pb-2 ${
            isRefreshing ? "animate-pulse" : ""
          }`}
          style={{
            transform: `scale(${0.82 + progress * 0.22})`,
            transition: isDragging ? "none" : "transform 0.3s ease",
          }}
        >
          {/* Logo Container: Ghost base + Progressive bottom-to-top fill */}
          <div className="relative w-24 h-12 flex items-center justify-center">
            {/* Silueta base apagada */}
            <img
              src={logoSrc}
              alt="ConjuntOS"
              className="w-full h-full object-contain opacity-15 grayscale"
              draggable={false}
            />

            {/* Capa que se va cargando de abajo hacia arriba con el desliz */}
            <div
              className="absolute inset-0 overflow-hidden"
              style={{
                clipPath: `inset(${(1 - progress) * 100}% 0 0 0)`,
                filter:
                  progress >= 0.95
                    ? "drop-shadow(0 0 10px rgba(87, 191, 0, 0.45)) drop-shadow(0 0 14px rgba(0, 157, 241, 0.35))"
                    : "none",
              }}
            >
              <img
                src={logoSrc}
                alt="ConjuntOS"
                className="w-full h-full object-contain"
                draggable={false}
              />
            </div>
          </div>

          {/* Indicador sutil de porcentaje / estado */}
          <span className="text-[9px] font-bold uppercase tracking-widest text-text-muted mt-0.5">
            {isRefreshing
              ? "Actualizando anuncios..."
              : progress >= 1
              ? "¡Suelta para recargar!"
              : `${Math.round(progress * 100)}%`}
          </span>
        </div>
      </div>

      {children}
    </div>
  );
}
