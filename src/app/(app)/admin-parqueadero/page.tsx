"use client";

import { useState, useEffect } from "react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { 
  ShieldAlert, Search, Filter, 
  Car, Clock, ArrowRight, ClipboardCheck, 
  MapPin, CheckCircle, Plus, X, LayoutGrid, ScrollText
} from "lucide-react";
import { gsap } from "gsap";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";

export default function AdminParqueaderoPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const role = user?.rol;

  const [registros, setRegistros] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [lastRound, setLastRound] = useState<any>(null);

  // Gestión de celdas
  const [celdas, setCeldas] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [modo, setModo] = useState<'lote' | 'individual'>('lote');
  const [prefijo, setPrefijo] = useState("P-");
  const [cantidad, setCantidad] = useState("10");
  const [numero, setNumero] = useState("");
  const [torre, setTorre] = useState("");
  const [tipoCelda, setTipoCelda] = useState("RESIDENTE");
  const [categoria, setCategoria] = useState("CARRO");

  const esAdmin = role === 'ADMINISTRADOR' || role === 'SUPER_ADMIN';

  async function loadCeldas() {
    try {
      const data = await api.get<any[]>('/parqueadero/mapa');
      setCeldas(data);
    } catch (e) { /* sin permiso para mapa => ignora */ }
  }

  async function crearCeldas() {
    setCreating(true);
    try {
      const body: any = { tipo: tipoCelda, categoria, torre: torre.trim() || undefined };
      if (modo === 'lote') {
        const n = parseInt(cantidad, 10);
        if (!n || n < 1) { toast.error("Indica una cantidad válida"); setCreating(false); return; }
        body.prefijo = prefijo;
        body.cantidad = n;
      } else {
        if (!numero.trim()) { toast.error("Indica el número de la celda"); setCreating(false); return; }
        body.numero = numero.trim();
      }
      const creadas = await api.post<any[]>('/parqueadero/celdas', body);
      toast.success(`${creadas.length} celda${creadas.length === 1 ? '' : 's'} creada${creadas.length === 1 ? '' : 's'} con éxito.`);
      setShowCreate(false);
      setNumero("");
      await loadCeldas();
    } catch (e: any) {
      toast.error(e?.message || "No se pudieron crear las celdas");
    } finally {
      setCreating(false);
    }
  }

  const disponibles = celdas.filter(c => c.estado === 'DISPONIBLE').length;

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    const allowed = ['VIGILANTE', 'SUPERVISOR_VIGILANCIA', 'ADMINISTRADOR', 'SUPER_ADMIN'];
    if (!role || !allowed.includes(role)) {
      toast.error("No tienes permisos para acceder a esta sección.");
      router.push("/inicio");
      return;
    }
    loadData();
  }, [user, authLoading, role, router]);

  useEffect(() => {
    if (!loading) {
      const ctx = gsap.context(() => {
         gsap.fromTo(".fade-up", { opacity: 0, y: 30 }, { opacity: 1, y: 0, stagger: 0.1, duration: 0.5 });
      });
      return () => ctx.revert();
    }
  }, [loading]);

  async function loadData() {
    try {
      const [regData, rondData] = await Promise.all([
        api.get<any[]>('/parqueadero/registros'),
        api.get<any>('/parqueadero/rondas')
      ]);
      setRegistros(regData);
      setLastRound(rondData);
      await loadCeldas();
    } catch (e) {
      toast.error("Error cargando auditoría");
    } finally {
      setLoading(false);
    }
  }

  const filteredRegistros = registros.filter(reg => 
    reg.placa?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    reg.celdaNumero?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    reg.usuarioNombre?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if(loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" /></div>;

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
       <ProfileHeader />

       <div className="fade-up flex flex-col gap-2 mb-2">
          <div className="flex items-center gap-3">
             <div className="w-12 h-12 rounded-2xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent">
                <ShieldAlert size={24} />
             </div>
             <div>
                <h1 className="text-2xl font-bold text-text tracking-tight">Auditoría de Parqueadero</h1>
                <p className="text-xs text-text uppercase tracking-widest font-medium">Control Maestro y Trazabilidad</p>
             </div>
          </div>
       </div>

       {/* STATUS CARD RONDAS */}
       <section className="fade-up liquid-glass rounded-3xl p-6 border border-border shadow-xl flex flex-col sm:flex-row gap-6 items-center justify-between">
          <div className="flex items-center gap-5">
             <div className={`w-14 h-14 rounded-full flex items-center justify-center border-4 transition-all ${lastRound ? 'bg-text/10 border-text/20 text-text' : 'bg-text/10 border-text/20 text-text animate-pulse'}`}>
                {lastRound ? <ClipboardCheck size={28} /> : <AlertCircle size={28} className="text-text" />}
             </div>
             <div className="flex flex-col">
                <span className="text-text font-bold text-lg mb-1">Estatus de Vigilancia</span>
                <p className="text-xs text-text leading-relaxed font-light">
                   {lastRound 
                    ? `La última ronda de verificación fue realizada hoy a las ${new Date(lastRound.fecha).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} por ${lastRound.usuario.nombre}.`
                    : 'Aún no se han reportado rondas de verificación el día de hoy.'}
                </p>
             </div>
          </div>
          {lastRound && (
            <div className="shrink-0 bg-text/20 px-4 py-2 rounded-full border border-text/30 flex items-center gap-2">
               <CheckCircle size={14} className="text-text" />
               <span className="text-[10px] text-text font-bold uppercase tracking-widest">Cumplido</span>
            </div>
          )}
       </section>

       {/* GESTIÓN DE CELDAS */}
       {esAdmin && (
         <section className="fade-up liquid-glass rounded-3xl p-6 border border-border shadow-xl flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
               <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-text/10 border border-border flex items-center justify-center">
                     <LayoutGrid size={22} className="text-[#009df2]" />
                  </div>
                  <div className="flex flex-col">
                     <span className="text-text font-bold text-lg">Celdas de Parqueadero</span>
                     <span className="text-xs text-text">
                        {celdas.length === 0
                          ? 'Aún no hay celdas creadas. Crea las primeras para poder asignarlas.'
                          : `${celdas.length} celdas · ${disponibles} disponibles`}
                     </span>
                  </div>
               </div>
               <button
                 onClick={() => setShowCreate(true)}
                 className="shrink-0 flex items-center gap-2 px-4 py-3 rounded-full bg-[#57bf00] text-white font-bold text-xs uppercase tracking-wide shadow-lg shadow-[#57bf00]/30 active:scale-95 transition-transform"
               >
                  <Plus size={16} /> Crear celdas
               </button>
            </div>
            <button
              onClick={() => router.push("/bitacora-parqueadero")}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-text/5 border border-border/50 text-text font-bold text-xs uppercase tracking-wide hover:bg-text/10 active:scale-95 transition-all"
            >
               <ScrollText size={15} className="text-[#009df2]" /> Ver bitácora y aprobaciones
            </button>
         </section>
       )}

       {/* FILTERS */}
       <section className="fade-up flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative flex-1 group w-full">
             <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-text group-focus-within:text-accent transition-colors" />
             <input 
               type="text" 
               placeholder="Buscar por placa, celda o funcionario..." 
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               className="w-full bg-primary-light/50 border border-border rounded-2xl py-4 pl-14 pr-6 text-sm text-text focus:outline-none focus:border-accent/50 focus:bg-primary-light/80 transition-all font-light" 
             />
          </div>
          <button className="w-14 h-14 rounded-2xl bg-primary-light/50 border border-border flex items-center justify-center text-text hover:text-text transition-all active:scale-95 shadow-lg">
             <Filter size={20} />
          </button>
       </section>

       {/* MASTER LOG */}
       <section className="fade-up flex flex-col gap-4">
          <div className="flex justify-between items-center px-2">
             <h3 className="text-text font-display font-medium text-lg tracking-wide">Bitácora Global</h3>
             <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-text/5 border border-border">
                <Clock size={12} className="text-text" />
                <span className="text-[10px] text-text font-bold uppercase tracking-widest">En Tiempo Real</span>
             </div>
          </div>

          <div className="flex flex-col gap-3">
             {filteredRegistros.length === 0 && (
               <div className="liquid-glass rounded-3xl p-12 border border-dashed border-border text-center">
                  <p className="text-text text-sm">No se encontraron registros que coincidan con la búsqueda.</p>
               </div>
             )}
             {filteredRegistros.map((reg, idx) => (
                <div key={idx} className="liquid-glass p-5 rounded-3xl border border-border/50 group hover:border-border transition-all shadow-xl">
                   <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                         <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border-2 ${reg.tipo === 'INGRESO' ? 'bg-text/10 border-text/20 text-text' : 'bg-text/10 border-text/20 text-text'}`}>
                            {reg.tipo === 'INGRESO' ? <ArrowRight size={22} className="rotate-45" /> : <ArrowRight size={22} className="-rotate-135" />}
                         </div>
                         <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                               <span className="text-lg font-bold text-text tracking-tight">Celda {reg.celdaNumero}</span>
                               <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-text/5 border border-border text-[9px] text-text font-bold uppercase tracking-widest">
                                  <MapPin size={10} /> {reg.celdaTipo}
                               </div>
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                               <div className="flex items-center gap-1.5 text-[11px] text-accent font-semibold tracking-tighter">
                                  <Car size={12} /> {reg.placa || 'PLACA NO REG.'}
                               </div>
                               <div className="w-1 h-1 rounded-full bg-border" />
                               <span className="text-[11px] text-text font-medium">Hace {Math.floor((new Date().getTime() - new Date(reg.fecha).getTime())/60000)} min</span>
                            </div>
                         </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-6 border-t sm:border-none border-border pt-3 sm:pt-0">
                         <div className="flex flex-col sm:items-end">
                            <span className="text-[10px] text-text font-bold uppercase tracking-widest mb-0.5">Operador</span>
                            <div className="flex items-center gap-2">
                               <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center text-on-accent text-[8px] font-bold">
                                  {reg.usuarioNombre?.[0]}
                               </div>
                               <span className="text-xs font-bold text-text">{reg.usuarioNombre}</span>
                            </div>
                         </div>
                      </div>
                   </div>
                   {reg.observacion && (
                     <div className="mt-4 p-3 rounded-2xl bg-surface/50 border border-border text-xs italic text-text leading-relaxed">
                        <span className="text-text font-bold not-italic mr-1">Observación:</span> &quot;{reg.observacion}&quot;
                     </div>
                   )}
                </div>
             ))}
          </div>
       </section>

       <footer>
          <div className="py-10 text-center opacity-10 pointer-events-none">
             <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text">ConjuntOS Audit Suite • Floor 0</p>
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

       {/* MODAL CREAR CELDAS */}
       {showCreate && (
         <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => !creating && setShowCreate(false)}>
            <div className="w-full max-w-md liquid-glass rounded-[32px] border border-border p-6 flex flex-col gap-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
               <div className="flex items-center justify-between">
                  <h3 className="text-text font-bold text-xl">Crear celdas</h3>
                  <button onClick={() => !creating && setShowCreate(false)} className="w-9 h-9 rounded-full bg-text/10 border border-border flex items-center justify-center">
                     <X size={18} className="text-text" />
                  </button>
               </div>

               {/* Selector de modo */}
               <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-text/5 border border-border">
                  <button
                    onClick={() => setModo('lote')}
                    className={`py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${modo === 'lote' ? 'bg-[#009df2] text-white' : 'text-text'}`}
                  >En lote</button>
                  <button
                    onClick={() => setModo('individual')}
                    className={`py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${modo === 'individual' ? 'bg-[#009df2] text-white' : 'text-text'}`}
                  >Individual</button>
               </div>

               {modo === 'lote' ? (
                 <div className="flex flex-col gap-3">
                    <div className="flex gap-3">
                       <div className="flex flex-col gap-1.5 flex-1">
                          <label className="text-[10px] text-text uppercase tracking-widest font-bold">Prefijo</label>
                          <input value={prefijo} onChange={(e) => setPrefijo(e.target.value)} placeholder="P-" className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-sm text-text outline-none focus:border-accent" />
                       </div>
                       <div className="flex flex-col gap-1.5 w-28">
                          <label className="text-[10px] text-text uppercase tracking-widest font-bold">Cantidad</label>
                          <input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-sm text-text outline-none focus:border-accent" />
                       </div>
                    </div>
                    <span className="text-[11px] text-text">
                       Se crearán <strong className="text-[#57bf00]">{prefijo}1</strong> … <strong className="text-[#57bf00]">{prefijo}{parseInt(cantidad, 10) || 0}</strong>
                    </span>
                 </div>
               ) : (
                 <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-text uppercase tracking-widest font-bold">Número de celda</label>
                    <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ej: A-101" className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-sm text-text outline-none focus:border-accent" />
                 </div>
               )}

               <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text uppercase tracking-widest font-bold">Categoría del espacio</label>
                  <div className="grid grid-cols-3 gap-2">
                     {[
                        { v: 'CARRO', label: 'Carro', icon: '🚗' },
                        { v: 'MOTO', label: 'Moto', icon: '🏍️' },
                        { v: 'BICI', label: 'Bici', icon: '🚲' },
                     ].map((c) => (
                        <button
                          key={c.v}
                          type="button"
                          onClick={() => setCategoria(c.v)}
                          className={`flex flex-col items-center gap-1 py-3 rounded-xl border text-xs font-bold transition-all ${categoria === c.v ? 'bg-[#009df2]/15 border-[#009df2] text-text' : 'bg-text/5 border-border text-text/70'}`}
                        >
                           <span className="text-lg leading-none">{c.icon}</span>
                           {c.label}
                        </button>
                     ))}
                  </div>
                  <span className="text-[10px] text-text/60">Las bahías de moto y bici son espacios distintos a los de carro.</span>
               </div>

               <div className="flex gap-3">
                  <div className="flex flex-col gap-1.5 flex-1">
                     <label className="text-[10px] text-text uppercase tracking-widest font-bold">Torre / Bloque (opcional)</label>
                     <input value={torre} onChange={(e) => setTorre(e.target.value)} placeholder="Torre A" className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-sm text-text outline-none focus:border-accent" />
                  </div>
                  <div className="flex flex-col gap-1.5 w-40">
                     <label className="text-[10px] text-text uppercase tracking-widest font-bold">Tipo</label>
                     <select value={tipoCelda} onChange={(e) => setTipoCelda(e.target.value)} className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-sm text-text outline-none focus:border-accent">
                        <option className="bg-primary text-text" value="RESIDENTE">Residente</option>
                        <option className="bg-primary text-text" value="VISITANTE">Visitante</option>
                        <option className="bg-primary text-text" value="DISCAPACITADO">Discapacitado</option>
                     </select>
                  </div>
               </div>

               <button
                 disabled={creating}
                 onClick={crearCeldas}
                 className="w-full py-3.5 rounded-full bg-[#57bf00] text-white font-bold text-sm tracking-wide shadow-xl shadow-[#57bf00]/30 active:scale-95 transition-transform disabled:opacity-50"
               >
                  {creating ? 'Creando...' : 'Crear celdas'}
               </button>
            </div>
         </div>
       )}
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
