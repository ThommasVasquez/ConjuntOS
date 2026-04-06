"use client";

import { useState, useEffect, useRef } from "react";
import { 
  Car, Bike, Plus, Info, ChevronRight, 
  MapPin, ShieldCheck, Clock, ArrowRight,
  Settings, X
} from "lucide-react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { gsap } from "gsap";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface Vehiculo {
  id: string;
  placa: string;
  marca: string;
  modelo?: string;
  color?: string;
  tipo: "CARRO" | "MOTO";
}

interface Celda {
  id: string;
  numero: string;
  torre?: string;
  tipo: string;
  estado: string;
}

export default function ParqueaderoPage() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [misCeldas, setMisCeldas] = useState<Celda[]>([]);
  const [disponibilidad, setDisponibilidad] = useState({ total: 0, libres: 0, ocupadas: 0 });
  const [isLoading, setIsLoading] = useState(true);

  // Modal y Forms
  const [showVehiculoModal, setShowVehiculoModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [vehiculoForm, setVehiculoForm] = useState({ placa: '', marca: '', modelo: '', color: '', tipo: 'AUTOMOVIL' });

  const submitVehiculo = async () => {
     if(!vehiculoForm.placa || !vehiculoForm.marca) {
         return toast.error("Llena placa y marca al menos");
     }
     setIsSubmitting(true);
     try {
       const res = await fetch('/api/tramites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tipo: 'VEHICULO', descripcion: vehiculoForm })
       });
       const data = await res.json();
       if(data.success){
           toast.success("Solicitud enviada. Pendiente de aprobación.");
           setShowVehiculoModal(false);
           setVehiculoForm({ placa: '', marca: '', modelo: '', color: '', tipo: 'AUTOMOVIL' });
       } else {
           console.error("DEBUG_TRAMITE_ERROR", data);
           toast.error(data.error || "No se pudo enviar");
       }
     } catch (err) {
       console.error("CONN_ERROR", err);
       toast.error("Error de conexión");
     } finally {
       setIsSubmitting(false);
     }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/user/parqueadero");
        const data = await res.json();
        if (data.success) {
          setVehiculos(data.data.vehiculos || []);
          setMisCeldas(data.data.misCeldas || []);
          setDisponibilidad(data.data.disponibilidadVisitantes || { total: 0, libres: 0, ocupadas: 0 });
        }
      } catch (error) {
        console.error("Error fetching parking data", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();

    const ctx = gsap.context(() => {
      gsap.fromTo(".fade-up", 
        { opacity: 0, y: 30 }, 
        { opacity: 1, y: 0, duration: 0.8, stagger: 0.1, ease: "power3.out" }
      );
    }, containerRef);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="min-h-screen flex flex-col p-6 pt-16 pb-40 overflow-x-hidden relative gap-8">
      <ProfileHeader className="fade-up" />

      {/* STATUS OVERVIEW */}
      <section className="fade-up w-full grid grid-cols-2 gap-4">
        <div className="liquid-glass-card rounded-[32px] p-5 border border-white/10 flex flex-col gap-3 group hover:bg-white/10 transition-all duration-300">
          <div className="flex justify-between items-center">
            <div className="p-2.5 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-400 group-hover:scale-110 transition-transform">
              <Car size={18} />
            </div>
            <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest bg-emerald-400/10 px-2.5 py-1 rounded-full border border-emerald-400/20">Mis Celdas</span>
          </div>
          <div>
            <h3 className="text-2xl font-display font-bold text-white tracking-tight">{misCeldas[0]?.numero || 'N/A'}</h3>
            <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Torre {misCeldas[0]?.torre || '1'}</p>
          </div>
        </div>

        <div className="liquid-glass-card rounded-[32px] p-5 border border-white/10 flex flex-col gap-3 group hover:bg-white/10 transition-all duration-300">
          <div className="flex justify-between items-center">
            <div className="p-2.5 rounded-full bg-accent/20 border border-accent/40 text-accent group-hover:scale-110 transition-transform">
              <MapPin size={18} />
            </div>
            <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border border-white/10">Visitantes</span>
          </div>
          <div>
            <h3 className="text-2xl font-display font-bold text-white tracking-tight">{disponibilidad.libres} / {disponibilidad.total}</h3>
            <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Disponibles</p>
          </div>
        </div>
      </section>

      {/* MY VEHICLES */}
      <section className="fade-up flex flex-col gap-5">
        <div className="flex justify-between items-end px-1">
          <h2 className="text-xl font-display font-bold text-white tracking-tight">Mis Vehículos</h2>
          <button 
            onClick={() => toast.info("Módulo de registro disponible próximamente")}
            className="w-10 h-10 rounded-full liquid-glass border border-white/10 flex items-center justify-center text-accent hover:scale-110 transition-all active:scale-95 shadow-lg"
          >
            <Plus size={20} strokeWidth={3} />
          </button>
        </div>

        <div className="flex gap-4 overflow-x-auto -mx-6 px-6 hide-scrollbar py-2">
          {isLoading ? (
            [1, 2].map(i => (
              <div key={i} className="w-[280px] h-[160px] rounded-[32px] bg-white/5 animate-pulse shrink-0 border border-white/5" />
            ))
          ) : vehiculos.length > 0 ? (
            vehiculos.map((v) => (
              <div key={v.id} className="w-[280px] shrink-0 liquid-glass-card rounded-[40px] p-6 border border-white/10 relative overflow-hidden group">
                 <div className="absolute -right-4 -top-4 w-32 h-32 bg-accent/10 rounded-full blur-2xl group-hover:bg-accent/20 transition-all duration-700" />
                 
                 <div className="flex justify-between items-start mb-6">
                    <div className={`p-3 rounded-2xl bg-linear-to-br ${v.tipo === 'CARRO' ? 'from-blue-500/20 to-indigo-600/20 text-blue-400' : 'from-orange-500/20 to-amber-600/20 text-orange-400'} border border-white/5`}>
                      {v.tipo === 'CARRO' ? <Car size={24} /> : <Bike size={24} />}
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] text-white/30 font-black uppercase tracking-[0.2em]">Placa</span>
                      <span className="text-xl font-display font-bold text-white tracking-widest">{v.placa}</span>
                    </div>
                 </div>

                 <div className="flex flex-col gap-1">
                    <h4 className="text-lg font-bold text-white tracking-tight">{v.marca}</h4>
                    <p className="text-xs text-white/40">{v.modelo} • {v.color}</p>
                 </div>
              </div>
            ))
          ) : (
            <div className="w-full liquid-glass-card rounded-[32px] p-10 border border-dashed border-white/10 flex flex-col items-center justify-center text-center gap-4">
               <Car size={40} className="text-white/10" />
               <p className="text-white/40 text-sm font-medium">No tienes vehículos registrados.</p>
               <button className="text-accent text-xs font-bold uppercase tracking-widest hover:underline">Registrar ahora</button>
            </div>
          )}
        </div>
      </section>

      {/* QUICK ACTIONS */}
      <section className="fade-up flex flex-col gap-4">
        <h2 className="text-lg font-display font-bold text-white px-1 tracking-tight">Acciones Rápidas</h2>
        
        <div className="flex flex-col gap-3">
          <button 
            onClick={() => setShowVehiculoModal(true)}
            className="w-full liquid-glass-card rounded-3xl p-4 border border-white/5 flex items-center gap-4 hover:bg-white/10 transition-all active:scale-[0.99] group overflow-hidden"
          >
            <div className={`p-3 rounded-2xl bg-white/5 border border-white/10 text-emerald-400 group-hover:scale-110 transition-transform`}>
              <ShieldCheck size={20} />
            </div>
            <div className="flex-1 text-left">
              <h4 className="text-sm font-bold text-white leading-none mb-1.5">Registrar Nuevo Vehículo</h4>
              <p className="text-[11px] text-white/40">Notificar a portería</p>
            </div>
            <ChevronRight size={16} className="text-white/20 group-hover:text-white transition-colors" />
          </button>

          {[
            { icon: Clock, title: "Historial de Accesos", sub: "Ver registros de entrada y salida", color: "text-blue-400" },
            { icon: Settings, title: "Configuración", sub: "Preferencias de notificaciones y tags", color: "text-purple-400" }
          ].map((item, idx) => (
            <button 
              key={idx}
              className="w-full liquid-glass-card rounded-3xl p-4 border border-white/5 flex items-center gap-4 hover:bg-white/10 transition-all active:scale-[0.99] group overflow-hidden"
            >
              <div className={`p-3 rounded-2xl bg-white/5 border border-white/10 ${item.color} group-hover:scale-110 transition-transform`}>
                <item.icon size={20} />
              </div>
              <div className="flex-1 text-left">
                <h4 className="text-sm font-bold text-white leading-none mb-1.5">{item.title}</h4>
                <p className="text-[11px] text-white/40">{item.sub}</p>
              </div>
              <ChevronRight size={16} className="text-white/20 group-hover:text-white transition-colors" />
            </button>
          ))}
        </div>
      </section>

      {/* RULES & INFO */}
      <section className="fade-up liquid-glass-card rounded-[40px] p-8 border border-white/10 relative overflow-hidden mt-2">
        <div className="absolute right-0 top-0 w-full h-full bg-linear-to-br from-accent/5 to-transparent pointer-events-none" />
        
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center border border-accent/30">
            <Info size={18} className="text-accent shadow-[0_0_10px_rgba(217,70,239,0.5)]" />
          </div>
          <div>
            <h3 className="text-lg font-display font-bold text-white tracking-tight">Reglamento</h3>
            <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest">Normas de convivencia</p>
          </div>
        </div>

        <ul className="flex flex-col gap-4 mb-8">
          {[
            "Velocidad máxima de 10 km/h en sótanos.",
            "Uso obligatorio de luces encendidas.",
            "Multas por mal parqueo después del 3er aviso.",
            "Parqueadero de visitantes limitado a 12h."
          ].map((rule, i) => (
            <li key={i} className="flex gap-4 items-start group">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent/40 group-hover:bg-accent transition-colors" />
              <span className="text-sm text-white/60 leading-relaxed group-hover:text-white/80 transition-colors">{rule}</span>
            </li>
          ))}
        </ul>

        <button 
          onClick={() => router.push('/citofonia?tab=VISITAS')}
          className="w-full bg-linear-to-r from-accent to-purple-600 rounded-2xl py-4 flex items-center justify-center gap-3 text-sm font-bold text-white hover:scale-[1.02] active:scale-95 transition-all shadow-[0_10px_25px_rgba(217,70,239,0.3)]"
        >
          Pedir Parqueo para Visita <ArrowRight size={18} />
        </button>
      </section>

      {/* MODAL NUEVO VEHICULO */}
      {showVehiculoModal && (
        <div className="fixed inset-0 z-100 flex items-end sm:items-center justify-center px-0 sm:px-4 pb-0 sm:pb-20 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowVehiculoModal(false)} />
          <div className="liquid-glass rounded-t-[32px] sm:rounded-[32px] w-full max-w-[430px] p-6 pb-12 sm:pb-6 relative z-10 shadow-[0_-20px_50px_rgba(0,0,0,0.5)] animate-in slide-in-from-bottom-full duration-300">
            <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
               <div>
                   <h3 className="text-xl font-display font-semibold text-white tracking-wide">Añadir Vehículo</h3>
                   <p className="text-xs text-white/50 mt-1">Registrar para acceso vehicular</p>
               </div>
               <button onClick={() => setShowVehiculoModal(false)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 transition-all">
                  <X size={16} />
               </button>
            </div>
            
            <div className="flex flex-col gap-4">
                <input type="text" placeholder="Placa (ej. XYZ-123)" value={vehiculoForm.placa} onChange={(e) => setVehiculoForm({...vehiculoForm, placa: e.target.value})} className="w-full bg-black/30 border border-white/10 rounded-2xl px-4 py-3.5 text-white outline-none focus:border-accent uppercase" />
                <div className="grid grid-cols-2 gap-4">
                  <input type="text" placeholder="Marca (BMW)" value={vehiculoForm.marca} onChange={(e) => setVehiculoForm({...vehiculoForm, marca: e.target.value})} className="w-full bg-black/30 border border-white/10 rounded-2xl px-4 py-3.5 text-white outline-none focus:border-accent" />
                  <input type="text" placeholder="Gris Claro" value={vehiculoForm.color} onChange={(e) => setVehiculoForm({...vehiculoForm, color: e.target.value})} className="w-full bg-black/30 border border-white/10 rounded-2xl px-4 py-3.5 text-white outline-none focus:border-accent" />
                </div>
                <select value={vehiculoForm.tipo} onChange={(e) => setVehiculoForm({...vehiculoForm, tipo: e.target.value})} className="w-full bg-black/30 border border-white/10 rounded-2xl px-4 py-3.5 text-white outline-none focus:border-accent">
                    <option value="AUTOMOVIL">Automóvil</option>
                    <option value="MOTO">Motocicleta</option>
                    <option value="BICICLETA">Bicicleta / Patineta</option>
                </select>
                
                <button disabled={isSubmitting} onClick={submitVehiculo} className="w-full mt-2 bg-linear-to-r from-emerald-500 to-teal-500 rounded-2xl py-4 flex items-center justify-center gap-3 font-bold text-white shadow-xl active:scale-95 transition-transform disabled:opacity-50">
                    <ShieldCheck size={20} /> {isSubmitting ? 'Enviando...' : 'Pedir Aprobación'}
                </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
