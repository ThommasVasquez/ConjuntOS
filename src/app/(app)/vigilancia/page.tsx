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
  Truck,
  CheckCircle2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { gsap } from "gsap";
import { api } from "@/lib/api/client";
import SosConsole from "@/components/sos/SosConsole";
import RoleSwitcher from "@/components/shell/RoleSwitcher";
import { MudanzaItem } from "@/components/mudanzas/PazYSalvoModal";

interface VigilanciaStats {
  visitasHoy: number;
  paquetesPendientes: number;
  totalResidentes: number;
  mudanzasHoy?: number;
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
    title: "Mudanzas Habilitadas",
    subtitle: "Paz y Salvo y permisos de trasteo",
    icon: <Truck size={26} />,
    path: "/mudanzas",
    color: "from-emerald-500/20 to-emerald-600/5",
    borderColor: "border-[#57bf00]/40",
    iconColor: "text-[#57bf00]",
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
  const [mudanzasHabilitadas, setMudanzasHabilitadas] = useState<MudanzaItem[]>([]);

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
        const [data, mudanzasData] = await Promise.all([
          api.get<VigilanciaStats>("/vigilancia/stats"),
          api.get<MudanzaItem[]>("/mudanzas").catch(() => []),
        ]);
        const apr = mudanzasData.filter(m => m.estado === 'APROBADO' || m.estado === 'EN_PROCESO');
        setStats({ ...data, mudanzasHoy: apr.length });
        setMudanzasHabilitadas(apr);
      } catch {
        toast.error("Error al cargar estadísticas");
      } finally {
        setStatsLoading(false);
      }
    }
    fetchStats();

    
}, [user, authLoading, role, router]);

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen relative overflow-x-hidden">
      <ProfileHeader />

      {/* ROLE SWITCHER (solo visible para testers) */}
      <RoleSwitcher />

      {/* HEADER TITLE */}
      <div className="flex items-center gap-3">
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
      <div className="grid grid-cols-3 gap-3">
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

      {/* MUDANZAS HABILITADAS (VIGILANCIA REALTIME BANNER) */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#57bf00] flex items-center gap-1.5">
            <Truck size={16} />
            Mudanzas Habilitadas ({mudanzasHabilitadas.length})
          </h3>
          <button
            onClick={() => router.push('/mudanzas')}
            className="text-[10px] text-[#57bf00] font-black uppercase tracking-wider hover:underline"
          >
            Ver Todas &rarr;
          </button>
        </div>

        {mudanzasHabilitadas.length === 0 ? (
          <div className="liquid-glass rounded-2xl p-4 border border-border/40 text-center">
            <p className="text-xs text-text/60">No hay mudanzas programadas para hoy.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {mudanzasHabilitadas.map((m) => (
              <div
                key={m.id}
                className="liquid-glass-card rounded-[24px] p-4 border border-[#57bf00]/40 bg-[#57bf00]/5 flex flex-col gap-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="bg-[#57bf00] text-black text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full tracking-wider">
                    ✓ PAZ Y SALVO {m.paz_y_salvo_codigo || 'APROBADO'}
                  </span>
                  <span className="text-[10px] font-bold text-text uppercase tracking-wider">
                    {m.tipo === 'SALIENTE' ? '📤 MUDANZA SALIENTE' : '📥 MUDANZA ENTRANTE'}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div>
                    <h4 className="text-sm font-bold text-text">
                      {m.usuario_nombre || 'Residente'}
                    </h4>
                    <p className="text-xs font-semibold text-[#57bf00]">
                      Torre {m.torre || '?'} - Apto {m.apto || '?'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-mono font-bold text-text">
                      {m.hora_inicio} - {m.hora_fin}
                    </p>
                    <p className="text-[10px] text-text/60">
                      Fecha: {m.fecha_mudanza}
                    </p>
                  </div>
                </div>

                {m.tiene_vehiculo && (
                  <div className="bg-primary-light/40 rounded-xl p-2.5 border border-border/30 text-[11px] text-text flex items-center justify-between">
                    <div>
                      <span className="font-bold">Vehículo:</span> {m.vehiculo_tipo || 'Camión'} ({m.vehiculo_placa || 'Sin placa'})
                    </div>
                    {m.conductor_nombre && (
                      <div className="text-[10px] text-text/70">
                        Conductor: {m.conductor_nombre} {m.conductor_documento ? `(CC ${m.conductor_documento})` : ''}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1 border-t border-border/30">
                  {m.estado === 'APROBADO' && (
                    <button
                      onClick={async () => {
                        try {
                          await api.put(`/mudanzas/${m.id}/estado`, { estado: 'EN_PROCESO' });
                          toast.success('Estado actualizado: Mudanza en proceso de ingreso/salida');
                          router.push('/mudanzas');
                        } catch (e: any) {
                          toast.error(e?.message || 'Error actualizando estado');
                        }
                      }}
                      className="flex-1 py-2 rounded-xl bg-[#57bf00] text-black font-bold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all text-center"
                    >
                      🚚 Registrar Ingreso Trasteo
                    </button>
                  )}
                  {m.estado === 'EN_PROCESO' && (
                    <button
                      onClick={async () => {
                        try {
                          await api.put(`/mudanzas/${m.id}/estado`, { estado: 'FINALIZADO' });
                          toast.success('Mudanza finalizada. Permiso completado.');
                          router.push('/mudanzas');
                        } catch (e: any) {
                          toast.error(e?.message || 'Error al finalizar mudanza');
                        }
                      }}
                      className="flex-1 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all text-center"
                    >
                      🏁 Marcar Salida / Finalizar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* QUICK-ACCESS NAVIGATION GRID */}
      <div className="flex flex-col gap-3">
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
      <div className="mt-4 flex items-center justify-center gap-2 p-3 rounded-2xl bg-surface-2/30 border border-border/30">
        <Activity size={14} className="text-emerald-400" />
        <span className="text-[10px] text-text/50 font-bold uppercase tracking-widest">
          Módulo de vigilancia activo
        </span>
      </div>
    </div>
  );
}
