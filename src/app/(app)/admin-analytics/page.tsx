"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api/client";
import ProfileHeader from "@/components/shell/ProfileHeader";
import type { DemografiaDto } from "@/lib/api/types";
import {
  Building2,
  Users,
  UserPlus,
  Activity,
  TrendingUp,
  Loader2,
} from "lucide-react";

export default function AdminAnalyticsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DemografiaDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || (user.rol !== "ADMINISTRADOR" && user.rol !== "SUPER_ADMIN")) return;
    api
      .get<DemografiaDto>("/admin/analytics/demografia")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  if (!user || (user.rol !== "ADMINISTRADOR" && user.rol !== "SUPER_ADMIN")) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center pt-16">
        <p className="text-text text-sm">Acceso restringido</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-primary flex flex-col pt-16 pb-32">
      <ProfileHeader className="px-4" />

      <div className="px-4 py-6 flex flex-col gap-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-display font-bold text-text">
            Analytics & Demografía
          </h1>
          <p className="text-text/60 text-sm mt-1">
            Datos agregados para venta de espacios publicitarios
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-accent" />
          </div>
        ) : !data ? (
          <div className="text-center py-20">
            <p className="text-text/60 text-sm">No se pudieron cargar los datos</p>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-3">
              <KpiCard
                icon={<Building2 size={20} />}
                label="Unidades"
                value={data.totalUnidades.toLocaleString("es-CO")}
                color="#009df2"
              />
              <KpiCard
                icon={<Users size={20} />}
                label="Usuarios"
                value={data.totalUsuarios.toLocaleString("es-CO")}
                color="#57bf00"
              />
              <KpiCard
                icon={<UserPlus size={20} />}
                label="Nuevos este mes"
                value={data.nuevosEsteMes.toLocaleString("es-CO")}
                color="#a855f7"
              />
              <KpiCard
                icon={<Activity size={20} />}
                label="Activos 30d"
                value={data.activos30d.toLocaleString("es-CO")}
                color="#f59e0b"
              />
            </div>

            {/* Por Rol */}
            <section className="liquid-glass-card rounded-[28px] p-5 border border-border">
              <h2 className="text-sm font-bold text-text uppercase tracking-wider mb-4 flex items-center gap-2">
                <TrendingUp size={16} className="text-accent" />
                Distribución por Rol
              </h2>
              <div className="flex flex-col gap-3">
                {data.porRol.map((item) => {
                  const pct = data.totalUsuarios > 0
                    ? ((item.cantidad / data.totalUsuarios) * 100).toFixed(1)
                    : "0";
                  return (
                    <div key={item.rol}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-text font-medium">{formatRol(item.rol)}</span>
                        <span className="text-text/60">
                          {item.cantidad} ({pct}%)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-surface-2 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Por Torre */}
            <section className="liquid-glass-card rounded-[28px] p-5 border border-border">
              <h2 className="text-sm font-bold text-text uppercase tracking-wider mb-4 flex items-center gap-2">
                <Building2 size={16} className="text-accent" />
                Distribución por Torre
              </h2>
              <div className="flex flex-col gap-2">
                {data.porTorre.map((item) => {
                  const pct = data.totalUsuarios > 0
                    ? ((item.cantidad / data.totalUsuarios) * 100).toFixed(1)
                    : "0";
                  return (
                    <div key={item.torre} className="flex justify-between items-center py-1.5 border-b border-border/30 last:border-0">
                      <span className="text-text text-sm">{item.torre}</span>
                      <span className="text-text/60 text-sm">
                        {item.cantidad} usuarios ({pct}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Nota para anunciantes */}
            <div className="bg-accent/10 border border-accent/20 rounded-[20px] p-4">
              <p className="text-xs text-text/80 leading-relaxed">
                <span className="font-bold text-accent">Dato para anunciantes: </span>
                {data.totalUsuarios} residentes activos en {data.porTorre.length} torres.
                {
                  data.porRol.find(r => r.rol === "PROPIETARIO") &&
                  ` ${data.porRol.find(r => r.rol === "PROPIETARIO")!.cantidad} propietarios`
                }
                {
                  data.porRol.find(r => r.rol === "ARRENDATARIO") &&
                  `, ${data.porRol.find(r => r.rol === "ARRENDATARIO")!.cantidad} arrendatarios`
                }
                . {data.activos30d} activos en los últimos 30 días.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="liquid-glass-card rounded-[24px] p-4 border border-border flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="text-text/70" style={{ color }}>{icon}</div>
        <span className="text-[10px] text-text/60 uppercase tracking-wider font-bold">{label}</span>
      </div>
      <span className="text-2xl font-display font-bold text-text">{value}</span>
    </div>
  );
}

function formatRol(rol: string): string {
  const map: Record<string, string> = {
    SUPER_ADMIN: "Super Admin",
    ADMINISTRADOR: "Administrador",
    PROPIETARIO: "Propietario",
    ARRENDATARIO: "Arrendatario",
    HUESPED_TEMPORAL: "Huésped Temporal",
    VIGILANTE: "Vigilante",
    CONCEJO: "Concejo",
  };
  return map[rol] || rol;
}
