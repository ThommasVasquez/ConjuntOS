"use client";

import { useEffect, useState } from "react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import {
  Users,
  Package,
  Mail,
  Shield,
  AlertTriangle,
  Search,
  Activity,
  Eye,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { gsap } from "gsap";
import { api } from "@/lib/api/client";
import SosConsole from "@/components/sos/SosConsole";

interface VigilanciaStats {
  visitasHoy: number;
  paquetesPendientes: number;
  totalResidentes: number;
}

const statCards = [
  {
    key: "visitasHoy" as const,
    label: "Visitas Hoy",
    icon: <Eye size={22} />,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
  {
    key: "paquetesPendientes" as const,
    label: "Paquetes Pendientes",
    icon: <Package size={22} />,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
  {
    key: "totalResidentes" as const,
    label: "Residentes Activos",
    icon: <Users size={22} />,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
];

const navCards = [
  {
    title: "Registrar Visita",
    subtitle: "Ingreso peatonal y vehicular",
    icon: <Users size={26} />,
    path: "/control-visitas",
    color: "from-emerald-500/20 to-emerald-600/5",
    borderColor: "border-emerald-500/30",
    iconColor: "text-emerald-400",
  },
  {
    title: "Registrar Paquete",
    subtitle: "Correspondencia y encomiendas",
    icon: <Package size={26} />,
    path: "/paqueteria",
    color: "from-amber-500/20 to-amber-600/5",
    borderColor: "border-amber-500/30",
    iconColor: "text-amber-400",
  },
  {
    title: "Correspondencia",
    subtitle: "Gestionar envíos y entregas",
    icon: <Mail size={26} />,
    path: "/correspondencia",
    color: "from-purple-500/20 to-purple-600/5",
    borderColor: "border-purple-500/30",
    iconColor: "text-purple-400",
  },
  {
    title: "Rondas de Seguridad",
    subtitle: "CCTV y rondas de vigilancia",
    icon: <Shield size={26} />,
    path: "/seguridad",
    color: "from-blue-500/20 to-blue-600/5",
    borderColor: "border-blue-500/30",
    iconColor: "text-blue-400",
  },
  {
    title: "Reportar Novedad",
    subtitle: "Registrar incidentes o alertas",
    icon: <AlertTriangle size={26} />,
    path: "/novedades-seguridad",
    color: "from-red-500/20 to-red-600/5",
    borderColor: "border-red-500/30",
    iconColor: "text-red-400",
  },
  {
    title: "Directorio",
    subtitle: "Buscar residentes y unidades",
    icon: <Search size={26} />,
    path: "/directorio",
    color: "from-cyan-500/20 to-cyan-600/5",
    borderColor: "border-cyan-500/30",
    iconColor: "text-cyan-400",
  },
];

export default function VigilanciaDashboard() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const role = user?.rol;

  const [stats, setStats] = useState<VigilanciaStats>({
    visitasHoy: 0,
    paquetesPendientes: 0,
    totalResidentes: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    const allowed = [
      "VIGILANTE",
      "SUPERVISOR_VIGILANCIA",
      "ADMINISTRADOR",
      "SUPER_ADMIN",
    ];
    if (!role || !allowed.includes(role)) {
      toast.error("No tienes permisos para acceder a esta sección.");
      router.push("/inicio");
      return;
    }

    async function fetchStats() {
      try {
        const data = await api.get<VigilanciaStats>("/vigilancia/stats");
        setStats(data);
      } catch {
        toast.error("Error al cargar estadísticas");
      } finally {
        setStatsLoading(false);
      }
    }
    fetchStats();

    gsap.fromTo(
      ".fade-up",
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, stagger: 0.1, duration: 0.5 }
    );
  }, [user, authLoading, role, router]);

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen relative overflow-x-hidden">
      <ProfileHeader />

      {/* HEADER TITLE */}
      <div className="fade-up flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-accent/20 border border-accent/30 flex items-center justify-center text-accent">
          <Shield size={24} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-text">Panel de Vigilancia</h2>
          <p className="text-xs text-text/70">
            Centro de control de seguridad y portería
          </p>
        </div>
      </div>

      {/* STATS ROW */}
      <div className="fade-up grid grid-cols-3 gap-3">
        {statCards.map((card) => (
          <div
            key={card.key}
            className={`liquid-glass rounded-2xl p-4 border ${card.border} ${card.bg} flex flex-col gap-2`}
          >
            <div className={`${card.color}`}>{card.icon}</div>
            <div>
              <p className="text-2xl font-display font-bold text-text">
                {statsLoading ? (
                  <span className="inline-block w-10 h-6 bg-text/10 rounded animate-pulse" />
                ) : (
                  stats[card.key].toLocaleString("es-CO")
                )}
              </p>
              <p className="text-[10px] text-text/60 font-bold uppercase tracking-wider mt-0.5">
                {card.label}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* LIVE SOS ALERTS (renders only when the queue is non-empty) */}
      <SosConsole />

      {/* QUICK-ACCESS NAVIGATION GRID */}
      <div className="fade-up flex flex-col gap-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-text/60 px-1">
          Acciones Rápidas
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {navCards.map((card) => (
            <button
              key={card.path}
              onClick={() => router.push(card.path)}
              className={`liquid-glass-card rounded-[22px] p-4 border ${card.borderColor} bg-gradient-to-br ${card.color} flex flex-col items-start gap-3 text-left hover:scale-[1.02] active:scale-95 transition-all cursor-pointer`}
            >
              <div
                className={`w-11 h-11 rounded-xl bg-text/5 border border-border flex items-center justify-center ${card.iconColor}`}
              >
                {card.icon}
              </div>
              <div>
                <h4 className="text-sm font-bold text-text leading-tight">
                  {card.title}
                </h4>
                <p className="text-[10px] text-text/50 mt-0.5 leading-relaxed">
                  {card.subtitle}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* FOOTER STATUS BAR */}
      <div className="fade-up mt-4 flex items-center justify-center gap-2 p-3 rounded-2xl bg-surface-2/30 border border-border/30">
        <Activity size={14} className="text-emerald-400" />
        <span className="text-[10px] text-text/50 font-bold uppercase tracking-widest">
          Módulo de vigilancia activo
        </span>
      </div>
    </div>
  );
}
