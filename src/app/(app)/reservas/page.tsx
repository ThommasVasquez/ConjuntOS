"use client";

/**
 * RÉSERVAS - CONJUNTOSAPP
 * Módulo de reserva de zonas comunes integrado al backend real.
 */

import { 
  ArrowRight, X, CheckCircle2, 
  Clock, Users, QrCode,
  Search, SlidersHorizontal, MapPin
} from "lucide-react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api/client";
import Image from "next/image";
import { gsap } from "gsap";
import { toast } from "sonner";
import { useWsSubscription } from "@/hooks/useWebSocket";

interface AreaComun {
  id: string;
  nombre: string;
  descripcion: string;
  imagenUrl: string;
  requiereDeposito: boolean;
  depositoMonto: number;
  horaApertura: string;
  horaCierre: string;
  diasDisponibles: string;
  duracionSlot: number;
  capacidadMax: number;
}

export default function ReservasPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [areas, setAreas] = useState<AreaComun[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedArea, setSelectedArea] = useState<AreaComun | null>(null);
  
  const [step, setStep] = useState<'GRID' | 'BOOKING' | 'PAYMENT' | 'SUCCESS'>('GRID');
  
  // States for Booking Configurator
  const [availableDays, setAvailableDays] = useState<Date[]>([]);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [timeSlots, setTimeSlots] = useState<{start: Date, end: Date, available: boolean}[]>([]);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Real-time WebSocket subscription
  useWsSubscription('reserva', () => {
    api.get<AreaComun[]>('/areas-comunes')
      .then((data) => setAreas(data))
      .catch(() => {});
  });

  useEffect(() => {
    async function loadAreas() {
      try {
        const data = await api.get<AreaComun[]>('/areas-comunes');
        setAreas(data);
      } catch (e) {
        console.error("Error loading areas", e);
      } finally {
        setLoading(false);
      }
    }
    loadAreas();
  }, [userId]);

  useEffect(() => {
    if(!loading) {
      const ctx = gsap.context(() => {
        gsap.fromTo(".fade-up", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: "power2.out", delay: 0.1 });
      }, containerRef);
      return () => ctx.revert();
    }
  }, [loading, step]);

  const handleSelectArea = (area: AreaComun) => {
    setSelectedArea(area);
    
    // Generar próximos 7 días a partir de hoy (limitado a sus días disponibles)
    const allowedDaysStr = area.diasDisponibles || "0,1,2,3,4,5,6";
    const allowedDays = allowedDaysStr.split(',').map((d: string) => parseInt(d, 10));
    
    const days: Date[] = [];
    const d = new Date();
    d.setHours(0,0,0,0);
    // Avanzar 15 días buscando
    for(let i=0; i<15 && days.length < 5; i++) {
       const cd = new Date(d);
       cd.setDate(d.getDate() + i);
       if(allowedDays.includes(cd.getDay())) {
          days.push(cd);
       }
    }
    setAvailableDays(days);
    if(days.length > 0) {
      setSelectedDay(days[0]);
    }
    setStep('BOOKING');
  };

  useEffect(() => {
    if(selectedArea && selectedDay) {
       loadSlotsForDay(selectedArea, selectedDay);
    }
  }, [selectedDay, selectedArea]);

  const loadSlotsForDay = async (area: AreaComun, day: Date) => {
     try {
        // Fetch server for blocked slots
        const yyyy = day.getFullYear();
        const mm = String(day.getMonth() + 1).padStart(2, '0');
        const dd = String(day.getDate()).padStart(2, '0');
        const ds = `${yyyy}-${mm}-${dd}`;
        
        const blocked = await api.get<{fechaInicio: string; fechaFin: string}[]>(`/areas-comunes/${area.id}/slots?fecha=${ds}`);
        
        // Generar intervalos
        const startH = parseInt(area.horaApertura.split(':')[0]);
        const startM = parseInt(area.horaApertura.split(':')[1]);
        const endH = parseInt(area.horaCierre.split(':')[0]);
        const endM = parseInt(area.horaCierre.split(':')[1]);
        const dur = parseInt(String(area.duracionSlot)) || 60; // mins

        const dayStart = new Date(day);
        dayStart.setHours(startH, startM, 0, 0);
        
        const dayEnd = new Date(day);
        dayEnd.setHours(endH, endM, 0, 0);

        const slots = [];
        let curr = new Date(dayStart);
        while(curr < dayEnd) {
           const slotEnd = new Date(curr.getTime() + dur * 60000);
           if (slotEnd > dayEnd) break;
           
           // Check overlap with any blocked
           let isBlocked = false;
           for(const b of blocked) {
              const bStart = new Date(b.fechaInicio as string);
              const bEnd = new Date(b.fechaFin as string);
              if (curr < bEnd && slotEnd > bStart) {
                 isBlocked = true;
                 break;
              }
           }
           
           // Check if it's in the past (if today)
           if (curr < new Date()) {
              isBlocked = true;
           }

           slots.push({ start: new Date(curr), end: new Date(slotEnd), available: !isBlocked });
           curr = slotEnd;
        }
        
        setTimeSlots(slots);
        setSelectedSlotIndex(null);
     } catch {
       console.error("Error loading slots for day");
     }
  };

  const proceedToBook = async () => {
    if (selectedSlotIndex === null) return;
    
    // Si requiere deposito lo mandamos a PAYMENT view
    if (selectedArea?.requiereDeposito && Number(selectedArea.depositoMonto) > 0) {
      setStep('PAYMENT');
    } else {
      await executeBooking();
    }
  };

  const executeBooking = async () => {
    if (selectedSlotIndex === null) return;
    const slot = timeSlots[selectedSlotIndex];
    setIsProcessing(true);
    try {
      await api.post('/reservas', {
          areaId: selectedArea?.id,
          fechaInicio: slot.start.toISOString(),
          fechaFin: slot.end.toISOString()
        });
      setStep('SUCCESS');
    } catch {
      toast.error("Error de conexión");
    } finally {
      setIsProcessing(false);
    }
  };

  if(loading) return <div className="min-h-screen flex items-center justify-center text-text/50"><div className="animate-spin w-8 h-8 border-2 border-text/20 border-t-accent rounded-full"></div></div>;

  return (
    <div ref={containerRef} className="min-h-screen flex flex-col p-6 pt-16 pb-32 overflow-x-hidden relative gap-10">
      <ProfileHeader className="fade-up" />

      <section className="fade-up flex gap-3">
        <div className="relative flex-1 group">
           <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-text/30 group-focus-within:text-accent transition-colors" />
           <input type="text" placeholder="Buscar servicios..." className="w-full bg-text/5 border border-border rounded-[24px] py-4 pl-14 pr-6 text-sm text-text focus:outline-none focus:border-accent/40 focus:ring-4 focus:ring-accent/5 transition-all shadow-inner" />
        </div>
        <button className="w-14 h-14 rounded-[22px] bg-primary-light border border-border flex items-center justify-center text-text/60 hover:border-accent/20 transition-all active:scale-95 shadow-lg cursor-pointer">
           <SlidersHorizontal size={20} />
        </button>
      </section>

      <div className="flex flex-col gap-2 -mt-4 mb-2">
          <h1 className="text-3xl font-display font-bold text-text tracking-tight">Reservas</h1>
          <p className="text-text/60 text-[10px] uppercase font-bold tracking-widest ">Zonas Comunes del Conjunto</p>
      </div>

      {step === 'GRID' && (
        <section className="flex flex-col gap-6">
           {areas.length === 0 && <p className="text-text/50 text-center py-10">No hay áreas activas registradas.</p>}
           {areas.map((area) => (
              <div key={area.id} onClick={() => handleSelectArea(area)} className="fade-up liquid-glass-card rounded-[32px] overflow-hidden group cursor-pointer active:scale-[0.98] transition-all border border-border shadow-2xl relative">
                 <div className="relative h-60 w-full overflow-hidden">
                     <Image src={area.imagenUrl || "/placeholder.svg"} alt={area.nombre} fill className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" unoptimized />
                    <div className="absolute inset-0 bg-gradient-to-t from-primary/80 via-primary/25 to-transparent opacity-80" />
                    <div className="absolute top-4 right-4 liquid-glass px-4 py-2 rounded-full border border-border">
                       <span className="text-text font-bold text-sm">
                         {!area.requiereDeposito || Number(area.depositoMonto) === 0 ? 'Gratis' : `$${Number(area.depositoMonto).toLocaleString()}`}
                       </span>
                    </div>
                 </div>
                 <div className="p-6">
                    <div className="flex justify-between items-start mb-3">
                       <div>
                          <h3 className="text-xl font-bold text-text text-glow mb-1 leading-tight">{area.nombre}</h3>
                          <div className="flex gap-2">
                            <span className="text-[10px] text-text/60 font-bold uppercase tracking-wider">{area.horaApertura}-{area.horaCierre}</span>
                          </div>
                       </div>
                       <div className="w-10 h-10 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-accent"><MapPin size={18}/></div>
                    </div>
                    <p className="text-text/75 text-xs leading-relaxed font-normal mb-6 line-clamp-2">{area.descripcion}</p>
                    <div className="flex justify-between items-center">
                       <div className="flex items-center gap-1.5 text-text/60 text-[10px] font-bold uppercase"><Users size={12} /> {area.capacidadMax} Max</div>
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
           <div className="liquid-glass rounded-t-[40px] p-6 sm:p-8 pb-32 sm:pb-8 w-full max-w-[480px] mx-auto relative z-10 shadow-[0_-20px_50px_rgba(0,0,0,0.5)] animate-in slide-in-from-bottom-full duration-500 overflow-y-auto max-h-[95vh] hide-scrollbar border-t border-border">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-2xl font-display font-medium text-text tracking-tight">Tu Reserva</h3>
                 <button onClick={() => setStep('GRID')} className="w-10 h-10 rounded-full bg-text/5 hover:bg-text/10 flex items-center justify-center text-text/50 transition-colors cursor-pointer"><X size={20} /></button>
              </div>
              
              <div className="flex gap-4 items-center mb-6 p-3 rounded-[24px] bg-text/5 border border-border">
                 <div className="relative w-16 h-16 rounded-2xl overflow-hidden shrink-0">
                    <Image src={selectedArea.imagenUrl || ""} alt="" fill className="w-full h-full object-cover" unoptimized />
                 </div>
                 <div className="flex-1">
                    <h4 className="text-text font-bold text-base mb-1">{selectedArea.nombre}</h4>
                    <p className="text-accent text-xs font-bold uppercase tracking-widest">
                       {!selectedArea.requiereDeposito ? 'Gratis' : `Depósito: $${Number(selectedArea.depositoMonto).toLocaleString()}`}
                    </p>
                 </div>
              </div>

              <div className="flex flex-col gap-6 mb-8">
                 {/* Selector de Día */}
                 <div className="flex flex-col gap-3">
                    <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest ml-1">Selecciona el Día</label>
                    <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2 px-1 -mx-1 snap-x">
                        {availableDays.map((date, idx) => {
                          const isSelected = selectedDay?.getDate() === date.getDate() && selectedDay?.getMonth() === date.getMonth();
                          const mos = date.toLocaleString('es-ES', { month: 'short' });
                          const dow = date.toLocaleString('es-ES', { weekday: 'short' });
                          
                          return (
                             <button 
                                key={idx} 
                                onClick={() => setSelectedDay(date)}
                                className={`min-w-[70px] snap-center py-3 rounded-2xl border transition-all flex flex-col items-center gap-1 shrink-0 cursor-pointer 
                                ${isSelected ? 'bg-accent border-accent text-white shadow-lg shadow-accent/20' : 'bg-text/5 border-border text-text hover:bg-text/10'}`}
                             >
                               <span className="text-[10px] font-medium uppercase tracking-widest">{dow}</span>
                               <span className="text-xl font-display font-bold">{date.getDate()}</span>
                               <span className="text-[9px] font-bold uppercase text-text/60">{mos}</span>
                             </button>
                          )
                        })}
                    </div>
                 </div>

                 {/* Selector de Hora */}
                 <div className="flex flex-col gap-3">
                    <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest ml-1">Horario ({selectedArea.duracionSlot} min)</label>
                    <div className="grid grid-cols-2 gap-2 max-h-[220px] overflow-y-auto hide-scrollbar pr-1">
                        {timeSlots.length === 0 && <p className="text-text/50 text-xs py-4 col-span-2 text-center">No hay horarios disponibles.</p>}
                        {timeSlots.map((slot, index) => {
                           const st = slot.start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                           const ed = slot.end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                           return (
                             <button
                               key={index}
                               disabled={!slot.available}
                               onClick={() => setSelectedSlotIndex(index)}
                               className={`
                                 py-3 px-2 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 border cursor-pointer
                                 ${!slot.available ? 'opacity-30 bg-text/5 border-transparent cursor-not-allowed text-text/40' : 
                                   selectedSlotIndex === index ? 'bg-accent text-white border-accent shadow-xl' : 'bg-text/5 border-border text-text hover:bg-text/10'}
                               `}
                             >
                                <span className={selectedSlotIndex === index ? 'opacity-50 text-[10px]' : 'text-accent/70 text-[10px]'}>MIE {selectedDay?.getDate()}</span>
                                <span>{st} - {ed}</span>
                             </button>
                           )
                        })}
                    </div>
                 </div>
              </div>
              
              <button 
                  disabled={selectedSlotIndex === null || isProcessing}
                  onClick={proceedToBook} 
                  className="w-full py-5 bg-gradient-to-r from-accent to-purple-600 rounded-[24px] font-bold text-white shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:active:scale-100 cursor-pointer"
               >
                  {isProcessing ? 'Procesando...' : selectedArea.requiereDeposito ? 'Pagar Depósito' : 'Confirmar Reserva'} 
                  <ArrowRight size={18} />
               </button>
           </div>
        </section>
      )}

      {step === 'PAYMENT' && (
        <section className="fade-up fixed inset-0 z-100 flex flex-col items-center justify-center p-8 bg-primary/95 backdrop-blur-3xl">
           <div className="w-16 h-16 rounded-full border-4 border-border border-t-accent animate-spin mb-4" />
           <h3 className="text-2xl font-display font-medium text-text tracking-tight">Procesando Pago Seguro...</h3>
            <p className="text-text/60 text-xs mt-4">Confirmando con pasarela de pago...</p>
            <button onClick={executeBooking} className="mt-8 text-xs font-bold text-accent px-4 py-2 border border-accent/20 rounded-full hover:bg-accent hover:text-white transition-colors cursor-pointer">Confirmar Pago</button>
        </section>
      )}

      {step === 'SUCCESS' && selectedArea && selectedSlotIndex !== null && (
        <section className="fade-up fixed inset-0 z-100 flex flex-col items-center justify-center p-6 bg-gradient-to-br from-primary to-primary-light animate-in slide-in-from-bottom-20 duration-700">
           <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center shadow-[0_0_50px_rgba(16,185,129,0.3)] mb-8 animate-bounce delay-100"><CheckCircle2 size={40} className="text-white" /></div>
           <h2 className="text-3xl font-display font-bold text-text tracking-tight mb-2 text-glow">¡Reserva Confirmada!</h2>
           <p className="text-text/50 text-sm mb-10 text-center font-light">Tu espacio ha sido separado exitosamente.</p>
           
           <div className="w-full max-w-[340px] liquid-glass rounded-[40px] overflow-hidden shadow-2xl border border-border p-8 relative">
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-accent/20 blur-3xl rounded-full pointer-events-none"></div>
              
              <div className="flex flex-col gap-6 mb-8 relative z-10">
                 <div className="flex gap-4 items-center">
                    <div className="w-12 h-12 rounded-2xl bg-text/5 border border-border flex items-center justify-center text-accent"><MapPin size={20} /></div>
                    <div><p className="text-[10px] text-text/50 uppercase font-bold tracking-widest">Espacio</p><p className="text-text font-bold">{selectedArea.nombre}</p></div>
                 </div>
                 <div className="flex gap-4 items-center">
                    <div className="w-12 h-12 rounded-2xl bg-text/5 border border-border flex items-center justify-center text-accent"><Clock size={20} /></div>
                    <div><p className="text-[10px] text-text/50 uppercase font-bold tracking-widest">Horario</p>
                       <p className="text-text font-bold text-sm">
                         {selectedDay?.toLocaleDateString('es-ES', {month:'short', day:'numeric'})} • {timeSlots[selectedSlotIndex].start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                       </p>
                    </div>
                 </div>
              </div>
              <div className="w-full aspect-square bg-text/5 p-4 rounded-[32px] flex items-center justify-center border border-border relative z-10">
                 {/* QR Decorativo premium */}
                 <div className="w-full h-full bg-white rounded-[20px] flex items-center justify-center p-4">
                      <QrCode size={180} className="text-black" />
                 </div>
              </div>
           </div>
           
           <button onClick={() => window.location.reload()} className="mt-12 text-text/60 text-[10px] font-bold uppercase tracking-widest hover:text-text transition-colors cursor-pointer">Volver a Reservas</button>
        </section>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}
