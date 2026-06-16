"use client";

import { useState, useEffect, useCallback } from "react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { DollarSign, CalendarClock, AlertCircle } from "lucide-react";
import { gsap } from "gsap";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useWsSubscription } from "@/hooks/useWebSocket";
import { api } from "@/lib/api/client";
import type { AdminStatsDto } from "@/lib/api/types";



const COP = (v: string | number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })
    .format(Number(v || 0));

export default function AdminFinanzasPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const role = user?.rol;
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminStatsDto | null>(null);
  const [error, setError] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const data = await api.get<AdminStatsDto>("/admin/stats");
      setStats(data);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  // Re-fetch consolidated finances when a payment event arrives over the socket.
  useWsSubscription("pago", () => { loadStats(); });

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }

    const allowed = ["ADMINISTRADOR", "SUPER_ADMIN", "CONCEJO"];
    if (!role || !allowed.includes(role)) {
      toast.error("No tienes permisos para acceder a esta sección.");
      router.push("/inicio");
      return;
    }

    loadStats().finally(() => setLoading(false));
  }, [user, authLoading, role, router, loadStats]);

  useEffect(() => {
    if (!loading) {
      gsap.fromTo(".fade-up", { opacity: 0, y: 20 }, { opacity: 1, y: 0, stagger: 0.1, duration: 0.5 });
    }
  }, [loading]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" /></div>;

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
       <ProfileHeader />

       <div className="fade-up liquid-glass rounded-3xl p-6 border border-border shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
             <div className="w-12 h-12 rounded-2xl bg-text/20 border border-text/30 flex items-center justify-center text-text">
                <DollarSign size={24} />
             </div>
             <div>
                <h2 className="text-xl font-bold text-text">Finanzas</h2>
                <p className="text-xs text-text">Consolidado del conjunto · mes en curso</p>
             </div>
          </div>

          {error ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <AlertCircle size={28} className="text-text" />
              <p className="text-text text-sm">No se pudieron cargar los datos financieros.</p>
              <button onClick={loadStats} className="text-xs font-bold text-accent underline">Reintentar</button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center bg-surface-2 p-4 rounded-2xl border border-border">
                 <span className="flex items-center gap-2 text-xs text-text uppercase font-bold">
                   <DollarSign size={14} className="text-text" /> Recaudación del mes
                 </span>
                 <span className="text-sm font-black text-text">{COP(stats?.recaudoMes ?? 0)}</span>
              </div>
              <div className="flex justify-between items-center bg-surface-2 p-4 rounded-2xl border border-border">
                 <span className="flex items-center gap-2 text-xs text-text uppercase font-bold">
                   <CalendarClock size={14} className="text-text" /> Reservas pendientes
                 </span>
                 <span className="text-sm font-black text-text">{stats?.reservasPendientes ?? 0}</span>
              </div>
            </div>
          )}
       </div>
    </div>
  );
}
