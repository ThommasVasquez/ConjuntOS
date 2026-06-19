"use client";

import { useState, useEffect, useRef } from "react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import {
  Heart, Users, Scale, AlertTriangle, Clock, CheckCircle2,
  ChevronLeft, ChevronRight, RefreshCw, X, Loader2, ArrowUpDown,
  FileText, Calendar, MessageSquare, Plus, Search, Eye, Phone,
  Volume2, Dog, Wind, Car, Trash2, HardHat, Siren, MoreHorizontal,
  User, Building,
} from "lucide-react";
import { gsap } from "gsap";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api/client";
import { useRouter } from "next/navigation";
import { useWsSubscription } from "@/hooks/useWebSocket";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TipoCaso = 'RUIDO' | 'MASCOTAS' | 'OLORES' | 'PARQUEADERO' | 'BASURAS' | 'OBRAS' | 'AMENAZAS' | 'OTRO';
type EstadoCaso = 'REPORTADO' | 'EN_MEDIACION' | 'RESUELTO' | 'ESCALADO' | 'ARCHIVADO';

interface UnidadEmbed {
  id: string;
  torre?: string | null;
  apto?: string | null;
  nombre_residente?: string | null;
}

interface CreadorEmbed {
  id: string;
  nombre: string;
}

interface CasoConvivenciaDto {
  id: string;
  tipo: TipoCaso;
  descripcion: string;
  unidad_reporta: UnidadEmbed;
  unidad_reportada: UnidadEmbed | null;
  creado_por: CreadorEmbed;
  estado: EstadoCaso;
  resolucion: string | null;
  fecha_mediacion: string | null;
  acta_reunion: string | null;
  created_at: string;
  updated_at: string;
}

interface StatsConvivencia {
  total: number;
  reportados: number;
  en_mediacion: number;
  resueltos: number;
  escalados: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type TabKey = "TODOS" | "REPORTADO" | "EN_MEDIACION" | "RESUELTO";

const TIPO_CASO: { key: TipoCaso; label: string; icon: React.ReactNode }[] = [
  { key: "RUIDO", label: "Ruido", icon: <Volume2 size={14} /> },
  { key: "MASCOTAS", label: "Mascotas", icon: <Dog size={14} /> },
  { key: "OLORES", label: "Olores", icon: <Wind size={14} /> },
  { key: "PARQUEADERO", label: "Parqueadero", icon: <Car size={14} /> },
  { key: "BASURAS", label: "Basuras", icon: <Trash2 size={14} /> },
  { key: "OBRAS", label: "Obras", icon: <HardHat size={14} /> },
  { key: "AMENAZAS", label: "Amenazas", icon: <Siren size={14} /> },
  { key: "OTRO", label: "Otro", icon: <MoreHorizontal size={14} /> },
];

const TIPO_ICON_MAP: Record<TipoCaso, React.ReactNode> = {
  RUIDO: <Volume2 size={18} />,
  MASCOTAS: <Dog size={18} />,
  OLORES: <Wind size={18} />,
  PARQUEADERO: <Car size={18} />,
  BASURAS: <Trash2 size={18} />,
  OBRAS: <HardHat size={18} />,
  AMENAZAS: <Siren size={18} />,
  OTRO: <MoreHorizontal size={18} />,
};

function getEstadoBadge(estado: EstadoCaso): { label: string; className: string; icon: React.ReactNode } {
  switch (estado) {
    case "REPORTADO":
      return { label: "Reportado", className: "bg-[#EAB308]/15 text-[#EAB308] border border-[#EAB308]/30", icon: <AlertTriangle size={10} /> };
    case "EN_MEDIACION":
      return { label: "En Mediación", className: "bg-[#009df2]/15 text-[#009df2] border border-[#009df2]/30", icon: <Users size={10} /> };
    case "RESUELTO":
      return { label: "Resuelto", className: "bg-[#57bf00]/15 text-[#57bf00] border border-[#57bf00]/30", icon: <CheckCircle2 size={10} /> };
    case "ESCALADO":
      return { label: "Escalado", className: "bg-[#EF4444]/15 text-[#EF4444] border border-[#EF4444]/30", icon: <Siren size={10} /> };
    case "ARCHIVADO":
      return { label: "Archivado", className: "bg-text/10 text-text border border-border", icon: <FileText size={10} /> };
    default:
      return { label: estado, className: "bg-text/10 text-text border border-border", icon: <AlertTriangle size={10} /> };
  }
}

const ESTADO_OPTIONS: EstadoCaso[] = ["REPORTADO", "EN_MEDIACION", "RESUELTO", "ESCALADO", "ARCHIVADO"];

interface UnidadOption {
  id: string;
  torre: string | null;
  numero: string;
  nombre_residente: string | null;
  label: string;
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function ComiteConvivenciaPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const role = user?.rol;

  const containerRef = useRef<HTMLDivElement>(null);

  // Data
  const [casos, setCasos] = useState<CasoConvivenciaDto[]>([]);
  const [stats, setStats] = useState<StatsConvivencia | null>(null);
  const [loading, setLoading] = useState(true);
  const [unidades, setUnidades] = useState<UnidadOption[]>([]);

  // Tabs
  const [tab, setTab] = useState<TabKey>("TODOS");

  // Filters
  const [filtroTipo, setFiltroTipo] = useState<TipoCaso | null>(null);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [formData, setFormData] = useState({
    tipo: "RUIDO" as TipoCaso,
    descripcion: "",
    unidad_reporta_id: "",
    unidad_reportada_id: "",
  });
  const [isCreating, setIsCreating] = useState(false);

  // Detail modal
  const [selected, setSelected] = useState<CasoConvivenciaDto | null>(null);
  const [nuevoEstado, setNuevoEstado] = useState<EstadoCaso>("EN_MEDIACION");
  const [nuevaResolucion, setNuevaResolucion] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const fetchCasos = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tab !== "TODOS") params.set("estado", tab);
      const qs = params.toString();
      const items = await api.get<CasoConvivenciaDto[]>(`/convivencia/casos${qs ? `?${qs}` : ""}`);
      setCasos(items);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.detail : "Error de conexión";
      toast.error(`Error al cargar casos: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const s = await api.get<StatsConvivencia>("/convivencia/casos/stats");
      setStats(s);
    } catch {
      // Stats are non-critical
    }
  };

  const fetchUnidades = async () => {
    try {
      const raw = await api.get<UnidadOption[]>("/convivencia/unidades");
      setUnidades(raw.map((u) => ({
        ...u,
        label: `T${u.torre || "?"} ${u.numero}${u.nombre_residente ? ` — ${u.nombre_residente}` : ""}`,
      })));
    } catch {
      // Unidades are non-critical
    }
  };

  // Real-time WebSocket
  useWsSubscription("convivencia", () => {
    fetchCasos();
    fetchStats();
  });

  // -----------------------------------------------------------------------
  // Auth guard + initial load
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    const allowed = ["ADMINISTRADOR", "SUPER_ADMIN", "CONCEJO"];
    if (!role || !allowed.includes(role)) {
      toast.error("No tienes permisos para acceder al Comité de Convivencia.");
      router.push("/inicio");
      return;
    }
    fetchCasos();
    fetchStats();
    fetchUnidades();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user, authLoading, role, router]);

  // -----------------------------------------------------------------------
  // Animations
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!loading) {
      const ctx = gsap.context(() => {
        gsap.fromTo(
          ".fade-up",
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, stagger: 0.08, duration: 0.4, ease: "power2.out" }
        );
      }, containerRef);
      return () => ctx.revert();
    }
  }, [loading, tab]);

  // -----------------------------------------------------------------------
  // Mutations
  // -----------------------------------------------------------------------

  const handleCreate = async () => {
    if (!formData.descripcion.trim()) {
      toast.error("La descripción es obligatoria");
      return;
    }
    if (!formData.unidad_reporta_id.trim()) {
      toast.error("Debes especificar la unidad que reporta");
      return;
    }
    setIsCreating(true);
    try {
      await api.post("/convivencia/casos", {
        tipo: formData.tipo,
        descripcion: formData.descripcion,
        unidad_reporta_id: formData.unidad_reporta_id,
        unidad_reportada_id: formData.unidad_reportada_id.trim() || undefined,
      });
      toast.success("Caso creado exitosamente");
      setShowCreate(false);
      setFormData({ tipo: "RUIDO", descripcion: "", unidad_reporta_id: "", unidad_reportada_id: "" });
      fetchCasos();
      fetchStats();
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.detail : "Error al crear";
      toast.error(msg);
    } finally {
      setIsCreating(false);
    }
  };

  const handleActualizar = async () => {
    if (!selected) return;
    setIsProcessing(true);
    try {
      await api.put(`/convivencia/casos/${selected.id}`, {
        estado: nuevoEstado,
        resolucion: nuevaResolucion.trim() || undefined,
      });
      toast.success(`Caso actualizado a "${nuevoEstado}"`);
      setSelected(null);
      setNuevaResolucion("");
      fetchCasos();
      fetchStats();
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.detail : "Error al actualizar";
      toast.error(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  const filteredCasos = filtroTipo
    ? casos.filter((c) => c.tipo === filtroTipo)
    : casos;

  const dateStr = (d: string): string => {
    try {
      return new Date(d).toLocaleDateString("es-ES", {
        day: "2-digit", month: "short", year: "numeric",
      });
    } catch { return d; }
  };

  const unidadLabel = (u: UnidadEmbed | null | undefined): string => {
    if (!u) return "—";
    const parts = [];
    if (u.torre) parts.push(`T${u.torre}`);
    if (u.apto) parts.push(`A${u.apto}`);
    if (u.nombre_residente) parts.push(u.nombre_residente);
    return parts.join(" · ") || "Unidad";
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div ref={containerRef} className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen relative overflow-x-hidden">
      <ProfileHeader />

      {/* Header */}
      <div className="fade-up flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-medium text-text tracking-wide flex items-center gap-2">
            <Scale size={24} className="text-[#009df2]" /> Comité de Convivencia
          </h1>
          <p className="text-sm text-text">Mediación y resolución de conflictos entre vecinos</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchCasos}
            className="p-2 rounded-full hover:bg-surface-2 transition-colors"
          >
            <RefreshCw size={18} className="text-text" />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-accent text-primary text-xs font-bold hover:bg-accent/90 transition-all shadow-md"
          >
            <Plus size={14} /> Nuevo Caso
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="fade-up grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total", value: stats.total, color: "text-text", bg: "bg-surface-2", icon: <Scale size={16} /> },
            { label: "Reportados", value: stats.reportados, color: "text-[#EAB308]", bg: "bg-[#EAB308]/10", icon: <AlertTriangle size={16} /> },
            { label: "En Mediación", value: stats.en_mediacion, color: "text-[#009df2]", bg: "bg-[#009df2]/10", icon: <Users size={16} /> },
            { label: "Resueltos", value: stats.resueltos, color: "text-[#57bf00]", bg: "bg-[#57bf00]/10", icon: <CheckCircle2 size={16} /> },
            { label: "Escalados", value: stats.escalados, color: "text-[#EF4444]", bg: "bg-[#EF4444]/10", icon: <Siren size={16} /> },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} rounded-2xl p-4 border border-border flex flex-col gap-1`}>
              <span className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${s.color}`}>
                {s.icon} {s.label}
              </span>
              <span className={`text-2xl font-display font-bold ${s.color}`}>{s.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="fade-up flex bg-surface-2 rounded-full p-1 border border-border overflow-x-auto">
        {([
          ["TODOS", "Todos"],
          ["REPORTADO", "Reportados"],
          ["EN_MEDIACION", "En Mediación"],
          ["RESUELTO", "Resueltos"],
        ] as [TabKey, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-3 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap px-2 ${
              tab === key ? "bg-accent text-primary shadow-md" : "text-text hover:text-text"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="fade-up flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-text mr-1">
          <ArrowUpDown size={12} className="inline mr-1" /> Tipo:
        </span>
        {TIPO_CASO.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setFiltroTipo((prev) => (prev === cat.key ? null : cat.key))}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all ${
              filtroTipo === cat.key
                ? "bg-[#009df2]/15 text-[#009df2] border-[#009df2]/30"
                : "bg-surface-2 border-border text-text hover:border-text/30"
            }`}
          >
            {cat.icon} {cat.label}
          </button>
        ))}
        {filtroTipo && (
          <button
            onClick={() => setFiltroTipo(null)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-text bg-text/5 border border-border hover:bg-text/10 transition-all"
          >
            <X size={12} /> Limpiar
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex flex-col gap-4">
        {loading ? (
          <div className="w-full py-12 flex justify-center">
            <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
          </div>
        ) : filteredCasos.length === 0 ? (
          <div className="fade-up liquid-glass rounded-3xl p-8 border border-border text-center">
            <Heart size={40} className="mx-auto text-text/50 mb-3" />
            <p className="text-text font-medium">Sin casos registrados</p>
            <p className="text-xs text-text mt-1">No hay casos de convivencia en esta sección.</p>
          </div>
        ) : (
          filteredCasos.map((c) => {
            const badge = getEstadoBadge(c.estado);
            return (
              <div
                key={c.id}
                onClick={() => {
                  setSelected(c);
                  setNuevoEstado(c.estado);
                  setNuevaResolucion(c.resolucion || "");
                }}
                className="fade-up liquid-glass rounded-3xl p-6 border border-border shadow-2xl flex flex-col gap-3 group hover:border-accent/30 transition-all cursor-pointer"
              >
                {/* Top row: type + status */}
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <span className="p-2.5 rounded-2xl bg-surface-2 border border-border text-text">
                      {TIPO_ICON_MAP[c.tipo] || <MoreHorizontal size={18} />}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-text uppercase tracking-wider">
                        {TIPO_CASO.find((t) => t.key === c.tipo)?.label || c.tipo}
                      </span>
                      <span className="text-[10px] text-text">{dateStr(c.created_at)}</span>
                    </div>
                  </div>
                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${badge.className}`}>
                    {badge.icon} {badge.label}
                  </span>
                </div>

                {/* Description */}
                <p className="text-xs text-text line-clamp-2 italic leading-relaxed">
                  &ldquo;{c.descripcion}&rdquo;
                </p>

                {/* Units info */}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-surface-2 border border-border flex items-center justify-center">
                      <Building size={14} className="text-text" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-text">
                        Reporta: {unidadLabel(c.unidad_reporta)}
                      </span>
                      {c.unidad_reportada && (
                        <span className="text-[10px] text-text">
                          Reportado: {unidadLabel(c.unidad_reportada)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <User size={12} className="text-text/50" />
                    <span className="text-[10px] text-text">{c.creado_por.nombre}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ================================================================== */}
      {/* CREATE MODAL */}
      {/* ================================================================== */}
      {showCreate && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowCreate(false)} />
          <div className="liquid-glass rounded-[32px] p-6 w-full max-w-[440px] max-h-[90vh] overflow-y-auto border border-border relative z-10 flex flex-col gap-5 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowCreate(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-text/5 border border-border flex items-center justify-center text-text hover:bg-text/10 transition-all z-10"
            >
              <X size={16} />
            </button>

            <h2 className="text-lg font-bold text-text">Nuevo Caso de Convivencia</h2>

            {/* Tipo selector */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-text">Tipo de Caso</label>
              <div className="grid grid-cols-4 gap-2">
                {TIPO_CASO.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setFormData((f) => ({ ...f, tipo: t.key }))}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border transition-all ${
                      formData.tipo === t.key
                        ? "bg-[#009df2]/15 text-[#009df2] border-[#009df2]/30"
                        : "bg-surface-2 border-border text-text hover:border-text/30"
                    }`}
                  >
                    {t.icon}
                    <span className="text-[9px] font-bold uppercase">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Unidad que reporta */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-text">
                Unidad que Reporta <span className="text-[#EF4444]">*</span>
              </label>
              <select
                value={formData.unidad_reporta_id}
                onChange={(e) => setFormData((f) => ({ ...f, unidad_reporta_id: e.target.value, unidad_reportada_id: e.target.value === f.unidad_reportada_id ? "" : f.unidad_reportada_id }))}
                className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text focus:outline-none focus:border-accent"
              >
                <option value="">Seleccionar unidad...</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>{u.label}</option>
                ))}
              </select>
            </div>

            {/* Unidad reportada */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-text">Unidad Reportada (opcional)</label>
              <select
                value={formData.unidad_reportada_id}
                onChange={(e) => setFormData((f) => ({ ...f, unidad_reportada_id: e.target.value }))}
                className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text focus:outline-none focus:border-accent"
              >
                <option value="">Ninguna</option>
                {unidades.filter((u) => u.id !== formData.unidad_reporta_id).map((u) => (
                  <option key={u.id} value={u.id}>{u.label}</option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-text">
                Descripción <span className="text-[#EF4444]">*</span>
              </label>
              <textarea
                rows={4}
                placeholder="Describe el caso de convivencia..."
                value={formData.descripcion}
                onChange={(e) => setFormData((f) => ({ ...f, descripcion: e.target.value }))}
                className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text placeholder:text-text/30 focus:outline-none focus:border-accent resize-none"
              />
            </div>

            {/* Submit */}
            <button
              onClick={handleCreate}
              disabled={isCreating}
              className="w-full py-3.5 rounded-full bg-accent text-primary font-bold text-sm hover:bg-accent/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {isCreating ? "Creando..." : "Crear Caso"}
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* DETAIL MODAL */}
      {/* ================================================================== */}
      {selected && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={() => { setSelected(null); setNuevaResolucion(""); }}
          />
          <div className="liquid-glass rounded-[32px] p-6 w-full max-w-[440px] max-h-[90vh] overflow-y-auto border border-border relative z-10 flex flex-col gap-5 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => { setSelected(null); setNuevaResolucion(""); }}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-text/5 border border-border flex items-center justify-center text-text hover:bg-text/10 transition-all z-10"
            >
              <X size={16} />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 pr-10">
              <span className="p-2.5 rounded-2xl bg-surface-2 border border-border text-text">
                {TIPO_ICON_MAP[selected.tipo] || <MoreHorizontal size={18} />}
              </span>
              <div>
                <h3 className="text-lg font-bold text-text">
                  {TIPO_CASO.find((t) => t.key === selected.tipo)?.label || selected.tipo}
                </h3>
                <span className="text-[10px] text-text uppercase tracking-widest">
                  {dateStr(selected.created_at)} · {getEstadoBadge(selected.estado).label}
                </span>
              </div>
            </div>

            {/* Description */}
            <p className="text-sm text-text leading-relaxed italic bg-surface-2 rounded-2xl p-4 border border-border">
              &ldquo;{selected.descripcion}&rdquo;
            </p>

            {/* Units */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs text-text">
                <Building size={14} /> <span className="font-medium">Reporta:</span> {unidadLabel(selected.unidad_reporta)}
              </div>
              {selected.unidad_reportada && (
                <div className="flex items-center gap-2 text-xs text-text">
                  <Building size={14} /> <span className="font-medium">Reportado:</span> {unidadLabel(selected.unidad_reportada)}
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-text">
                <User size={14} /> <span className="font-medium">Creado por:</span> {selected.creado_por.nombre}
              </div>
            </div>

            {/* Resolución (if exists) */}
            {selected.resolucion && (
              <div className="bg-[#57bf00]/10 border border-[#57bf00]/30 rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#57bf00] mb-1">Resolución</p>
                <p className="text-sm text-text">{selected.resolucion}</p>
              </div>
            )}

            {/* Update form */}
            <div className="flex flex-col gap-3 border-t border-border pt-4">
              <h4 className="text-xs font-bold uppercase tracking-widest text-text">Actualizar Caso</h4>

              {/* Estado selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-text">Nuevo Estado</label>
                <div className="grid grid-cols-3 gap-2">
                  {ESTADO_OPTIONS.map((e) => {
                    const b = getEstadoBadge(e);
                    return (
                      <button
                        key={e}
                        onClick={() => setNuevoEstado(e)}
                        className={`flex items-center justify-center gap-1 px-2 py-2 rounded-xl text-[10px] font-bold uppercase border transition-all ${
                          nuevoEstado === e ? b.className + " shadow-md" : "bg-surface-2 border-border text-text hover:border-text/30"
                        }`}
                      >
                        {b.icon} {b.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Resolution text */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-text">Resolución (opcional)</label>
                <textarea
                  rows={3}
                  placeholder="Describe la resolución del caso..."
                  value={nuevaResolucion}
                  onChange={(e) => setNuevaResolucion(e.target.value)}
                  className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text placeholder:text-text/30 focus:outline-none focus:border-accent resize-none"
                />
              </div>

              <button
                onClick={handleActualizar}
                disabled={isProcessing}
                className="w-full py-3 rounded-full bg-accent text-primary font-bold text-sm hover:bg-accent/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {isProcessing ? "Actualizando..." : "Guardar Cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
