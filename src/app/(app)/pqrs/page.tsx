"use client";

/**
 * PQRS - CONJUNTOSAPP
 * Peticiones, Quejas, Reclamos y Soporte Técnico.
 * Gestión centralizada de solicitudes para residentes.
 */

import { 
  Plus, MessageSquare, AlertTriangle, CheckCircle2, 
  Clock, ArrowRight, Info,   FileText, Megaphone, Wrench, X, 
  SendHorizonal, Calendar, Camera, ChevronRight, Image as ImageIcon
} from "lucide-react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api/client";
import { gsap } from "gsap";
import { toast } from "sonner";
import { useWsSubscription } from "@/hooks/useWebSocket";
import { Skeleton } from "@/components/ui/Skeleton";

interface Solicitud {
  id: string;
  tipo: 'PETICION' | 'QUEJA' | 'RECLAMO' | 'SUGERENCIA' | 'MANTENIMIENTO';
  categoria: string;
  descripcion: string;
  urgente: boolean;
  estado: 'ABIERTA' | 'ASIGNADA' | 'EN_PROGRESO' | 'RESUELTA' | 'CERRADA';
  createdAt: string;
  imagenes?: string[];
  comentarios?: { id: string; contenido: string; createdAt: string }[];
}

const TIPO_CONFIG = {
  PETICION: { icon: <FileText size={18}/>, color: "text-text", bg: "bg-text/10 border-text/20" },
  QUEJA: { icon: <AlertTriangle size={18}/>, color: "text-text", bg: "bg-text/10 border-text/20" },
  RECLAMO: { icon: <Megaphone size={18}/>, color: "text-text", bg: "bg-text/10 border-text/20" },
  SUGERENCIA: { icon: <Info size={18}/>, color: "text-text", bg: "bg-text/10 border-text/20" },
  MANTENIMIENTO: { icon: <Wrench size={18}/>, color: "text-text", bg: "bg-text/10 border-text/20" },
};

// Fallback so an unknown/new backend `tipo` renders safely instead of crashing the
// whole list with `TIPO_CONFIG[tipo].bg` on undefined.
const TIPO_FALLBACK = { icon: <FileText size={18}/>, color: "text-text", bg: "bg-text/10 border-text/20" };
const tipoCfg = (t: string) => TIPO_CONFIG[t as keyof typeof TIPO_CONFIG] ?? TIPO_FALLBACK;

export default function PQRSPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    tipo: 'PETICION',
    categoria: 'OTRO',
    descripcion: '',
    urgente: false
  });

  // Detail modal state
  const [selectedSolicitud, setSelectedSolicitud] = useState<Solicitud | null>(null);
  const [detailData, setDetailData] = useState<Solicitud | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Photo upload state
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refetchSolicitudes = async () => {
    try {
      const data = await api.get<Solicitud[]>('/solicitudes');
      setSolicitudes(data);
    } catch (error) {
      console.error("❌ Error loading solicitudes:", error);
    }
  };

  // Real-time WebSocket subscription
  useWsSubscription('solicitud', () => refetchSolicitudes());

  useEffect(() => {
    async function fetchSolicitudes() {
      try {
        const data = await api.get<Solicitud[]>('/solicitudes');
        setSolicitudes(data);
      } catch (error) {
        console.error("❌ Error loading solicitudes:", error);
      } finally {
        setIsLoading(false);
      }
    }

    if (user) fetchSolicitudes();
  }, [user, userId]);

  useEffect(() => {
    if (!isLoading) {
      const ctx = gsap.context(() => {
        gsap.fromTo(".fade-up-pqrs", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: "power2.out", delay: 0.1 });
      }, containerRef);
      return () => ctx.revert();
    }
  }, [isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.descripcion.trim()) return toast.warning("Debes describir el motivo");
    
    setIsSubmitting(true);
    try {
      const payload = { ...formData, ...(photoUrl ? { imagenes: [photoUrl] } : {}) };
      const newSolicitud = await api.post<Solicitud>('/solicitudes', payload);
      setSolicitudes([newSolicitud, ...solicitudes]);
      setIsFormOpen(false);
      setFormData({ tipo: 'PETICION', categoria: 'OTRO', descripcion: '', urgente: false });
      setPhotoPreview(null);
      setPhotoUrl("");
      toast.success("Solicitud radicada con éxito", {
        description: `Radicado #: ${newSolicitud.id.slice(-6).toUpperCase()}`
      });
    } catch {
      toast.error("Hubo un error al radicar la solicitud");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoPreview(URL.createObjectURL(file));
    try {
      const formDataUpload = new FormData();
      formDataUpload.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formDataUpload });
      const data = await res.json();
      if (data.url) setPhotoUrl(data.url);
    } catch {
      toast.error("No se pudo subir la imagen");
    }
  };

  const openDetail = async (s: Solicitud) => {
    setSelectedSolicitud(s);
    setIsLoadingDetail(true);
    try {
      const data = await api.get<Solicitud>(`/solicitudes/${s.id}`);
      setDetailData(data);
    } catch {
      setDetailData(s);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const getStatusLabel = (status: string) => {
    switch(status) {
      case 'RESUELTA': return { text: "Resuelto", color: "text-green-400 bg-green-500/10" };
      case 'CERRADA': return { text: "Cerrado", color: "text-text/40 bg-text/5" };
      case 'EN_PROGRESO': return { text: "En Proceso", color: "text-text dark:text-text bg-text/10" };
      case 'ASIGNADA': return { text: "Asignado", color: "text-text dark:text-text bg-text/10" };
      default: return { text: "Pendiente", color: "text-text dark:text-text bg-text/10" };
    }
  };

  const stats = [
    { label: "Total", value: solicitudes.length, icon: <MessageSquare size={16} />, color: "text-text" },
    { label: "Abiertas", value: solicitudes.filter(s => s.estado !== 'RESUELTA' && s.estado !== 'CERRADA').length, icon: <Clock size={16} />, color: "text-text" },
    { label: "Resueltas", value: solicitudes.filter(s => s.estado === 'RESUELTA' || s.estado === 'CERRADA').length, icon: <CheckCircle2 size={16} />, color: "text-text" },
  ];

  return (
    <div ref={containerRef} className="min-h-screen flex flex-col p-6 pt-16 pb-32 overflow-x-hidden relative gap-6">
      <ProfileHeader className="fade-up-pqrs" />

      {/* STATS OVERVIEW */}
      <section className="fade-up-pqrs grid grid-cols-3 gap-4">
        {stats.map((stat, i) => (
          <div key={i} className="liquid-glass-card rounded-[24px] p-4 flex flex-col items-center gap-1 border border-border">
             <div className={`${stat.color} p-2 rounded-xl bg-text/5 mb-1`}>
                {stat.icon}
             </div>
             <span className="text-xl font-display font-bold text-text tracking-tight">{stat.value}</span>
             <span className="text-[8px] font-black uppercase tracking-widest text-text">{stat.label}</span>
          </div>
        ))}
      </section>

      {/* ACTION BUTTON */}
      <button 
        onClick={() => setIsFormOpen(true)}
        className="fade-up-pqrs group relative w-full h-[120px] rounded-[32px] overflow-hidden flex items-center justify-center transition-all active:scale-[0.98] shadow-2xl shadow-accent/20 cursor-pointer"
      >
         <div className="absolute inset-0 bg-linear-to-br from-[#0A0A0A] via-accent/20 to-[#FFFFFF] group-hover:scale-105 transition-transform duration-700" />
         <div className="flex flex-col items-center gap-2 relative z-10">
            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-[#000000] shadow-xl">
               <Plus size={24} />
            </div>
            <span className="text-white font-display font-bold text-sm tracking-tight">Radicar nueva PQRS</span>
         </div>
      </button>

      {/* LIST HEADER */}
      <div className="fade-up-pqrs flex justify-between items-end mt-4">
         <h3 className="text-text font-display text-lg font-bold tracking-tight">Tus Solicitudes</h3>
         <button className="text-text text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 hover:text-text transition-colors cursor-pointer">
            Filtrar <ArrowRight size={10} />
         </button>
      </div>

      {/* PQRS LIST */}
      <section className="flex flex-col gap-4">
         {isLoading ? (
           <div className="py-20 flex flex-col items-center gap-4">
              <Skeleton className="w-10 h-10 rounded-full" />
              <p className="text-text text-[10px] font-bold uppercase tracking-widest">Sincronizando radicados...</p>
           </div>
         ) : solicitudes.length === 0 ? (
           <div className="py-20 flex flex-col items-center gap-4 liquid-glass-card rounded-[32px] border border-border p-10 text-center">
              <div className="w-16 h-16 rounded-full bg-text/5 flex items-center justify-center text-text mb-2">
                 <FileText size={32} />
              </div>
              <h4 className="text-text text-sm font-bold">Aún no tienes solicitudes</h4>
              <p className="text-text text-xs px-6">Cuando radiques una PQRS aparecerá listada en esta sección para su seguimiento.</p>
           </div>
         ) : (
           solicitudes.map((s) => (
              <div key={s.id} onClick={() => openDetail(s)} className="fade-up-pqrs liquid-glass-card rounded-[32px] p-6 border border-border flex flex-col gap-4 shadow-xl hover:border-accent/20 transition-all cursor-pointer group">
                <div className="flex justify-between items-start">
                   <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-2xl ${tipoCfg(s.tipo).bg} ${tipoCfg(s.tipo).color}`}>
                         {tipoCfg(s.tipo).icon}
                      </div>
                      <div>
                         <h4 className="text-text font-bold text-sm tracking-tight">{s.tipo}</h4>
                         <span className="text-[8px] font-black uppercase tracking-widest text-text">{s.categoria}</span>
                      </div>
                   </div>
                   <div className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border border-border ${getStatusLabel(s.estado).color}`}>
                      {getStatusLabel(s.estado).text}
                   </div>
                </div>

                <p className="text-text text-xs line-clamp-2 leading-relaxed">
                   {s.descripcion}
                </p>

                <div className="pt-4 mt-2 border-t border-border flex justify-between items-center">
                   <div className="flex items-center gap-1.5">
                      <Calendar size={12} className="text-text" />
                       <span className="text-[10px] text-text font-medium">{new Date(s.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                   </div>
                   <div className="flex items-center gap-2">
                      <span className="text-[8px] font-black uppercase tracking-widest text-text">ID: {s.id.slice(-6).toUpperCase()}</span>
                      {s.urgente && <span className="bg-text/20 text-text text-[8px] font-black uppercase px-2 py-0.5 rounded-full">Urgente</span>}
                   </div>
                </div>
             </div>
           ))
         )}
      </section>

      {/* MODAL FORM: CREATE PQRS */}
      {isFormOpen && (
        <div className="fixed inset-0 z-200 flex items-end sm:items-center justify-center p-6 animate-in slide-in-from-bottom duration-500">
           <div className="absolute inset-0 bg-black/80 backdrop-blur-3xl" onClick={() => !isSubmitting && setIsFormOpen(false)} />
           
           <div className="relative w-full max-w-sm bg-primary border border-border rounded-t-[48px] sm:rounded-[48px] shadow-2xl overflow-hidden">
              <form onSubmit={handleSubmit} className="p-8 flex flex-col gap-6">
                 <div className="flex justify-between items-center">
                    <div>
                       <h3 className="text-xl font-display font-bold text-text tracking-tight">Nueva PQRS</h3>
                       <p className="text-text text-[10px] font-bold uppercase tracking-widest mt-1">Radicación oficial</p>
                    </div>
                    <button type="button" onClick={() => setIsFormOpen(false)} className="w-10 h-10 rounded-full bg-text/5 flex items-center justify-center text-text hover:text-text cursor-pointer"><X size={20} /></button>
                 </div>

                 {/* TIPO PICKER */}
                 <div className="flex flex-col gap-3">
                    <span className="text-text text-[10px] font-bold uppercase tracking-widest px-2">Tipo de Solicitud</span>
                    <div className="grid grid-cols-2 gap-2">
                       {Object.entries(TIPO_CONFIG).map(([key, config]) => (
                         <button 
                           type="button"
                           key={key} 
                           onClick={() => setFormData({ ...formData, tipo: key, categoria: key === 'MANTENIMIENTO' ? 'ELECTRICIDAD' : 'OTRO' })}
                           className={`flex items-center gap-2 p-3 rounded-2xl border transition-all cursor-pointer ${formData.tipo === key ? `${config.bg} border-${config.color.split('-')[1]}/40 ${config.color}` : 'bg-text/5 border-border text-text'}`}
                         >
                            {config.icon}
                            <span className="text-[10px] font-bold uppercase tracking-widest">{key.slice(0, 8)}</span>
                         </button>
                       ))}
                    </div>
                 </div>

                 {/* DESCRIPTION */}
                 <div className="flex flex-col gap-3">
                    <span className="text-text text-[10px] font-bold uppercase tracking-widest px-2">Descripción del caso</span>
                    <div className="relative group">
                       <textarea 
                         value={formData.descripcion}
                         onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                         placeholder="Escribe aquí los detalles de tu solicitud..."
                         className="w-full bg-text/5 border border-border rounded-3xl p-5 min-h-[140px] text-text placeholder:text-text focus:outline-none focus:border-accent/40 focus:ring-4 focus:ring-accent/5 transition-all outline-none resize-none"
                       />
                    </div>
                 </div>

                  {/* OPTIONS */}
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-text/5 border border-border">
                     <div 
                       className="flex items-center gap-2 overflow-hidden cursor-pointer" 
                       onClick={() => fileInputRef.current?.click()}
                     >
                        {photoPreview ? (
                          <img src={photoPreview} alt="Preview" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-text/5 flex items-center justify-center text-text">
                            <Camera size={16} />
                          </div>
                        )}
                        <span className="text-[10px] text-text font-bold uppercase tracking-widest">
                          {photoPreview ? 'Foto vinculada' : 'Vincular Foto'}
                        </span>
                        <input 
                          ref={fileInputRef} 
                          type="file" 
                          accept="image/*" 
                          onChange={handlePhotoSelect} 
                          className="hidden" 
                        />
                     </div>
                    <label className="flex items-center gap-2 cursor-pointer group">
                       <span className={`text-[10px] font-bold uppercase transition-colors ${formData.urgente ? 'text-text' : 'text-text group-hover:text-text'}`}>¡Urgente!</span>
                       <input 
                         type="checkbox" 
                         checked={formData.urgente} 
                         onChange={(e) => setFormData({ ...formData, urgente: e.target.checked })} 
                         className="w-5 h-5 accent-text rounded-lg cursor-pointer" 
                       />
                    </label>
                 </div>

                 <button 
                   disabled={isSubmitting}
                   className="w-full bg-accent hover:brightness-110 py-5 rounded-[24px] font-bold text-primary shadow-xl shadow-accent/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 cursor-pointer"
                 >
                   {isSubmitting ? <Skeleton className="w-5 h-5 rounded-full" /> : (
                     <>Radicar Solicitud <SendHorizonal size={18} /></>
                   )}
                 </button>
              </form>
           </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {selectedSolicitud && (
        <div className="fixed inset-0 z-200 flex items-end sm:items-center justify-center p-6 animate-in slide-in-from-bottom duration-500">
           <div className="absolute inset-0 bg-black/80 backdrop-blur-3xl" onClick={() => { setSelectedSolicitud(null); setDetailData(null); }} />
           <div className="relative w-full max-w-sm bg-primary border border-border rounded-t-[48px] sm:rounded-[48px] shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
              <div className="p-6 flex flex-col gap-5 overflow-y-auto flex-1">
                 <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                       <div className={`p-2.5 rounded-2xl ${tipoCfg(selectedSolicitud.tipo).bg} ${tipoCfg(selectedSolicitud.tipo).color}`}>
                          {tipoCfg(selectedSolicitud.tipo).icon}
                       </div>
                       <div>
                          <h3 className="text-text font-bold text-sm tracking-tight">{selectedSolicitud.tipo}</h3>
                          <span className="text-[8px] font-black uppercase tracking-widest text-text">{selectedSolicitud.categoria}</span>
                       </div>
                    </div>
                    <div className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border border-border ${getStatusLabel(detailData?.estado || selectedSolicitud.estado).color}`}>
                       {getStatusLabel(detailData?.estado || selectedSolicitud.estado).text}
                    </div>
                 </div>

                 <p className="text-text text-sm leading-relaxed">
                    {detailData?.descripcion || selectedSolicitud.descripcion}
                 </p>

                 {(detailData?.imagenes || selectedSolicitud.imagenes || []).length > 0 && (
                   <div className="flex gap-3 overflow-x-auto pb-2">
                      {(detailData?.imagenes || selectedSolicitud.imagenes || []).map((url, i) => (
                        <img key={i} src={url} alt={`Evidencia ${i + 1}`} className="h-24 rounded-2xl object-cover shrink-0" />
                      ))}
                   </div>
                 )}

                 <div className="pt-4 border-t border-border flex justify-between items-center">
                    <div className="flex items-center gap-1.5">
                       <Calendar size={12} className="text-text" />
                       <span className="text-[10px] text-text font-medium">{new Date(selectedSolicitud.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    </div>
                    <span className="text-[8px] font-black uppercase tracking-widest text-text">ID: {selectedSolicitud.id.slice(-6).toUpperCase()}</span>
                 </div>

                 {isLoadingDetail && (
                   <div className="flex justify-center py-4"><Skeleton className="w-5 h-5 rounded-full" /></div>
                 )}

                 {detailData?.comentarios && detailData.comentarios.length > 0 && (
                   <div className="flex flex-col gap-3 pt-4 border-t border-border">
                      <span className="text-text text-[10px] font-bold uppercase tracking-widest px-2">Seguimiento</span>
                      {detailData.comentarios.map(c => (
                        <div key={c.id} className="bg-text/5 rounded-2xl p-4">
                           <p className="text-text text-xs leading-relaxed">{c.contenido}</p>
                            <span className="text-[9px] text-text/60 mt-2 block">{new Date(c.createdAt).toLocaleDateString('es-ES')}</span>
                        </div>
                      ))}
                   </div>
                 )}
              </div>
           </div>
        </div>
      )}

    </div>
  );
}
