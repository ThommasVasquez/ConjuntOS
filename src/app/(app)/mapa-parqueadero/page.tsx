"use client";

import { useState, useEffect } from "react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { Map, Car, ShieldCheck, HelpCircle } from "lucide-react";
import { gsap } from "gsap";
import { toast } from "sonner";

export default function MapaParqueaderoPage() {
  const [parqueaderos, setParqueaderos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const res = await fetch('/api/parqueadero/mapa');
      const data = await res.json();
      if(data.success) {
         setParqueaderos(data.data);
      }
    } catch (e) {
      toast.error("Error al cargar mapa");
    } finally {
      setLoading(false);
      gsap.fromTo(".fade-up", { opacity: 0, scale: 0.95 }, { opacity: 1, scale: 1, stagger: 0.05, duration: 0.4 });
    }
  }

  const toggleEstado = async (id: string, currentEstado: string) => {
    // Only toggle logic for VISITOR parking to avoid messing up Resident assignments, 
    // but for demo we will allow toggling any.
    const newEstado = currentEstado === 'DISPONIBLE' ? 'OCUPADO' : 'DISPONIBLE';
    
    // Optimistic UI update
    setParqueaderos(prev => prev.map(p => p.id === id ? { ...p, estado: newEstado } : p));
    toast.success(`Cambiado a ${newEstado}`);

    try {
      await fetch('/api/parqueadero/mapa', {
         method: 'PUT',
         headers: {'Content-Type': 'application/json'},
         body: JSON.stringify({ parqueaderoId: id, estado: newEstado })
      });
    } catch {
      toast.error("Error de red");
      loadData(); // revert
    }
  };

  if(loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-white/20 border-t-accent rounded-full animate-spin" /></div>;

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
       <ProfileHeader />
       
       <div className="liquid-glass rounded-3xl p-6 border border-white/10 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
             <div className="w-12 h-12 rounded-2xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <Map size={24} />
             </div>
             <div>
               <h2 className="text-xl font-bold text-white">Mapa Interactivo</h2>
               <p className="text-xs text-white/50">Celdas de estacionamiento</p>
             </div>
          </div>

          {/* Leyenda */}
          <div className="flex gap-4 mb-6 pt-2 pb-4 border-b border-white/5 overflow-x-auto hide-scrollbar">
             <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-white/20 border border-white/40"></div><span className="text-[10px] text-white/50 uppercase font-bold tracking-widest">Disponible</span></div>
             <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-accent/20 border border-accent"></div><span className="text-[10px] text-white/50 uppercase font-bold tracking-widest">Ocupado</span></div>
             <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500/20 border border-blue-500"></div><span className="text-[10px] text-white/50 uppercase font-bold tracking-widest">Reservado</span></div>
          </div>
          
          {parqueaderos.length === 0 && <p className="text-white/30 text-sm text-center py-6">No hay celdas registradas.</p>}
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
             {parqueaderos.map((p) => {
                const isLibre = p.estado === 'DISPONIBLE';
                const isResident = p.tipo === 'RESIDENTE';

                return (
                  <button 
                    key={p.id}
                    onClick={() => toggleEstado(p.id, p.estado)}
                    className={`fade-up relative flex flex-col items-center justify-center gap-2 py-6 rounded-2xl border transition-all
                      ${isLibre ? 'bg-white/5 border-white/10 hover:bg-white/10 text-white/60' : 'bg-accent/10 border-accent/40 shadow-[0_0_15px_rgba(217,70,239,0.15)] text-accent'}
                    `}
                  >
                     {isResident ? <ShieldCheck size={20} className={isLibre ? 'text-white/20' : 'text-accent/60'} /> : <HelpCircle size={20} className={isLibre ? 'text-blue-400/40' : 'text-blue-400'}/>}
                     <span className="font-display font-bold text-xl">{p.numero}</span>
                     
                     <div className="absolute top-2 left-2 flex gap-1">
                        {!isLibre && <Car size={12} className="text-accent absolute -top-4 -right-8 animate-pulse" />}
                     </div>
                     <span className="text-[9px] uppercase font-bold tracking-widest absolute bottom-2 opacity-50">
                        {p.tipo}
                     </span>
                  </button>
                )
             })}
          </div>
       </div>

    </div>
  );
}
