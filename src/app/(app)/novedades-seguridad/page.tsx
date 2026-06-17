"use client";

import { useState, useEffect } from "react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { ShieldAlert, CheckCircle2, Clock, MapPin, AlertTriangle, FileText } from "lucide-react";
import { gsap } from "gsap";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api/client";
import { useRouter } from "next/navigation";
import { useWsSubscription } from "@/hooks/useWebSocket";

interface NovedadItem {
  id: string;
  descripcion: string;
  tipo: string;
  ubicacion: string;
  severidad: string;
  estado: string;
  created_at: string;
  resolucion?: string;
  reportado_por?: {
    nombre: string;
    torre: string;
    apto: string;
  };
}

const SEVERITY_BADGE: Record<string, string> = {
  BAJA: "🟢 BAJA",
  MEDIA: "🟡 MEDIA",
  ALTA: "🟠 ALTA",
  CRITICA: "🔴 CRÍTICA",
};

const SEVERITY_COLOR: Record<string, string> = {
  BAJA: "bg-green-500/10 text-green-400 border-green-500/30",
  MEDIA: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  ALTA: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  CRITICA: "bg-red-500/10 text-red-400 border-red-500/30",
};

const TIPO_LABEL: Record<string, string> = {
  PERSONA_SOSPECHOSA: "Persona Sospechosa",
  RUIDO: "Ruido",
  DAÑO: "Daño",
  INCENDIO: "Incendio",
  OTRO: "Otro",
};

const TIPO_ICON: Record<string, string> = {
  PERSONA_SOSPECHOSA: "👤",
  RUIDO: "🔊",
  DAÑO: "💥",
  INCENDIO: "🔥",
  OTRO: "📋",
};

export default function NovedadesSeguridadPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const role = user?.rol;

  const [novedades, setNovedades] = useState<NovedadItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({
    tipo: "PERSONA_SOSPECHOSA",
    ubicacion: "",
    descripcion: "",
    severidad: "MEDIA",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Resolve prompt state
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolucionText, setResolucionText] = useState("");
  const [isResolving, setIsResolving] = useState(false);

  const refetchNovedades = async () => {
    try {
      const data = await api.get<NovedadItem[]>("/vigilancia/novedades");
      setNovedades(data);
    } catch {}
  };

  // Real-time WebSocket subscription
  useWsSubscription("novedad", () => refetchNovedades());

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }

    const allowed = ["VIGILANTE", "SUPERVISOR_VIGILANCIA", "ADMINISTRADOR", "SUPER_ADMIN"];
    if (!role || !allowed.includes(role)) {
      toast.error("No tienes permisos para acceder a esta sección.");
      router.push("/inicio");
      return;
    }

    async function loadData() {
      try {
        const data = await api.get<NovedadItem[]>("/vigilancia/novedades");
        setNovedades(data);
      } catch {
        toast.error("Error al cargar novedades");
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
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      await api.post("/vigilancia/novedades", formData);
      toast.success("Novedad reportada exitosamente");
      const fresh = await api.get<NovedadItem[]>("/vigilancia/novedades");
      setNovedades(fresh);
      setFormData({ tipo: "PERSONA_SOSPECHOSA", ubicacion: "", descripcion: "", severidad: "MEDIA" });
    } catch {
      toast.error("Error al reportar novedad");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolve = async (id: string) => {
    if (!resolucionText.trim()) {
      toast.error("Describe la resolución de la novedad");
      return;
    }

    setIsResolving(true);
    try {
      await api.put(`/vigilancia/novedades/${id}/resolver`, { resolucion: resolucionText });
      toast.success("Novedad resuelta");
      const fresh = await api.get<NovedadItem[]>("/vigilancia/novedades");
      setNovedades(fresh);
      setResolvingId(null);
      setResolucionText("");
    } catch {
      toast.error("Error al resolver novedad");
    } finally {
      setIsResolving(false);
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    const diff = Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / 60000);
    if (diff < 60) return `Hace ${diff} min`;
    const hours = Math.floor(diff / 60);
    if (hours < 24) return `Hace ${hours}h`;
    const days = Math.floor(hours / 24);
    return `Hace ${days}d`;
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
      </div>
    );

  const activas = novedades.filter((n) => n.estado !== "CERRADO");
  const resueltas = novedades.filter((n) => n.estado === "CERRADO");

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
      <ProfileHeader />

      {/* Reportar Novedad Form */}
      <div className="fade-up liquid-glass rounded-3xl p-6 border border-border shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
            <ShieldAlert size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text">Reportar Novedad</h2>
            <p className="text-xs text-text">Registrar incidente de seguridad</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex gap-4">
            <div className="flex-1 flex flex-col gap-1.5">
              <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1">
                Tipo de Novedad
              </label>
              <select
                value={formData.tipo}
                onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
                className="w-full bg-surface-2 border border-border rounded-2xl py-3 px-4 text-sm text-text focus:outline-none focus:border-border"
              >
                <option value="PERSONA_SOSPECHOSA" className="bg-primary text-text">
                  👤 Persona Sospechosa
                </option>
                <option value="RUIDO" className="bg-primary text-text">
                  🔊 Ruido
                </option>
                <option value="DAÑO" className="bg-primary text-text">
                  💥 Daño
                </option>
                <option value="INCENDIO" className="bg-primary text-text">
                  🔥 Incendio
                </option>
                <option value="OTRO" className="bg-primary text-text">
                  📋 Otro
                </option>
              </select>
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1">
                Severidad
              </label>
              <select
                value={formData.severidad}
                onChange={(e) => setFormData({ ...formData, severidad: e.target.value })}
                className="w-full bg-surface-2 border border-border rounded-2xl py-3 px-4 text-sm text-text focus:outline-none focus:border-border"
              >
                <option value="BAJA" className="bg-primary text-text">
                  🟢 BAJA
                </option>
                <option value="MEDIA" className="bg-primary text-text">
                  🟡 MEDIA
                </option>
                <option value="ALTA" className="bg-primary text-text">
                  🟠 ALTA
                </option>
                <option value="CRITICA" className="bg-primary text-text">
                  🔴 CRÍTICA
                </option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1">
              Ubicación
            </label>
            <input
              required
              type="text"
              placeholder="Ej: Torre A, Piso 3, Parqueadero..."
              value={formData.ubicacion}
              onChange={(e) => setFormData({ ...formData, ubicacion: e.target.value })}
              className="w-full bg-surface-2 border border-border rounded-2xl py-3 px-4 text-sm text-text focus:outline-none focus:border-border"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1">
              Descripción
            </label>
            <textarea
              required
              rows={3}
              placeholder="Describe la novedad o incidente..."
              value={formData.descripcion}
              onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
              className="w-full bg-surface-2 border border-border rounded-2xl py-3 px-4 text-sm text-text focus:outline-none focus:border-border resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 w-full py-4 bg-red-500/20 hover:bg-red-500/30 transition-colors rounded-2xl font-bold text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.2)] flex justify-center items-center gap-2"
          >
            {isSubmitting ? (
              "Reportando..."
            ) : (
              <>
                <AlertTriangle size={18} /> Reportar Novedad
              </>
            )}
          </button>
        </form>
      </div>

      {/* Novedades Activas */}
      <div className="fade-up flex flex-col gap-4">
        <div className="flex justify-between items-center ml-2">
          <h3 className="text-sm font-bold text-text uppercase tracking-widest flex items-center gap-2">
            <Clock size={16} className="text-text" /> Novedades Activas
          </h3>
          <span className="bg-surface-2 text-text text-[10px] px-2 py-0.5 rounded-full font-bold">
            {activas.length} ACTIVAS
          </span>
        </div>

        {activas.length === 0 && (
          <p className="text-text text-sm text-center py-6">Sin novedades activas.</p>
        )}

        {activas.map((n) => (
          <div
            key={n.id}
            className="liquid-glass-card p-5 rounded-3xl border border-border flex flex-col gap-4 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 rounded-full blur-2xl pointer-events-none translate-x-1/2 -translate-y-1/2" />

            <div className="flex justify-between items-start relative z-10">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border ${SEVERITY_COLOR[n.severidad] || "bg-surface-2 text-text border-border"}`}
                  >
                    {SEVERITY_BADGE[n.severidad] || n.severidad}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest bg-surface-2 px-2.5 py-0.5 rounded-full text-text border border-border">
                    {TIPO_ICON[n.tipo]} {TIPO_LABEL[n.tipo] || n.tipo}
                  </span>
                </div>
                <p className="text-text font-bold text-lg leading-tight mt-1">{n.descripcion}</p>
              </div>
              <div className="bg-surface-2 px-3 py-1 rounded-full border border-border text-[10px] font-bold text-text whitespace-nowrap">
                {formatTimeAgo(n.created_at)}
              </div>
            </div>

            <div className="flex items-center gap-2 text-text text-xs font-semibold relative z-10">
              <MapPin size={14} /> {n.ubicacion}
            </div>

            {n.reportado_por && (
              <div className="flex items-center gap-2 text-text text-[10px] font-bold uppercase tracking-widest relative z-10">
                Reportado por: {n.reportado_por.nombre}
                {n.reportado_por.torre && ` • Torre ${n.reportado_por.torre}`}
                {n.reportado_por.apto && ` • Apto ${n.reportado_por.apto}`}
              </div>
            )}

            {/* Resolve section */}
            {resolvingId === n.id ? (
              <div className="relative z-10 flex flex-col gap-2">
                <textarea
                  rows={2}
                  placeholder="Describe cómo se resolvió la novedad..."
                  value={resolucionText}
                  onChange={(e) => setResolucionText(e.target.value)}
                  className="w-full bg-surface-2 border border-border rounded-xl py-2.5 px-3 text-xs text-text focus:outline-none focus:border-border resize-none"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleResolve(n.id)}
                    disabled={isResolving}
                    className="flex-1 py-2.5 bg-green-500/20 hover:bg-green-500/30 transition-colors rounded-xl font-bold text-green-400 text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                  >
                    {isResolving ? (
                      "Resolviendo..."
                    ) : (
                      <>
                        <CheckCircle2 size={14} /> Confirmar Resolución
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setResolvingId(null);
                      setResolucionText("");
                    }}
                    disabled={isResolving}
                    className="py-2.5 px-4 bg-surface-2 border border-border hover:bg-text/10 transition-colors rounded-xl font-bold text-text text-xs uppercase tracking-widest"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  setResolvingId(n.id);
                  setResolucionText("");
                }}
                className="w-full mt-2 py-3 bg-surface-2 border border-border hover:bg-text/10 dark:hover:bg-text/20 hover:border-text/40 hover:text-text dark:hover:text-text transition-all rounded-xl font-bold flex items-center justify-center gap-2 text-xs uppercase tracking-widest relative z-10 text-text"
              >
                <CheckCircle2 size={16} /> Marcar como Resuelto
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Novedades Resueltas */}
      {resueltas.length > 0 && (
        <div className="fade-up flex flex-col gap-4">
          <div className="flex justify-between items-center ml-2">
            <h3 className="text-sm font-bold text-text uppercase tracking-widest flex items-center gap-2">
              <FileText size={16} className="text-text" /> Novedades Resueltas
            </h3>
            <span className="bg-green-500/10 text-green-400 text-[10px] px-2 py-0.5 rounded-full font-bold border border-green-500/30">
              {resueltas.length} RESUELTAS
            </span>
          </div>

          {resueltas.map((n) => (
            <div
              key={n.id}
              className="liquid-glass-card p-5 rounded-3xl border border-border flex flex-col gap-4 relative overflow-hidden opacity-70"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/10 rounded-full blur-2xl pointer-events-none translate-x-1/2 -translate-y-1/2" />

              <div className="flex justify-between items-start relative z-10">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border ${SEVERITY_COLOR[n.severidad] || "bg-surface-2 text-text border-border"}`}
                    >
                      {SEVERITY_BADGE[n.severidad] || n.severidad}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-widest bg-surface-2 px-2.5 py-0.5 rounded-full text-text border border-border">
                      {TIPO_ICON[n.tipo]} {TIPO_LABEL[n.tipo] || n.tipo}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-widest bg-green-500/10 px-2.5 py-0.5 rounded-full text-green-400 border border-green-500/30">
                      Resuelto
                    </span>
                  </div>
                  <p className="text-text font-bold text-lg leading-tight mt-1">{n.descripcion}</p>
                  {n.resolucion && (
                    <p className="text-text text-xs mt-1 italic">Resolución: {n.resolucion}</p>
                  )}
                </div>
                <div className="bg-surface-2 px-3 py-1 rounded-full border border-border text-[10px] font-bold text-text whitespace-nowrap">
                  {formatTimeAgo(n.created_at)}
                </div>
              </div>

              <div className="flex items-center gap-2 text-text text-xs font-semibold relative z-10">
                <MapPin size={14} /> {n.ubicacion}
              </div>

              {n.reportado_por && (
                <div className="flex items-center gap-2 text-text text-[10px] font-bold uppercase tracking-widest relative z-10">
                  Reportado por: {n.reportado_por.nombre}
                  {n.reportado_por.torre && ` • Torre ${n.reportado_por.torre}`}
                  {n.reportado_por.apto && ` • Apto ${n.reportado_por.apto}`}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
