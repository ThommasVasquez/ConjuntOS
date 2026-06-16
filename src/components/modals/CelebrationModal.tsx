"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { X, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";

interface CelebrationModalProps {
  tipo: "APROBACION" | "SISTEMA";
  titulo: string;
  mensaje: string;
  onClose: () => void;
}

export default function CelebrationModal({ tipo, titulo, mensaje, onClose }: CelebrationModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1. Modal Entrance
    const ctx = gsap.context(() => {
      gsap.fromTo(".modal-content", 
        { scale: 0.8, opacity: 0, y: 40 }, 
        { scale: 1, opacity: 1, y: 0, duration: 0.6, ease: "back.out(1.7)" }
      );
      gsap.fromTo(".modal-backdrop", 
        { opacity: 0 }, 
        { opacity: 1, duration: 0.4 }
      );

      // 2. Confetti Burst (Only for APROBACION)
      if (tipo === "APROBACION") {
        createConfetti();
      }
    }, modalRef);

    return () => ctx.revert();
  }, [tipo]);

  const createConfetti = () => {
    if (!canvasRef.current) return;
    const colors = ["#FFFFFF", "#A3A3A3", "#FFFFFF", "#808080", "#A7A7A7"];
    const container = canvasRef.current;
    
    for (let i = 0; i < 60; i++) {
      const particle = document.createElement("div");
      particle.className = "absolute w-2 h-2 rounded-full z-0";
      particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      container.appendChild(particle);

      const angle = Math.random() * Math.PI * 2;
      const velocity = 5 + Math.random() * 10;
      const x = Math.cos(angle) * 150;
      const y = Math.sin(angle) * 150;

      gsap.fromTo(particle, 
        { x: 0, y: 0, opacity: 1, scale: 1 },
        { 
          x: x * velocity * 0.1, 
          y: (y * velocity * 0.1) - 100, 
          opacity: 0, 
          scale: 0.5,
          duration: 1.5 + Math.random(),
          ease: "power2.out",
          onComplete: () => particle.remove()
        }
      );
    }
  };

  const handleClose = () => {
    gsap.to(".modal-content", {
      scale: 0.9,
      opacity: 0,
      y: 20,
      duration: 0.4,
      ease: "power2.in",
      onComplete: onClose
    });
    gsap.to(".modal-backdrop", { opacity: 0, duration: 0.3 });
  };

  const isApprove = tipo === "APROBACION";

  return (
    <div ref={modalRef} className="fixed inset-0 z-100 flex items-center justify-center p-6">
      {/* BACKDROP */}
      <div className="modal-backdrop absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* MODAL CONTENT */}
      <div className="modal-content relative w-full max-w-sm liquid-glass rounded-[40px] border border-white/20 p-8 shadow-2xl overflow-hidden">
        {/* CONFETTI CONTAINER */}
        <div ref={canvasRef} className="absolute inset-0 pointer-events-none" />
        
        <div className="relative z-10 flex flex-col items-center text-center gap-6">
          {/* ICON */}
          <div className={`w-20 h-20 rounded-[32px] flex items-center justify-center border-2 ${isApprove ? 'bg-accent/10 border-accent/40 text-accent accent-glow' : 'bg-text/10 border-text/40 text-text shadow-[0_0_20px_rgba(153,153,153,0.2)]'}`}>
            {isApprove ? <CheckCircle2 size={40} /> : <AlertCircle size={40} />}
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-display font-black text-white leading-tight tracking-tight">
              {isApprove ? <span className="flex items-center justify-center gap-2">¡Solicitud Aprobada! <Sparkles className="animate-pulse" size={24} /></span> : "Estado de tu Trámite"}
            </h2>
            <p className="text-white text-sm leading-relaxed font-medium">
              {mensaje}
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 w-full">
            <p className="text-[10px] text-white font-bold uppercase tracking-widest mb-1">Motivo / Mensaje</p>
            <p className="text-xs text-white italic">&quot;{titulo}&quot;</p>
          </div>

          <button 
            onClick={handleClose}
            className={`w-full py-4 rounded-2xl font-bold text-sm tracking-widest uppercase transition-all active:scale-95 shadow-xl ${isApprove ? 'bg-accent text-primary accent-glow-strong' : 'bg-white/10 text-on-accent border border-white/20 hover:bg-white/20'}`}
          >
            {isApprove ? "¡Excelente!" : "Entendido"}
          </button>
        </div>

        {/* CLOSE BUTTON (Corner) */}
        <button 
          onClick={handleClose}
          className="absolute top-6 right-6 text-white hover:text-white transition-colors"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
}
