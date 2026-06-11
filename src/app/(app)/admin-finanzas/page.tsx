"use client";

import { useState, useEffect } from "react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { DollarSign } from "lucide-react";
import { gsap } from "gsap";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useWsSubscription } from "@/hooks/useWebSocket";

export default function AdminFinanzasPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const role = user?.rol;
  const [loading, setLoading] = useState(true);

  // Real-time WebSocket subscription
  useWsSubscription('pago', () => {
    // Re-fetch financial stats when payment events arrive
    // Currently a placeholder page; will trigger re-render when data is added
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }

    const allowed = ['ADMINISTRADOR', 'SUPER_ADMIN', 'CONCEJO'];
    if (!role || !allowed.includes(role)) {
      toast.error("No tienes permisos para acceder a esta sección.");
      router.push("/inicio");
      return;
    }

    setLoading(false);
  }, [user, authLoading, role, router]);

  useEffect(() => {
    if (!loading) {
      gsap.fromTo(".fade-up", { opacity: 0, y: 20 }, { opacity: 1, y: 0, stagger: 0.1, duration: 0.5 });
    }
  }, [loading]);

  if(loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" /></div>;

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
       <ProfileHeader />
       
       <div className="fade-up liquid-glass rounded-3xl p-6 border border-border shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
             <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-500">
                <DollarSign size={24} />
             </div>
             <div>
                <h2 className="text-xl font-bold text-text">Finanzas</h2>
                <p className="text-xs text-text/70">Historial general de pagos</p>
             </div>
          </div>
          
          <p className="text-text/75 text-sm text-center py-6">Consolidado general protegido. No hay reportes este mes.</p>
       </div>
    </div>
  );
}
