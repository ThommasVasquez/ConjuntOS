"use client";

/**
 * RÉSERVAS - CONJUNTOSAPP
 * Módulo de reserva de zonas comunes integrado al backend real.
 */

import { 
  ArrowRight, X, CheckCircle2, 
  Clock, Users,
  Search, SlidersHorizontal, MapPin, QrCode, Calendar, Trash2, Edit2
} from "lucide-react";
import QRCode from "react-qr-code";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api/client";
import { PAYMENTS_ENABLED, PAYMENTS_DISABLED_MSG } from "@/lib/flags";
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

interface ReservaDto {
  id: string;
  areaId: string;
  fechaInicio: string;
  fechaFin: string;
  estado: string;
  notas?: string;
  createdAt: string;
  areaNombre: string;
  areaImagenUrl?: string;
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
  const [reservaId, setReservaId] = useState<string>("");
  const [reservas, setReservas] = useState<ReservaDto[]>([]);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrReservaId, setQrReservaId] = useState("");
  const [qrReservaNombre, setQrReservaNombre] = useState("");
  const [qrReservaInicio, setQrReservaInicio] = useState("");
  const [qrReservaFin, setQrReservaFin] = useState("");
  const [qrReservaEstado, setQrReservaEstado] = useState("");

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingReserva, setEditingReserva] = useState<ReservaDto | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editAvailableDays, setEditAvailableDays] = useState<Date[]>([]);
  const [editSelectedDay, setEditSelectedDay] = useState<Date | null>(null);
  const [editTimeSlots, setEditTimeSlots] = useState<{start: Date, end: Date, available: boolean}[]>([]);
  const [editSelectedSlotIndex, setEditSelectedSlotIndex] = useState<number | null>(null);

  // Real-time WebSocket subscription
  useWsSubscription('reserva', () => {
    Promise.all([
      api.get<AreaComun[]>('/areas-comunes').then(setAreas).catch(() => {}),
      api.get<ReservaDto[]>('/reservas').then(setReservas).catch(() => {}),
    ]);
  });

  useEffect(() => {
    async function loadAreas() {
      try {
        const [areasData, reservasData] = await Promise.all([
          api.get<AreaComun[]>('/areas-comunes'),
          api.get<ReservaDto[]>('/reservas').catch(() => []),
        ]);
        setAreas(areasData);
        setReservas(reservasData);
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
        
}, containerRef);
      return () => ctx.revert();
    }
  }, [loading, step]);

  const DAY_MAP: Record<string, number> = {
    DOM: 0, LUN: 1, MAR: 2, MIE: 3, JUE: 4, VIE: 5, SAB: 6,
    DOMINGO: 0, LUNES: 1, MARTES: 2, MIERCOLES: 3, JUEVES: 4, VIERNES: 5, SABADO: 6,
    SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6,
  };

  function parseDiasDisponibles(raw: string): number[] {
    if (!raw) return [0,1,2,3,4,5,6];
    const parts = raw.split(/[\s,;]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
    const days = new Set<number>();
    for (const p of parts) {
      // Try direct code match (DOM, LUN, etc.)
      if (DAY_MAP[p] !== undefined) { days.add(DAY_MAP[p]); continue; }
      // Try numeric (0-6)
      const n = parseInt(p, 10);
      if (!isNaN(n) && n >= 0 && n <= 6) { days.add(n); continue; }
      // Try substring match (e.g. "Lunes" inside "Lunes a Domingo")
      for (const [key, val] of Object.entries(DAY_MAP)) {
        if (p.includes(key)) { days.add(val); break; }
      }
    }
    return days.size > 0 ? Array.from(days) : [0,1,2,3,4,5,6];
  }

  const handleSelectArea = (area: AreaComun) => {
    setSelectedArea(area);
    
    // Generar próximos 7 días a partir de hoy (limitado a sus días disponibles)
    const allowedDays = parseDiasDisponibles(area.diasDisponibles || "");
    
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
        setTimeSlots([]);
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
      if (!PAYMENTS_ENABLED) { toast.error(PAYMENTS_DISABLED_MSG); return; }
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
      const res = await api.post<{ id: string }>('/reservas', {
          areaId: selectedArea?.id,
          fechaInicio: slot.start.toISOString(),
          fechaFin: slot.end.toISOString()
        });
      setReservaId(res.id);
      setStep('SUCCESS');
    } catch {
      toast.error("Error de conexion");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelarReserva = async (id: string) => {
    if (!window.confirm("¿Seguro que quieres cancelar esta reserva?")) return;
    try {
      await api.put(`/reservas/${id}/cancelar`, {});
      setReservas(prev => prev.filter(r => r.id !== id));
      toast.success("Reserva cancelada");
    } catch {
      toast.error("No se pudo cancelar la reserva");
    }
  };

  const openEditModal = (r: ReservaDto) => {
    setEditingReserva(r);

    // Find the area from our list to get its config
    const area = areas.find(a => a.id === r.areaId);
    if (!area) {
      toast.error("Área no encontrada");
      return;
    }

    // Generate available days (same logic as booking flow)
    const allowedDays = parseDiasDisponibles(area.diasDisponibles || "");

    const days: Date[] = [];
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    for (let i = 0; i < 15 && days.length < 5; i++) {
      const cd = new Date(d);
      cd.setDate(d.getDate() + i);
      if (allowedDays.includes(cd.getDay())) {
        days.push(cd);
      }
    }
    setEditAvailableDays(days);

    // Pre-select the day of the current reservation
    const reservaDate = new Date(r.fechaInicio);
    reservaDate.setHours(0, 0, 0, 0);
    const matchingDay = days.find(day =>
      day.getDate() === reservaDate.getDate() &&
      day.getMonth() === reservaDate.getMonth() &&
      day.getFullYear() === reservaDate.getFullYear()
    );
    setEditSelectedDay(matchingDay || days[0] || null);
    setShowEditModal(true);
  };

  // Load slots when edit day changes
  useEffect(() => {
    if (!showEditModal || !editingReserva || !editSelectedDay) return;

    const area = areas.find(a => a.id === editingReserva.areaId);
    if (!area) return;

    (async () => {
      try {
        const yyyy = editSelectedDay.getFullYear();
        const mm = String(editSelectedDay.getMonth() + 1).padStart(2, '0');
        const dd = String(editSelectedDay.getDate()).padStart(2, '0');
        const ds = `${yyyy}-${mm}-${dd}`;

        const blocked = await api.get<{fechaInicio: string; fechaFin: string}[]>(
          `/areas-comunes/${area.id}/slots?fecha=${ds}`
        );

        const startH = parseInt(area.horaApertura.split(':')[0]);
        const startM = parseInt(area.horaApertura.split(':')[1]);
        const endH = parseInt(area.horaCierre.split(':')[0]);
        const endM = parseInt(area.horaCierre.split(':')[1]);
        const dur = parseInt(String(area.duracionSlot)) || 60;

        const dayStart = new Date(editSelectedDay);
        dayStart.setHours(startH, startM, 0, 0);
        const dayEnd = new Date(editSelectedDay);
        dayEnd.setHours(endH, endM, 0, 0);

        const slots: {start: Date, end: Date, available: boolean}[] = [];
        let curr = new Date(dayStart);
        while (curr < dayEnd) {
          const slotEnd = new Date(curr.getTime() + dur * 60000);
          if (slotEnd > dayEnd) break;

          let isBlocked = false;
          for (const b of blocked) {
            const bStart = new Date(b.fechaInicio);
            const bEnd = new Date(b.fechaFin);
            // Exclude the current reservation being edited from blocked list
            const reservaInicioMs = new Date(editingReserva.fechaInicio).getTime();
            const reservaFinMs = new Date(editingReserva.fechaFin).getTime();
            if (reservaInicioMs === bStart.getTime() && reservaFinMs === bEnd.getTime()) continue;
            if (curr < bEnd && slotEnd > bStart) {
              isBlocked = true;
              break;
            }
          }

          if (curr < new Date()) {
            isBlocked = true;
          }

          slots.push({ start: new Date(curr), end: new Date(slotEnd), available: !isBlocked });
          curr = slotEnd;
        }

        setEditTimeSlots(slots);

        // Pre-select the slot matching the current reservation
        const rInicio = new Date(editingReserva.fechaInicio);
        const rFin = new Date(editingReserva.fechaFin);
        const matchIdx = slots.findIndex(s =>
          s.start.getTime() === rInicio.getTime() && s.end.getTime() === rFin.getTime()
        );
        setEditSelectedSlotIndex(matchIdx >= 0 ? matchIdx : null);
      } catch {
        console.error("Error loading edit slots");
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEditModal, editingReserva?.id, editSelectedDay?.toISOString().slice(0, 10)]);

  const handleEditarReserva = async () => {
    if (!editingReserva || editSelectedSlotIndex === null) return;
    const slot = editTimeSlots[editSelectedSlotIndex];
    setEditSaving(true);
    try {
      const updated = await api.put<ReservaDto>(`/reservas/${editingReserva.id}/editar`, {
        fechaInicio: slot.start.toISOString(),
        fechaFin: slot.end.toISOString(),
      });
      setReservas(prev => prev.map(r => r.id === editingReserva.id ? { ...r, fechaInicio: updated.fechaInicio, fechaFin: updated.fechaFin } : r));
      setShowEditModal(false);
      toast.success("Reserva actualizada");
    } catch (e: any) {
      if (e?.status === 409) {
        toast.error("Ese horario ya está reservado. Elige otro.");
      } else {
        toast.error("No se pudo actualizar la reserva");
      }
    } finally {
      setEditSaving(false);
    }
  };

 if(loading) return <div className="min-h-screen flex items-center justify-center text-text"><div className="animate-pulse bg-text/10 w-8 h-8 rounded-full"></div></div>;

  return (
    <div ref={containerRef} className="min-h-screen flex flex-col p-6 pt-16 pb-32 overflow-x-hidden relative gap-10">
      <ProfileHeader className="" />

      <section className="flex gap-3">
        <div className="relative flex-1 group">
           <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-text group-focus-within:text-accent transition-colors" />
           <input type="text" placeholder="Buscar servicios..." className="w-full bg-text/5 border border-border rounded-[24px] py-4 pl-14 pr-6 text-sm text-text focus:outline-none focus:border-accent/40 focus:ring-4 focus:ring-accent/5 transition-all shadow-inner" />
        </div>
        <button className="w-14 h-14 rounded-[22px] bg-primary-light border border-border flex items-center justify-center text-text hover:border-accent/20 transition-all active:scale-95 shadow-lg cursor-pointer">
           <SlidersHorizontal size={20} />
        </button>
      </section>

      <div className="flex flex-col gap-2 -mt-4 mb-2">
          <h1 className="text-3xl font-display font-bold text-text tracking-tight">Reservas</h1>
          <p className="text-text text-[10px] uppercase font-bold tracking-widest ">Zonas Comunes del Conjunto</p>
      </div>

      {/* Mis Reservas */}
      {step === 'GRID' && reservas.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-accent px-1">Mis Reservas</h3>
          {reservas.map((r) => {
            const ahora = new Date();
            const inicio = new Date(r.fechaInicio);
            const fin = new Date(r.fechaFin);
            const isActive = r.estado !== "CANCELADA" && fin > ahora;
            const canEdit = (r.estado === "CONFIRMADA" || r.estado === "PENDIENTE") && fin > ahora;
            return (
              <div key={r.id} className={`liquid-glass rounded-2xl p-4 border ${isActive ? 'border-border' : 'border-border/50 opacity-60'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center text-accent shrink-0">
                    {r.areaImagenUrl ? (
                      <img src={r.areaImagenUrl} alt="" className="w-full h-full object-cover rounded-xl" />
                    ) : (
                      <Calendar size={18} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-text truncate">{r.areaNombre}</p>
                    <p className="text-[10px] text-text/60">
                      {inicio.toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" })}
                      {" \u00b7 "}
                      {inicio.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                      {" \u2192 "}
                      {fin.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase shrink-0 ${
                    r.estado === "CONFIRMADA" ? "bg-success/20 text-success" :
                    r.estado === "PENDIENTE" ? "bg-warning/20 text-warning" :
                    r.estado === "CANCELADA" ? "bg-red-500/20 text-red-400" :
                    "bg-text/10 text-text/60"
                  }`}>
                    {r.estado === "CONFIRMADA" ? "Activa" : r.estado === "PENDIENTE" ? "Pendiente" : r.estado}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-3 justify-end">
                  <button
                    onClick={() => {
                      setQrReservaId(r.id);
                      setQrReservaNombre(r.areaNombre);
                      setQrReservaInicio(r.fechaInicio);
                      setQrReservaFin(r.fechaFin);
                      setQrReservaEstado(r.estado);
                      setShowQrModal(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent/10 text-accent text-[10px] font-bold uppercase tracking-wider hover:bg-accent/20 transition-colors"
                  >
                    <QrCode size={12} /> QR
                  </button>
                  {canEdit && (
                    <button
                      onClick={() => openEditModal(r)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-text/5 text-text/70 text-[10px] font-bold uppercase tracking-wider hover:bg-text/10 transition-colors"
                    >
                      <Edit2 size={12} /> Editar
                    </button>
                  )}
                  {canEdit && (
                    <button
                      onClick={() => handleCancelarReserva(r.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 text-red-400 text-[10px] font-bold uppercase tracking-wider hover:bg-red-500/20 transition-colors"
                    >
                      <Trash2 size={12} /> Anular
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {step === 'GRID' && (
        <section className="flex flex-col gap-6">
           {areas.length === 0 && <p className="text-text text-center py-10">No hay áreas activas registradas.</p>}
           {areas.map((area) => (
              <div key={area.id} onClick={() => handleSelectArea(area)} className="liquid-glass-card rounded-[32px] overflow-hidden group cursor-pointer active:scale-[0.98] transition-all border border-border shadow-2xl relative">
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
                            <span className="text-[10px] text-text font-bold uppercase tracking-wider">{area.horaApertura}-{area.horaCierre}</span>
                          </div>
                       </div>
                       <div className="w-10 h-10 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-accent"><MapPin size={18}/></div>
                    </div>
                    <p className="text-text text-xs leading-relaxed font-normal mb-6 line-clamp-2">{area.descripcion}</p>
                    <div className="flex justify-between items-center">
                       <div className="flex items-center gap-1.5 text-text text-[10px] font-bold uppercase"><Users size={12} /> {area.capacidadMax} Max</div>
                       <div className="flex items-center gap-2 group/btn"><span className="text-accent text-[11px] font-bold uppercase tracking-widest group-hover/btn:translate-x-[-4px] transition-transform">Reservar</span><ArrowRight size={14} className="text-accent" /></div>
                    </div>
                 </div>
              </div>
           ))}
        </section>
      )}

      {step === 'BOOKING' && selectedArea && (
        <section className="fixed inset-0 z-1000 flex flex-col justify-end">
           <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={() => setStep('GRID')} />
           <div className="liquid-glass rounded-t-[40px] p-6 sm:p-8 pb-32 sm:pb-8 w-full max-w-[480px] mx-auto relative z-10 shadow-[0_-20px_50px_rgba(0,0,0,0.5)] animate-in slide-in-from-bottom-full duration-500 overflow-y-auto max-h-[95vh] hide-scrollbar border-t border-border">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-2xl font-display font-medium text-text tracking-tight">Tu Reserva</h3>
                 <button onClick={() => setStep('GRID')} className="w-10 h-10 rounded-full bg-text/5 hover:bg-text/10 flex items-center justify-center text-text transition-colors cursor-pointer"><X size={20} /></button>
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
                    <label className="text-[10px] text-text font-bold uppercase tracking-widest ml-1">Selecciona el Día</label>
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
                                ${isSelected ? 'bg-accent border-accent text-on-accent shadow-lg shadow-accent/20' : 'bg-text/5 border-border text-text hover:bg-text/10'}`}
                             >
                               <span className="text-[10px] font-medium uppercase tracking-widest">{dow}</span>
                               <span className="text-xl font-display font-bold">{date.getDate()}</span>
                               <span className="text-[9px] font-bold uppercase text-text">{mos}</span>
                             </button>
                          )
                        })}
                    </div>
                 </div>

                 {/* Selector de Hora */}
                 <div className="flex flex-col gap-3">
                    <label className="text-[10px] text-text font-bold uppercase tracking-widest ml-1">Horario ({selectedArea.duracionSlot} min)</label>
                    <div className="grid grid-cols-2 gap-2 max-h-[220px] overflow-y-auto hide-scrollbar pr-1">
                        {timeSlots.length === 0 && <p className="text-text text-xs py-4 col-span-2 text-center">No hay horarios disponibles.</p>}
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
                                 ${!slot.available ? 'opacity-30 bg-text/5 border-transparent cursor-not-allowed text-text' : 
                                   selectedSlotIndex === index ? 'bg-accent text-on-accent border-accent shadow-xl' : 'bg-text/5 border-border text-text hover:bg-text/10'}
                               `}
                             >
                                <span className={selectedSlotIndex === index ? 'opacity-50 text-[10px]' : 'text-accent/70 text-[10px]'}>{selectedDay ? ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'][selectedDay.getDay()] : ''} {selectedDay?.getDate()}</span>
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
                  className="w-full py-5 bg-accent rounded-[24px] font-bold text-on-accent shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:active:scale-100 cursor-pointer"
               >
                  {isProcessing ? 'Procesando...' : selectedArea.requiereDeposito ? 'Pagar Depósito' : 'Confirmar Reserva'} 
                  <ArrowRight size={18} />
               </button>
           </div>
        </section>
      )}

      {step === 'PAYMENT' && (
        <section className="fixed inset-0 z-100 flex flex-col items-center justify-center p-8 bg-primary/95 backdrop-blur-3xl">
 <div className="w-16 h-16 rounded-full animate-pulse bg-text/10 mb-4" />
           <h3 className="text-2xl font-display font-medium text-text tracking-tight">Procesando Pago Seguro...</h3>
            <p className="text-text text-xs mt-4">Confirmando con pasarela de pago...</p>
             <button onClick={executeBooking} disabled={isProcessing} className="mt-8 text-xs font-bold text-accent px-4 py-2 border border-accent/20 rounded-full hover:bg-accent hover:text-on-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">Confirmar Pago</button>
        </section>
      )}

      {step === 'SUCCESS' && selectedArea && selectedSlotIndex !== null && (
        <section className="fixed inset-0 z-100 flex flex-col items-center justify-center p-6 bg-gradient-to-br from-primary to-primary-light animate-in slide-in-from-bottom-20 duration-700">
           <div className="w-20 h-20 rounded-full bg-text/10 flex items-center justify-center shadow-[0_0_50px_rgba(128,128,128,0.3)] mb-8 animate-bounce delay-100"><CheckCircle2 size={40} className="text-white" /></div>
           <h2 className="text-3xl font-display font-bold text-text tracking-tight mb-2 text-glow">¡Reserva Confirmada!</h2>
           <p className="text-text text-sm mb-10 text-center font-light">Tu espacio ha sido separado exitosamente.</p>
           
           <div className="w-full max-w-[340px] liquid-glass rounded-[40px] overflow-hidden shadow-2xl border border-border p-8 relative">
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-accent/20 blur-3xl rounded-full pointer-events-none"></div>
              
              <div className="flex flex-col gap-6 mb-8 relative z-10">
                 <div className="flex gap-4 items-center">
                    <div className="w-12 h-12 rounded-2xl bg-text/5 border border-border flex items-center justify-center text-accent"><MapPin size={20} /></div>
                    <div><p className="text-[10px] text-text uppercase font-bold tracking-widest">Espacio</p><p className="text-text font-bold">{selectedArea.nombre}</p></div>
                 </div>
                 <div className="flex gap-4 items-center">
                    <div className="w-12 h-12 rounded-2xl bg-text/5 border border-border flex items-center justify-center text-accent"><Clock size={20} /></div>
                    <div><p className="text-[10px] text-text uppercase font-bold tracking-widest">Horario</p>
                       <p className="text-text font-bold text-sm">
                         {selectedDay?.toLocaleDateString('es-ES', {month:'short', day:'numeric'})} • {timeSlots[selectedSlotIndex].start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                       </p>
                    </div>
                 </div>
              </div>
              <div className="w-full aspect-square bg-text/5 p-4 rounded-[32px] flex items-center justify-center border border-border relative z-10">
                 <div className="w-full h-full bg-white rounded-[20px] flex items-center justify-center p-4">
                      {reservaId && <QRCode value={reservaId} size={180} />}
                 </div>
              </div>
           </div>
           
           <button onClick={() => window.location.reload()} className="mt-12 text-text text-[10px] font-bold uppercase tracking-widest hover:text-text transition-colors cursor-pointer">Volver a Reservas</button>
        </section>
      )}

      {/* QR Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowQrModal(false)}>
          <div className="liquid-glass rounded-[32px] p-6 border border-border w-80 flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowQrModal(false)} className="self-end text-text/50 hover:text-text"><X size={18} /></button>
            <h3 className="text-lg font-bold text-text">{qrReservaNombre}</h3>
            <span className={`text-[10px] px-3 py-0.5 rounded-full font-bold uppercase ${
              qrReservaEstado === "CONFIRMADA" ? "bg-success/20 text-success" :
              qrReservaEstado === "PENDIENTE" ? "bg-warning/20 text-warning" :
              "bg-red-500/20 text-red-400"
            }`}>
              {qrReservaEstado === "CONFIRMADA" ? "Activa" : qrReservaEstado === "PENDIENTE" ? "Pendiente" : qrReservaEstado}
            </span>
            <div className="w-full space-y-1.5 px-1">
              <div className="flex items-center gap-2 text-xs text-text">
                <Calendar size={13} className="text-accent shrink-0" />
                <span className="font-bold">{qrReservaInicio ? new Date(qrReservaInicio).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" }) : ""}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-text">
                <Clock size={13} className="text-accent shrink-0" />
                <span className="font-mono">{qrReservaInicio ? new Date(qrReservaInicio).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : ""} {"\u2192"} {qrReservaFin ? new Date(qrReservaFin).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : ""}</span>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-3">
              <QRCode value={qrReservaId} size={200} />
            </div>
            <p className="text-[10px] text-text/50 text-center">Presenta este código al ingreso del área</p>
            <button onClick={() => setShowQrModal(false)} className="w-full py-3 rounded-xl bg-accent text-primary font-bold text-sm mt-1">Cerrar</button>
          </div>
        </div>
      )}

      {/* Edit Modal — Slot Picker */}
      {showEditModal && editingReserva && (
        <div className="fixed inset-0 z-[1000] flex flex-col justify-end" onClick={() => setShowEditModal(false)}>
          <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" />
          <div className="liquid-glass rounded-t-[40px] p-6 pb-32 w-full max-w-[480px] mx-auto relative z-10 shadow-[0_-20px_50px_rgba(0,0,0,0.5)] animate-in slide-in-from-bottom-full duration-500 overflow-y-auto max-h-[90vh] hide-scrollbar border-t border-border" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-2xl font-display font-medium text-text tracking-tight">Editar Reserva</h3>
              <button onClick={() => setShowEditModal(false)} className="w-10 h-10 rounded-full bg-text/5 hover:bg-text/10 flex items-center justify-center text-text transition-colors cursor-pointer"><X size={20} /></button>
            </div>
            <p className="text-xs text-text/60 mb-6">{editingReserva.areaNombre}</p>

            {/* Day Selector */}
            <div className="flex flex-col gap-3 mb-6">
              <label className="text-[10px] text-text font-bold uppercase tracking-widest ml-1">Selecciona el Día</label>
              <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2 px-1 -mx-1 snap-x">
                {editAvailableDays.map((date, idx) => {
                  const isSelected = editSelectedDay?.getDate() === date.getDate() && editSelectedDay?.getMonth() === date.getMonth();
                  const mos = date.toLocaleString('es-ES', { month: 'short' });
                  const dow = date.toLocaleString('es-ES', { weekday: 'short' });
                  return (
                    <button
                      key={idx}
                      onClick={() => setEditSelectedDay(date)}
                      className={`min-w-[70px] snap-center py-3 rounded-2xl border transition-all flex flex-col items-center gap-1 shrink-0 cursor-pointer
                      ${isSelected ? 'bg-accent border-accent text-on-accent shadow-lg shadow-accent/20' : 'bg-text/5 border-border text-text hover:bg-text/10'}`}
                    >
                      <span className="text-[10px] font-medium uppercase tracking-widest">{dow}</span>
                      <span className="text-xl font-display font-bold">{date.getDate()}</span>
                      <span className="text-[9px] font-bold uppercase text-text">{mos}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time Slot Selector */}
            <div className="flex flex-col gap-3 mb-6">
              <label className="text-[10px] text-text font-bold uppercase tracking-widest ml-1">Horario ({editingReserva.areaNombre})</label>
              <div className="grid grid-cols-2 gap-2 max-h-[220px] overflow-y-auto hide-scrollbar pr-1">
                {editTimeSlots.length === 0 && <p className="text-text text-xs py-4 col-span-2 text-center">No hay horarios disponibles.</p>}
                {editTimeSlots.map((slot, index) => {
                  const st = slot.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const ed = slot.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const isCurrentSlot = editingReserva &&
                    new Date(editingReserva.fechaInicio).getTime() === slot.start.getTime() &&
                    new Date(editingReserva.fechaFin).getTime() === slot.end.getTime();
                  return (
                    <button
                      key={index}
                      disabled={!slot.available}
                      onClick={() => setEditSelectedSlotIndex(index)}
                      className={`
                        py-3 px-2 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 border cursor-pointer
                        ${!slot.available ? 'opacity-30 bg-text/5 border-transparent cursor-not-allowed text-text' :
                          editSelectedSlotIndex === index ? 'bg-accent text-on-accent border-accent shadow-xl' : 'bg-text/5 border-border text-text hover:bg-text/10'}
                      `}
                    >
                      <span className={editSelectedSlotIndex === index ? 'opacity-50 text-[10px]' : 'text-accent/70 text-[10px]'}>
                        {editSelectedDay ? ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'][editSelectedDay.getDay()] : ''} {editSelectedDay?.getDate()}
                        {isCurrentSlot ? ' (actual)' : ''}
                      </span>
                      <span>{st} - {ed}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={handleEditarReserva}
              disabled={editSaving || editSelectedSlotIndex === null}
              className="w-full py-5 bg-accent rounded-[24px] font-bold text-on-accent shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:active:scale-100 cursor-pointer"
            >
              {editSaving ? "Guardando..." : "Guardar Cambios"}
            </button>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}
