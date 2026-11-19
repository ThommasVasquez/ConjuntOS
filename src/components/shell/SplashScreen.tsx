"use client";

import { useEffect, useState } from "react";

export default function SplashScreen() {
  const [phase, setPhase] = useState<"visible" | "fading" | "hidden">("visible");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("conjuntos_splash_shown")) {
      setPhase("hidden");
      return;
    }

    sessionStorage.setItem("conjuntos_splash_shown", "true");

    const fadeTimer = setTimeout(() => {
      setPhase("fading");
    }, 950);

    const hideTimer = setTimeout(() => {
      setPhase("hidden");
    }, 1400);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[999999] bg-[#08090d] flex flex-col items-center justify-center overflow-hidden select-none transition-opacity duration-450 ease-out ${
        phase === "fading" ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* Subtle brand ambient glow (#57BF00 + #009DF1) */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full blur-[110px] opacity-25 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(87,191,0,0.55) 0%, rgba(0,157,241,0.45) 55%, transparent 100%)",
        }}
      />

      {/* Centered Official Logo */}
      <div className="relative flex flex-col items-center animate-in fade-in zoom-in-95 duration-500">
        <img
          src="/logo-verticalW.svg"
          alt="ConjuntOS®"
          className="w-[210px] sm:w-[240px] h-auto object-contain drop-shadow-[0_0_24px_rgba(0,157,241,0.22)]"
          draggable={false}
        />
      </div>

      {/* Subtle footer signature */}
      <div className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+2rem)] flex flex-col items-center gap-1 opacity-60">
        <span className="text-[10px] font-bold tracking-[0.25em] text-white/70 uppercase">
          ConjuntOS®
        </span>
        <span className="text-[9px] text-white/45">
          Powered by <span className="text-[#009df1] font-semibold">EnergySoftmedia®</span>
        </span>
      </div>
    </div>
  );
}
