"use client";

/**
 * VISITANTES - CONJUNTOAPP
 * Gestión de ingresos, generación de códigos QR y control de acceso.
 */

import { 
  Plus, QrCode, Clock, Calendar, CheckCircle2, 
  Share2, MoreHorizontal, UserPlus, 
  ShieldCheck, ArrowRight, Download, User
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { toast } from "sonner";
import ProfileHeader from "@/components/shell/ProfileHeader";

interface Visitor {
  id: string;
  name: string;
  type: 'FRECUENTE' | 'OCASIONAL' | 'DELIVERY';
  status: 'ACTIVO' | 'PROGRAMADO' | 'SALIDA';
  entryTime?: string;
  scheduledDate?: string;
  avatar?: string;
}

export default function VisitantesPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [newVisitForm, setNewVisitForm] = useState({ name: '', type: 'OCASIONAL' });

  const [visitors] = useState<Visitor[]>([
    { id: '1', name: "Carlos Mendoza", type: 'FRECUENTE', status: 'ACTIVO', entryTime: '10:45 AM' },
    { id: '2', name: "Rappi - Pedido #442", type: 'DELIVERY', status: 'ACTIVO', entryTime: '11:15 AM' },
    { id: '3', name: "Elena Rodríguez", type: 'OCASIONAL', status: 'PROGRAMADO', scheduledDate: 'Hoy, 4:00 PM' },
    { id: '4', name: "Marco Tulio", type: 'FRECUENTE', status: 'SALIDA', entryTime: '08:00 AM' },
  ]);

  useEffect(() => {
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
  }, []);

  const handleCreateInvitation = () => {
    if (!newVisitForm.name) {
      toast.error("Por favor ingresa el nombre del invitado");
      return;
    }
    setIsQRModalOpen(true);
    toast.success("¡Código QR generado con éxito!");
  };

  return (
    <div ref={containerRef} className="min-h-screen flex flex-col p-6 pt-16 pb-32 overflow-x-hidden relative gap-8">
      
      {/* 0. HEADER ESTANDARIZADO */}
      <ProfileHeader className="fade-up" />

      {/* BACKGROUND AMBIENT GLOW */}
      <div className="fixed top-[-10%] right-[-10%] w-full h-[50%] bg-[#4C1D95]/10 blur-[120px] rounded-full -z-10 pointer-events-none" />
      <div className="fixed bottom-[-10%] left-[-10%] w-full h-[50%] bg-[#BE185D]/10 blur-[120px] rounded-full -z-10 pointer-events-none" />

      {/* 2. SUMMARY CARDS */}
      <section className="grid grid-cols-2 gap-4 fade-up">
        <div className="liquid-glass-card p-5 rounded-[28px] border-t border-white/10 flex flex-col gap-3">
          <div className="w-10 h-10 rounded-2xl bg-green-500/10 flex items-center justify-center text-green-400">
            <User size={20} />
          </div>
          <div>
            <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest">En casa</span>
            <p className="text-2xl font-bold text-white tracking-tight">02</p>
          </div>
        </div>
        <div className="liquid-glass-card p-5 rounded-[28px] border-t border-white/10 flex flex-col gap-3">
          <div className="w-10 h-10 rounded-2xl bg-accent/10 flex items-center justify-center text-accent">
            <Calendar size={20} />
          </div>
          <div>
            <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Agendadas</span>
            <p className="text-2xl font-bold text-white tracking-tight">01</p>
          </div>
        </div>
      </section>

      {/* 3. NEW VISIT ACTION */}
      <section className="fade-up liquid-glass-card p-6 rounded-[32px] border border-white/10 relative overflow-hidden group">
         <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 blur-[60px] rounded-full -z-10 group-hover:bg-accent/20 transition-all" />
         
         <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
               <div className="w-12 h-12 rounded-[18px] bg-accent flex items-center justify-center text-white shadow-[0_8px_20px_rgba(217,70,239,0.4)]">
                  <UserPlus size={24} />
               </div>
               <div>
                  <h3 className="text-white font-bold text-lg leading-tight">Nueva Invitación</h3>
                  <p className="text-white/40 text-xs">Genera un QR para tu visita en segundos.</p>
               </div>
            </div>

            <div className="flex flex-col gap-4">
               <input 
                 type="text" 
                 placeholder="Nombre del Invitado"
                 className="w-full bg-[#1a1333]/50 border border-white/10 rounded-2xl py-4 px-5 text-sm text-white focus:outline-none focus:border-accent/40 focus:ring-4 focus:ring-accent/5 transition-all outline-none"
                 value={newVisitForm.name}
                 onChange={(e) => setNewVisitForm({...newVisitForm, name: e.target.value})}
               />
               
               <div className="flex gap-2">
                  {['OCASIONAL', 'FRECUENTE', 'DELIVERY'].map((type) => (
                    <button 
                      key={type}
                      onClick={() => setNewVisitForm({...newVisitForm, type: type as 'OCASIONAL' | 'FRECUENTE' | 'DELIVERY'})}
                      className={`flex-1 py-3.5 rounded-2xl border text-[10px] font-bold uppercase tracking-widest transition-all ${newVisitForm.type === type ? 'bg-accent border-accent text-white shadow-lg shadow-accent/20' : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'}`}
                    >
                      {type}
                    </button>
                  ))}
               </div>

               <button 
                 onClick={handleCreateInvitation}
                 className="w-full bg-linear-to-r from-accent to-purple-600 py-4 rounded-[22px] font-bold text-white shadow-xl shadow-accent/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
               >
                 Generar Código QR <QrCode size={20} />
               </button>
            </div>
         </div>
      </section>

      {/* 4. VISITOR LISTS */}
      <section className="fade-up flex flex-col gap-6">
         <div className="flex justify-between items-center px-1">
            <h2 className="text-white font-display text-lg font-bold tracking-tight">Activos en el Conjunto</h2>
            <div className="flex items-center gap-1.5 text-green-400 text-[10px] font-bold uppercase tracking-widest border border-green-500/20 bg-green-500/5 px-3 py-1.5 rounded-full">
               <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
               Tiempo Real
            </div>
         </div>

         <div className="flex flex-col gap-4">
            {visitors.filter(v => v.status === 'ACTIVO').map((visitor) => (
              <div key={visitor.id} className="liquid-glass-card rounded-[28px] p-5 flex items-center justify-between border border-white/5 hover:border-white/15 transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center relative">
                     <User size={28} className="text-white/20" />
                     <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-green-500 rounded-full border-2 border-[#0d041a] flex items-center justify-center">
                        <CheckCircle2 size={12} className="text-white" />
                     </div>
                  </div>
                  <div>
                    <h4 className="text-white font-bold text-base leading-none mb-1.5">{visitor.name}</h4>
                    <div className="flex items-center gap-3">
                       <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${visitor.type === 'DELIVERY' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                          {visitor.type}
                       </span>
                       <div className="flex items-center gap-1 text-white/30 text-[10px]">
                          <Clock size={12} />
                          <span>Ingresó {visitor.entryTime}</span>
                       </div>
                    </div>
                  </div>
                </div>
                <button className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-all ring-1 ring-white/10">
                   <MoreHorizontal size={20} />
                </button>
              </div>
            ))}
         </div>
      </section>

      {/* 5. HISTORY OR SCHEDULED */}
      <section className="fade-up flex flex-col gap-6">
         <div className="flex justify-between items-center px-1">
            <h2 className="text-white font-display text-lg font-bold tracking-tight">Programadas & Historial</h2>
            <button className="text-white/40 text-[10px] font-bold uppercase tracking-widest hover:text-white transition-colors">Ver Todo</button>
         </div>

         <div className="flex flex-col gap-3">
            {visitors.filter(v => v.status !== 'ACTIVO').map((visitor) => (
              <div key={visitor.id} className="liquid-glass-card rounded-[24px] p-4 flex items-center justify-between border border-white/5 opacity-80 hover:opacity-100 transition-all">
                <div className="flex items-center gap-4">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${visitor.status === 'PROGRAMADO' ? 'bg-accent/10 text-accent' : 'bg-white/5 text-white/40'}`}>
                    {visitor.status === 'PROGRAMADO' ? <Calendar size={20} /> : <Clock size={20} />}
                  </div>
                  <div>
                    <h4 className="text-white font-semibold text-sm leading-tight">{visitor.name}</h4>
                    <p className="text-white/30 text-[10px] mt-0.5">
                      {visitor.status === 'PROGRAMADO' ? `Llega ${visitor.scheduledDate}` : `Salió ${visitor.entryTime}`}
                    </p>
                  </div>
                </div>
                {visitor.status === 'PROGRAMADO' ? (
                   <button 
                     onClick={() => { setIsQRModalOpen(true); }}
                     className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-white/60 text-[10px] font-bold hover:bg-accent hover:text-white hover:border-accent transition-all"
                   >
                     REENVIAR QR
                   </button>
                ) : (
                   <button className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-white/20">
                      <ArrowRight size={16} />
                   </button>
                )}
              </div>
            ))}
         </div>
      </section>

      {/* MODAL: QR INVITATION */}
      {isQRModalOpen && (
        <div className="fixed inset-0 z-200 flex items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setIsQRModalOpen(false)} />
           
           <div className="relative w-full max-w-sm liquid-glass-card rounded-[40px] border border-white/20 shadow-[0_30px_100px_rgba(0,0,0,0.8)] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-400">
              <div className="p-8 flex flex-col items-center gap-6">
                 <div className="w-full flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                       <ShieldCheck size={18} className="text-green-400" />
                       <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Acceso Seguro</span>
                    </div>
                    <button onClick={() => setIsQRModalOpen(false)} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:bg-white/10">
                       <Plus className="rotate-45" size={20} />
                    </button>
                 </div>

                 <div className="flex flex-col items-center text-center gap-2">
                    <h3 className="text-2xl font-display font-bold text-white tracking-tight">Invitación Digital</h3>
                    <p className="text-white/50 text-xs px-4">Comparte este código con tu invitado para agilizar su ingreso.</p>
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
                    <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                       <span className="text-[10px] text-white/30 font-bold uppercase tracking-widest">Invitado</span>
                       <p className="text-white font-bold text-lg">{newVisitForm.name || "Invitado Especial"}</p>
                       <div className="flex items-center gap-2 mt-1">
                          <CheckCircle2 size={14} className="text-accent" />
                          <span className="text-[10px] text-accent font-bold uppercase tracking-wider">Pase de tipo {newVisitForm.type}</span>
                       </div>
                    </div>

                    <div className="flex gap-3">
                       <button className="flex-1 bg-white/10 hover:bg-white/20 py-4 rounded-2xl font-bold text-white text-sm transition-all flex items-center justify-center gap-2">
                          <Download size={18} /> Guardar
                       </button>
                       <button className="flex-1 bg-[#25D366] hover:brightness-110 py-4 rounded-2xl font-bold text-white text-sm transition-all shadow-lg flex items-center justify-center gap-2">
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
