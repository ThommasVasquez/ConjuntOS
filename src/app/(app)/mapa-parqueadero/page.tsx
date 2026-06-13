"use client";

import { 
  AlertCircle, ArrowRight, Car, CheckCircle, ClipboardCheck, 
  Clock, HelpCircle, History, Map, ShieldCheck, X 
} from "lucide-react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { gsap } from "gsap";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api/client";
import { useRouter } from "next/navigation";
import { useWsSubscription } from "@/hooks/useWebSocket";

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

  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const role = user?.rol;

  // Real-time WebSocket subscription
  useWsSubscription('parqueadero', () => {
    loadData();
    loadExtra();
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }

    const allowed = ['ENCARGADO_PARQUEADERO', 'VIGILANTE', 'SUPERVISOR_VIGILANCIA', 'ADMINISTRADOR', 'SUPER_ADMIN'];
    if (!role || !allowed.includes(role)) {
      toast.error("No tienes permisos para acceder a esta sección.");
      router.push("/inicio");
      return;
    }

    loadData();
    loadExtra();
  }, [user, authLoading, role, router]);

  async function loadData() {
    try {
      const data = await api.get<any[]>('/parqueadero/mapa');
      setParqueaderos(data);
    } catch (e) {
      toast.error("Error al cargar mapa");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!loading) {
      gsap.fromTo(".fade-up", { opacity: 0, scale: 0.95 }, { opacity: 1, scale: 1, stagger: 0.05, duration: 0.4 });
    }
  }, [loading]);

  async function loadExtra() {
    try {
      const [regData, rondData] = await Promise.all([
        api.get<any[]>('/parqueadero/registros'),
        api.get<any>('/parqueadero/rondas')
      ]);
      setRegistros(regData);
      setLastRound(rondData);
    } catch {
      // Non-critical: historic data unavailable
    }
  }

  const handleCellClick = (cell: any) => {
    if (cell.estado === 'DISPONIBLE') {
      setSelectedCell(cell);
      setPlaca("");
      setObs("");
    } else {
      processToggle(cell.id, 'DISPONIBLE');
    }
  };

  const processToggle = async (id: string, newEstado: string, plate?: string, notes?: string) => {
    setIsSubmitting(true);
    setParqueaderos(prev => prev.map(p => p.id === id ? { ...p, estado: newEstado } : p));
    
    try {
      await api.put(`/parqueadero/celdas/${id}`, { 
           estado: newEstado,
           placa: plate,
           observacion: notes
         });
      {
        toast.success(newEstado === 'OCUPADO' ? `Ingreso registrado en celda ${selectedCell?.numero || ""}` : "Celda liberada");
        loadExtra();
      }
    } catch {
      toast.error("Error de red");
      loadData();
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
      await api.post('/parqueadero/rondas', { completada: true, hallazgos: [] });
      {
        toast.success("Ronda registrada correctamente", { id: toastId });
        loadExtra();
      }
    } catch {
      toast.error("Error al registrar ronda", { id: toastId });
    }
  };

  if(loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-text/25 border-t-accent rounded-full animate-spin" /></div>;

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
       <ProfileHeader />
       
       <section className="fade-up liquid-glass rounded-3xl p-5 border border-border/40 shadow-xl flex items-center justify-between mb-2">
          <div className="flex items-center gap-4">
             <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-colors ${lastRound ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' : 'bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400 animate-pulse'}`}>
                {lastRound ? <CheckCircle size={24} /> : <AlertCircle size={24} />}
             </div>
             <div>
                <h3 className="text-text font-bold text-sm">Rondas de Verificación</h3>
                <p className="text-[10px] text-text/60 uppercase tracking-widest mt-0.5">
                   {lastRound ? `Última: ${new Date(lastRound.fecha).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} por ${lastRound.usuario.nombre}` : 'Pendiente hoy'}
                </p>
             </div>
          </div>
          <button 
            onClick={handlePerformRound}
            className="bg-text/5 hover:bg-text/10 border border-border/40 px-4 py-2 rounded-xl text-[10px] text-text font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2"
          >
             <ClipboardCheck size={14} /> Iniciar Ronda
          </button>
       </section>

       <div className="liquid-glass rounded-3xl p-6 border border-border/40 shadow-2xl relative overflow-hidden">
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-3">
               <div className="w-12 h-12 rounded-2xl bg-zinc-500/10 border border-zinc-500/30 flex items-center justify-center text-zinc-600 dark:text-zinc-400">
                  <Map size={24} />
               </div>
               <div>
                 <h2 className="text-xl font-bold text-text">Mapa Interactivo</h2>
                 <p className="text-xs text-text/60">Celdas de estacionamiento</p>
               </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-text/40 font-bold uppercase tracking-[0.2em]">Piso 1 - Sótano</span>
            </div>
          </div>

          <div className="flex gap-4 mb-6 pt-2 pb-4 border-b border-border/10 overflow-x-auto hide-scrollbar">
             <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-text/15 border border-text/30"></div><span className="text-[10px] text-text/60 uppercase font-bold tracking-widest">Libre</span></div>
             <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-accent/25 border border-accent"></div><span className="text-[10px] text-text/60 uppercase font-bold tracking-widest">Ocupado</span></div>
             <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-zinc-500/25 border border-zinc-500"></div><span className="text-[10px] text-text/60 uppercase font-bold tracking-widest">Reservado</span></div>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
             {parqueaderos.map((p) => {
                const isLibre = p.estado === 'DISPONIBLE';
                const isResident = p.tipo === 'RESIDENTE';
                const assignedPlate = p.usuario?.vehiculos?.[0]?.placa;
                const residentName = p.usuario?.nombre;

                return (
                  <button 
                    key={p.id}
                    onClick={() => handleCellClick(p)}
                    className={`fade-up relative flex flex-col items-center justify-center gap-2 py-6 rounded-2xl border transition-all active:scale-95
                      ${isLibre ? 'bg-text/5 border-border/40 hover:bg-text/10 text-text/70' : 'bg-accent/10 border-accent/40 shadow-[0_0_15px_rgba(0,0,0,0.3)] dark:shadow-[0_0_15px_rgba(0,0,0,0.3)] text-accent'}
                    `}
                  >
                     {isResident ? <ShieldCheck size={20} className={isLibre ? 'text-text/30' : 'text-accent/60'} /> : <HelpCircle size={20} className={isLibre ? 'text-zinc-500/30 dark:text-zinc-400/30' : 'text-zinc-600 dark:text-zinc-400' }/>}
                     <span className="font-display font-bold text-xl">{p.numero}</span>
                     
                     {!isLibre && (
                       <div className="absolute top-2 right-2 flex flex-col items-end">
                           <Car size={14} className="text-accent animate-bounce-subtle" />
                           {assignedPlate && <span className="text-[8px] font-black bg-accent text-primary px-1 rounded-sm mt-1">{assignedPlate}</span>}
                       </div>
                     )}

                     {residentName && !isLibre && (
                         <span className="text-[7px] uppercase font-bold text-text/50 absolute top-2 left-2 max-w-[50px] truncate">{residentName}</span>
                     )}

                     <span className="text-[9px] uppercase font-bold tracking-widest absolute bottom-2 opacity-50">
                        {p.tipo}
                     </span>
                  </button>
                )
             })}
          </div>
       </div>

       <section className="fade-up flex flex-col gap-4 mt-2">
          <div className="flex justify-between items-center px-2">
             <h3 className="text-text font-display font-medium text-lg tracking-wide flex items-center gap-2"><History size={18} className="text-text/40"/> Mi Actividad</h3>
             <span className="text-[10px] text-text/40 font-bold uppercase tracking-widest">Últimos 50</span>
          </div>

          <div className="flex flex-col gap-3">
             {registros.length === 0 && (
               <div className="liquid-glass rounded-3xl p-8 border border-dashed border-border/30 text-center">
                  <p className="text-text/40 text-xs italic">No has registrado movimientos recientemente.</p>
               </div>
             )}
             {registros.map((reg, idx) => (
                <div key={idx} className="liquid-glass p-4 rounded-3xl border border-border/20 flex items-center justify-between group hover:border-border/55 transition-all">
                   <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${reg.tipo === 'INGRESO' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-orange-500/10 border-orange-500/20 text-orange-600 dark:text-orange-400'}`}>
                         {reg.tipo === 'INGRESO' ? <ArrowRight size={18} className="rotate-45" /> : <ArrowRight size={18} className="-rotate-135" />}
                      </div>
                      <div className="flex flex-col">
                         <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-text">Celda {reg.parqueadero.numero}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-text/5 text-text/60 uppercase font-black">{reg.parqueadero.tipo.slice(0,3)}</span>
                         </div>
                         <div className="flex items-center gap-2 mt-0.5">
                            <Clock size={10} className="text-text/40" />
                            <span className="text-[10px] text-text/60 font-medium">{new Date(reg.fecha).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} • {reg.placa || 'Sin placa'}</span>
                         </div>
                      </div>
                   </div>
                   {reg.observacion && (
                     <div className="hidden sm:block max-w-[150px] truncate text-[10px] italic text-text/40">
                        &quot;{reg.observacion}&quot;
                     </div>
                   )}
                </div>
             ))}
          </div>
       </section>

       {selectedCell && (
          <div className="fixed inset-0 z-100 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300">
             <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setSelectedCell(null)} />
             <form 
               onSubmit={handleConfirmAccess}
               className="liquid-glass rounded-t-[32px] sm:rounded-[32px] w-full max-w-[430px] p-8 pb-12 sm:pb-8 relative z-10 shadow-2xl border-t border-border/40 animate-in slide-in-from-bottom-full duration-300"
             >
                <div className="flex justify-between items-center mb-8">
                   <div className="flex flex-col">
                      <span className="text-[10px] text-accent font-bold uppercase tracking-[0.2em] mb-1">Registro de Acceso</span>
                      <h3 className="text-2xl font-display font-medium text-text">Celda {selectedCell.numero}</h3>
                   </div>
                   <button type="button" onClick={() => setSelectedCell(null)} className="w-10 h-10 rounded-full bg-text/5 flex items-center justify-center text-text/40 hover:text-text transition-all">
                      <X size={20} />
                   </button>
                </div>

                <div className="flex flex-col gap-6">
                   <div className="flex flex-col gap-2">
                      <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest ml-1">Placa del Vehículo</label>
                      <input 
                        required
                        autoFocus
                        type="text" 
                        value={placa}
                        onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                        placeholder="ABC-123" 
                        className="w-full bg-text/5 border border-border/50 rounded-2xl py-4 px-6 text-text placeholder:text-text/40 text-lg font-mono tracking-widest focus:outline-none focus:border-accent/50 focus:bg-text/10 transition-all"
                      />
                   </div>

                   <div className="flex flex-col gap-2">
                      <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest ml-1">Observaciones (Opcional)</label>
                      <textarea 
                        value={obs}
                        onChange={(e) => setObs(e.target.value)}
                        placeholder="Ej: Vehículo de mudanza, ingreso temporal..." 
                        className="w-full bg-text/5 border border-border/50 rounded-2xl p-4 text-sm text-text placeholder:text-text/40 resize-none h-24 focus:outline-none focus:border-accent/50 transition-all"
                      />
                   </div>

                   <button 
                     disabled={isSubmitting}
                     type="submit" 
                     className="w-full bg-accent rounded-2xl py-4 font-bold text-on-accent shadow-xl shadow-accent/20 active:scale-95 transition-all flex items-center justify-center gap-2"
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
