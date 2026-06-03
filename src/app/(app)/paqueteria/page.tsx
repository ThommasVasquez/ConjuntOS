"use client";

import { useState, useEffect } from "react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { Package, CheckCircle2, ScanLine, Clock, MapPin } from "lucide-react";
import { gsap } from "gsap";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function PaqueteriaPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = (session?.user as any)?.role;

  const [paquetes, setPaquetes] = useState<any[]>([]);
  const [residentes, setResidentes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [formData, setFormData] = useState({
    usuarioId: "",
    remitente: "",
    descripcion: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      router.push("/login");
      return;
    }

    const allowed = ['VIGILANTE', 'SUPERVISOR_VIGILANCIA', 'ADMINISTRADOR', 'SUPER_ADMIN'];
    if (!allowed.includes(role)) {
      toast.error("No tienes permisos para acceder a esta sección.");
      router.push("/inicio");
      return;
    }

    async function loadData() {
       try {
         const [paqRes, dirRes] = await Promise.all([
           fetch('/api/vigilancia/paquetes'),
           fetch('/api/user/directory')
         ]);
         const [paqData, dirData] = await Promise.all([paqRes.json(), dirRes.json()]);
         
         if(paqData.success) {
            setPaquetes(paqData.data);
         }
         if(dirData.success) {
            setResidentes(dirData.data);
         }
       } catch (e) {
         toast.error("Error al cargar datos");
       } finally {
         setLoading(false);
       }
    }
    loadData();
  }, [session, status, role, router]);

  useEffect(() => {
    if (!loading) {
      gsap.fromTo(".fade-up", { opacity: 0, y: 20 }, { opacity: 1, y: 0, stagger: 0.1, duration: 0.5 });
    }
  }, [loading]);

  const handleSubmit = async (e: React.FormEvent) => {
     e.preventDefault();
     if(isSubmitting) return;
     if(!formData.usuarioId) return toast.error("Selecciona un residente destino");

     setIsSubmitting(true);
     try {
       const res = await fetch('/api/vigilancia/paquetes', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(formData)
       });
       const data = await res.json();
       if(data.success) {
          toast.success("Paquete registrado y Residente notificado");
          // Re-fetch to get the full joined object safely instead of manual push
          const res2 = await fetch('/api/vigilancia/paquetes');
          const data2 = await res2.json();
          setPaquetes(data2.data);
          setFormData({usuarioId: "", remitente: "", descripcion: ""});
       } else {
          toast.error("Error al registrar");
       }
     } catch {
       toast.error("Error de conexión");
     } finally {
       setIsSubmitting(false);
     }
  };

  const markAsDelivered = async (id: string) => {
    try {
      const res = await fetch('/api/vigilancia/paquetes', {
         method: 'PUT',
         headers: {'Content-Type': 'application/json'},
         body: JSON.stringify({ paqueteId: id })
      });
      const data = await res.json();
      if(data.success) {
         toast.success("Entrega confirmada");
         setPaquetes(paquetes.filter(p => p.id !== id));
      } else {
         toast.error("Hubo un error del servidor");
      }
    } catch {
      toast.error("Error de red");
    }
  };

  if(loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" /></div>;

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
       <ProfileHeader />
       
       <div className="fade-up liquid-glass rounded-3xl p-6 border border-border shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
             <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <ScanLine size={24} />
             </div>
             <div>
                <h2 className="text-xl font-bold text-text">Recepción de Envíos</h2>
                <p className="text-xs text-text/70">Mensajería y domicilios</p>
             </div>
          </div>
          
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
             <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest pl-1">Destinatario</label>
                <select 
                   value={formData.usuarioId} 
                   onChange={e => setFormData({...formData, usuarioId: e.target.value})}
                   className="w-full bg-surface-2 border border-border rounded-2xl py-3 px-4 text-sm text-text focus:outline-none focus:border-emerald-500"
                >
                   <option value="" className="bg-primary text-text">Seleccione apartamento/residente...</option>
                   {residentes.map(r => (
                     <option key={r.id} value={r.id} className="bg-primary text-text">{r.unidad.torre} - Apto {r.unidad.numero} ({r.nombre})</option>
                   ))}
                </select>
             </div>

             <div className="flex gap-4">
                  <div className="flex-1 flex flex-col gap-1.5">
                     <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest pl-1">Empresa / Remitente</label>
                     <input 
                        required
                        type="text" 
                        placeholder="Amazon, Rappi..." 
                        value={formData.remitente}
                        onChange={e => setFormData({...formData, remitente: e.target.value})}
                        className="w-full bg-surface-2 border border-border rounded-2xl py-3 px-4 text-sm text-text focus:outline-none focus:border-emerald-500" 
                     />
                  </div>
             </div>

             <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest pl-1">Descripción Rápida</label>
                <input 
                   required
                   type="text" 
                   placeholder="Caja mediana, Documento..." 
                   value={formData.descripcion}
                   onChange={e => setFormData({...formData, descripcion: e.target.value})}
                   className="w-full bg-surface-2 border border-border rounded-2xl py-3 px-4 text-sm text-text focus:outline-none focus:border-emerald-500" 
                />
             </div>

             <button type="submit" disabled={isSubmitting} className="mt-2 w-full py-4 bg-emerald-500 hover:bg-emerald-400 transition-colors rounded-2xl font-bold text-black shadow-[0_0_20px_rgba(16,185,129,0.3)] flex justify-center items-center gap-2">
                {isSubmitting ? "Registrando..." : <><Package size={18}/> Clasificar Envío</>}
             </button>
          </form>
       </div>

       {/* Inventario Portería */}
       <div className="fade-up flex flex-col gap-4">
          <div className="flex justify-between items-center ml-2">
             <h3 className="text-sm font-bold text-text uppercase tracking-widest flex items-center gap-2"><Clock size={16} className="text-emerald-400"/> Inventario Portería</h3>
             <span className="bg-surface-2 text-text/75 text-[10px] px-2 py-0.5 rounded-full font-bold">{paquetes.length} ÍTEMS</span>
          </div>
          
          {paquetes.length === 0 && <p className="text-text/60 text-sm text-center py-6">Portería libre de paquetes.</p>}
          
          {paquetes.map((p, i) => (
             <div key={i} className="liquid-glass-card p-5 rounded-3xl border border-border flex flex-col gap-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none translate-x-1/2 -translate-y-1/2"></div>
                
                <div className="flex justify-between items-start relative z-10">
                   <div>
                     <p className="text-text font-bold text-lg leading-tight">{p.descripcion}</p>
                     <p className="text-emerald-700 dark:text-emerald-400 font-bold text-[10px] tracking-widest uppercase">{p.remitente}</p>
                   </div>
                   <div className="bg-surface-2 px-3 py-1 rounded-full border border-border text-[10px] font-bold text-text/75">
                      Hace {Math.floor((new Date().getTime() - new Date(p.fechaLlegada).getTime()) / 60000)} min
                   </div>
                </div>
                <div className="flex items-center gap-2 text-text/75 text-xs font-semibold relative z-10">
                   <MapPin size={14} /> {p.usuario?.unidad?.torre} - Apto {p.usuario?.unidad?.numero} ({p.usuario?.nombre})
                </div>
                <button onClick={() => markAsDelivered(p.id)} className="w-full mt-2 py-3 bg-surface-2 border border-border hover:bg-emerald-500/10 dark:hover:bg-emerald-500/20 hover:border-emerald-500/40 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all rounded-xl font-bold flex items-center justify-center gap-2 text-xs uppercase tracking-widest relative z-10 text-text">
                   <CheckCircle2 size={16} /> Marcar como Entregado
                </button>
             </div>
          ))}
       </div>
    </div>
  );
}
