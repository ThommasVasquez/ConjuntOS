"use client";

import { useState, useEffect, useRef } from "react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import {
  CheckCircle2, Clock, AlertTriangle, Wrench, Zap,
  Paintbrush, KeyRound, MoreHorizontal, User, Image as ImageIcon,
  ChevronLeft, ChevronRight, RefreshCw, MessageSquare, AlertCircle,
  X, Loader2, ArrowUpDown, Send, TrendingUp, History,
} from "lucide-react";
import { gsap } from "gsap";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api/client";
import { useRouter } from "next/navigation";
import { useWsSubscription } from "@/hooks/useWebSocket";
import type {
  CatServicio,
  EstadoSolicitud,
  TipoPqr,
  SolicitudDto,
  PrioridadTicket,
  TicketStatsDto,
  TicketComentarioDto,
} from "@/lib/api/types";

// ---------------------------------------------------------------------------
// Extended interface — the admin listing endpoint likely embeds resident info
// ---------------------------------------------------------------------------
interface ResidenteEmbed {
  nombre?: string;
  torre?: string | null;
  apto?: string | null;
}

interface AdminSolicitud extends SolicitudDto {
  residente?: ResidenteEmbed;
  usuario?: ResidenteEmbed;
  solicitante?: ResidenteEmbed;
  creadoEn?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type TabKey = "PENDIENTES" | "EN_PROGRESO" | "FINALIZADAS" | "TODAS";

const CATEGORIAS: { key: CatServicio; label: string; icon: React.ReactNode }[] = [
  { key: "PLOMERIA", label: "Plomería", icon: <Wrench size={14} /> },
  { key: "ELECTRICIDAD", label: "Electricidad", icon: <Zap size={14} /> },
  { key: "CARPINTERIA", label: "Carpintería", icon: <Paintbrush size={14} /> },
  { key: "PINTURA", label: "Pintura", icon: <Paintbrush size={14} /> },
  { key: "CERRAJERIA", label: "Cerrajería", icon: <KeyRound size={14} /> },
  { key: "OTRO", label: "Otro", icon: <MoreHorizontal size={14} /> },
];

const CATEGORIA_ICON_MAP: Record<CatServicio, React.ReactNode> = {
  PLOMERIA: <Wrench size={18} />,
  ELECTRICIDAD: <Zap size={18} />,
  CARPINTERIA: <Paintbrush size={18} />,
  PINTURA: <Paintbrush size={18} />,
  CERRAJERIA: <KeyRound size={18} />,
  OTRO: <MoreHorizontal size={18} />,
};

function getEstadoBadge(estado: EstadoSolicitud): { label: string; className: string; icon: React.ReactNode } {
  switch (estado) {
    case "ABIERTA":
      return {
        label: "Abierta",
        className: "bg-[#EAB308]/15 text-[#EAB308] border border-[#EAB308]/30",
        icon: <AlertCircle size={10} />,
      };
    case "ASIGNADA":
      return {
        label: "Asignada",
        className: "bg-[#009df2]/15 text-[#009df2] border border-[#009df2]/30",
        icon: <User size={10} />,
      };
    case "EN_PROGRESO":
      return {
        label: "En Progreso",
        className: "bg-[#F97316]/15 text-[#F97316] border border-[#F97316]/30",
        icon: <Clock size={10} />,
      };
    case "RESUELTA":
      return {
        label: "Resuelta",
        className: "bg-[#57bf00]/15 text-[#57bf00] border border-[#57bf00]/30",
        icon: <CheckCircle2 size={10} />,
      };
    case "CERRADA":
      return {
        label: "Cerrada",
        className: "bg-[#6B7280]/15 text-[#6B7280] border border-[#6B7280]/30",
        icon: <CheckCircle2 size={10} />,
      };
    default:
      return {
        label: estado,
        className: "bg-text/10 text-text border border-border",
        icon: <AlertCircle size={10} />,
      };
  }
}

function getPrioridadBadge(prioridad: PrioridadTicket): { label: string; className: string } {
  switch (prioridad) {
    case "URGENTE": return { label: "Urgente", className: "bg-[#EF4444]/15 text-[#EF4444] border border-[#EF4444]/30" };
    case "ALTA": return { label: "Alta", className: "bg-[#F97316]/15 text-[#F97316] border border-[#F97316]/30" };
    case "MEDIA": return { label: "Media", className: "bg-[#EAB308]/15 text-[#EAB308] border border-[#EAB308]/30" };
    case "BAJA": return { label: "Baja", className: "bg-[#6B7280]/15 text-[#6B7280] border border-[#6B7280]/30" };
  }
}

const PRIORIDAD_OPTIONS: PrioridadTicket[] = ["BAJA", "MEDIA", "ALTA", "URGENTE"];
const ESTADO_OPTIONS: EstadoSolicitud[] = ["ABIERTA", "ASIGNADA", "EN_PROGRESO", "RESUELTA", "CERRADA"];

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function AdminPQRSPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const role = user?.rol;

  const containerRef = useRef<HTMLDivElement>(null);

  // Data
  const [solicitudes, setSolicitudes] = useState<AdminSolicitud[]>([]);
  const [loading, setLoading] = useState(true);

  // Tabs
  const [tab, setTab] = useState<TabKey>("PENDIENTES");

  // Filters
  const [filtroCategoria, setFiltroCategoria] = useState<CatServicio | null>(null);
  const [filtroUrgente, setFiltroUrgente] = useState(false);

  // Modal detail
  const [selected, setSelected] = useState<AdminSolicitud | null>(null);
  const [nuevoEstado, setNuevoEstado] = useState<EstadoSolicitud>("ASIGNADA");
  const [nuevaPrioridad, setNuevaPrioridad] = useState<PrioridadTicket>("MEDIA");
  const [proveedorId, setProveedorId] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Stats + Comentarios
  const [stats, setStats] = useState<TicketStatsDto | null>(null);
  const [comentarios, setComentarios] = useState<TicketComentarioDto[]>([]);
  const [nuevoComentario, setNuevoComentario] = useState("");
  const [cargandoComentarios, setCargandoComentarios] = useState(false);
  const [enviandoComentario, setEnviandoComentario] = useState(false);

  // Image gallery in modal
  const [imgIdx, setImgIdx] = useState(0);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const buildQuery = (): string => {
    const params = new URLSearchParams();
    if (tab === "PENDIENTES") params.set("estado", "ABIERTA");
    else if (tab === "EN_PROGRESO") params.set("estado", "ASIGNADA,EN_PROGRESO");
    else if (tab === "FINALIZADAS") params.set("estado", "RESUELTA,CERRADA");
    // TODAS: no estado filter

    if (filtroCategoria) params.set("categoria", filtroCategoria);
    if (filtroUrgente) params.set("urgente", "true");

    const qs = params.toString();
    return qs ? `?${qs}` : "";
  };

  const fetchSolicitudes = async () => {
    setLoading(true);
    try {
      const items = await api.get<AdminSolicitud[]>(`/admin/solicitudes${buildQuery()}`);
      setSolicitudes(items);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.detail : "Error de conexión";
      toast.error(`Error al cargar solicitudes: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  // Real-time WebSocket
  useWsSubscription("solicitud", () => fetchSolicitudes());

  const fetchStats = async () => {
    try {
      const data = await api.get<TicketStatsDto>("/admin/solicitudes/stats");
      setStats(data);
    } catch { /* silencioso */ }
  };

  const fetchComentarios = async (ticketId: string) => {
    setCargandoComentarios(true);
    try {
      const data = await api.get<TicketComentarioDto[]>(`/admin/solicitudes/${ticketId}/comentarios`);
      setComentarios(data);
    } catch {
      setComentarios([]);
    } finally {
      setCargandoComentarios(false);
    }
  };

  const postComentario = async () => {
    if (!selected || !nuevoComentario.trim()) return;
    setEnviandoComentario(true);
    try {
      await api.post(`/admin/solicitudes/${selected.id}/comentarios`, {
        contenido: nuevoComentario.trim(),
      });
      toast.success("Comentario agregado");
      setNuevoComentario("");
      fetchComentarios(selected.id);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.detail : "Error al enviar";
      toast.error(msg);
    } finally {
      setEnviandoComentario(false);
    }
  };

  // -----------------------------------------------------------------------
  // Auth guard + initial load
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    const allowed = ["ADMINISTRADOR", "SUPER_ADMIN"];
    if (!role || !allowed.includes(role)) {
      toast.error("No tienes permisos para acceder a esta sección.");
      router.push("/inicio");
      return;
    }
    fetchSolicitudes();
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user, authLoading, role, router, filtroCategoria, filtroUrgente]);

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
  // Mutation: change status
  // -----------------------------------------------------------------------

  const handleCambiarEstado = async () => {
    if (!selected) return;
    setIsProcessing(true);
    try {
      await api.put(`/admin/solicitudes/${selected.id}`, {
        estado: nuevoEstado,
        prioridad: nuevaPrioridad,
        proveedor_id: proveedorId.trim() || undefined,
      });
      toast.success(`Solicitud actualizada a "${nuevoEstado}"`);
      setSelected(null);
      setProveedorId("");
      setImgIdx(0);
      fetchSolicitudes();
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

  const getResidente = (s: AdminSolicitud): ResidenteEmbed => {
    return s.residente || s.usuario || s.solicitante || {};
  };

  const pendingCount = solicitudes.filter((s) => s.estado === "ABIERTA").length;

  const dateStr = (s: AdminSolicitud): string => {
    const d = s.createdAt || s.creadoEn || "";
    try {
      return new Date(d).toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return d;
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen relative overflow-x-hidden"
    >
      <ProfileHeader />

      {/* Header */}
      <div className="fade-up flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-medium text-text tracking-wide">
            Solicitudes de Servicio
          </h1>
          <p className="text-sm text-text">
            Gestión de PQRS y mantenimiento
          </p>
        </div>
        <div className="flex items-center gap-3">
          {pendingCount > 0 && (
            <span className="bg-[#EAB308]/15 text-[#EAB308] border border-[#EAB308]/30 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5">
              <AlertCircle size={12} />
              {pendingCount} pendiente{pendingCount !== 1 ? "s" : ""}
            </span>
          )}
          <button
            onClick={fetchSolicitudes}
            className="p-2 rounded-full hover:bg-surface-2 transition-colors"
          >
            <RefreshCw size={18} className="text-text" />
          </button>
        </div>
      </div>

      {/* Stats Dashboard */}
      {stats && (
        <div className="fade-up grid grid-cols-4 gap-2">
          {[
            { label: "Abiertos", value: stats.abiertos, color: "bg-[#EAB308]/10 text-[#EAB308] border-[#EAB308]/20" },
            { label: "En Progreso", value: stats.enProgreso, color: "bg-[#F97316]/10 text-[#F97316] border-[#F97316]/20" },
            { label: "Resueltos", value: stats.resueltos, color: "bg-[#57bf00]/10 text-[#57bf00] border-[#57bf00]/20" },
            { label: "SLA Vencido", value: stats.slaVencidos, color: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20" },
          ].map((item) => (
            <div
              key={item.label}
              className={`flex flex-col items-center gap-1 p-3 rounded-2xl border ${item.color}`}
            >
              <span className="text-2xl font-display font-bold">{item.value}</span>
              <span className="text-[9px] font-bold uppercase tracking-wide">{item.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="fade-up flex bg-surface-2 rounded-full p-1 border border-border">
        {(
          [
            ["PENDIENTES", "Pendientes"],
            ["EN_PROGRESO", "En Progreso"],
            ["FINALIZADAS", "Finalizadas"],
            ["TODAS", "Todas"],
          ] as [TabKey, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-3 rounded-full text-[10px] font-bold uppercase tracking-wide whitespace-nowrap transition-all ${
              tab === key
                ? "bg-accent text-primary shadow-md"
                : "text-text hover:text-text"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="fade-up flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-text mr-1">
          <ArrowUpDown size={12} className="inline mr-1" />
          Categoría:
        </span>
        {CATEGORIAS.map((cat) => (
          <button
            key={cat.key}
            onClick={() =>
              setFiltroCategoria((prev) => (prev === cat.key ? null : cat.key))
            }
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide border transition-all ${
              filtroCategoria === cat.key
                ? "bg-[#009df2]/15 text-[#009df2] border-[#009df2]/30"
                : "bg-surface-2 border-border text-text hover:border-text/30"
            }`}
          >
            {cat.icon}
            {cat.label}
          </button>
        ))}

        <div className="w-px h-5 bg-border mx-1" />

        <button
          onClick={() => setFiltroUrgente((prev) => !prev)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide border transition-all ${
            filtroUrgente
              ? "bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/30"
              : "bg-surface-2 border-border text-text hover:border-text/30"
          }`}
        >
          <AlertTriangle size={12} />
          Urgente
        </button>

        {(filtroCategoria || filtroUrgente) && (
          <button
            onClick={() => {
              setFiltroCategoria(null);
              setFiltroUrgente(false);
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-text bg-text/5 border border-border hover:bg-text/10 transition-all"
          >
            <X size={12} />
            Limpiar
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex flex-col gap-4">
        {loading ? (
          <div className="w-full py-12 flex justify-center">
            <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
          </div>
        ) : solicitudes.length === 0 ? (
          <div className="fade-up liquid-glass rounded-3xl p-8 border border-border text-center">
            <CheckCircle2 size={40} className="mx-auto text-text/50 mb-3" />
            <p className="text-text font-medium">Bandeja al día</p>
            <p className="text-xs text-text mt-1">
              No hay solicitudes en esta sección.
            </p>
          </div>
        ) : (
          solicitudes.map((s) => {
            const residente = getResidente(s);
            const badge = getEstadoBadge(s.estado);
            const imgs = s.imagenes ?? [];

            return (
              <div
                key={s.id}
                onClick={() => {
                  setSelected(s);
                  setNuevoEstado(s.estado);
                  setNuevaPrioridad((s as any).prioridad || "MEDIA");
                  setProveedorId("");
                  setImgIdx(0);
                  setComentarios([]);
                  fetchComentarios(s.id);
                }}
                className="fade-up liquid-glass rounded-3xl p-6 border border-border shadow-2xl flex flex-col gap-3 group hover:border-accent/30 transition-all cursor-pointer"
              >
                {/* Top row: category + type + status badge */}
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <span className="p-2.5 rounded-2xl bg-surface-2 border border-border text-text">
                      {CATEGORIA_ICON_MAP[s.categoria] || <MoreHorizontal size={18} />}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-text uppercase tracking-wide">
                        {s.categoria}
                      </span>
                      <span className="text-[10px] text-text">
                        {s.tipo} • {dateStr(s)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {(s as any).prioridad && (
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${getPrioridadBadge((s as any).prioridad || "MEDIA").className}`}>
                        {getPrioridadBadge((s as any).prioridad || "MEDIA").label}
                      </span>
                    )}
                    {s.urgente && (
                      <span className="bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/30 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <AlertTriangle size={10} />
                        Urgente
                      </span>
                    )}
                    <span
                      className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${badge.className}`}
                    >
                      {badge.icon}
                      {badge.label}
                    </span>
                  </div>
                </div>

                {/* Description (truncated) */}
                <p className="text-xs text-text line-clamp-2 italic leading-relaxed">
                  &ldquo;{s.descripcion}&rdquo;
                </p>

                {/* Resident info + images */}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-surface-2 border border-border flex items-center justify-center">
                      <User size={14} className="text-text" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-text">
                        {residente.nombre || "Residente"}
                      </span>
                      {(residente.torre || residente.apto) && (
                        <span className="text-[10px] text-text">
                          T{residente.torre || "?"} - A{residente.apto || "?"}
                        </span>
                      )}
                    </div>
                  </div>

                  {imgs.length > 0 && (
                    <div className="flex items-center gap-1">
                      <ImageIcon size={14} className="text-text" />
                      <span className="text-[10px] text-text font-bold">
                        {imgs.length} foto{imgs.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ================================================================== */}
      {/* MODAL: Solicitud Detail */}
      {/* ================================================================== */}
      {selected && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={() => {
              setSelected(null);
              setImgIdx(0);
            }}
          />

          <div className="liquid-glass rounded-[32px] p-6 w-full max-w-[440px] max-h-[90vh] overflow-y-auto border border-border relative z-10 flex flex-col gap-5 animate-in zoom-in-95 duration-200">
            {/* Close button */}
            <button
              onClick={() => {
                setSelected(null);
                setImgIdx(0);
              }}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-text/5 border border-border flex items-center justify-center text-text hover:bg-text/10 transition-all z-10"
            >
              <X size={16} />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 pr-10">
              <span className="p-2.5 rounded-2xl bg-surface-2 border border-border text-text">
                {CATEGORIA_ICON_MAP[selected.categoria] || <MoreHorizontal size={18} />}
              </span>
              <div>
                <h3 className="text-lg font-bold text-text">
                  {selected.categoria}
                </h3>
                <span className="text-[10px] text-text uppercase tracking-widest">
                  {selected.tipo} • {dateStr(selected)}
                </span>
              </div>
            </div>

            {/* Badges */}
            <div className="flex items-center gap-2">
              {(() => {
                const badge = getEstadoBadge(selected.estado);
                return (
                  <span
                    className={`text-[10px] uppercase font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${badge.className}`}
                  >
                    {badge.icon}
                    Estado: {badge.label}
                  </span>
                );
              })()}
              {selected.urgente && (
                <span className="bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/30 text-[10px] uppercase font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
                  <AlertTriangle size={10} />
                  Urgente
                </span>
              )}
            </div>

            {/* Resident info */}
            {(() => {
              const r = getResidente(selected);
              return (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-2 border border-border">
                  <div className="w-9 h-9 rounded-full bg-text/5 border border-border flex items-center justify-center">
                    <User size={18} className="text-text" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-text block">
                      {r.nombre || "Residente"}
                    </span>
                    {(r.torre || r.apto) && (
                      <span className="text-[10px] text-text font-bold">
                        Torre {r.torre || "?"} — Apto {r.apto || "?"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Full description */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] text-text uppercase tracking-[0.2em] font-black">
                Descripción
              </span>
              <p className="text-xs text-text leading-relaxed bg-surface-2 rounded-xl p-4 border border-border">
                {selected.descripcion}
              </p>
            </div>

            {/* Image gallery */}
            {(selected.imagenes ?? []).length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-[10px] text-text uppercase tracking-[0.2em] font-black">
                  Imágenes ({selected.imagenes.length})
                </span>

                {/* Current image */}
                <div className="relative rounded-2xl overflow-hidden border border-border bg-surface-2 aspect-video">
                  <img
                    src={selected.imagenes[imgIdx]}
                    alt={`Imagen ${imgIdx + 1}`}
                    className="w-full h-full object-cover"
                  />

                  {/* Navigation arrows */}
                  {selected.imagenes.length > 1 && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setImgIdx((prev) =>
                            prev === 0 ? selected.imagenes.length - 1 : prev - 1
                          );
                        }}
                        className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white hover:bg-black/70 transition-all"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setImgIdx((prev) =>
                            prev === selected.imagenes.length - 1 ? 0 : prev + 1
                          );
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white hover:bg-black/70 transition-all"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </>
                  )}

                  {/* Dot indicators */}
                  {selected.imagenes.length > 1 && (
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {selected.imagenes.map((_, i) => (
                        <button
                          key={i}
                          onClick={(e) => {
                            e.stopPropagation();
                            setImgIdx(i);
                          }}
                          className={`w-2 h-2 rounded-full transition-all ${
                            i === imgIdx
                              ? "bg-white scale-110"
                              : "bg-white/40 hover:bg-white/60"
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Thumbnails */}
                {selected.imagenes.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
                    {selected.imagenes.map((img, i) => (
                      <button
                        key={i}
                        onClick={(e) => {
                          e.stopPropagation();
                          setImgIdx(i);
                        }}
                        className={`shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${
                          i === imgIdx
                            ? "border-accent"
                            : "border-border hover:border-text/30 opacity-60 hover:opacity-100"
                        }`}
                      >
                        <img
                          src={img}
                          alt={`Thumb ${i + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Estado change section */}
            <div className="flex flex-col gap-3 p-4 rounded-2xl bg-surface-2 border border-border">
              <span className="text-[10px] text-text uppercase tracking-[0.2em] font-black">
                Cambiar Estado
              </span>

              <select
                value={nuevoEstado}
                onChange={(e) => setNuevoEstado(e.target.value as EstadoSolicitud)}
                className="w-full bg-surface-2 border border-border rounded-xl px-4 py-3 text-xs text-text outline-none focus:border-accent"
              >
                {ESTADO_OPTIONS.map((opt) => {
                  const badge = getEstadoBadge(opt);
                  return (
                    <option key={opt} value={opt} className="bg-primary text-text">
                      {badge.label}
                    </option>
                  );
                })}
              </select>

              <select
                value={nuevaPrioridad}
                onChange={(e) => setNuevaPrioridad(e.target.value as PrioridadTicket)}
                className="w-full bg-surface-2 border border-border rounded-xl px-4 py-3 text-xs text-text outline-none focus:border-accent"
              >
                {PRIORIDAD_OPTIONS.map((opt) => {
                  const pb = getPrioridadBadge(opt);
                  return (
                    <option key={opt} value={opt} className="bg-primary text-text">
                      Prioridad: {pb.label}
                    </option>
                  );
                })}
              </select>

              <input
                type="text"
                value={proveedorId}
                onChange={(e) => setProveedorId(e.target.value)}
                placeholder="ID del proveedor (opcional)"
                className="w-full bg-surface-2 border border-border rounded-xl px-4 py-3 text-xs text-text outline-none focus:border-accent"
              />

              <button
                disabled={isProcessing}
                onClick={handleCambiarEstado}
                className="w-full py-3 rounded-full bg-[#57bf00] text-white shadow-xl shadow-[#57bf00]/30 font-bold text-sm tracking-wide active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Actualizando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    Guardar Cambios
                  </>
                )}
              </button>
            </div>

            {/* Quick actions */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setNuevoEstado("CERRADA");
                  handleCambiarEstado();
                }}
                disabled={isProcessing || selected.estado === "CERRADA"}
                className="flex-1 py-3 rounded-full border border-[#6B7280]/30 text-[#6B7280] font-bold text-xs tracking-wide hover:bg-[#6B7280]/10 transition-colors disabled:opacity-40"
              >
                Cerrar Ticket
              </button>
              <button
                onClick={() => {
                  setNuevoEstado("ABIERTA");
                  handleCambiarEstado();
                }}
                disabled={isProcessing || selected.estado === "ABIERTA"}
                className="flex-1 py-3 rounded-full border border-[#EAB308]/30 text-[#EAB308] font-bold text-xs tracking-wide hover:bg-[#EAB308]/10 transition-colors disabled:opacity-40"
              >
                Reabrir
              </button>
            </div>

            {/* Comentarios */}
            <div className="flex flex-col gap-3 pt-2 border-t border-border">
              <span className="text-[10px] text-text uppercase tracking-[0.2em] font-black flex items-center gap-1.5">
                <MessageSquare size={12} />
                Comentarios ({comentarios.length})
              </span>

              {cargandoComentarios ? (
                <div className="w-5 h-5 border-2 border-border border-t-accent rounded-full animate-spin mx-auto" />
              ) : comentarios.length === 0 ? (
                <p className="text-[10px] text-text italic text-center py-2">
                  Sin comentarios aún
                </p>
              ) : (
                <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
                  {comentarios.map((c) => (
                    <div key={c.id} className="bg-surface-2 rounded-xl p-3 border border-border">
                      <p className="text-xs text-text leading-relaxed">{c.contenido}</p>
                      <span className="text-[9px] text-text mt-1 block">
                        {new Date(c.createdAt).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Add comment */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nuevoComentario}
                  onChange={(e) => setNuevoComentario(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && postComentario()}
                  placeholder="Escribir comentario..."
                  className="flex-1 bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-xs text-text outline-none focus:border-accent"
                />
                <button
                  onClick={postComentario}
                  disabled={enviandoComentario || !nuevoComentario.trim()}
                  className="px-3 py-2.5 rounded-xl bg-accent text-primary font-bold text-xs flex items-center gap-1 disabled:opacity-40 active:scale-95 transition-transform"
                >
                  {enviandoComentario ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
