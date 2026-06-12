"use client";

/**
 * VISITANTES - CONJUNTOSAPP
 * Gestión de ingresos, generación de códigos QR y control de acceso.
 */

import { 
  ArrowRight, Calendar, CheckCircle2, Clock, Download, Loader2,
  MoreHorizontal, Plus, QrCode, Share2, ShieldCheck, 
  User, UserPlus
} from "lucide-react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { gsap } from "gsap";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { useAuth } from "@/hooks/useAuth";
import type { VisitaDto, TipoVisita, TipoVehiculoVisita } from "@/lib/api/types";
import { useWsSubscription } from "@/hooks/useWebSocket";

type VisitStatus = 'ACTIVO' | 'PROGRAMADO' | 'HISTORIAL';

function getVisitStatus(visita: VisitaDto): VisitStatus {
  const now = new Date();
  const fecha = new Date(visita.fecha);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const visitDay = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());

  if (visitDay > today) return 'PROGRAMADO';
  if (visitDay.getTime() === today.getTime()) return 'ACTIVO';
  return 'HISTORIAL';
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

function formatScheduledDate(dateStr: string): string {
  const fecha = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const visitDay = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());

  if (visitDay.getTime() === today.getTime()) {
    return `Hoy, ${formatTime(dateStr)}`;
  }
  return fecha.toLocaleDateString("es-CO", { weekday: "short", month: "short", day: "numeric" }) + `, ${formatTime(dateStr)}`;
}

export default function VisitantesPage() {
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [newVisitForm, setNewVisitForm] = useState<{
    name: string;
    tipo: TipoVisita;
    vehiculoTipo: TipoVehiculoVisita;
    placa: string;
    observacion: string;
  }>({
    name: '',
    tipo: 'PEATONAL',
    vehiculoTipo: 'NINGUNO',
    placa: '',
    observacion: '',
  });

  const [visitors, setVisitors] = useState<VisitaDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetchVisitors = async () => {
    try {
      const data = await api.get<{ visitas: VisitaDto[]; paquetes: any[] }>("/comunicaciones");
      setVisitors(data.visitas || []);
    } catch (e: any) {
      console.error("Error fetching visitors:", e);
    }
  };

  // Real-time WebSocket subscription
  useWsSubscription('visita', () => refetchVisitors());

  // Fetch visitors on mount
  useEffect(() => {
    const fetchVisitors = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.get<{ visitas: VisitaDto[]; paquetes: any[] }>("/comunicaciones");
        setVisitors(data.visitas || []);
      } catch (e: any) {
        console.error("Error fetching visitors:", e);
        setError("No se pudieron cargar las visitas");
      } finally {
        setLoading(false);
      }
    };
    fetchVisitors();
  }, []);

  useEffect(() => {
    if (loading) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(".fade-up", 
        { opacity: 0, y: 30 },
        { 
          opacity: 1, 
          y: 0, 
          duration: 0.6, 
          stagger: 0.1,
          ease: "power3.out" 
        }
      );
    }, containerRef);

    return () => ctx.revert();
  }, [loading]);

  const handleCreateInvitation = async () => {
    if (!newVisitForm.name) {
      toast.error("Por favor ingresa el nombre del invitado");
      return;
    }
    setSubmitting(true);
    try {
      const newVisit = await api.post<VisitaDto>("/visitas", {
        nombre: newVisitForm.name.trim(),
        tipo: newVisitForm.tipo,
        vehiculoTipo: newVisitForm.vehiculoTipo !== 'NINGUNO' ? newVisitForm.vehiculoTipo : undefined,
        placa: newVisitForm.placa.trim() || undefined,
        observacion: newVisitForm.observacion.trim() || undefined,
      });
      setVisitors(prev => [newVisit, ...prev]);
      setIsQRModalOpen(true);
      toast.success("Visita programada con exito");
      setNewVisitForm({ name: '', tipo: 'PEATONAL', vehiculoTipo: 'NINGUNO', placa: '', observacion: '' });
    } catch (e: any) {
      toast.error(e?.detail || "Error al crear la invitacion");
    } finally {
      setSubmitting(false);
    }
  };

  const activeVisitors = visitors.filter(v => getVisitStatus(v) === 'ACTIVO');
  const scheduledVisitors = visitors.filter(v => getVisitStatus(v) === 'PROGRAMADO');
  const pastVisitors = visitors.filter(v => getVisitStatus(v) === 'HISTORIAL');
  const nonActiveVisitors = [...scheduledVisitors, ...pastVisitors];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-accent" size={32} />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="min-h-screen flex flex-col p-6 pt-16 pb-32 overflow-x-hidden relative gap-8">
      
      <ProfileHeader className="fade-up" />

      {error && (
        <div className="fade-up bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold p-4 rounded-2xl text-center">
          {error}
        </div>
      )}

      {/* 2. SUMMARY CARDS */}
      <section className="grid grid-cols-2 gap-4 fade-up">
        <div className="liquid-glass-card p-5 rounded-[28px] border-t border-border flex flex-col gap-3">
          <div className="w-10 h-10 rounded-2xl bg-green-500/10 flex items-center justify-center text-green-400">
            <User size={20} />
          </div>
          <div>
            <span className="text-[10px] text-text/60 font-bold uppercase tracking-widest">Hoy</span>
            <p className="text-2xl font-bold text-text tracking-tight">{String(activeVisitors.length).padStart(2, '0')}</p>
          </div>
        </div>
        <div className="liquid-glass-card p-5 rounded-[28px] border-t border-border flex flex-col gap-3">
          <div className="w-10 h-10 rounded-2xl bg-accent/10 flex items-center justify-center text-accent">
            <Calendar size={20} />
          </div>
          <div>
            <span className="text-[10px] text-text/60 font-bold uppercase tracking-widest">Agendadas</span>
            <p className="text-2xl font-bold text-text tracking-tight">{String(scheduledVisitors.length).padStart(2, '0')}</p>
          </div>
        </div>
      </section>

      {/* 3. NEW VISIT ACTION */}
      <section className="fade-up liquid-glass-card p-6 rounded-[32px] border border-border relative overflow-hidden group">
         <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 blur-[60px] rounded-full -z-10 group-hover:bg-accent/20 transition-all" />
         
         <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
               <div className="w-12 h-12 rounded-[18px] bg-accent flex items-center justify-center text-white shadow-[0_8px_20px_rgba(59,130,246,0.4)]">
                  <UserPlus size={24} />
               </div>
               <div>
                  <h3 className="text-text font-bold text-lg leading-tight">Nueva Invitacion</h3>
                  <p className="text-text/60 text-xs">Programa una visita y genera un pase digital.</p>
               </div>
            </div>

            <div className="flex flex-col gap-4">
               <input 
                 type="text" 
                 placeholder="Nombre del Invitado"
                 className="w-full bg-text/5 border border-border rounded-2xl py-4 px-5 text-sm text-text focus:outline-none focus:border-accent/40 focus:ring-4 focus:ring-accent/5 transition-all outline-none placeholder:text-text/55"
                 value={newVisitForm.name}
                 onChange={(e) => setNewVisitForm({...newVisitForm, name: e.target.value})}
               />
               
               <div className="flex gap-2">
                  {(['PEATONAL', 'VEHICULAR'] as TipoVisita[]).map((tipo) => (
                    <button 
                      key={tipo}
                      onClick={() => setNewVisitForm({...newVisitForm, tipo})}
                      className={`flex-1 py-3.5 rounded-2xl border text-[10px] font-bold uppercase tracking-widest transition-all cursor-pointer ${newVisitForm.tipo === tipo ? 'bg-accent border-accent text-white shadow-lg shadow-accent/20' : 'bg-text/5 border-border text-text/60 hover:bg-text/10'}`}
                    >
                      {tipo}
                    </button>
                  ))}
               </div>

               {newVisitForm.tipo === 'VEHICULAR' && (
                 <input 
                   type="text" 
                   placeholder="Placa del vehiculo (ej. ABC123)"
                   className="w-full bg-text/5 border border-border rounded-2xl py-3 px-5 text-sm text-text focus:outline-none focus:border-accent/40 focus:ring-4 focus:ring-accent/5 transition-all outline-none placeholder:text-text/55"
                   value={newVisitForm.placa}
                   onChange={(e) => setNewVisitForm({...newVisitForm, placa: e.target.value.toUpperCase()})}
                 />
               )}

               <button 
                 onClick={handleCreateInvitation}
                 disabled={submitting}
                 className="w-full bg-linear-to-r from-accent to-blue-600 py-4 rounded-[22px] font-bold text-white shadow-xl shadow-accent/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60"
               >
                 {submitting ? <Loader2 size={20} className="animate-spin" /> : <><QrCode size={20} /> Programar Visita</>}
               </button>
            </div>
         </div>
      </section>

      {/* 4. VISITOR LISTS - ACTIVE TODAY */}
      <section className="fade-up flex flex-col gap-6">
         <div className="flex justify-between items-center px-1">
            <h2 className="text-text font-display text-lg font-bold tracking-tight">Visitas de Hoy</h2>
            <div className="flex items-center gap-1.5 text-green-400 text-[10px] font-bold uppercase tracking-widest border border-green-500/20 bg-green-500/5 px-3 py-1.5 rounded-full">
               <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
               Tiempo Real
            </div>
         </div>

         <div className="flex flex-col gap-4">
            {activeVisitors.length === 0 ? (
              <p className="text-text/40 text-xs text-center py-6 italic">No hay visitas activas hoy.</p>
            ) : activeVisitors.map((visitor) => (
              <div key={visitor.id} className="liquid-glass-card rounded-[28px] p-5 flex items-center justify-between border border-border hover:border-accent/20 transition-all">
                <div className="flex items-center gap-4">
                   <div className="w-14 h-14 rounded-full bg-text/5 border border-border flex items-center justify-center relative">
                      <User size={28} className="text-text/50" />
                      <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-green-500 rounded-full border-2 border-primary flex items-center justify-center">
                         <CheckCircle2 size={12} className="text-white" />
                      </div>
                   </div>
                   <div>
                     <h4 className="text-text font-bold text-base leading-none mb-1.5">{visitor.nombre}</h4>
                     <div className="flex items-center gap-3">
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${visitor.tipo === 'VEHICULAR' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                           {visitor.tipo}
                        </span>
                        <div className="flex items-center gap-1 text-text/60 text-[10px]">
                           <Clock size={12} />
                           <span>Programada {formatTime(visitor.fecha)}</span>
                        </div>
                     </div>
                   </div>
                </div>
                <button className="w-10 h-10 rounded-full bg-text/5 flex items-center justify-center text-text/60 hover:text-text transition-all ring-1 ring-border cursor-pointer">
                   <MoreHorizontal size={20} />
                </button>
              </div>
            ))}
         </div>
      </section>

      {/* 5. SCHEDULED & HISTORY */}
      <section className="fade-up flex flex-col gap-6">
         <div className="flex justify-between items-center px-1">
            <h2 className="text-text font-display text-lg font-bold tracking-tight">Programadas & Historial</h2>
            <button className="text-text/60 text-[10px] font-bold uppercase tracking-widest hover:text-text transition-colors cursor-pointer">Ver Todo</button>
         </div>

         <div className="flex flex-col gap-3">
            {nonActiveVisitors.length === 0 ? (
              <p className="text-text/40 text-xs text-center py-4 italic">No hay visitas programadas ni historial.</p>
            ) : nonActiveVisitors.map((visitor) => {
              const status = getVisitStatus(visitor);
              return (
                <div key={visitor.id} className="liquid-glass-card rounded-[24px] p-4 flex items-center justify-between border border-border opacity-85 hover:opacity-100 transition-all">
                  <div className="flex items-center gap-4">
                     <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${status === 'PROGRAMADO' ? 'bg-accent/10 text-accent' : 'bg-text/5 text-text/60'}`}>
                       {status === 'PROGRAMADO' ? <Calendar size={20} /> : <Clock size={20} />}
                     </div>
                     <div>
                       <h4 className="text-text font-semibold text-sm leading-tight">{visitor.nombre}</h4>
                       <p className="text-text/60 text-[10px] mt-0.5">
                         {status === 'PROGRAMADO' ? `Llega ${formatScheduledDate(visitor.fecha)}` : `Visita ${formatScheduledDate(visitor.fecha)}`}
                       </p>
                     </div>
                  </div>
                  {status === 'PROGRAMADO' ? (
                     <button 
                       onClick={() => { setIsQRModalOpen(true); }}
                       className="px-4 py-2 rounded-full bg-text/5 border border-border text-text/70 text-[10px] font-bold hover:bg-accent hover:text-white hover:border-accent transition-all cursor-pointer"
                     >
                       REENVIAR QR
                     </button>
                  ) : (
                     <button className="w-9 h-9 rounded-full bg-text/5 flex items-center justify-center text-text/50 cursor-pointer">
                        <ArrowRight size={16} />
                     </button>
                  )}
                </div>
              );
            })}
         </div>
      </section>

      {/* MODAL: QR INVITATION */}
      {isQRModalOpen && (
        <div className="fixed inset-0 z-200 flex items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setIsQRModalOpen(false)} />
           
           <div className="relative w-full max-w-sm bg-primary border border-border rounded-[40px] shadow-[0_30px_100px_rgba(0,0,0,0.8)] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-400">
              <div className="p-8 flex flex-col items-center gap-6">
                 <div className="w-full flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                       <ShieldCheck size={18} className="text-green-400" />
                       <span className="text-text/60 text-[10px] font-bold uppercase tracking-widest">Acceso Seguro</span>
                    </div>
                    <button onClick={() => setIsQRModalOpen(false)} className="w-8 h-8 rounded-full bg-text/5 flex items-center justify-center text-text/70 hover:bg-text/10 cursor-pointer">
                       <Plus className="rotate-45" size={20} />
                    </button>
                 </div>

                 <div className="flex flex-col items-center text-center gap-2">
                    <h3 className="text-2xl font-display font-bold text-text tracking-tight">Invitacion Digital</h3>
                    <p className="text-text/50 text-xs px-4">Comparte este codigo con tu invitado para agilizar su ingreso.</p>
                 </div>

                 <div className="relative p-6 bg-white rounded-3xl shadow-[0_0_40px_rgba(255,255,255,0.1)] group">
                    <div className="w-48 h-48 bg-gray-50 flex items-center justify-center rounded-2xl border-4 border-white overflow-hidden">
                       <QrCode size={160} className="text-[#1a0b2e]" />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                       <div className="w-12 h-12 bg-[#1a0b2e] rounded-xl flex items-center justify-center text-white shadow-xl">
                          <CheckCircle2 size={24} className="text-green-400" />
                       </div>
                    </div>
                 </div>

                 <div className="w-full flex flex-col gap-4">
                    <div className="bg-text/5 rounded-2xl p-4 border border-border">
                       <span className="text-[10px] text-text/60 font-bold uppercase tracking-widest">Invitado</span>
                       <p className="text-text font-bold text-lg">{newVisitForm.name || "Invitado Especial"}</p>
                       <div className="flex items-center gap-2 mt-1">
                          <CheckCircle2 size={14} className="text-accent" />
                          <span className="text-[10px] text-accent font-bold uppercase tracking-wider">Pase de tipo {newVisitForm.tipo}</span>
                       </div>
                    </div>

                    <div className="flex gap-3">
                       <button className="flex-1 bg-text/10 hover:bg-text/20 py-4 rounded-2xl font-bold text-text text-sm transition-all flex items-center justify-center gap-2 cursor-pointer">
                          <Download size={18} /> Guardar
                       </button>
                       <button className="flex-1 bg-[#25D366] hover:brightness-110 py-4 rounded-2xl font-bold text-white text-sm transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer">
                          <Share2 size={18} /> WhatsApp
                       </button>
                    </div>
                 </div>
              </div>
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
