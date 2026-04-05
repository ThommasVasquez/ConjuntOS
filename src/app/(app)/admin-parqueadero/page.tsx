"use client";

import { useState, useEffect } from "react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { 
  ShieldAlert, Search, Filter, 
  Car, Clock, ArrowRight, ClipboardCheck, 
  MapPin, CheckCircle
} from "lucide-react";
import { gsap } from "gsap";
import { toast } from "sonner";

export default function AdminParqueaderoPage() {
  const [registros, setRegistros] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [lastRound, setLastRound] = useState<any>(null);

  useEffect(() => {
    loadData();
    const ctx = gsap.context(() => {
       gsap.fromTo(".fade-up", { opacity: 0, y: 30 }, { opacity: 1, y: 0, stagger: 0.1, duration: 0.5 });
    });
    return () => ctx.revert();
  }, []);

  async function loadData() {
    try {
      const [regRes, rondRes] = await Promise.all([
        fetch('/api/parqueadero/registros'),
        fetch('/api/parqueadero/rondas')
      ]);
      const [regData, rondData] = await Promise.all([regRes.json(), rondRes.json()]);
      
      if(regData.success) setRegistros(regData.data);
      if(rondData.success) setLastRound(rondData.data);
    } catch (e) {
      toast.error("Error cargando auditoría");
    } finally {
      setLoading(false);
    }
  }

  const filteredRegistros = registros.filter(reg => 
    reg.placa?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    reg.parqueadero.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
    reg.usuario.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if(loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-white/20 border-t-accent rounded-full animate-spin" /></div>;

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
       <ProfileHeader />

       <div className="fade-up flex flex-col gap-2 mb-2">
          <div className="flex items-center gap-3">
             <div className="w-12 h-12 rounded-2xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent">
                <ShieldAlert size={24} />
             </div>
             <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Auditoría de Parqueadero</h1>
                <p className="text-xs text-white/50 uppercase tracking-widest font-medium">Control Maestro y Trazabilidad</p>
             </div>
          </div>
       </div>

       {/* STATUS CARD RONDAS */}
       <section className="fade-up liquid-glass rounded-3xl p-6 border border-white/10 shadow-xl flex flex-col sm:flex-row gap-6 items-center justify-between">
          <div className="flex items-center gap-5">
             <div className={`w-14 h-14 rounded-full flex items-center justify-center border-4 transition-all ${lastRound ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-orange-500/10 border-orange-500/20 text-orange-400 animate-pulse'}`}>
                {lastRound ? <ClipboardCheck size={28} /> : <AlertCircle size={28} className="text-orange-500" />}
             </div>
             <div className="flex flex-col">
                <span className="text-white font-bold text-lg mb-1">Estatus de Vigilancia</span>
                <p className="text-xs text-white/40 leading-relaxed font-light">
                   {lastRound 
                    ? `La última ronda de verificación fue realizada hoy a las ${new Date(lastRound.fecha).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} por ${lastRound.usuario.nombre}.`
                    : 'Aún no se han reportado rondas de verificación el día de hoy.'}
                </p>
             </div>
          </div>
          {lastRound && (
            <div className="shrink-0 bg-emerald-500/20 px-4 py-2 rounded-full border border-emerald-500/30 flex items-center gap-2">
               <CheckCircle size={14} className="text-emerald-400" />
               <span className="text-[10px] text-emerald-100 font-bold uppercase tracking-widest">Cumplido</span>
            </div>
          )}
       </section>

       {/* FILTERS */}
       <section className="fade-up flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative flex-1 group w-full">
             <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-accent transition-colors" />
             <input 
               type="text" 
               placeholder="Buscar por placa, celda o funcionario..." 
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-14 pr-6 text-sm text-white focus:outline-none focus:border-accent/50 focus:bg-white/10 transition-all font-light" 
             />
          </div>
          <button className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-95 shadow-lg">
             <Filter size={20} />
          </button>
       </section>

       {/* MASTER LOG */}
       <section className="fade-up flex flex-col gap-4">
          <div className="flex justify-between items-center px-2">
             <h3 className="text-white font-display font-medium text-lg tracking-wide">Bitácora Global</h3>
             <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
                <Clock size={12} className="text-white/30" />
                <span className="text-[10px] text-white/50 font-bold uppercase tracking-widest">En Tiempo Real</span>
             </div>
          </div>

          <div className="flex flex-col gap-3">
             {filteredRegistros.length === 0 && (
               <div className="liquid-glass rounded-3xl p-12 border border-dashed border-white/10 text-center">
                  <p className="text-white/20 text-sm">No se encontraron registros que coincidan con la búsqueda.</p>
               </div>
             )}
             {filteredRegistros.map((reg, idx) => (
                <div key={idx} className="liquid-glass p-5 rounded-3xl border border-white/5 group hover:border-white/20 transition-all shadow-xl">
                   <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                         <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border-2 ${reg.tipo === 'INGRESO' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-orange-500/10 border-orange-500/20 text-orange-400'}`}>
                            {reg.tipo === 'INGRESO' ? <ArrowRight size={22} className="rotate-45" /> : <ArrowRight size={22} className="-rotate-135" />}
                         </div>
                         <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                               <span className="text-lg font-bold text-white tracking-tight">Celda {reg.parqueadero.numero}</span>
                               <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[9px] text-white/50 font-bold uppercase tracking-widest">
                                  <MapPin size={10} /> {reg.parqueadero.tipo}
                               </div>
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                               <div className="flex items-center gap-1.5 text-[11px] text-accent font-semibold tracking-tighter">
                                  <Car size={12} /> {reg.placa || 'PLACA NO REG.'}
                               </div>
                               <div className="w-1 h-1 rounded-full bg-white/20" />
                               <span className="text-[11px] text-white/30 font-medium">Hace {Math.floor((new Date().getTime() - new Date(reg.fecha).getTime())/60000)} min</span>
                            </div>
                         </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-6 border-t sm:border-none border-white/5 pt-3 sm:pt-0">
                         <div className="flex flex-col sm:items-end">
                            <span className="text-[10px] text-white/30 font-bold uppercase tracking-widest mb-0.5">Operador</span>
                            <div className="flex items-center gap-2">
                               <div className="w-6 h-6 rounded-full bg-linear-to-tr from-accent to-purple-600 flex items-center justify-center text-white text-[8px] font-bold">
                                  {reg.usuario.nombre[0]}
                               </div>
                               <span className="text-xs font-bold text-white/80">{reg.usuario.nombre}</span>
                            </div>
                         </div>
                      </div>
                   </div>
                   {reg.observacion && (
                     <div className="mt-4 p-3 rounded-2xl bg-black/20 border border-white/5 text-xs italic text-white/40 leading-relaxed">
                        <span className="text-white/60 font-bold not-italic mr-1">Observación:</span> &quot;{reg.observacion}&quot;
                     </div>
                   )}
                </div>
             ))}
          </div>
       </section>

       <footer>
          <div className="py-10 text-center opacity-10 pointer-events-none">
             <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white">ConjuntoApp Audit Suite • Floor 0</p>
          </div>
       </footer>

       <style dangerouslySetInnerHTML={{__html: `
         @keyframes pulse-subtle {
           0%, 100% { opacity: 0.5; }
           50% { opacity: 1; }
         }
         .animate-pulse-subtle {
           animation: pulse-subtle 2s infinite ease-in-out;
         }
       `}} />
    </div>
  );
}

function AlertCircle({ size, className }: { size: number, className: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  );
}
