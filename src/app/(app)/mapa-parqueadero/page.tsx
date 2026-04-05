"use client";

import { useState, useEffect } from "react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { 
  Map, Car, ShieldCheck, HelpCircle, 
  History, CheckCircle, AlertCircle, X, 
  Clock, ArrowRight, ClipboardCheck
} from "lucide-react";
import { gsap } from "gsap";
import { toast } from "sonner";

export default function MapaParqueaderoPage() {
  const [parqueaderos, setParqueaderos] = useState<any[]>([]);
  const [registros, setRegistros] = useState<any[]>([]);
  const [lastRound, setLastRound] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Modal State
  const [selectedCell, setSelectedCell] = useState<any>(null);
  const [placa, setPlaca] = useState("");
  const [obs, setObs] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadData();
    loadExtra();
  }, []);

  async function loadData() {
    try {
      const res = await fetch('/api/parqueadero/mapa');
      const data = await res.json();
      if(data.success) {
         setParqueaderos(data.data);
      }
    } catch (e) {
      toast.error("Error al cargar mapa");
    } finally {
      setLoading(false);
      gsap.fromTo(".fade-up", { opacity: 0, scale: 0.95 }, { opacity: 1, scale: 1, stagger: 0.05, duration: 0.4 });
    }
  }

  async function loadExtra() {
    try {
      const [regRes, rondRes] = await Promise.all([
        fetch('/api/parqueadero/registros'),
        fetch('/api/parqueadero/rondas')
      ]);
      const [regData, rondData] = await Promise.all([regRes.json(), rondRes.json()]);
      
      if(regData.success) setRegistros(regData.data);
      if(rondData.success) setLastRound(rondData.data);
    } catch (e) {
      console.warn("Error cargando históricos");
    }
  }

  const handleCellClick = (cell: any) => {
    if (cell.estado === 'DISPONIBLE') {
      setSelectedCell(cell);
      setPlaca("");
      setObs("");
    } else {
      // Direct toggle to available (departure)
      processToggle(cell.id, 'DISPONIBLE');
    }
  };

  const processToggle = async (id: string, newEstado: string, plate?: string, notes?: string) => {
    setIsSubmitting(true);
    
    // Optimistic UI update
    setParqueaderos(prev => prev.map(p => p.id === id ? { ...p, estado: newEstado } : p));
    
    try {
      const res = await fetch('/api/parqueadero/mapa', {
         method: 'PUT',
         headers: {'Content-Type': 'application/json'},
         body: JSON.stringify({ 
           parqueaderoId: id, 
           estado: newEstado,
           placa: plate,
           observacion: notes
         })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(newEstado === 'OCUPADO' ? `Ingreso registrado en celda ${selectedCell?.numero || ""}` : "Celda liberada");
        loadExtra(); // Refresh logs
      }
    } catch {
      toast.error("Error de red");
      loadData(); // revert
    } finally {
      setIsSubmitting(false);
      setSelectedCell(null);
    }
  };

  const handleConfirmAccess = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCell) return;
    processToggle(selectedCell.id, 'OCUPADO', placa, obs);
  };

  const handlePerformRound = async () => {
    const toastId = toast.loading("Registrando ronda de verificación...");
    try {
      const res = await fetch('/api/parqueadero/rondas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completada: true, hallazgos: "Verificación de rutina completada sin novedades." })
      });
      if (res.ok) {
        toast.success("Ronda registrada correctamente", { id: toastId });
        loadExtra();
      }
    } catch {
      toast.error("Error al registrar ronda", { id: toastId });
    }
  };

  if(loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-white/20 border-t-accent rounded-full animate-spin" /></div>;

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
       <ProfileHeader />
       
       {/* SECCION RONDAS */}
       <section className="fade-up liquid-glass rounded-3xl p-5 border border-white/10 shadow-xl flex items-center justify-between mb-2">
          <div className="flex items-center gap-4">
             <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-colors ${lastRound ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-orange-500/10 border-orange-500/30 text-orange-400 animate-pulse'}`}>
                {lastRound ? <CheckCircle size={24} /> : <AlertCircle size={24} />}
             </div>
             <div>
                <h3 className="text-white font-bold text-sm">Rondas de Verificación</h3>
                <p className="text-[10px] text-white/50 uppercase tracking-widest mt-0.5">
                   {lastRound ? `Última: ${new Date(lastRound.fecha).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} por ${lastRound.usuario.nombre}` : 'Pendiente hoy'}
                </p>
             </div>
          </div>
          <button 
            onClick={handlePerformRound}
            className="bg-white/10 hover:bg-white/20 border border-white/10 px-4 py-2 rounded-xl text-[10px] text-white font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2"
          >
             <ClipboardCheck size={14} /> Iniciar Ronda
          </button>
       </section>

       <div className="liquid-glass rounded-3xl p-6 border border-white/10 shadow-2xl relative overflow-hidden">
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-3">
               <div className="w-12 h-12 rounded-2xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <Map size={24} />
               </div>
               <div>
                 <h2 className="text-xl font-bold text-white">Mapa Interactivo</h2>
                 <p className="text-xs text-white/50">Celdas de estacionamiento</p>
               </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-white/30 font-bold uppercase tracking-[0.2em]">Piso 1 - Sótano</span>
            </div>
          </div>

          <div className="flex gap-4 mb-6 pt-2 pb-4 border-b border-white/5 overflow-x-auto hide-scrollbar">
             <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-white/20 border border-white/40"></div><span className="text-[10px] text-white/50 uppercase font-bold tracking-widest">Libre</span></div>
             <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-accent/20 border border-accent"></div><span className="text-[10px] text-white/50 uppercase font-bold tracking-widest">Ocupado</span></div>
             <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500/20 border border-blue-500"></div><span className="text-[10px] text-white/50 uppercase font-bold tracking-widest">Reservado</span></div>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
             {parqueaderos.map((p) => {
                const isLibre = p.estado === 'DISPONIBLE';
                const isResident = p.tipo === 'RESIDENTE';

                return (
                  <button 
                    key={p.id}
                    onClick={() => handleCellClick(p)}
                    className={`fade-up relative flex flex-col items-center justify-center gap-2 py-6 rounded-2xl border transition-all active:scale-95
                      ${isLibre ? 'bg-white/5 border-white/10 hover:bg-white/10 text-white/60' : 'bg-accent/10 border-accent/40 shadow-[0_0_15px_rgba(217,70,239,0.15)] text-accent'}
                    `}
                  >
                     {isResident ? <ShieldCheck size={20} className={isLibre ? 'text-white/20' : 'text-accent/60'} /> : <HelpCircle size={20} className={isLibre ? 'text-blue-400/40' : 'text-blue-400'}/>}
                     <span className="font-display font-bold text-xl">{p.numero}</span>
                     {!isLibre && <Car size={16} className="text-accent absolute top-2 right-2 animate-bounce-subtle" />}
                     <span className="text-[9px] uppercase font-bold tracking-widest absolute bottom-2 opacity-50">
                        {p.tipo}
                     </span>
                  </button>
                )
             })}
          </div>
       </div>

       {/* HISTORIAL DE ACTIVIDAD */}
       <section className="fade-up flex flex-col gap-4 mt-2">
          <div className="flex justify-between items-center px-2">
             <h3 className="text-white font-display font-medium text-lg tracking-wide flex items-center gap-2"><History size={18} className="text-white/40"/> Mi Actividad</h3>
             <span className="text-[10px] text-white/30 font-bold uppercase tracking-widest">Últimos 50</span>
          </div>

          <div className="flex flex-col gap-3">
             {registros.length === 0 && (
               <div className="liquid-glass rounded-3xl p-8 border border-dashed border-white/10 text-center">
                  <p className="text-white/20 text-xs italic">No has registrado movimientos recientemente.</p>
               </div>
             )}
             {registros.map((reg, idx) => (
                <div key={idx} className="liquid-glass p-4 rounded-3xl border border-white/5 flex items-center justify-between group hover:border-white/20 transition-all">
                   <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${reg.tipo === 'INGRESO' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-orange-500/10 border-orange-500/20 text-orange-400'}`}>
                         {reg.tipo === 'INGRESO' ? <ArrowRight size={18} className="rotate-45" /> : <ArrowRight size={18} className="-rotate-135" />}
                      </div>
                      <div className="flex flex-col">
                         <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white">Celda {reg.parqueadero.numero}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-white/40 uppercase font-black">{reg.parqueadero.tipo.slice(0,3)}</span>
                         </div>
                         <div className="flex items-center gap-2 mt-0.5">
                            <Clock size={10} className="text-white/30" />
                            <span className="text-[10px] text-white/40 font-medium">{new Date(reg.fecha).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} • {reg.placa || 'Sin placa'}</span>
                         </div>
                      </div>
                   </div>
                   {reg.observacion && (
                     <div className="hidden sm:block max-w-[150px] truncate text-[10px] italic text-white/30">
                        &quot;{reg.observacion}&quot;
                     </div>
                   )}
                </div>
             ))}
          </div>
       </section>

       {/* MODAL REGISTRO */}
       {selectedCell && (
          <div className="fixed inset-0 z-100 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300">
             <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setSelectedCell(null)} />
             <form 
               onSubmit={handleConfirmAccess}
               className="liquid-glass rounded-t-[32px] sm:rounded-[32px] w-full max-w-[430px] p-8 pb-12 sm:pb-8 relative z-10 shadow-2xl border-t border-white/20 animate-in slide-in-from-bottom-full duration-300"
             >
                <div className="flex justify-between items-center mb-8">
                   <div className="flex flex-col">
                      <span className="text-[10px] text-accent font-bold uppercase tracking-[0.2em] mb-1">Registro de Acceso</span>
                      <h3 className="text-2xl font-display font-medium text-white">Celda {selectedCell.numero}</h3>
                   </div>
                   <button type="button" onClick={() => setSelectedCell(null)} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-all">
                      <X size={20} />
                   </button>
                </div>

                <div className="flex flex-col gap-6">
                   <div className="flex flex-col gap-2">
                      <label className="text-[10px] text-white/40 font-bold uppercase tracking-widest ml-1">Placa del Vehículo</label>
                      <input 
                        required
                        autoFocus
                        type="text" 
                        value={placa}
                        onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                        placeholder="ABC-123" 
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white text-lg font-mono tracking-widest focus:outline-none focus:border-accent/50 focus:bg-white/10 transition-all"
                      />
                   </div>

                   <div className="flex flex-col gap-2">
                      <label className="text-[10px] text-white/40 font-bold uppercase tracking-widest ml-1">Observaciones (Opcional)</label>
                      <textarea 
                        value={obs}
                        onChange={(e) => setObs(e.target.value)}
                        placeholder="Ej: Vehículo de mudanza, ingreso temporal..." 
                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white resize-none h-24 focus:outline-none focus:border-accent/50 transition-all"
                      />
                   </div>

                   <button 
                     disabled={isSubmitting}
                     type="submit" 
                     className="w-full bg-linear-to-r from-accent to-purple-600 rounded-2xl py-4 font-bold text-white shadow-xl shadow-accent/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                   >
                     {isSubmitting ? "Procesando..." : <><Car size={18} /> Confirmar Ingreso</>}
                   </button>
                </div>
             </form>
          </div>
       )}

       <style dangerouslySetInnerHTML={{__html: `
         @keyframes bounce-subtle {
           0%, 100% { transform: translateY(0); }
           50% { transform: translateY(-4px); }
         }
         .animate-bounce-subtle {
           animation: bounce-subtle 2s infinite ease-in-out;
         }
       `}} />
    </div>
  );
}
