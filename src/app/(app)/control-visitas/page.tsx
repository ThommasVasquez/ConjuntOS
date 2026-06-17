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
  usuario?: {
    unidad?: {
      torre: string | null;
      numero: string | null;
    } | null;
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
    observacion: "",
    documento: "",
    categoria: "VISITA"
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
=======
       const res = await fetch('/api/vigilancia/visitas', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(formData)
       });
       const data = await res.json();
       if(data.success) {
          toast.success("Visita registrada exitosamente");
          // Re-fetch visitas to ensure complete data and relation enrichment
          const visRes = await fetch('/api/vigilancia/visitas');
          const visData = await visRes.json();
          if (visData.success) {
            setVisitas(visData.data);
          } else {
            setVisitas([data.data, ...visitas]);
          }
          setFormData({
            usuarioId: "",
            nombre: "",
            tipo: "PEATONAL",
            vehiculoTipo: "NINGUNO",
            placa: "",
            observacion: "",
            documento: "",
            categoria: "VISITA"
          });
       } else {
          toast.error("Error al registrar");
       }
>>>>>>> Stashed changes
     } catch {
       toast.error("Error de conexión");
     } finally {
       setIsSubmitting(false);
     }
  };

  const handleCheckout = async (visitaId: string) => {
    try {
      const res = await fetch('/api/vigilancia/visitas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitaId })
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Salida registrada exitosamente");
        setVisitas(prev => prev.map(v => v.id === visitaId ? { ...v, fechaSalida: data.data.fechaSalida } : v));
      } else {
        toast.error("Error al registrar salida");
      }
    } catch {
      toast.error("Error de conexión");
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
<<<<<<< Updated upstream
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
=======
                    <option value="">Seleccione residente...</option>
                    {residentes.map(r => {
                      const torre = r.unidad?.torre || r.torre;
                      const numero = r.unidad?.numero || r.numero;
                      const torreLabel = torre ? `Torre ${torre}` : "Sin Torre";
                      const aptoLabel = numero ? `Apto ${numero}` : "Sin Apto";
                      return (
                        <option key={r.id} value={r.id} className="bg-primary text-text">
                          {torreLabel} - {aptoLabel} ({r.nombre})
                        </option>
                      );
                    })}
                </select>
             </div>
             
             <div className="flex gap-4">
                <div className="flex-1 flex flex-col gap-1.5">
                   <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest pl-1">Ocupante Principal</label>
                   <input 
                      required
                      type="text" 
                      placeholder="Nombre del visitante" 
                      value={formData.nombre}
                      onChange={e => setFormData({...formData, nombre: e.target.value})}
                      className="w-full bg-primary-light/50 border border-border rounded-2xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent transition-all" 
                   />
                </div>
                <div className="flex-1 flex flex-col gap-1.5">
                   <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest pl-1">Documento Identidad</label>
                   <input 
                      type="text" 
                      placeholder="C.C. / Pasaporte" 
                      value={formData.documento}
                      onChange={e => setFormData({...formData, documento: e.target.value})}
                      className="w-full bg-primary-light/50 border border-border rounded-2xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent transition-all" 
                   />
                </div>
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
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
=======
                <div className="flex-1 flex flex-col gap-1.5">
                   <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest pl-1">Categoría</label>
                   <select 
                      value={formData.categoria}
                      onChange={e => setFormData({...formData, categoria: e.target.value})}
                      className="w-full bg-primary-light/50 border border-border rounded-2xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent transition-all"
                   >
                      <option value="VISITA" className="bg-primary text-text">Visita</option>
                      <option value="DELIVERY" className="bg-primary text-text">Domicilio / Delivery</option>
                      <option value="CONTRATISTA" className="bg-primary text-text">Contratista</option>
                      <option value="PROVEEDOR" className="bg-primary text-text">Proveedor</option>
                   </select>
                </div>
             </div>

             {formData.tipo === 'VEHICULAR' && (
               <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest pl-1">Placa Vehículo</label>
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

             <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text/60 font-bold uppercase tracking-widest pl-1">Observaciones</label>
                <input 
                   type="text" 
                   placeholder="Ej: Entrega de llaves, Reparaciones de gas, etc." 
                   value={formData.observacion}
                   onChange={e => setFormData({...formData, observacion: e.target.value})}
                   className="w-full bg-primary-light/50 border border-border rounded-2xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent transition-all" 
                />
             </div>

             <button type="submit" disabled={isSubmitting} className="mt-2 w-full py-4 bg-accent hover:bg-accent/80 transition-colors rounded-2xl font-bold text-primary shadow-[0_0_20px_rgba(217,70,239,0.3)] flex justify-center items-center gap-2 cursor-pointer">
>>>>>>> Stashed changes
                {isSubmitting ? "Registrando..." : <><PlusCircle size={18}/> Registrar Ingreso</>}
             </button>
          </form>
       </div>

       {/* Bitácora de Hoy */}
       <div className="fade-up flex flex-col gap-4">
          <h3 className="text-sm font-bold text-text uppercase tracking-widest ml-2 flex items-center gap-2"><Eye size={16} className="text-accent"/> Bitácora Reciente</h3>
<<<<<<< Updated upstream
          {visitas.length === 0 && <p className="text-text text-sm text-center py-6">No hay visitas registradas hoy.</p>}
          {visitas.map((v, i) => (
             <div key={i} className="liquid-glass p-4 rounded-3xl border border-border/50 flex flex-col gap-3">
                <div className="flex justify-between items-start">
                   <div>
                     <p className="text-text font-bold">{v.nombre}</p>
                     <p className="text-text text-xs">Visita a: {v.usuario?.unidad?.torre} - {v.usuario?.unidad?.numero}</p>
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
=======
          {visitas.length === 0 && <p className="text-text/60 text-sm text-center py-6">No hay visitas registradas hoy.</p>}
          <div className="flex flex-col gap-4">
            {visitas.map((v, i) => (
               <div key={i} className="liquid-glass p-5 rounded-3xl border border-border/50 flex flex-col gap-3 shadow-md">
                  <div className="flex justify-between items-start">
                     <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-text font-bold leading-tight">{v.nombre}</p>
                          <span className="bg-primary border border-border text-text/60 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded">
                            {v.categoria || 'VISITA'}
                          </span>
                        </div>
                        <p className="text-text/60 text-xs">
                          Destino: {v.usuario?.unidad?.torre || v.usuario?.torre || "Torre 1"} - {v.usuario?.unidad?.numero || v.usuario?.apto || v.usuario?.numero || "502"}
                        </p>
                        {v.documento && (
                          <p className="text-[10px] text-text/50 mt-1">Doc: {v.documento}</p>
                        )}
                        {v.observacion && (
                          <p className="text-xs text-text/60 italic mt-1 font-sans">"{v.observacion}"</p>
                        )}
                     </div>
                     <div className="flex flex-col items-end gap-1.5">
                       <div className="bg-text/5 px-3 py-1 rounded-full border border-border text-[10px] font-bold text-text/60">
                          Entrada: {new Date(v.creadoEn).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                       </div>
                       {v.fechaSalida ? (
                         <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-[10px] font-bold">
                           Salida: {new Date(v.fechaSalida).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                         </div>
                       ) : (
                         <button
                           onClick={() => handleCheckout(v.id)}
                           className="bg-emerald-500 hover:bg-emerald-600 text-black px-3.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all"
                         >
                           Marcar Salida
                         </button>
                       )}
                     </div>
                  </div>
                  <div className="flex bg-surface/50 p-2 rounded-xl gap-4 items-center border border-border/30">
                     <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest ${v.tipo === 'VEHICULAR' ? 'text-emerald-400' : 'text-accent'}`}>
                        {v.tipo === 'VEHICULAR' ? <Car size={14}/> : <Users size={14}/>} {v.tipo}
                     </div>
                     {v.placa && <div className="text-xs text-text/70 bg-text/5 px-2 py-0.5 rounded border border-border font-mono tracking-widest">{v.placa}</div>}
                  </div>
               </div>
            ))}
          </div>
>>>>>>> Stashed changes
       </div>
    </div>
  );
}
