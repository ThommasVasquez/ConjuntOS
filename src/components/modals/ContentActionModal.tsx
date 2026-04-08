"use client";

import { X, CheckCircle2, ShoppingBag, CreditCard, MapPin, Sparkles, Megaphone, Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import Image from "next/image";
import { toast } from "sonner";
import CelebrationModal from "./CelebrationModal";

interface ContentActionModalProps {
  item: any;
  userData: any;
  onClose: () => void;
  onActionComplete?: (itemName: string) => void;
}

export default function ContentActionModal({ item, userData, onClose, onActionComplete }: ContentActionModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<"detail" | "options" | "checkout" | "tracking" | "success">("detail");
  const [showCelebration, setShowCelebration] = useState(false);
  
  // OPCIONES DE PRODUCTO (Stage 68.10)
  const [flavor, setFlavor] = useState("Pepperoni");
  const [size, setSize] = useState("Familiar");
  const [trackingStep, setTrackingStep] = useState(1);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.3 });
      gsap.fromTo(modalRef.current, { scale: 0.9, opacity: 0, y: 20 }, { scale: 1, opacity: 1, y: 0, duration: 0.4, ease: "back.out(1.7)" });
    });
    return () => ctx.revert();
  }, []);

  const handleAction = () => {
    if (item.brand === 'Pizza Now') setStep("options");
    else if (item.type === 'AD') setStep("checkout");
    else {
      toast.success(item.category === 'Eventos' ? "¡Asistencia Confirmada!" : "Reporte Marcado como Leído");
      onClose();
    }
  };

  const startTracking = () => {
     setStep("tracking");
     // Simular progreso de tracking
     setTimeout(() => setTrackingStep(2), 5000);
     setTimeout(() => setTrackingStep(3), 10000);
     setTimeout(() => {
        setStep("success");
        setShowCelebration(true);
        if (onActionComplete) onActionComplete(item.title);
     }, 15000);
  };

  const handlePay = () => {
    toast.promise(
      new Promise((resolve) => setTimeout(resolve, 2000)),
      {
        loading: 'Procesando pago con Visa Débito **** 9012...',
        success: '¡Autorización Exitosa!',
        error: 'Error al procesar el pago',
      }
    );
    setTimeout(() => {
      startTracking();
    }, 2000);
  };

  if (showCelebration) {
    return (
      <CelebrationModal 
        tipo="SISTEMA" 
        titulo="¡Pedido Exitoso!" 
        mensaje={`Tu pedido de "${item.title}" ha sido procesado. Te notificaremos cuando llegue a la portería de la Torre ${userData?.torre || 'X'}.`} 
        onClose={onClose} 
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* OVERLAY */}
      <div 
        ref={overlayRef} 
        onClick={onClose}
        className="absolute inset-0 bg-[#0a0514]/90 backdrop-blur-md" 
      />

      {/* MODAL CONTAINER */}
      <div 
        ref={modalRef}
        className="relative w-full max-w-lg bg-[#1a1333] border border-white/10 rounded-[40px] shadow-2xl overflow-hidden"
      >
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 z-20 w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>

        {step === "detail" && (
          <div className="flex flex-col">
            {item.image && (
              <div className="relative h-64 w-full">
                <Image src={item.image} alt="" fill className="object-cover" unoptimized />
                <div className="absolute inset-0 bg-linear-to-t from-[#1a1333] to-transparent" />
                <div className="absolute bottom-6 left-8 bg-accent/20 border border-accent/30 px-4 py-1.5 rounded-full text-[10px] font-black text-accent uppercase tracking-widest">
                  {item.type === 'AD' ? 'OFERTA ESPECIAL' : item.category}
                </div>
              </div>
            )}

            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <h2 className="text-3xl font-display font-bold text-white leading-tight">
                  {item.title}
                </h2>
                <p className="text-white/50 text-sm leading-relaxed">
                  {item.content}
                </p>
              </div>

              {item.type === 'AD' ? (
                 <div className="liquid-glass rounded-3xl p-6 border border-white/5 flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-white/30 uppercase tracking-widest font-black">Precio Residente</span>
                      <span className="text-2xl font-black text-white">$15.900 <span className="text-xs text-white/20 line-through ml-2">$22.000</span></span>
                    </div>
                    <button 
                      onClick={handleAction}
                      className="bg-accent text-primary px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-accent/20"
                    >
                      {item.brand === 'Pizza Now' ? 'Configurar Pedido' : 'Comprar Ya'}
                    </button>
                 </div>
              ) : (
                <div className="flex gap-4">
                  <button 
                    onClick={handleAction}
                    className="flex-1 bg-white text-primary px-8 py-5 rounded-[24px] font-black text-xs uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    {item.category === 'Eventos' ? 'Confirmar Asistencia' : 'Marcar como Enterado'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {step === "options" && (
           <div className="p-8 space-y-8">
              <div className="space-y-1">
                 <h3 className="text-2xl font-display font-bold text-white">Personaliza tu Pizza</h3>
                 <p className="text-[10px] text-white/30 uppercase font-black tracking-widest">Elige tus sabores favoritos</p>
              </div>

              <div className="space-y-6">
                 <div className="space-y-3">
                   <span className="text-xs font-bold text-white/50">Sabor</span>
                   <div className="grid grid-cols-3 gap-2">
                      {["Pepperoni", "Hawaiana", "Pollo Champ"].map(f => (
                        <button key={f} onClick={() => setFlavor(f)} className={`py-3 rounded-2xl text-[10px] font-black uppercase tracking-tighter border transition-all ${flavor === f ? 'bg-accent text-primary border-accent' : 'bg-white/5 text-white/40 border-white/5 hover:border-white/20'}`}>{f}</button>
                      ))}
                   </div>
                 </div>

                 <div className="space-y-3">
                   <span className="text-xs font-bold text-white/50">Tamaño</span>
                   <div className="grid grid-cols-2 gap-2">
                      {["Mediana", "Familiar"].map(s => (
                        <button key={s} onClick={() => setSize(s)} className={`py-3 rounded-2xl text-[10px] font-black uppercase tracking-tighter border transition-all ${size === s ? 'bg-accent text-primary border-accent' : 'bg-white/5 text-white/40 border-white/5 hover:border-white/20'}`}>{s}</button>
                      ))}
                   </div>
                 </div>
              </div>

              <button 
                onClick={() => setStep("checkout")}
                className="w-full bg-white text-primary py-5 rounded-[24px] font-black text-xs uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all"
              >
                Continuar al Pago
              </button>
           </div>
        )}

        {step === "checkout" && (
          <div className="p-8 space-y-8">
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center text-accent">
                 <ShoppingBag size={24} />
               </div>
               <div>
                  <h3 className="text-xl font-bold text-white">Finalizar Pedido</h3>
                  <p className="text-[10px] text-white/30 uppercase tracking-widest font-black">Entrega Prioritaria</p>
               </div>
            </div>

            <div className="space-y-4">
               <div className="p-5 rounded-3xl bg-white/5 border border-white/5 flex items-center justify-between group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400">
                       <MapPin size={20} />
                    </div>
                    <div className="flex flex-col">
                       <span className="text-[10px] text-white/30 uppercase font-black">Entrega en</span>
                       <span className="text-white font-bold">Torre {userData?.torre || '...'} • Apto {userData?.apartamento || '...'}</span>
                    </div>
                  </div>
               </div>

               <div className="p-5 rounded-3xl bg-white/5 border border-white/5 flex items-center justify-between group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400">
                       <CreditCard size={20} />
                    </div>
                    <div className="flex flex-col">
                       <span className="text-[10px] text-white/30 uppercase font-black">Tarjeta Guardada</span>
                       <span className="text-white font-bold">Visa Débito **** 9012</span>
                    </div>
                  </div>
                  <Image src="https://upload.wikimedia.org/wikipedia/commons/5/d1/Visa_logo.png" alt="Visa" width={32} height={10} className="opacity-60 object-contain h-auto invert" unoptimized />
               </div>
            </div>

            <div className="pt-4 border-t border-white/5 space-y-2">
               <div className="flex justify-between text-xs text-white/40">
                  <span>Subtotal ({flavor} {size})</span>
                  <span>$15.900</span>
               </div>
               <div className="flex justify-between text-xs text-green-400">
                  <span>Envío Prioritario</span>
                  <span>GRATIS</span>
               </div>
               <div className="flex justify-between text-lg font-black text-white pt-2">
                  <span>Total</span>
                  <span>$15.900</span>
               </div>
            </div>

            <button 
              onClick={handlePay}
              className="w-full bg-accent text-primary py-6 rounded-[28px] font-black text-sm uppercase tracking-[0.2em] shadow-2xl shadow-accent/20 hover:scale-[1.02] active:scale-95 transition-all"
            >
              Confirmar Pago Seguro
            </button>
          </div>
        )}

        {step === "tracking" && (
           <div className="p-10 flex flex-col items-center text-center space-y-10">
              <div className="relative w-32 h-32">
                 <div className="absolute inset-0 rounded-full border-4 border-accent/20 border-t-accent animate-spin" />
                 <div className="absolute inset-0 flex items-center justify-center">
                    <ShoppingBag className="text-accent animate-bounce" size={40} />
                 </div>
              </div>

              <div className="space-y-4">
                 <div className="flex flex-col gap-1">
                    <h3 className="text-2xl font-display font-bold text-white">Rastreando Pedido</h3>
                    <p className="text-sm text-white/40 italic">Preparando tu pizza de {flavor} sabor artesanal...</p>
                 </div>

                 <div className="flex justify-center gap-2">
                    {[1,2,3].map(s => (
                       <div key={s} className={`h-1.5 w-12 rounded-full transition-all duration-1000 ${trackingStep >= s ? 'bg-accent' : 'bg-white/10'}`} />
                    ))}
                 </div>
                 
                 <p className="text-[10px] font-black uppercase text-accent tracking-[0.3em] animate-pulse">
                    {trackingStep === 1 ? 'Preparando...' : trackingStep === 2 ? 'En camino a la torre...' : 'Llegando a Portería...'}
                 </p>
              </div>
           </div>
        )}
      </div>
    </div>
  );
}
