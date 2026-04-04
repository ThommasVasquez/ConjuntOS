"use client";

import { useState, useEffect } from "react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { CheckCircle2, XCircle, Clock, Heart } from "lucide-react";
import { gsap } from "gsap";
import { toast } from "sonner";

export default function AdminNovedadesPage() {
  const [loading, setLoading] = useState(true);
  const [datos, setDatos] = useState({ reservas: [], solicitudes: [] });

  useEffect(() => {
    // In a real app we'd fetch actual pending items
    // For demo purposes, we set timeout and display empty list
    setTimeout(() => {
      setLoading(false);
      gsap.fromTo(".fade-up", { opacity: 0, y: 20 }, { opacity: 1, y: 0, stagger: 0.1, duration: 0.5 });
    }, 600);
  }, []);

  if(loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-white/20 border-t-accent rounded-full animate-spin" /></div>;

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
       <ProfileHeader />
       
       <div className="fade-up liquid-glass rounded-3xl p-6 border border-white/10 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
             <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-500">
                <Heart size={24} />
             </div>
             <div>
               <h2 className="text-xl font-bold text-white">Novedades</h2>
               <p className="text-xs text-white/50">Aprobaciones pendientes</p>
             </div>
          </div>
          
          {datos.reservas.length === 0 && datos.solicitudes.length === 0 ? (
            <p className="text-white/30 text-sm text-center py-6">Todo al día. No hay aprobaciones requeridas.</p>
          ) : (
            <div>...</div>
          )}
       </div>
    </div>
  );
}
