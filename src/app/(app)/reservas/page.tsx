"use client";

/**
 * RÉSERVAS - CONJUNTOAPP
 * Módulo de reserva de zonas comunes con pasarela de pago simulada.
 */

import { 
  ArrowRight, X, CreditCard, CheckCircle2, 
  Sparkles, Clock, Users, QrCode, Download,
  Search, SlidersHorizontal
} from "lucide-react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { gsap } from "gsap";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface Area {
  id: string;
  name: string;
  desc: string;
  price: number;
  image: string;
  icon: React.ReactNode;
  capacity: number;
  tags: string[];
}

export default function ReservasPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedArea, setSelectedArea] = useState<Area | null>(null);
  const [step, setStep] = useState<'GRID' | 'BOOKING' | 'PAYMENT' | 'SUCCESS'>('GRID');

  const areas: Area[] = [
    {
      id: 'pool',
      name: "Piscina Infinity",
      desc: "Disfruta de una tarde relajante con vista panorámica y agua climatizada.",
      price: 15000,
      image: "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&q=80&w=1000",
      icon: <Sparkles size={18} />,
      capacity: 10,
      tags: ["Climatizada", "Vistas"]
    },
    {
      id: 'gym',
      name: "Gym Premium",
      desc: "Equipamiento de última generación para tu rutina diaria de entrenamiento.",
      price: 0,
      image: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&q=80&w=1000",
      icon: <Users size={18} />,
      capacity: 15,
      tags: ["24/7", "Máquinas Pro"]
    },
    {
      id: 'hall',
      name: "Salón Comunal Deluxe",
      desc: "El lugar perfecto para tus eventos especiales y reuniones importantes.",
      price: 80000,
      image: "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&q=80&w=1000",
      icon: <Users size={18} />,
      capacity: 50,
      tags: ["Audio Pro", "Cocina"]
    }
  ];

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(".fade-up", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: "power2.out", delay: 0.1 });
    }, containerRef);
    return () => ctx.revert();
  }, [userId]);

  const handleSelectArea = (area: Area) => {
    setSelectedArea(area);
    setStep('BOOKING');
  };

  const handleProcessPayment = () => {
    setStep('PAYMENT');
    setTimeout(() => {
      setStep('SUCCESS');
      toast.success("Reserva confirmada con éxito");
    }, 4000);
  };

  const handlePostStory = () => {
    const story = {
      id: Date.now(),
      createdAt: Date.now(),
      type: 'RESERVATION',
      content: selectedArea?.name,
      image: selectedArea?.image
    };
    localStorage.setItem("conjunto_app_active_story", JSON.stringify(story));
    toast.success("¡Tu estado ha sido publicado!");
  };

  return (
    <div ref={containerRef} className="min-h-screen flex flex-col p-6 pt-16 pb-32 overflow-x-hidden relative gap-10">
      <ProfileHeader className="fade-up" />

      <section className="fade-up flex gap-3">
        <div className="relative flex-1 group">
           <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-accent transition-colors" />
           <input type="text" placeholder="Buscar servicios..." className="w-full bg-[#1a1333] border border-white/5 rounded-[24px] py-4 pl-14 pr-6 text-sm text-white focus:outline-none focus:border-accent/40 focus:ring-4 focus:ring-accent/5 transition-all shadow-inner" />
        </div>
        <button className="w-14 h-14 rounded-[22px] bg-[#241a4a] border border-white/5 flex items-center justify-center text-white/60 hover:border-white/10 transition-all active:scale-95 shadow-lg">
           <SlidersHorizontal size={20} />
        </button>
      </section>

      <div className="flex flex-col gap-2 -mt-4 mb-2">
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">Reservas</h1>
          <p className="text-white/40 text-[10px] uppercase font-bold tracking-widest ">Zonas Comunes del Conjunto</p>
      </div>

      {step === 'GRID' && (
        <section className="flex flex-col gap-6">
           {areas.map((area) => (
             <div key={area.id} onClick={() => handleSelectArea(area)} className="fade-up liquid-glass-card rounded-[32px] overflow-hidden group cursor-pointer active:scale-[0.98] transition-all border border-white/5 shadow-2xl relative">
                <div className="relative h-60 w-full overflow-hidden">
                    <Image src={area.image} alt={area.name} fill className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" unoptimized />
                   <div className="absolute inset-0 bg-linear-to-t from-[#0d041a] via-transparent to-transparent opacity-80" />
                   <div className="absolute top-4 right-4 liquid-glass px-4 py-2 rounded-full border border-white/10">
                      <span className="text-white font-bold text-sm">{area.price === 0 ? 'Gratis' : `$${area.price.toLocaleString()}`}</span>
                   </div>
                </div>
                <div className="p-6">
                   <div className="flex justify-between items-start mb-3">
                      <div>
                         <h3 className="text-xl font-bold text-white text-glow mb-1 leading-tight">{area.name}</h3>
                         <div className="flex gap-2">{area.tags.map(tag => <span key={tag} className="text-[10px] text-white/40 font-bold uppercase tracking-wider">{tag}</span>)}</div>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-accent">{area.icon}</div>
                   </div>
                   <p className="text-white/50 text-xs leading-relaxed font-light mb-6">{area.desc}</p>
                   <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5 text-white/30 text-[10px] font-bold uppercase"><Users size={12} /> {area.capacity} Personas</div>
                      <div className="flex items-center gap-2 group/btn"><span className="text-accent text-[11px] font-bold uppercase tracking-widest group-hover/btn:translate-x-[-4px] transition-transform">Reservar</span><ArrowRight size={14} className="text-accent" /></div>
                   </div>
                </div>
             </div>
           ))}
        </section>
      )}

      {step === 'BOOKING' && selectedArea && (
        <section className="fade-up fixed inset-0 z-1000 flex flex-col justify-end">
           <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={() => setStep('GRID')} />
           <div className="liquid-glass rounded-t-[40px] p-8 pb-40 w-full max-w-[430px] mx-auto relative z-10 shadow-2xl border-t border-white/20 animate-in slide-in-from-bottom-full duration-500 overflow-y-auto max-h-[95vh] hide-scrollbar">
              <div className="flex justify-between items-center mb-8">
                 <h3 className="text-2xl font-display font-medium text-white tracking-tight">Tu Reserva</h3>
                 <button onClick={() => setStep('GRID')} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/50"><X size={20} /></button>
              </div>
              <div className="flex gap-6 items-center mb-8 p-4 rounded-3xl bg-white/5 border border-white/5">
                 <div className="relative w-20 h-20 rounded-2xl overflow-hidden border border-white/10 shrink-0"><Image src={selectedArea.image} alt="" fill className="w-full h-full object-cover" unoptimized /></div>
                 <div>
                    <h4 className="text-white font-bold text-lg mb-1">{selectedArea.name}</h4>
                    <p className="text-accent text-sm font-bold">{selectedArea.price === 0 ? 'Gratis' : `$${selectedArea.price.toLocaleString()}`}</p>
                 </div>
              </div>
              <div className="flex flex-col gap-6 mb-8">
                 <div className="flex flex-col gap-3">
                    <label className="text-[10px] text-white/40 font-bold uppercase tracking-widest ml-1">Fecha</label>
                    <div className="grid grid-cols-4 gap-3">{[14, 15, 16, 17].map(day => <button key={day} className={`py-4 rounded-2xl border transition-all flex flex-col items-center gap-1 ${day === 15 ? 'bg-accent border-accent text-white' : 'bg-white/5 border-white/5 text-white/50'}`}><span className="text-[10px] font-medium opacity-50">Abr</span><span className="text-lg font-bold">{day}</span></button>)}</div>
                 </div>
              </div>
              <div className="bg-white/5 p-6 rounded-[28px] border border-white/10 mb-8">
                 <div className="flex justify-between items-center mb-4 pb-4 border-b border-white/5"><span className="text-white/60 text-sm">Subtotal</span><span className="text-white font-bold">${selectedArea.price.toLocaleString()}</span></div>
                 <div className="flex justify-between items-center"><span className="text-white font-bold">Total</span><span className="text-2xl font-display font-bold text-white">${selectedArea.price.toLocaleString()}</span></div>
              </div>
              <button onClick={handleProcessPayment} className="w-full py-5 bg-accent rounded-3xl font-bold text-white shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-3">Pagar Ahora <CreditCard size={20} /></button>
           </div>
        </section>
      )}

      {step === 'PAYMENT' && (
        <section className="fade-up fixed inset-0 z-100 flex flex-col items-center justify-center p-8 bg-[#0d041a]/95 backdrop-blur-3xl">
           <div className="w-16 h-16 rounded-full border-4 border-white/10 border-t-accent animate-spin mb-4" />
           <h3 className="text-2xl font-display font-medium text-white tracking-tight">Procesando Pago...</h3>
        </section>
      )}

      {step === 'SUCCESS' && selectedArea && (
        <section className="fade-up fixed inset-0 z-100 flex flex-col items-center justify-center p-6 bg-[#1a0b2e] animate-in slide-in-from-bottom-20 duration-700">
           <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg mb-8 animate-bounce"><CheckCircle2 size={40} className="text-white" /></div>
           <h2 className="text-3xl font-display font-bold text-white tracking-tight mb-2 text-glow">¡Reserva Exitosa!</h2>
           <div className="w-full max-w-[340px] liquid-glass rounded-[40px] overflow-hidden shadow-2xl border border-white/10 p-8">
              <div className="flex flex-col gap-6 mb-8">
                 <div className="flex gap-4 items-center">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-accent"><Users size={20} /></div>
                    <div><p className="text-[10px] text-white/30 uppercase font-bold">Espacio</p><p className="text-white font-bold">{selectedArea.name}</p></div>
                 </div>
                 <div className="flex gap-4 items-center">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-accent"><Clock size={20} /></div>
                    <div><p className="text-[10px] text-white/30 uppercase font-bold">Horario</p><p className="text-white font-bold">11:30 AM - 01:00 PM</p></div>
                 </div>
              </div>
              <div className="w-full aspect-square bg-white p-6 rounded-[32px] flex items-center justify-center mb-8"><QrCode size={180} className="text-[#0d041a]" /></div>
              <button onClick={handlePostStory} className="w-full py-4 bg-accent rounded-2xl flex items-center justify-center gap-3 text-white font-bold transition-all"><Download size={18} /> Mi Estado</button>
           </div>
           <button onClick={() => router.push('/inicio')} className="mt-12 text-white/40 text-xs font-bold uppercase hover:text-white">Volver al Inicio</button>
        </section>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}
