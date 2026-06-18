"use client";

import { useState, useEffect } from "react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { Users, Car, Eye, PlusCircle } from "lucide-react";
import { gsap } from "gsap";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api/client";
import { useRouter } from "next/navigation";
import { useWsSubscription } from "@/hooks/useWebSocket";

interface ResidenteDirectorio {
  id: string;
  nombre: string;
  torre: string | null;
  apto: string | null;
}

interface VisitaItem {
  nombre: string;
  tipo: string;
  placa: string | null;
  creadoEn: string;
  residente?: {
    torre: string | null;
    apto: string | null;
  } | null;
}

export default function ControlVisitas() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const role = user?.rol;

  const [visitas, setVisitas] = useState<VisitaItem[]>([]);
  const [residentes, setResidentes] = useState<ResidenteDirectorio[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [formData, setFormData] = useState({
    usuarioId: "",
    nombre: "",
    tipo: "PEATONAL",
    vehiculoTipo: "NINGUNO",
    placa: "",
    observacion: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refetchVisitas = async () => {
    try {
      const data = await api.get<VisitaItem[]>('/vigilancia/visitas');
      setVisitas(data);
    } catch {}
  };

  // Real-time WebSocket subscriptions
  useWsSubscription('visita', () => refetchVisitas());
  useWsSubscription('paquete', () => refetchVisitas());

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

    async function loadData() {
       try {
         const [visData, dirData] = await Promise.all([
           api.get<VisitaItem[]>('/vigilancia/visitas'),
           api.get<ResidenteDirectorio[]>('/directorio')
         ]);
         setVisitas(visData);
         setResidentes(dirData);
       } catch {
         toast.error("Error al cargar datos");
       } finally {
         setLoading(false);
       }
    }
    loadData();
  }, [user, authLoading, role, router]);

  useEffect(() => {
    if (!loading) {
      gsap.fromTo(".fade-up", { opacity: 0, y: 20 }, { opacity: 1, y: 0, stagger: 0.1, duration: 0.5 });
    }
  }, [loading]);

  const handleSubmit = async (e: React.FormEvent) => {
     e.preventDefault();
     if(isSubmitting) return;
     if(!formData.usuarioId) return toast.error("Selecciona un residente");

     setIsSubmitting(true);
     try {
       const newVisita = await api.post<VisitaItem>('/vigilancia/visitas', formData);
       toast.success("Visita registrada exitosamente");
       setVisitas([newVisita, ...visitas]);
       setFormData({...formData, nombre: "", placa: "", observacion: ""});
     } catch {
       toast.error("Error de conexión");
     } finally {
       setIsSubmitting(false);
     }
  };

  if(loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" /></div>;

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
       <ProfileHeader />
       
       <div className="fade-up liquid-glass rounded-3xl p-6 border border-border shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
             <div className="w-12 h-12 rounded-2xl bg-accent/20 border border-accent/30 flex items-center justify-center text-accent">
                <Users size={24} />
             </div>
             <div>
               <h2 className="text-xl font-bold text-text">Ingreso Visitas</h2>
               <p className="text-xs text-text">Control peatonal y vehicular</p>
             </div>
          </div>
          
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
             <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1">Residente Destino</label>
                <select 
                   value={formData.usuarioId} 
                   onChange={e => setFormData({...formData, usuarioId: e.target.value})}
                   className="w-full bg-primary-light/50 border border-border rounded-2xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent transition-all"
                >
                   <option value="">Seleccione residente...</option>
                   {residentes.map(r => (
                     <option key={r.id} value={r.id} className="bg-primary text-text">
                       {r.torre && r.apto ? `Torre ${r.torre} - Apto ${r.apto}` : "Sin unidad"} ({r.nombre})
                     </option>
                   ))}
                </select>
             </div>
             
             <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1">Ocupante Principal</label>
                <input 
                   required
                   type="text" 
                   placeholder="Nombre del visitante" 
                   value={formData.nombre}
                   onChange={e => setFormData({...formData, nombre: e.target.value})}
                   className="w-full bg-primary-light/50 border border-border rounded-2xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent transition-all" 
                />
             </div>

             <div className="flex gap-4">
                <div className="flex-1 flex flex-col gap-1.5">
                   <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1">Tipo de Ingreso</label>
                   <select 
                      value={formData.tipo}
                      onChange={e => setFormData({...formData, tipo: e.target.value, vehiculoTipo: e.target.value === 'PEATONAL' ? 'NINGUNO' : formData.vehiculoTipo})}
                      className="w-full bg-primary-light/50 border border-border rounded-2xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent transition-all"
                   >
                      <option value="PEATONAL" className="bg-primary text-text">Peatonal</option>
                      <option value="VEHICULAR" className="bg-primary text-text">Vehicular</option>
                   </select>
                </div>
                {formData.tipo === 'VEHICULAR' && (
                  <div className="flex-1 flex flex-col gap-1.5">
                     <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1">Placa</label>
                     <input 
                        required
                        type="text" 
                        placeholder="ABC-123" 
                        value={formData.placa}
                        onChange={e => setFormData({...formData, placa: e.target.value.toUpperCase()})}
                        className="w-full bg-primary-light/50 border border-border rounded-2xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent uppercase transition-all" 
                     />
                  </div>
                )}
             </div>

             <button type="submit" disabled={isSubmitting} className="mt-2 w-full py-4 bg-accent hover:bg-accent/80 transition-colors rounded-2xl font-bold text-primary shadow-[0_0_20px_rgba(0,0,0,0.3)] flex justify-center items-center gap-2">
                {isSubmitting ? "Registrando..." : <><PlusCircle size={18}/> Registrar Ingreso</>}
             </button>
          </form>
       </div>

       {/* Bitácora de Hoy */}
       <div className="fade-up flex flex-col gap-4">
          <h3 className="text-sm font-bold text-text uppercase tracking-widest ml-2 flex items-center gap-2"><Eye size={16} className="text-accent"/> Bitácora Reciente</h3>
          {visitas.length === 0 && <p className="text-text text-sm text-center py-6">No hay visitas registradas hoy.</p>}
          {visitas.map((v, i) => (
             <div key={i} className="liquid-glass p-4 rounded-3xl border border-border/50 flex flex-col gap-3">
                <div className="flex justify-between items-start">
                   <div>
                     <p className="text-text font-bold">{v.nombre}</p>
                     <p className="text-text text-xs">Visita a: {v.residente?.torre} - {v.residente?.apto}</p>
                   </div>
                   <div className="bg-text/5 px-3 py-1 rounded-full border border-border text-[10px] font-bold text-text">
                      {new Date(v.creadoEn).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                   </div>
                </div>
                <div className="flex bg-surface/50 p-2 rounded-xl gap-4 items-center border border-border/30">
                   <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest ${v.tipo === 'VEHICULAR' ? 'text-text' : 'text-accent'}`}>
                      {v.tipo === 'VEHICULAR' ? <Car size={14}/> : <Users size={14}/>} {v.tipo}
                   </div>
                   {v.placa && <div className="text-xs text-text bg-text/5 px-2 py-0.5 rounded border border-border font-mono tracking-widest">{v.placa}</div>}
                </div>
             </div>
          ))}
       </div>
    </div>
  );
}
