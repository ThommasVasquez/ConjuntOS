"use client";

import { ReactNode, useEffect, useRef, useCallback } from "react";
import { gsap } from "gsap";
import { Observer } from "gsap/dist/Observer";

// Registrar el plugin Observer de GSAP
if (typeof window !== "undefined") {
  gsap.registerPlugin(Observer);
}

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}

export default function BottomSheet({ isOpen, onClose, children, title }: BottomSheetProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  
  // Guardamos la instancia de animación para revertirla/controlarla
  const animRef = useRef<gsap.core.Tween | null>(null);

  const animateClose = useCallback(() => {
    if (!sheetRef.current || !overlayRef.current) return;
    
    gsap.to(sheetRef.current, { y: "100%", duration: 0.3, ease: "power2.in" });
    gsap.to(overlayRef.current, { 
      opacity: 0, 
      duration: 0.3, 
      display: 'none',
      onComplete: onClose 
    });
  }, [onClose]);

  useEffect(() => {
    if (!overlayRef.current || !sheetRef.current) return;

    if (isOpen) {
      // Entrance Animation
      gsap.to(overlayRef.current, { opacity: 1, duration: 0.3, display: 'block', ease: "power2.out" });
      animRef.current = gsap.fromTo(sheetRef.current, 
        { y: "100%" },
        { y: "0%", duration: 0.45, ease: "elastic.out(1, 0.7)" }
      );
      
      // Setup drag to dismiss using Observer on the handle/sheet
      const obs = Observer.create({
        target: sheetRef.current,
        type: "touch,pointer",
        dragMinimum: 10,
        onDown: () => {
          gsap.killTweensOf(sheetRef.current);
        },
        onDrag: (e) => {
          if (e.deltaY > 0) { // Only drag down
             gsap.set(sheetRef.current, { y: `+=${e.deltaY}` });
          }
        },
        onDragEnd: (e) => {
          // If dragged down confidently or velocity is high enough, close it
          const yPos = gsap.getProperty(sheetRef.current, "y") as number;
          if (yPos > 100 || e.velocityY > 500) {
             animateClose();
          } else {
             // Snap back
             gsap.to(sheetRef.current, { y: "0%", duration: 0.3, ease: "power2.out" });
          }
        }
      });

      return () => {
        obs.kill();
      };
    } else {
       // Only if the component is just hiding (but usually we unmount or animate out)
       // This branch handles when isOpen goes false from outside prop change
       if (overlayRef.current && gsap.getProperty(overlayRef.current, "opacity") !== 0) {
         animateClose();
       }
    }
  }, [isOpen, animateClose]);



  // Esc keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) animateClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, animateClose]);

  if (!isOpen) return null;

  return (
    <div 
      ref={overlayRef}
      className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm opacity-0 hidden"
      aria-modal="true"
      role="dialog"
    >
      <div className="absolute inset-0" onClick={animateClose} aria-label="Cerrar modal" />
      
      <div 
        ref={sheetRef}
        className="absolute bottom-0 w-full max-w-[430px] left-1/2 -translate-x-1/2 bg-surface rounded-t-3xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '90dvh' }}
      >
        {/* Handle for dragging */}
        <div ref={handleRef} className="w-full h-8 flex items-center justify-center cursor-grab active:cursor-grabbing shrink-0 mt-2">
          <div className="w-12 h-1.5 bg-border rounded-full" />
        </div>
        
        {title && (
          <div className="px-6 pb-2 text-center border-b border-border text-lg font-display font-semibold">
             {title}
          </div>
        )}
        
        <div className="p-6 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+24px)] flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
