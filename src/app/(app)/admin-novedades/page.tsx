"use client";

import { useState, useEffect, useRef } from "react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { CheckCircle2, XCircle, Clock, Info, User, Car, Briefcase, Dog, AlertCircle, FileText } from "lucide-react";
import { gsap } from "gsap";
import { toast } from "sonner";

export default function AdminNovedadesPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [tramites, setTramites] = useState<any[]>([]);
  const [tab, setTab] = useState<'PENDIENTE' | 'HISTORIAL'>('PENDIENTE');

  // Modal State
  const [selectedTramite, setSelectedTramite] = useState<any>(null);
  const [obs, setObs] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [availableCells, setAvailableCells] = useState<any[]>([]);
  const [selectedCellId, setSelectedCellId] = useState("");

  const fetchTramites = async () => {
    setLoading(true);
    try {
      const qs = tab === 'PENDIENTE' ? '?estado=PENDIENTE' : '';
      const res = await fetch(`/api/tramites${qs}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        const items = data.data;
        if (tab === 'HISTORIAL') {
             setTramites(items.filter((t: any) => t.estado !== 'PENDIENTE'));
        } else {
             setTramites(items);
        }
      }
    } catch {
      toast.error('Error al cargar trámites');
    } finally {
      setLoading(false);
    }
  };

  const fetchCells = async () => {
      try {
          const res = await fetch('/api/parqueadero/mapa');
          const data = await res.json();
          if (data.success) {
              setAvailableCells(data.data.filter((c: any) => c.estado === 'DISPONIBLE'));
          }
      } catch (e) { console.error("Error fetching cells", e); }
  };

  useEffect(() => {
    fetchTramites();
    if (tab === 'PENDIENTE') fetchCells();
  }, [tab]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(".fade-up", 
        { opacity: 0, y: 20 }, 
        { opacity: 1, y: 0, stagger: 0.1, duration: 0.4, ease: "power2.out" }
      );
    }, containerRef);
    return () => ctx.revert();
  }, [tramites, tab]);

  const parseDesc = (str: string) => {
      try { 
        const parsed = JSON.parse(str);
        // Manejar estructura de Stage 36: { metadatos, documentos }
        if (parsed.metadatos) return parsed;
        // Si no, intentar aplanar si es objeto directo
        return { metadatos: parsed, documentos: [] };
      } catch { 
        return { metadatos: { nota: str }, documentos: [] }; 
      }
  };

  const downloadFile = (base64: string, filename: string) => {
      try {
          const link = document.createElement('a');
          link.href = base64;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          toast.success(`Descargando ${filename}`);
      } catch (e) {
          toast.error("Error al descargar archivo");
      }
  };

  const getTipoIcon = (tipo: string) => {
      switch (tipo) {
          case 'VEHICULO': return <Car size={16} className="text-blue-400" />;
          case 'MASCOTA': return <Dog size={16} className="text-orange-400" />;
          case 'ARRENDAMIENTO': return <Briefcase size={16} className="text-emerald-400" />;
          case 'MUDANZA': return <Info size={16} className="text-purple-400" />;
          default: return <AlertCircle size={16} className="text-white/50" />;
      }
  };

  const handleResolve = async (accion: 'APROBAR' | 'RECHAZAR') => {
      if (accion === 'RECHAZAR' && !obs.trim()) {
           toast.error('Debes incluir una observación al rechazar.');
           return;
      }
      setIsProcessing(true);
      try {
          const res = await fetch('/api/tramites/aprobar', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                  tramiteId: selectedTramite.id, 
                  accion, 
                  observacionAdmin: obs,
                  parqueaderoId: accion === 'APROBAR' && selectedTramite.tipo === 'VEHICULO' ? selectedCellId : undefined
              })
          });
          const data = await res.json();
          if (data.success) {
              toast.success(`Trámite ${accion === 'APROBAR' ? 'aprobado' : 'rechazado'} con éxito.`);
              setSelectedTramite(null);
              setObs("");
              setSelectedCellId("");
              fetchTramites();
          } else {
              toast.error(data.error || 'Error al procesar.');
          }
      } catch {
          toast.error('Error de conexión.');
      } finally {
          setIsProcessing(false);
      }
  };

  return (
    <div ref={containerRef} className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen relative overflow-x-hidden">
       <ProfileHeader />
       
       <div className="fade-up flex items-center justify-between">
           <div>
               <h1 className="text-2xl font-display font-medium text-white tracking-wide">Trámites</h1>
               <p className="text-sm text-white/50">Solicitudes de residentes</p>
           </div>
       </div>

       {/* Tabs */}
       <div className="fade-up flex bg-white/5 rounded-full p-1 border border-white/10">
           <button 
             onClick={() => setTab('PENDIENTE')} 
             className={`flex-1 py-3 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${tab === 'PENDIENTE' ? 'bg-accent/20 text-accent shadow-inner' : 'text-white/40 hover:text-white/80'}`}
           >
              Pendientes
           </button>
           <button 
             onClick={() => setTab('HISTORIAL')} 
             className={`flex-1 py-3 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${tab === 'HISTORIAL' ? 'bg-white/10 text-white shadow-inner' : 'text-white/40 hover:text-white/80'}`}
           >
              Historial
           </button>
       </div>

       {/* Listado */}
       <div className="flex flex-col gap-4">
           {loading ? (
             <div className="w-full py-12 flex justify-center"><div className="w-8 h-8 border-2 border-white/20 border-t-accent rounded-full animate-spin" /></div>
           ) : tramites.length === 0 ? (
               <div className="fade-up liquid-glass rounded-3xl p-8 border border-white/10 text-center">
                   <CheckCircle2 size={40} className="mx-auto text-emerald-500/50 mb-3" />
                   <p className="text-white/80 font-medium">Bandeja al día</p>
                   <p className="text-xs text-white/40 mt-1">No hay trámites en esta sección.</p>
               </div>
           ) : (
               tramites.map((t) => {
                   const u = t.usuario;
                   const desc = parseDesc(t.descripcion);
                   return (
                     <div key={t.id} onClick={() => tab === 'PENDIENTE' ? setSelectedTramite(t) : null} className="fade-up liquid-glass rounded-[24px] p-5 border border-white/10 flex flex-col gap-3 group hover:border-white/20 transition-all cursor-pointer">
                         <div className="flex justify-between items-start">
                             <div className="flex items-center gap-2">
                                <span className="p-2 rounded-full bg-white/5 border border-white/10 text-xl">{getTipoIcon(t.tipo)}</span>
                                <div className="flex flex-col">
                                   <span className="text-xs font-bold text-white uppercase tracking-wider">{t.tipo}</span>
                                   <span className="text-[10px] text-white/50">{new Date(t.creadoEn).toLocaleString()}</span>
                                </div>
                             </div>
                             {t.estado === 'PENDIENTE' && <span className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex items-center gap-1"><Clock size={10}/> Pendiente</span>}
                             {t.estado === 'APROBADO' && <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 size={10}/> Aprobado</span>}
                             {t.estado === 'RECHAZADO' && <span className="bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex items-center gap-1"><XCircle size={10}/> Rechazado</span>}
                         </div>

                         <div className="flex bg-black/20 rounded-xl p-3 items-center gap-3">
                            <User size={16} className="text-white/30" />
                            <div className="flex flex-col">
                                <span className="text-sm font-medium text-white/90">
                                   {u.nombre} 
                                   <span className="ml-2 text-[10px] bg-accent/20 text-accent px-2 py-0.5 rounded-md font-black uppercase">
                                      T{u.unidad?.torre || '?'} - A{u.unidad?.numero || '?'}
                                   </span>
                                </span>
                            </div>
                         </div>
                         
                         {/* Desc Preview */}
                         <div className="text-xs text-white/60 line-clamp-2 italic">
                            &quot;{t.tipo === 'VEHICULO' ? `${desc.metadatos?.marca || 'Vehículo'} - Placa: ${desc.metadatos?.placa || '?'}` : 
                              t.tipo === 'MASCOTA' ? `Mascota: ${desc.metadatos?.nombre || 'Pet'} (${desc.metadatos?.tipo || '?'})` : 
                              t.tipo === 'MUDANZA' ? `Fecha Mudanza: ${desc.metadatos?.fecha || '?'}` : 'Solicitud pendiente...'}&quot;
                         </div>

                         {tab === 'HISTORIAL' && t.aprobadoPor && (
                             <div className="text-[10px] text-white/30 border-t border-white/5 pt-2 mt-1">
                                Procesado por: {t.aprobadoPor.nombre}
                             </div>
                         )}
                     </div>
                   )
               })
           )}
       </div>

       {/* Modal Resolución */}
       {selectedTramite && tab === 'PENDIENTE' && (
           <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setSelectedTramite(null)} />
              <div className="liquid-glass rounded-[32px] p-6 w-full max-w-[400px] border border-white/20 relative z-10 flex flex-col gap-4 animate-in zoom-in-95 duration-200">
                  <h3 className="text-lg font-bold text-white mb-2 pb-2 border-b border-white/10">Resolver Trámite</h3>
                  <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-white/5 border border-white/10">
                      <span className="text-xs text-white/40 uppercase tracking-widest font-bold">Solicitante</span>
                      <span className="text-sm text-white">{selectedTramite.usuario.nombre}</span>
                  </div>
                  
                  <div className="flex flex-col gap-3">
                      {/* Metadatos - Stage 39 Grid Fix */}
                      <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                         <span className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-black mb-3 block">Detalles del Activo</span>
                         <div className="grid grid-cols-2 gap-3">
                            {Object.entries(parseDesc(selectedTramite.descripcion).metadatos || {}).map(([k, v]: any) => (
                                <div key={k} className="flex flex-col">
                                   <span className="text-[9px] text-white/20 uppercase font-bold">{k}</span>
                                   <span className="text-xs text-white/90 font-mono">{String(v)}</span>
                                </div>
                            ))}
                         </div>
                      </div>

                      {/* Documentación - Stage 39 Document Viewer */}
                      {parseDesc(selectedTramite.descripcion).documentos?.length > 0 && (
                        <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                           <span className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-black mb-3 block">Documentación Adjunta</span>
                           <div className="flex flex-col gap-2">
                              {parseDesc(selectedTramite.descripcion).documentos.map((doc: any, i: number) => (
                                 <div key={i} className="flex items-center justify-between p-2 rounded-xl bg-black/20 group">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                       <FileText size={14} className={doc.type === 'pdf' ? 'text-red-400' : 'text-blue-400'} />
                                       <span className="text-[10px] text-white/60 truncate">{doc.nombre}</span>
                                    </div>
                                    <button 
                                      onClick={() => downloadFile(doc.base64, doc.nombre)}
                                      className="text-[10px] font-black text-accent uppercase tracking-widest hover:text-white transition-colors"
                                    >
                                       Descargar
                                    </button>
                                 </div>
                              ))}
                           </div>
                        </div>
                      )}
                    </div>

                   {selectedTramite.tipo === 'VEHICULO' && (
                       <div className="flex flex-col gap-2 p-3 rounded-xl bg-accent/5 border border-accent/20">
                           <label className="text-[10px] text-accent uppercase tracking-widest font-bold">Asignar Celda (Opcional)</label>
                           <select 
                             value={selectedCellId}
                             onChange={(e) => setSelectedCellId(e.target.value)}
                             className="w-full bg-[#1a1333] border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent/40"
                           >
                               <option value="">No asignar puesto...</option>
                               {availableCells.map((c) => (
                                   <option key={c.id} value={c.id}>Celda {c.numero} ({c.torre || 'N/A'})</option>
                               ))}
                           </select>
                       </div>
                   )}

                  <div className="flex flex-col gap-2 mt-2">
                      <label className="text-xs text-white/40 uppercase tracking-widest font-bold">Observaciones (Opcional si aprueba)</label>
                      <textarea 
                        value={obs}
                        onChange={(e) => setObs(e.target.value)}
                        placeholder="Explicación para el residente..."
                        className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm text-white focus:border-accent/50 outline-none h-24 resize-none"
                      />
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-4">
                      <button 
                        disabled={isProcessing}
                        onClick={() => handleResolve('RECHAZAR')}
                        className="w-full py-3 rounded-full border border-red-500/50 text-red-400 font-bold text-sm tracking-wide hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      >
                          Rechazar
                      </button>
                      <button 
                        disabled={isProcessing}
                        onClick={() => handleResolve('APROBAR')}
                        className="w-full py-3 rounded-full bg-linear-to-r from-emerald-500 to-teal-500 text-white shadow-xl shadow-emerald-500/20 font-bold text-sm tracking-wide active:scale-95 transition-transform disabled:opacity-50"
                      >
                          {isProcessing ? '...' : 'Aprobar'}
                      </button>
                  </div>
              </div>
           </div>
       )}
    </div>
  );
}
