"use client";

import { 
  AlertCircle, ArrowRight, Car, CheckCircle, ClipboardCheck, 
  Clock, History, Map, X 
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
  const [cellToRelease, setCellToRelease] = useState<any>(null);
  const [placa, setPlaca] = useState("");
  const [obs, setObs] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Nivel/sótano seleccionado. El backend no tiene campo de nivel, así que se
  // deriva del prefijo del número de celda (ej. "S1-01" -> Sótano 1, "S2-..." ->
  // Sótano 2). Las celdas sin prefijo reconocible caen en "Sótano 1" por defecto.
  const [nivel, setNivel] = useState<number>(1);
  const nivelDeCelda = (p: any): number => {
    const m = /^\s*S(?:[ÓO]TANO)?\s*-?\s*(\d+)/i.exec(String(p?.numero || ""));
    return m ? parseInt(m[1], 10) : 1;
  };
  const nivelesDisponibles = Array.from(
    new Set(parqueaderos.map(nivelDeCelda))
  ).sort((a, b) => a - b);
  const celdasDelNivel = parqueaderos.filter((p) => nivelDeCelda(p) === nivel);

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
    } else if (cell.usuarioId || cell.asignadoHasta) {
      // Celda con asignación PERMANENTE: abrir modal de confirmación con nuestro
      // diseño (en vez del confirm() nativo del navegador).
      setCellToRelease(cell);
    } else {
      processToggle(cell.id, 'DISPONIBLE');
    }
  };

  const liberarCelda = async (id: string) => {
    setIsSubmitting(true);
    try {
      const r: any = await api.post(`/parqueadero/celdas/${id}/liberar`, {});
      if (r?.pendiente) {
        toast.success("Solicitud enviada a aprobación del administrador.", { duration: 5000 });
      } else {
        toast.success("Celda liberada. Ahora está disponible.");
      }
      loadData();
      loadExtra();
    } catch (e: any) {
      toast.error(e?.message || "Error al liberar la celda");
      loadData();
    } finally {
      setIsSubmitting(false);
      setCellToRelease(null);
    }
  };

  const processToggle = async (id: string, newEstado: string, plate?: string, notes?: string) => {
    setIsSubmitting(true);
    setParqueaderos(prev => prev.map(p => p.id === id ? { ...p, estado: newEstado } : p));
    
    try {
      const r: any = await api.put(`/parqueadero/celdas/${id}`, { 
           estado: newEstado,
           placa: plate,
           observacion: notes
         });
      if (r?.pendiente) {
        toast.success("Solicitud enviada a aprobación del administrador.", { duration: 5000 });
        loadData(); // revierte el cambio optimista: aún no se aplicó
      } else {
        toast.success(newEstado === 'OCUPADO' ? `Ingreso registrado en celda ${selectedCell?.numero || ""}` : "Celda liberada");
      }
      loadExtra();
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
             <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-colors ${lastRound ? 'bg-text/10 border-text/30 text-text dark:text-text' : 'bg-text/10 border-text/30 text-text dark:text-text animate-pulse'}`}>
                {lastRound ? <CheckCircle size={24} /> : <AlertCircle size={24} />}
             </div>
             <div>
                <h3 className="text-text font-bold text-sm">Rondas de Verificación</h3>
                <p className="text-[10px] text-text uppercase tracking-widest mt-0.5">
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
               <div className="w-12 h-12 rounded-2xl bg-text/10 border border-text/30 flex items-center justify-center text-text dark:text-text">
                  <Map size={24} />
               </div>
               <div>
                 <h2 className="text-xl font-bold text-text">Mapa Interactivo</h2>
                 <p className="text-xs text-text">Celdas de estacionamiento</p>
               </div>
            </div>
          </div>

          {/* SELECTOR DE NIVEL / SÓTANO */}
          <div className="flex items-center gap-2 mb-5 overflow-x-auto hide-scrollbar">
             {(nivelesDisponibles.length > 0 ? nivelesDisponibles : [1, 2]).map((n) => {
                const activo = nivel === n;
                const count = parqueaderos.filter((p) => nivelDeCelda(p) === n).length;
                return (
                   <button
                      key={n}
                      onClick={() => setNivel(n)}
                      className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold uppercase tracking-widest transition-all active:scale-95 ${
                         activo
                            ? 'bg-accent text-on-accent border-accent shadow-lg shadow-accent/20'
                            : 'bg-text/5 text-text border-border/40 hover:bg-text/10'
                      }`}
                   >
                      Sótano {n}
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${activo ? 'bg-black/20' : 'bg-text/10'}`}>{count}</span>
                   </button>
                );
             })}
          </div>

          <div className="flex gap-4 mb-6 pt-2 pb-4 border-b border-border/10 overflow-x-auto hide-scrollbar">
             <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#57bf00] border border-[#57bf00] shadow-[0_0_6px_rgba(87,191,0,0.6)]"></div><span className="text-[10px] text-text uppercase font-bold tracking-widest">Libre</span></div>
             <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#EF4444] border border-[#EF4444] shadow-[0_0_6px_rgba(239,68,68,0.6)]"></div><span className="text-[10px] text-text uppercase font-bold tracking-widest">Ocupado</span></div>
             <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#FACC15] border border-[#FACC15] shadow-[0_0_6px_rgba(250,204,21,0.6)]"></div><span className="text-[10px] text-text uppercase font-bold tracking-widest">Reservado</span></div>
          </div>

          {/* Equivalencia física de espacios */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-5 -mt-2">
             <span className="text-[10px] text-text/60 font-bold uppercase tracking-widest">Equivalencia:</span>
             <span className="text-[10px] text-text/80">🚗 1 carro</span>
             <span className="text-[10px] text-text/40">=</span>
             <span className="text-[10px] text-text/80">🏍️ 4 motos</span>
             <span className="text-[10px] text-text/40">=</span>
             <span className="text-[10px] text-text/80">🚲 5 bicis</span>
          </div>
          
          {/* MAPA TIPO PLANO AÉREO: bahías a ambos lados de un carril central */}
          {celdasDelNivel.length === 0 ? (
             <div className="py-16 flex flex-col items-center justify-center gap-2 text-center">
                <Map size={40} className="text-text/40" />
                <p className="text-xs text-text/70 font-bold">
                   {parqueaderos.length === 0 ? "No hay celdas registradas todavía" : `Sin celdas en Sótano ${nivel}`}
                </p>
             </div>
          ) : (() => {
             // Una bahía de estacionamiento. La proporción física se respeta:
             // en el cajón de un carro caben 4 motos (perpendiculares) o 5 bicis,
             // por eso la moto ocupa 1/4 del ancho y la bici 1/5 (flex-wrap las
             // empaqueta solas: 4 motos por fila, 5 bicis por fila, 1 carro por fila).
             const bay = (p: any, side: 'left' | 'right') => {
                const isLibre = p.estado === 'DISPONIBLE';
                const isReservado = p.estado === 'RESERVADO';
                const vencida = p.asignadoHasta ? new Date(p.asignadoHasta).getTime() < Date.now() : false;
                // Libre=verde, Ocupado=rojo, Reservado=amarillo.
                const stateColor = isLibre ? '#57bf00' : isReservado ? '#FACC15' : '#EF4444';
                const cat = p.categoria || 'CARRO';
                const catIcon = cat === 'MOTO' ? '🏍️' : cat === 'BICI' ? '🚲' : '🚗';

                // MOTO / BICI: tiles compactos que ocupan una fracción del ancho del
                // cajón de carro (1/4 y 1/5), para que se vea cuántas caben.
                if (cat === 'MOTO' || cat === 'BICI') {
                   const widthCls = cat === 'MOTO' ? 'w-[25%]' : 'w-[20%]';
                   return (
                      <button
                         key={p.id}
                         onClick={() => handleCellClick(p)}
                         title={`Celda ${p.numero} · ${cat} · ${p.estado}`}
                         className={`group relative ${widthCls} h-11 flex flex-col items-center justify-center gap-0.5 border border-white/15 transition-all active:scale-[0.95] hover:brightness-150`}
                         style={{ backgroundColor: stateColor + '26' }}
                      >
                         <span className="text-[11px] leading-none" style={{ opacity: isLibre ? 0.35 : 1 }}>{catIcon}</span>
                         <span className="font-display font-bold text-[8px] leading-none text-text truncate max-w-full px-0.5">{p.numero}</span>
                         {vencida && <span className="absolute bottom-0 inset-x-0 text-center text-[6px] font-black uppercase text-[#EF4444]">venc</span>}
                      </button>
                   );
                }

                // CARRO: bahía completa, ocupa todo el ancho del cajón.
                const numEl = (
                   <span key="n" className="font-display font-bold text-xs leading-none break-all text-text px-1">{p.numero}</span>
                );
                const carEl = (
                   <span key="c" className="text-[11px] leading-none shrink-0" style={{ opacity: isLibre ? 0.3 : 1 }} title={cat}>{catIcon}</span>
                );
                return (
                   <button
                      key={p.id}
                      onClick={() => handleCellClick(p)}
                      title={`Celda ${p.numero} · ${p.estado}`}
                      className="group relative w-full flex items-center justify-between h-11 px-2 border-t border-white/20 transition-all active:scale-[0.98] hover:brightness-150"
                      style={{ backgroundColor: stateColor + '26' }}
                   >
                      {/* tope de rueda en el extremo exterior */}
                      <span className={`absolute inset-y-1.5 w-1 rounded-full ${side === 'left' ? 'left-0.5' : 'right-0.5'}`} style={{ backgroundColor: stateColor }} />
                      {side === 'left' ? <>{numEl}{carEl}</> : <>{carEl}{numEl}</>}
                      {vencida && <span className="absolute bottom-0 inset-x-0 text-center text-[6px] font-black uppercase tracking-wide text-[#EF4444]">vencida</span>}
                   </button>
                );
             };
             const mid = Math.ceil(celdasDelNivel.length / 2);
             const leftCells = celdasDelNivel.slice(0, mid);
             const rightCells = celdasDelNivel.slice(mid);
             return (
                <div className="fade-up relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
                     style={{ background: 'repeating-linear-gradient(45deg, #0d0d0d 0 6px, #121212 6px 12px)' }}>
                   {/* Marca de agua "P" */}
                   <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                      <span className="font-display font-black text-white/[0.04] leading-none select-none" style={{ fontSize: '38vw' }}>P</span>
                   </div>

                   {/* ENTRADA */}
                   <div className="relative flex items-center justify-center h-7 border-b-2 border-dashed border-[#57bf00]/60">
                      <div className="absolute inset-0 bg-[#57bf00]/10" />
                      <span className="relative text-[8px] font-black tracking-[0.3em] text-[#57bf00] uppercase">▲ Entrada</span>
                   </div>

                   {/* CUERPO: peatonal · bahías · carril · bahías · peatonal */}
                   <div className="relative flex items-stretch">
                      <div className="w-1.5 bg-[#57bf00]/30" />
                      <div className="flex-1 flex flex-row flex-wrap content-start border-r-2 border-white/40">
                         {leftCells.map((p) => bay(p, 'left'))}
                      </div>
                      {/* Carril central con línea amarilla y flechas */}
                      <div className="w-10 relative flex flex-col items-center justify-between py-3 shrink-0">
                         <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px]"
                              style={{ backgroundImage: 'repeating-linear-gradient(to bottom, #FACC15 0 8px, transparent 8px 18px)' }} />
                         <ArrowRight size={16} className="relative text-white/70 -rotate-90" />
                         <ArrowRight size={16} className="relative text-white/70 rotate-90" />
                      </div>
                      <div className="flex-1 flex flex-row flex-wrap content-start border-l-2 border-white/40">
                         {rightCells.map((p) => bay(p, 'right'))}
                      </div>
                      <div className="w-1.5 bg-[#57bf00]/30" />
                   </div>

                   {/* SALIDA */}
                   <div className="relative flex items-center justify-center h-7 border-t-2 border-dashed border-white/30">
                      <span className="relative text-[8px] font-black tracking-[0.3em] text-text/70 uppercase">Salida ▼</span>
                   </div>
                </div>
             );
          })()}
       </div>

       <section className="fade-up flex flex-col gap-4 mt-2">
          <div className="flex justify-between items-center px-2">
             <h3 className="text-text font-display font-medium text-lg tracking-wide flex items-center gap-2"><History size={18} className="text-text"/> Mi Actividad</h3>
             <span className="text-[10px] text-text font-bold uppercase tracking-widest">Últimos 50</span>
          </div>

          <div className="flex flex-col gap-3">
             {registros.length === 0 && (
               <div className="liquid-glass rounded-3xl p-8 border border-dashed border-border/30 text-center">
                  <p className="text-text text-xs italic">No has registrado movimientos recientemente.</p>
               </div>
             )}
             {registros.map((reg, idx) => (
                <div key={idx} className="liquid-glass p-4 rounded-3xl border border-border/20 flex items-center justify-between group hover:border-border/55 transition-all">
                   <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${reg.tipo === 'INGRESO' ? 'bg-text/10 border-text/20 text-text dark:text-text' : 'bg-text/10 border-text/20 text-text dark:text-text'}`}>
                         {reg.tipo === 'INGRESO' ? <ArrowRight size={18} className="rotate-45" /> : <ArrowRight size={18} className="-rotate-135" />}
                      </div>
                      <div className="flex flex-col">
                         <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-text">Celda {reg.celdaNumero}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-text/5 text-text uppercase font-black">{reg.celdaTipo?.slice(0,3)}</span>
                         </div>
                         <div className="flex items-center gap-2 mt-0.5">
                            <Clock size={10} className="text-text" />
                            <span className="text-[10px] text-text font-medium">{new Date(reg.fecha).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} • {reg.placa || 'Sin placa'}</span>
                         </div>
                      </div>
                   </div>
                   {reg.observacion && (
                     <div className="hidden sm:block max-w-[150px] truncate text-[10px] italic text-text">
                        &quot;{reg.observacion}&quot;
                     </div>
                   )}
                </div>
             ))}
          </div>
       </section>

       {/* MODAL: CONFIRMAR LIBERACIÓN DE CELDA (reemplaza el confirm() nativo) */}
       {cellToRelease && (
          <div className="fixed inset-0 z-100 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300">
             <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setCellToRelease(null)} />
             <div className="liquid-glass rounded-t-[32px] sm:rounded-[32px] w-full max-w-[430px] p-8 pb-12 sm:pb-8 relative z-10 shadow-2xl border-t border-border/40 animate-in slide-in-from-bottom-full duration-300">
                <div className="flex flex-col items-center text-center gap-4">
                   <div className="w-16 h-16 rounded-full bg-[#FACC15]/15 border border-[#FACC15]/40 flex items-center justify-center">
                      <AlertCircle size={30} className="text-[#FACC15]" />
                   </div>
                   <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-accent font-bold uppercase tracking-[0.2em]">Liberar Celda</span>
                      <h3 className="text-2xl font-display font-bold text-text">Celda {cellToRelease.numero}</h3>
                   </div>
                   <p className="text-sm text-text/80 leading-relaxed">
                      {cellToRelease.asignadoHasta ? (
                         <>
                            Esta celda tiene una asignación{" "}
                            <span className="font-bold" style={{ color: new Date(cellToRelease.asignadoHasta).getTime() < Date.now() ? '#EF4444' : '#57bf00' }}>
                               {new Date(cellToRelease.asignadoHasta).getTime() < Date.now()
                                  ? 'VENCIDA'
                                  : `vigente hasta el ${new Date(cellToRelease.asignadoHasta).toLocaleDateString('es-CO')}`}
                            </span>.{" "}
                         </>
                      ) : null}
                      Quedará <span className="font-bold text-[#57bf00]">disponible</span> para una nueva asignación.
                   </p>

                   <div className="flex gap-3 w-full mt-2">
                      <button
                         type="button"
                         onClick={() => setCellToRelease(null)}
                         className="flex-1 py-4 rounded-2xl bg-text/5 border border-border/50 text-text font-bold text-sm hover:bg-text/10 active:scale-95 transition-all"
                      >
                         Cancelar
                      </button>
                      <button
                         type="button"
                         disabled={isSubmitting}
                         onClick={() => liberarCelda(cellToRelease.id)}
                         className="flex-1 py-4 rounded-2xl bg-accent text-on-accent font-bold text-sm shadow-xl shadow-accent/20 active:scale-95 transition-all disabled:opacity-60"
                      >
                         {isSubmitting ? "Liberando..." : "Liberar Celda"}
                      </button>
                   </div>
                </div>
             </div>
          </div>
       )}

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
                   <button type="button" onClick={() => setSelectedCell(null)} className="w-10 h-10 rounded-full bg-text/5 flex items-center justify-center text-text hover:text-text transition-all">
                      <X size={20} />
                   </button>
                </div>

                <div className="flex flex-col gap-6">
                   <div className="flex flex-col gap-2">
                      <label className="text-[10px] text-text font-bold uppercase tracking-widest ml-1">Placa del Vehículo</label>
                      <input 
                        required
                        autoFocus
                        type="text" 
                        value={placa}
                        onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                        placeholder="ABC-123" 
                        className="w-full bg-text/5 border border-border/50 rounded-2xl py-4 px-6 text-text placeholder:text-text text-lg font-mono tracking-widest focus:outline-none focus:border-accent/50 focus:bg-text/10 transition-all"
                      />
                   </div>

                   <div className="flex flex-col gap-2">
                      <label className="text-[10px] text-text font-bold uppercase tracking-widest ml-1">Observaciones (Opcional)</label>
                      <textarea 
                        value={obs}
                        onChange={(e) => setObs(e.target.value)}
                        placeholder="Ej: Vehículo de mudanza, ingreso temporal..." 
                        className="w-full bg-text/5 border border-border/50 rounded-2xl p-4 text-sm text-text placeholder:text-text resize-none h-24 focus:outline-none focus:border-accent/50 transition-all"
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
