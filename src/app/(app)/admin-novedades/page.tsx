"use client";

import { useState, useEffect, useRef } from "react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { CheckCircle2, XCircle, Clock, Info, User, Car, Briefcase, Dog, AlertCircle, FileText, Upload, Trash2, Megaphone, RefreshCw, Pencil, X } from "lucide-react";
import { gsap } from "gsap";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api/client";
import { useRouter } from "next/navigation";
import { useWsSubscription } from "@/hooks/useWebSocket";

export default function AdminNovedadesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const role = user?.rol;

  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [tramites, setTramites] = useState<any[]>([]);
  const [tab, setTab] = useState<'PENDIENTE' | 'HISTORIAL' | 'PUBLICAR_ANUNCIO'>('PENDIENTE');

  // State for announcements
  const [anuncios, setAnuncios] = useState<any[]>([]);
  const [loadingAnuncios, setLoadingAnuncios] = useState(false);
  const [anuncioForm, setAnuncioForm] = useState({
    titulo: "",
    contenido: "",
    tipo: "GENERAL",
    fijado: false,
    imagenUrl: ""
  });
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSubmittingAnuncio, setIsSubmittingAnuncio] = useState(false);
  const [editingAnuncioId, setEditingAnuncioId] = useState<string | null>(null);

  // Modal State
  const [selectedTramite, setSelectedTramite] = useState<any>(null);
  const [obs, setObs] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [availableCells, setAvailableCells] = useState<any[]>([]);
  const [selectedCellId, setSelectedCellId] = useState("");
  const [mesesAsignacion, setMesesAsignacion] = useState("12");

  const fetchTramites = async () => {
    setLoading(true);
    try {
      const qs = tab === 'PENDIENTE' ? '?estado=PENDIENTE' : '';
      const items = await api.get<any[]>(`/tramites${qs}`);
      {
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
          const data = await api.get<any[]>('/parqueadero/mapa');
          setAvailableCells(data.filter((c: any) => c.estado === 'DISPONIBLE'));
      } catch (e) { console.error("Error fetching cells", e); }
  };

  const fetchAnuncios = async () => {
    setLoadingAnuncios(true);
    try {
      const data = await api.get<any[]>('/anuncios');
      setAnuncios(data);
    } catch {
      toast.error("Error al cargar anuncios");
    } finally {
      setLoadingAnuncios(false);
    }
  };

  // Real-time WebSocket subscriptions
  useWsSubscription('tramite', () => fetchTramites());
  useWsSubscription('anuncio', () => fetchAnuncios());

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      return toast.error("El tamaño de la imagen supera el límite de 5MB");
    }

    setIsUploadingImage(true);
    try {
      // Read the file as a base64 data URL, then offload it to object storage
      // (MinIO) via the backend. We persist only the returned short URL — never
      // the base64 blob — so the announcement payload stays small and never hits
      // the request-body size cap.
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
        reader.readAsDataURL(file);
      });

      const res = await api.post<{ url: string }>("/uploads/imagen", {
        data: dataUrl,
        carpeta: "anuncios",
      });
      setAnuncioForm(prev => ({ ...prev, imagenUrl: res.url }));
      toast.success("Imagen cargada correctamente");
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.detail : (err?.message || "Error al cargar imagen");
      toast.error("Error al cargar imagen: " + msg);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSubmitAnuncio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!anuncioForm.titulo.trim() || !anuncioForm.contenido.trim()) {
      return toast.error("Por favor completa los campos obligatorios");
    }

    setIsSubmittingAnuncio(true);
    try {
      if (editingAnuncioId) {
        await api.put(`/anuncios/${editingAnuncioId}`, anuncioForm);
        toast.success("Anuncio actualizado exitosamente");
      } else {
        await api.post('/anuncios', anuncioForm);
        toast.success("Anuncio publicado exitosamente");
      }
      setAnuncioForm({
        titulo: "",
        contenido: "",
        tipo: "GENERAL",
        fijado: false,
        imagenUrl: ""
      });
      setEditingAnuncioId(null);
      fetchAnuncios();
    } catch {
      toast.error(editingAnuncioId ? "Error de conexión al actualizar anuncio" : "Error de conexión al publicar anuncio");
    } finally {
      setIsSubmittingAnuncio(false);
    }
  };

  const startEditAnuncio = (anuncio: any) => {
    setEditingAnuncioId(anuncio.id);
    setAnuncioForm({
      titulo: anuncio.titulo || "",
      contenido: anuncio.contenido || "",
      tipo: anuncio.tipo || "GENERAL",
      fijado: !!anuncio.fijado,
      imagenUrl: anuncio.imagenUrl || ""
    });
    // Scroll to the form at the top of the panel.
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEditAnuncio = () => {
    setEditingAnuncioId(null);
    setAnuncioForm({
      titulo: "",
      contenido: "",
      tipo: "GENERAL",
      fijado: false,
      imagenUrl: ""
    });
  };

  const handleDeleteAnuncio = async (id: string) => {
    if (!confirm("¿Estás seguro de que deseas eliminar este anuncio?")) return;

    try {
      await api.delete(`/anuncios/${id}`);
      toast.success("Anuncio eliminado correctamente");
      fetchAnuncios();
    } catch {
      toast.error("Error de conexión al eliminar anuncio");
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }

    const allowed = ['ADMINISTRADOR', 'SUPER_ADMIN'];
    if (!role || !allowed.includes(role)) {
      toast.error("No tienes permisos para acceder a esta sección.");
      router.push("/inicio");
      return;
    }

    if (tab === 'PENDIENTE' || tab === 'HISTORIAL') {
      fetchTramites();
      if (tab === 'PENDIENTE') fetchCells();
    } else if (tab === 'PUBLICAR_ANUNCIO') {
      fetchAnuncios();
    }
  }, [tab, user, authLoading, role, router]);

  useEffect(() => {
    if (!loading) {
      const ctx = gsap.context(() => {
        gsap.fromTo(".fade-up", 
          { opacity: 0, y: 20 }, 
          { opacity: 1, y: 0, stagger: 0.1, duration: 0.4, ease: "power2.out" }
        );
      }, containerRef);
      return () => ctx.revert();
    }
  }, [loading, tab]);

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

  // Normaliza un trámite al shape { metadatos, documentos } sea cual sea el
  // contrato: nuevo backend (payload objeto + documentos array) o el viejo
  // (descripcion string JSON). Evita el crash cuando no hay 'descripcion'.
  const getMeta = (t: any) => {
      if (t && typeof t === 'object' && (t.payload !== undefined || t.documentos !== undefined)) {
          return { metadatos: t.payload || {}, documentos: t.documentos || [] };
      }
      return parseDesc(t?.descripcion);
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
          case 'VEHICULO': return <Car size={16} className="text-neutral-400" />;
          case 'MASCOTA': return <Dog size={16} className="text-neutral-400" />;
          case 'ARRENDAMIENTO': return <Briefcase size={16} className="text-neutral-400" />;
          case 'MUDANZA': return <Info size={16} className="text-neutral-400" />;
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
          // Contrato real del backend: PUT /tramites/{id}/resolver
          // { decision: 'APROBADO'|'RECHAZADO', observacion?, parqueaderoId?, meses? }
          const asignaCelda = accion === 'APROBAR' && selectedTramite.tipo === 'VEHICULO' && selectedCellId;
          await api.put(`/tramites/${selectedTramite.id}/resolver`, {
                  decision: accion === 'APROBAR' ? 'APROBADO' : 'RECHAZADO',
                  observacion: obs || undefined,
                  parqueaderoId: asignaCelda ? selectedCellId : undefined,
                  meses: asignaCelda ? (parseInt(mesesAsignacion, 10) || 0) : undefined,
              });
          toast.success(`Trámite ${accion === 'APROBAR' ? 'aprobado' : 'rechazado'} con éxito.`);
          setSelectedTramite(null);
          setObs("");
          setSelectedCellId("");
          setMesesAsignacion("12");
          fetchTramites();
      } catch (e: any) {
          toast.error(e?.message || 'Error al procesar el trámite.');
      } finally {
          setIsProcessing(false);
      }
  };

  return (
    <div ref={containerRef} className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen relative overflow-x-hidden">
       <ProfileHeader />
       
       <div className="fade-up flex items-center justify-between">
            <div>
                <h1 className="text-2xl font-display font-medium text-text tracking-wide">Trámites</h1>
                <p className="text-sm text-text/70">Solicitudes de residentes</p>
            </div>
            {tab === 'PENDIENTE' && (
                <button onClick={fetchTramites} className="p-2 rounded-full hover:bg-surface-2 transition-colors">
                    <RefreshCw size={18} className="text-text/70" />
                </button>
            )}
       </div>

       {/* Tabs */}
       <div className="fade-up flex bg-surface-2 rounded-full p-1 border border-border">
            <button 
              onClick={() => setTab('PENDIENTE')} 
              className={`flex-1 py-3 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${tab === 'PENDIENTE' ? 'bg-accent text-primary shadow-md' : 'text-text/70 hover:text-text'}`}
            >
               Pendientes
            </button>
            <button 
              onClick={() => setTab('HISTORIAL')} 
              className={`flex-1 py-3 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${tab === 'HISTORIAL' ? 'bg-accent text-primary shadow-md' : 'text-text/70 hover:text-text'}`}
            >
               Historial
            </button>
            <button 
              onClick={() => setTab('PUBLICAR_ANUNCIO')} 
              className={`flex-1 py-3 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${tab === 'PUBLICAR_ANUNCIO' ? 'bg-accent text-primary shadow-md' : 'text-text/70 hover:text-text'}`}
            >
               Publicar Anuncio
            </button>
       </div>

       {/* Listado */}
       {tab !== 'PUBLICAR_ANUNCIO' ? (
          <div className="flex flex-col gap-4">
               {loading ? (
                 <div className="w-full py-12 flex justify-center"><div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" /></div>
               ) : tramites.length === 0 ? (
                   <div className="fade-up liquid-glass rounded-3xl p-8 border border-border text-center">
                       <CheckCircle2 size={40} className="mx-auto text-neutral-500/50 mb-3" />
                       <p className="text-text/80 font-medium">Bandeja al día</p>
                       <p className="text-xs text-text/70 mt-1">No hay trámites en esta sección.</p>
                   </div>
               ) : (
                   tramites.map((t) => {
                       const u = t.solicitante || t.usuario;
                       const desc = getMeta(t);
                       return (
                         <div key={t.id} onClick={() => tab === 'PENDIENTE' ? setSelectedTramite(t) : null} className="fade-up liquid-glass-card rounded-[24px] p-5 border border-border flex flex-col gap-3 group hover:border-accent/30 transition-all cursor-pointer">
                             <div className="flex justify-between items-start">
                                 <div className="flex items-center gap-2">
                                    <span className="p-2 rounded-full bg-surface-2 border border-border text-xl">{getTipoIcon(t.tipo)}</span>
                                    <div className="flex flex-col">
                                       <span className="text-xs font-bold text-text uppercase tracking-wider">{t.tipo}</span>
                                       <span className="text-[10px] text-text/70">{new Date(t.createdAt || t.creadoEn).toLocaleString()}</span>
                                    </div>
                                 </div>
                                 {t.estado === 'PENDIENTE' && <span className="bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border border-neutral-500/20 dark:border-neutral-500/30 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex items-center gap-1"><Clock size={10}/> Pendiente</span>}
                                 {t.estado === 'APROBADO' && <span className="bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border border-neutral-500/20 dark:border-neutral-500/30 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 size={10}/> Aprobado</span>}
                                 {t.estado === 'RECHAZADO' && <span className="bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border border-neutral-500/20 dark:border-neutral-500/30 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex items-center gap-1"><XCircle size={10}/> Rechazado</span>}
                             </div>

                             <div className="flex bg-surface-2 rounded-xl p-3 items-center gap-3">
                                <User size={16} className="text-text/60" />
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium text-text">
                                       {u?.nombre || 'Solicitante'} 
                                       <span className="ml-2 text-[10px] bg-accent/20 text-accent px-2 py-0.5 rounded-md font-black uppercase">
                                          T{u?.torre || u?.unidad?.torre || '?'} - A{u?.apto || u?.unidad?.numero || '?'}
                                       </span>
                                    </span>
                                </div>
                             </div>
                             
                             {/* Desc Preview */}
                             <div className="text-xs text-text/70 line-clamp-2 italic">
                                &quot;{t.tipo === 'VEHICULO' ? `${desc.metadatos?.marca || 'Vehículo'} - Placa: ${desc.metadatos?.placa || '?'}` : 
                                  t.tipo === 'MASCOTA' ? `Mascota: ${desc.metadatos?.nombre || 'Pet'} (${desc.metadatos?.tipo || '?'})` : 
                                  t.tipo === 'MUDANZA' ? `Fecha Mudanza: ${desc.metadatos?.fecha || '?'}` : 'Solicitud pendiente...'}&quot;
                             </div>

                             {tab === 'HISTORIAL' && (t.aprobadoPor || t.aprobadoPorId) && (
                                 <div className="text-[10px] text-text/60 border-t border-border pt-2 mt-1">
                                    Procesado{t.aprobadoPor?.nombre ? `: ${t.aprobadoPor.nombre}` : ''}
                                 </div>
                             )}
                         </div>
                       )
                   })
               )}
          </div>
       ) : (
          <div className="fade-up flex flex-col gap-8">
               {/* Formulario */}
               <form onSubmit={handleSubmitAnuncio} className="liquid-glass-card rounded-[28px] p-6 border border-border flex flex-col gap-4">
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-border">
                        <h2 className="text-base font-bold text-text">{editingAnuncioId ? "Editar Publicación / Circular" : "Crear Publicación / Circular"}</h2>
                        {editingAnuncioId && (
                            <button
                              type="button"
                              onClick={cancelEditAnuncio}
                              className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-text/60 hover:text-text bg-surface-2 border border-border rounded-full px-3 py-1.5 transition-all active:scale-95"
                            >
                                <X size={12} /> Cancelar
                            </button>
                        )}
                    </div>
                    
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] text-text/60 uppercase tracking-[0.2em] font-black ml-1">Título del Anuncio *</label>
                        <input 
                          type="text"
                          required
                          value={anuncioForm.titulo}
                          onChange={(e) => setAnuncioForm(prev => ({ ...prev, titulo: e.target.value }))}
                          placeholder="Ej: Mantenimiento Preventivo de Ascensores"
                          className="w-full bg-surface-2 border border-border rounded-xl px-4 py-3 text-xs text-text outline-none focus:border-accent"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] text-text/60 uppercase tracking-[0.2em] font-black ml-1">Categoría / Tipo *</label>
                            <select 
                              value={anuncioForm.tipo}
                              onChange={(e) => setAnuncioForm(prev => ({ ...prev, tipo: e.target.value }))}
                              className="w-full bg-surface-2 border border-border rounded-xl px-4 py-3 text-xs text-text outline-none focus:border-accent"
                            >
                                <option value="GENERAL">GENERAL</option>
                                <option value="URGENTE">URGENTE</option>
                                <option value="MANTENIMIENTO">MANTENIMIENTO</option>
                                <option value="EVENTO">EVENTO</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-3 pt-6 pl-2">
                            <input 
                              type="checkbox"
                              id="fijado"
                              checked={anuncioForm.fijado}
                              onChange={(e) => setAnuncioForm(prev => ({ ...prev, fijado: e.target.checked }))}
                              className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                            />
                            <label htmlFor="fijado" className="text-[10px] text-text/85 uppercase tracking-widest font-black cursor-pointer">Fijar Anuncio (Top)</label>
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] text-text/60 uppercase tracking-[0.2em] font-black ml-1">Contenido / Circular *</label>
                        <textarea 
                          required
                          rows={5}
                          value={anuncioForm.contenido}
                          onChange={(e) => setAnuncioForm(prev => ({ ...prev, contenido: e.target.value }))}
                          placeholder="Redacta la información detallada para los copropietarios..."
                          className="w-full bg-surface-2 border border-border rounded-xl p-4 text-xs text-text focus:border-accent outline-none resize-none leading-relaxed"
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-[10px] text-text/60 uppercase tracking-[0.2em] font-black ml-1">Fotografía / Imagen (Opcional)</label>
                        {anuncioForm.imagenUrl ? (
                            <div className="relative rounded-2xl overflow-hidden border border-border h-40 group">
                                <img src={anuncioForm.imagenUrl} alt="Anuncio Preview" className="w-full h-full object-cover" />
                                <button 
                                  type="button"
                                  onClick={() => setAnuncioForm(prev => ({ ...prev, imagenUrl: "" }))}
                                  className="absolute top-3 right-3 bg-neutral-500 text-white rounded-full p-2 hover:bg-neutral-600 transition-all shadow-md active:scale-90"
                                >
                                    <XCircle size={16} />
                                </button>
                            </div>
                        ) : (
                            <label className="border-2 border-dashed border-border hover:border-accent/50 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all bg-surface-2/20 hover:bg-surface-2/40">
                                <Upload className="text-text/40" size={24} />
                                <span className="text-[10px] font-bold text-text/60 uppercase tracking-wider">{isUploadingImage ? "Subiendo..." : "Seleccionar Archivo (PNG, JPG, max 5MB)"}</span>
                                <input 
                                  type="file" 
                                  accept="image/*" 
                                  className="hidden" 
                                  onChange={handleImageUpload} 
                                  disabled={isUploadingImage}
                                />
                            </label>
                        )}
                    </div>

                    <button 
                      type="submit"
                      disabled={isSubmittingAnuncio || isUploadingImage}
                      className="w-full py-4 bg-accent rounded-2xl font-bold text-xs uppercase tracking-widest text-on-accent shadow-xl shadow-accent/20 active:scale-[0.98] transition-all disabled:opacity-50 mt-2"
                    >
                        {isSubmittingAnuncio ? (editingAnuncioId ? "Guardando..." : "Publicando...") : (editingAnuncioId ? "Guardar Cambios" : "Publicar Anuncio")}
                    </button>
               </form>

               {/* Historial de Publicaciones */}
               <div className="flex flex-col gap-4">
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-text/50 px-1">Anuncios Activos</h3>
                    {loadingAnuncios ? (
                        <div className="w-full py-8 flex justify-center"><div className="w-6 h-6 border-2 border-border border-t-accent rounded-full animate-spin" /></div>
                    ) : anuncios.length === 0 ? (
                        <div className="liquid-glass rounded-3xl p-8 border border-border text-center text-text/50 text-xs italic">
                            No hay anuncios publicados por ti en esta copropiedad.
                        </div>
                    ) : (
                        anuncios.map((anuncio) => (
                            <div key={anuncio.id} className="liquid-glass-card rounded-2xl p-4 border border-border flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0 text-accent">
                                        <Megaphone size={18} />
                                    </div>
                                    <div className="flex flex-col overflow-hidden">
                                        <span className="text-xs font-bold text-text truncate">{anuncio.titulo}</span>
                                        <span className="text-[9px] text-text/50 uppercase tracking-wider">{anuncio.tipo} • {new Date(anuncio.publicadoEn).toLocaleDateString()}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button 
                                      type="button"
                                      onClick={() => startEditAnuncio(anuncio)}
                                      className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all active:scale-95 ${editingAnuncioId === anuncio.id ? "bg-accent/20 border-accent/40 text-accent" : "bg-accent/10 border-accent/25 text-accent hover:bg-accent/20"}`}
                                    >
                                        <Pencil size={16} />
                                    </button>
                                    <button 
                                      type="button"
                                      onClick={() => handleDeleteAnuncio(anuncio.id)}
                                      className="w-10 h-10 rounded-xl bg-neutral-500/10 border border-neutral-500/25 flex items-center justify-center text-neutral-400 hover:bg-neutral-500/20 active:scale-95 transition-all"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
               </div>
          </div>
       )}

       {/* Modal Resolución */}
       {selectedTramite && tab === 'PENDIENTE' && (
            <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
               <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setSelectedTramite(null)} />
               <div className="liquid-glass-card rounded-[32px] p-6 w-full max-w-[400px] border border-border relative z-10 flex flex-col gap-4 animate-in zoom-in-95 duration-200">
                   <h3 className="text-lg font-bold text-text mb-2 pb-2 border-b border-border">Resolver Trámite</h3>
                   <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-surface-2 border border-border">
                       <span className="text-xs text-text/70 uppercase tracking-widest font-bold">Solicitante</span>
                       <span className="text-sm text-text">{selectedTramite.solicitante?.nombre || selectedTramite.usuario?.nombre || 'Solicitante'}</span>
                   </div>
                   
                   <div className="flex flex-col gap-3">
                       {/* Metadatos - Stage 39 Grid Fix */}
                       <div className="p-4 rounded-2xl bg-surface-2 border border-border">
                          <span className="text-[10px] text-text/70 uppercase tracking-[0.2em] font-black mb-3 block">Detalles del Activo</span>
                          <div className="grid grid-cols-2 gap-3">
                             {Object.entries(getMeta(selectedTramite).metadatos || {}).map(([k, v]: any) => (
                                 <div key={k} className="flex flex-col">
                                    <span className="text-[9px] text-text/60 uppercase font-bold">{k}</span>
                                    <span className="text-xs text-text font-mono">{String(v)}</span>
                                 </div>
                             ))}
                          </div>
                       </div>

                       {/* Documentación - Stage 39 Document Viewer */}
                       {getMeta(selectedTramite).documentos?.length > 0 && (
                         <div className="p-4 rounded-2xl bg-surface-2 border border-border">
                            <span className="text-[10px] text-text/70 uppercase tracking-[0.2em] font-black mb-3 block">Documentación Adjunta</span>
                            <div className="flex flex-col gap-2">
                               {getMeta(selectedTramite).documentos.map((doc: any, i: number) => (
                                  <div key={i} className="flex items-center justify-between p-2 rounded-xl bg-surface-2 border border-border group">
                                     <div className="flex items-center gap-2 overflow-hidden">
                                        <FileText size={14} className={doc.type === 'pdf' ? 'text-neutral-400' : 'text-neutral-400'} />
                                        <span className="text-[10px] text-text/70 truncate">{doc.nombre}</span>
                                     </div>
                                     <button 
                                       onClick={() => downloadFile(doc.base64, doc.nombre)}
                                       className="text-[10px] font-black text-accent uppercase tracking-widest hover:text-text transition-colors animate-in"
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
                              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs text-text outline-none focus:border-accent"
                            >
                                <option value="" className="bg-primary text-text">No asignar puesto...</option>
                                {availableCells.map((c) => (
                                    <option key={c.id} value={c.id} className="bg-primary text-text">Celda {c.numero} ({c.torre || 'N/A'})</option>
                                ))}
                            </select>
                            {selectedCellId && (
                                <div className="flex flex-col gap-1.5 mt-1">
                                    <label className="text-[10px] text-accent uppercase tracking-widest font-bold">Cláusula de tiempo (asignación permanente)</label>
                                    <select
                                      value={mesesAsignacion}
                                      onChange={(e) => setMesesAsignacion(e.target.value)}
                                      className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs text-text outline-none focus:border-accent"
                                    >
                                        <option value="3" className="bg-primary text-text">3 meses</option>
                                        <option value="6" className="bg-primary text-text">6 meses</option>
                                        <option value="12" className="bg-primary text-text">12 meses (1 año)</option>
                                        <option value="24" className="bg-primary text-text">24 meses (2 años)</option>
                                        <option value="0" className="bg-primary text-text">Sin vencimiento</option>
                                    </select>
                                    <span className="text-[9px] text-text/50">
                                        {mesesAsignacion === "0"
                                          ? "La celda quedará asignada indefinidamente."
                                          : `La asignación vencerá automáticamente en ${mesesAsignacion} meses. El vigilante verá la fecha.`}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                   <div className="flex flex-col gap-2 mt-2">
                       <label className="text-xs text-text/70 uppercase tracking-widest font-bold">Observaciones (Opcional si aprueba)</label>
                       <textarea 
                         value={obs}
                         onChange={(e) => setObs(e.target.value)}
                         placeholder="Explicación para el residente..."
                         className="w-full bg-surface-2 border border-border rounded-xl p-3 text-sm text-text focus:border-accent outline-none h-24 resize-none"
                       />
                   </div>

                   <div className="grid grid-cols-2 gap-3 mt-4">
                       <button 
                         disabled={isProcessing}
                         onClick={() => handleResolve('RECHAZAR')}
                         className="w-full py-3 rounded-full border border-neutral-500/30 dark:border-neutral-500/50 text-neutral-600 dark:text-neutral-400 font-bold text-sm tracking-wide hover:bg-neutral-500/10 transition-colors disabled:opacity-50"
                       >
                           Rechazar
                       </button>
                       <button 
                         disabled={isProcessing}
                         onClick={() => handleResolve('APROBAR')}
                         className="w-full py-3 rounded-full bg-linear-to-r from-neutral-500 to-neutral-500 text-white shadow-xl shadow-neutral-500/20 font-bold text-sm tracking-wide active:scale-95 transition-transform disabled:opacity-50"
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
