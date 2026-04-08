"use client";

/**
 * PQRS - CONJUNTOSAPP
 * Peticiones, Quejas, Reclamos y Soporte Técnico.
 * Gestión centralizada de solicitudes para residentes.
 */

import { 
  Plus, MessageSquare, AlertTriangle, CheckCircle2, 
  Clock, ArrowRight, Info, Loader2,
  FileText, Megaphone, Wrench, X, 
  SendHorizonal, Calendar, Camera
} from "lucide-react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { gsap } from "gsap";
import { toast } from "sonner";

interface Solicitud {
  id: string;
  tipo: 'PETICION' | 'QUEJA' | 'RECLAMO' | 'SUGERENCIA' | 'MANTENIMIENTO';
  categoria: string;
  descripcion: string;
  urgente: boolean;
  estado: 'ABIERTA' | 'ASIGNADA' | 'EN_PROGRESO' | 'COMPLETADA';
  creadoEn: string;
}

const TIPO_CONFIG = {
  PETICION: { icon: <FileText size={18}/>, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  QUEJA: { icon: <AlertTriangle size={18}/>, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
  RECLAMO: { icon: <Megaphone size={18}/>, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
  SUGERENCIA: { icon: <Info size={18}/>, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  MANTENIMIENTO: { icon: <Wrench size={18}/>, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
};

export default function PQRSPage() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
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

  useEffect(() => {
    async function fetchSolicitudes() {
      try {
        const res = await fetch("/api/user/solicitudes", { cache: 'no-store' });
        const json = await res.json();
        if (json.success) setSolicitudes(json.data);
      } catch (error) {
        console.error("❌ Error loading solicitudes:", error);
      } finally {
        setIsLoading(false);
      }
    }

    if (session) fetchSolicitudes();

    const ctx = gsap.context(() => {
      gsap.fromTo(".fade-up-pqrs", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: "power2.out", delay: 0.1 });
    }, containerRef);
    return () => ctx.revert();
  }, [session, userId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.descripcion.trim()) return toast.warning("Debes describir el motivo");
    
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/user/solicitudes", {
        method: "POST",
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (json.success) {
        setSolicitudes([json.data, ...solicitudes]);
        setIsFormOpen(false);
        setFormData({ tipo: 'PETICION', categoria: 'OTRO', descripcion: '', urgente: false });
        toast.success("Solicitud radicada con éxito", {
          description: `Radicado #: ${json.data.id.slice(-6).toUpperCase()}`
        });
      }
    } catch {
      toast.error("Hubo un error al radicar la solicitud");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusLabel = (status: string) => {
    switch(status) {
      case 'COMPLETADA': return { text: "Resuelto", color: "text-emerald-400 bg-emerald-500/10" };
      case 'EN_PROGRESO': return { text: "En Proceso", color: "text-blue-400 bg-blue-500/10" };
      case 'ASIGNADA': return { text: "Asignado", color: "text-indigo-400 bg-indigo-500/10" };
      default: return { text: "Pendiente", color: "text-amber-400 bg-amber-500/10" };
    }
  };

  const stats = [
    { label: "Total", value: solicitudes.length, icon: <MessageSquare size={16} />, color: "text-white" },
    { label: "Abiertas", value: solicitudes.filter(s => s.estado !== 'COMPLETADA').length, icon: <Clock size={16} />, color: "text-amber-400" },
    { label: "Resueltas", value: solicitudes.filter(s => s.estado === 'COMPLETADA').length, icon: <CheckCircle2 size={16} />, color: "text-emerald-400" },
  ];

  return (
    <div ref={containerRef} className="min-h-screen flex flex-col p-6 pt-16 pb-32 overflow-x-hidden relative gap-6">
      <ProfileHeader className="fade-up-pqrs" />

      {/* STATS OVERVIEW */}
      <section className="fade-up-pqrs grid grid-cols-3 gap-4">
        {stats.map((stat, i) => (
          <div key={i} className="liquid-glass-card rounded-[24px] p-4 flex flex-col items-center gap-1 border border-white/5">
             <div className={`${stat.color} p-2 rounded-xl bg-white/5 mb-1`}>
                {stat.icon}
             </div>
             <span className="text-xl font-display font-bold text-white tracking-tight">{stat.value}</span>
             <span className="text-[8px] font-black uppercase tracking-widest text-white/30">{stat.label}</span>
          </div>
        ))}
      </section>

      {/* ACTION BUTTON */}
      <button 
        onClick={() => setIsFormOpen(true)}
        className="fade-up-pqrs group relative w-full h-[120px] rounded-[32px] overflow-hidden flex items-center justify-center transition-all active:scale-[0.98] shadow-2xl shadow-accent/20"
      >
         <div className="absolute inset-0 bg-linear-to-br from-[#1E1B4B] via-accent/20 to-[#4C1D95] group-hover:scale-105 transition-transform duration-700" />
         <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1557682250-33bd709cbe85?auto=format&fit=crop&q=80&w=1000')] bg-cover mix-blend-overlay opacity-30" />
         <div className="flex flex-col items-center gap-2 relative z-10">
            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-primary shadow-xl">
               <Plus size={24} />
            </div>
            <span className="text-white font-display font-bold text-sm tracking-tight">Radicar nueva PQRS</span>
         </div>
      </button>

      {/* LIST HEADER */}
      <div className="fade-up-pqrs flex justify-between items-end mt-4">
         <h3 className="text-white font-display text-lg font-bold tracking-tight">Tus Solicitudes</h3>
         <button className="text-white/30 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 hover:text-white transition-colors">
            Filtrar <ArrowRight size={10} />
         </button>
      </div>

      {/* PQRS LIST */}
      <section className="flex flex-col gap-4">
         {isLoading ? (
           <div className="py-20 flex flex-col items-center gap-4">
              <Loader2 className="w-10 h-10 text-accent animate-spin" />
              <p className="text-white/30 text-[10px] font-bold uppercase tracking-widest">Sincronizando radicados...</p>
           </div>
         ) : solicitudes.length === 0 ? (
           <div className="py-20 flex flex-col items-center gap-4 liquid-glass-card rounded-[32px] border border-white/5 p-10 text-center">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-white/20 mb-2">
                 <FileText size={32} />
              </div>
              <h4 className="text-white text-sm font-bold">Aún no tienes solicitudes</h4>
              <p className="text-white/40 text-xs px-6">Cuando radiques una PQRS aparecerá listada en esta sección para su seguimiento.</p>
           </div>
         ) : (
           solicitudes.map((s) => (
             <div key={s.id} className="fade-up-pqrs liquid-glass-card rounded-[32px] p-6 border border-white/5 flex flex-col gap-4 shadow-xl hover:border-white/10 transition-all cursor-pointer group">
                <div className="flex justify-between items-start">
                   <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-2xl ${TIPO_CONFIG[s.tipo as keyof typeof TIPO_CONFIG].bg} ${TIPO_CONFIG[s.tipo as keyof typeof TIPO_CONFIG].color}`}>
                         {TIPO_CONFIG[s.tipo as keyof typeof TIPO_CONFIG].icon}
                      </div>
                      <div>
                         <h4 className="text-white font-bold text-sm tracking-tight">{s.tipo}</h4>
                         <span className="text-[8px] font-black uppercase tracking-widest text-white/30">{s.categoria}</span>
                      </div>
                   </div>
                   <div className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border border-white/5 ${getStatusLabel(s.estado).color}`}>
                      {getStatusLabel(s.estado).text}
                   </div>
                </div>

                <p className="text-white/70 text-xs line-clamp-2 leading-relaxed">
                   {s.descripcion}
                </p>

                <div className="pt-4 mt-2 border-t border-white/5 flex justify-between items-center">
                   <div className="flex items-center gap-1.5">
                      <Calendar size={12} className="text-white/20" />
                      <span className="text-[10px] text-white/40 font-medium">{new Date(s.creadoEn).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                   </div>
                   <div className="flex items-center gap-2">
                      <span className="text-[8px] font-black uppercase tracking-widest text-white/20">ID: {s.id.slice(-6).toUpperCase()}</span>
                      {s.urgente && <span className="bg-red-500/20 text-red-400 text-[8px] font-black uppercase px-2 py-0.5 rounded-full">Urgente</span>}
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
           
           <div className="relative w-full max-w-sm liquid-glass-card rounded-t-[48px] sm:rounded-[48px] border border-white/10 shadow-2xl overflow-hidden">
              <form onSubmit={handleSubmit} className="p-8 flex flex-col gap-6">
                 <div className="flex justify-between items-center">
                    <div>
                       <h3 className="text-xl font-display font-bold text-white tracking-tight">Nueva PQRS</h3>
                       <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mt-1">Radicación oficial</p>
                    </div>
                    <button type="button" onClick={() => setIsFormOpen(false)} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white"><X size={20} /></button>
                 </div>

                 {/* TIPO PICKER */}
                 <div className="flex flex-col gap-3">
                    <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest px-2">Tipo de Solicitud</span>
                    <div className="grid grid-cols-2 gap-2">
                       {Object.entries(TIPO_CONFIG).map(([key, config]) => (
                         <button 
                           type="button"
                           key={key} 
                           onClick={() => setFormData({ ...formData, tipo: key, categoria: key === 'MANTENIMIENTO' ? 'ELECTRICIDAD' : 'OTRO' })}
                           className={`flex items-center gap-2 p-3 rounded-2xl border transition-all ${formData.tipo === key ? `${config.bg} border-${config.color.split('-')[1]}/40 ${config.color}` : 'bg-white/5 border-white/5 text-white/30'}`}
                         >
                            {config.icon}
                            <span className="text-[10px] font-bold uppercase tracking-widest">{key.slice(0, 8)}</span>
                         </button>
                       ))}
                    </div>
                 </div>

                 {/* DESCRIPTION */}
                 <div className="flex flex-col gap-3">
                    <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest px-2">Descripción del caso</span>
                    <div className="relative group">
                       <textarea 
                         value={formData.descripcion}
                         onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                         placeholder="Escribe aquí los detalles de tu solicitud..."
                         className="w-full bg-white/5 border border-white/5 rounded-3xl p-5 min-h-[140px] text-white text-sm focus:outline-none focus:border-accent/40 focus:ring-4 focus:ring-accent/5 transition-all outline-none resize-none"
                       />
                    </div>
                 </div>

                 {/* OPTIONS */}
                 <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
                    <div className="flex items-center gap-2 overflow-hidden">
                       <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/40">
                          <Camera size={16} />
                       </div>
                       <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Vincular Foto</span>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer group">
                       <span className={`text-[10px] font-bold uppercase transition-colors ${formData.urgente ? 'text-red-400' : 'text-white/30 group-hover:text-white/50'}`}>¡Urgente!</span>
                       <input 
                         type="checkbox" 
                         checked={formData.urgente} 
                         onChange={(e) => setFormData({ ...formData, urgente: e.target.checked })} 
                         className="w-5 h-5 accent-red-500 rounded-lg cursor-pointer" 
                       />
                    </label>
                 </div>

                 <button 
                   disabled={isSubmitting}
                   className="w-full bg-accent hover:brightness-110 py-5 rounded-[24px] font-bold text-white shadow-xl shadow-accent/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                 >
                   {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : (
                     <>Radicar Solicitud <SendHorizonal size={18} /></>
                   )}
                 </button>
              </form>
           </div>
        </div>
      )}

      {/* STYLE OVERRIDES */}
      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .liquid-glass { background: rgba(26, 11, 46, 0.6); backdrop-filter: blur(40px); }
      `}} />
    </div>
  );
}
