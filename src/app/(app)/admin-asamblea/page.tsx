"use client";

import { useState, useEffect, useRef } from "react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import {
  Video,
  Users,
  Vote,
  ListOrdered,
  FileCheck,
  Hand,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Plus,
  X,
  Play,
  Square,
  ToggleLeft,
  ToggleRight,
  Shield,
  MessageSquare,
  AlertCircle,
  Clock,
  UserCheck,
  UserX,
} from "lucide-react";
import { gsap } from "gsap";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api/client";
import { useRouter } from "next/navigation";
import { useWsSubscription } from "@/hooks/useWebSocket";
import type { LiveKitTokenDto } from "@/lib/api/types";

// ---------------------------------------------------------------------------
// Local DTOs (mirror backend/api/src/domains/asamblea/dto.rs)
// ---------------------------------------------------------------------------

interface OrdenDiaItem {
  id?: string;
  titulo: string;
  descripcion?: string;
}

interface AsambleaDto {
  id: string;
  titulo: string;
  descripcion: string | null;
  fecha: string;
  activa: boolean;
  ordenDia: OrdenDiaItem[];
  itemActivoIndex: number;
  sessionState: unknown;
  version: number;
}

interface VotacionDto {
  id: string;
  asambleaId: string;
  titulo: string;
  descripcion: string | null;
  opciones: string[];
  activa: boolean;
  createdAt: string;
}

interface QuorumDto {
  quorum_porcentaje: number;
}

interface AsistenciaDto {
  id: string;
  asambleaId: string;
  usuarioId: string;
  tipo: string;
  verificado: boolean;
  ip: string | null;
  dispositivo: string | null;
  createdAt: string;
}

interface QuorumResponse {
  asistencias: AsistenciaDto[];
  totalCoeficiente: number;
  presenteCoeficiente: number;
  quorumPorcentaje: number;
}

interface TurnoDto {
  id: string;
  asambleaId: string;
  usuarioId: string;
  nombre: string;
  apto: string | null;
  estado: string;
  createdAt: string;
}

interface PoderDto {
  id: string;
  asambleaId: string;
  otorganteId: string;
  apoderadoId: string;
  documentoUrl: string;
  verificado: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type TabKey = "sesion" | "votaciones" | "asistencias" | "turnos" | "poderes";

const TURNO_ESTADOS = ["PENDIENTE", "HABLANDO", "COMPLETADO"] as const;

const ESTADO_TURNO_BADGE: Record<string, { label: string; className: string }> = {
  PENDIENTE: { label: "Pendiente", className: "bg-[#EAB308]/15 text-[#EAB308] border border-[#EAB308]/30" },
  HABLANDO: { label: "Hablando", className: "bg-[#57bf00]/15 text-[#57bf00] border border-[#57bf00]/30" },
  COMPLETADO: { label: "Completado", className: "bg-[#009df2]/15 text-[#009df2] border border-[#009df2]/30" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-CO", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return iso; }
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("es-CO", {
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return ""; }
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function AdminAsambleaPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const role = user?.rol;
  const containerRef = useRef<HTMLDivElement>(null);

  const [tab, setTab] = useState<TabKey>("sesion");
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);

  // ── Session ───────────────────────────────────────────────────────────────
  const [asamblea, setAsamblea] = useState<AsambleaDto | null>(null);
  const [savingSession, setSavingSession] = useState(false);
  const [liveKitToken, setLiveKitToken] = useState<LiveKitTokenDto | null>(null);

  // ── Votaciones ────────────────────────────────────────────────────────────
  const [votaciones, setVotaciones] = useState<VotacionDto[]>([]);
  const [loadingVotaciones, setLoadingVotaciones] = useState(false);
  const [showVotacionModal, setShowVotacionModal] = useState(false);
  const [votacionForm, setVotacionForm] = useState({ titulo: "", descripcion: "", opciones: "" });
  const [savingVotacion, setSavingVotacion] = useState(false);

  // ── Asistencias / Quorum ──────────────────────────────────────────────────
  const [quorum, setQuorum] = useState<QuorumResponse | null>(null);
  const [loadingQuorum, setLoadingQuorum] = useState(false);

  // ── Turnos ────────────────────────────────────────────────────────────────
  const [turnos, setTurnos] = useState<TurnoDto[]>([]);
  const [loadingTurnos, setLoadingTurnos] = useState(false);

  // ── Poderes ───────────────────────────────────────────────────────────────
  const [poderes, setPoderes] = useState<PoderDto[]>([]);
  const [loadingPoderes, setLoadingPoderes] = useState(false);

  // =====================================================================
  // Data fetching
  // =====================================================================

  const fetchSession = async () => {
    setLoading(true);
    try {
      const data = await api.get<AsambleaDto>("/asambleas/activa/session");
      setAsamblea(data);
    } catch {
      setAsamblea(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchVotaciones = async () => {
    if (!asamblea) return;
    setLoadingVotaciones(true);
    try {
      const data = await api.get<VotacionDto[]>(`/asambleas/${asamblea.id}/votaciones`);
      setVotaciones(data);
    } catch {
      toast.error("Error al cargar votaciones");
    } finally {
      setLoadingVotaciones(false);
    }
  };

  const fetchQuorum = async () => {
    if (!asamblea) return;
    setLoadingQuorum(true);
    try {
      const data = await api.get<QuorumResponse>(`/asambleas/${asamblea.id}/asistencias`);
      setQuorum(data);
    } catch {
      // silent
    } finally {
      setLoadingQuorum(false);
    }
  };

  const fetchTurnos = async () => {
    if (!asamblea) return;
    setLoadingTurnos(true);
    try {
      const data = await api.get<TurnoDto[]>(`/asambleas/${asamblea.id}/turnos`);
      setTurnos(data);
    } catch {
      toast.error("Error al cargar turnos");
    } finally {
      setLoadingTurnos(false);
    }
  };

  const fetchPoderes = async () => {
    if (!asamblea) return;
    setLoadingPoderes(true);
    try {
      const data = await api.get<PoderDto[]>(`/asambleas/${asamblea.id}/poderes`);
      setPoderes(data);
    } catch {
      toast.error("Error al cargar poderes");
    } finally {
      setLoadingPoderes(false);
    }
  };

  const fetchLiveKitToken = async () => {
    if (!asamblea) return;
    try {
      const data = await api.get<LiveKitTokenDto>(`/asambleas/${asamblea.id}/livekit-token`);
      setLiveKitToken(data);
      toast.success("Token LiveKit generado");
    } catch {
      toast.error("Error al generar token LiveKit");
    }
  };

  const fetchAll = () => {
    fetchVotaciones();
    fetchQuorum();
    fetchTurnos();
    fetchPoderes();
  };

  // =====================================================================
  // WS subscription
  // =====================================================================

  useWsSubscription("asamblea", () => {
    fetchSession();
    if (asamblea) fetchAll();
  });

  // =====================================================================
  // Auth guard + initial load
  // =====================================================================

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
    fetchSession().finally(() => setInitialLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, role, router]);

  // Fetch tab data when session loads or tab changes
  useEffect(() => {
    if (initialLoading || !asamblea) return;
    if (tab === "votaciones") fetchVotaciones();
    else if (tab === "asistencias") fetchQuorum();
    else if (tab === "turnos") fetchTurnos();
    else if (tab === "poderes") fetchPoderes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, asamblea, initialLoading]);

  // =====================================================================
  // GSAP animations
  // =====================================================================

  useEffect(() => {
    if (!initialLoading) {
      const ctx = gsap.context(() => {
        gsap.fromTo(
          ".fade-up",
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, stagger: 0.08, duration: 0.45, ease: "power2.out" },
        );
      }, containerRef);
      return () => ctx.revert();
    }
  }, [initialLoading, tab, asamblea]);

  // =====================================================================
  // Session mutations
  // =====================================================================

  const toggleSession = async (activa: boolean) => {
    if (!asamblea) return;
    setSavingSession(true);
    try {
      await api.put("/asambleas/activa/session", {
        activa,
        sessionState: activa ? "INICIADA" : "FINALIZADA",
        version: asamblea.version,
      });
      toast.success(activa ? "Asamblea iniciada" : "Asamblea finalizada");
      fetchSession();
    } catch (e: unknown) {
      toast.error(e instanceof ApiError ? e.detail : "Error al actualizar sesión");
    } finally {
      setSavingSession(false);
    }
  };

  // =====================================================================
  // Votacion mutations
  // =====================================================================

  const handleCreateVotacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asamblea || !votacionForm.titulo.trim()) {
      toast.error("El título es obligatorio");
      return;
    }
    setSavingVotacion(true);
    try {
      const opciones = votacionForm.opciones
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean);

      await api.post(`/asambleas/${asamblea.id}/votaciones`, {
        titulo: votacionForm.titulo.trim(),
        descripcion: votacionForm.descripcion.trim() || undefined,
        opciones: opciones.length > 0 ? opciones : undefined,
      });
      toast.success("Votación creada");
      setShowVotacionModal(false);
      setVotacionForm({ titulo: "", descripcion: "", opciones: "" });
      fetchVotaciones();
    } catch (e: unknown) {
      toast.error(e instanceof ApiError ? e.detail : "Error al crear votación");
    } finally {
      setSavingVotacion(false);
    }
  };

  const toggleVotacion = async (vid: string, activa: boolean) => {
    if (!asamblea) return;
    try {
      await api.put(`/asambleas/${asamblea.id}/votaciones/${vid}`, { activa });
      toast.success(activa ? "Votación abierta" : "Votación cerrada");
      fetchVotaciones();
    } catch {
      toast.error("Error al actualizar votación");
    }
  };

  // =====================================================================
  // Turno mutations
  // =====================================================================

  const updateTurno = async (tid: string, estado: string) => {
    if (!asamblea) return;
    try {
      await api.put(`/asambleas/${asamblea.id}/turnos/${tid}`, { estado });
      toast.success("Turno actualizado");
      fetchTurnos();
    } catch {
      toast.error("Error al actualizar turno");
    }
  };

  // =====================================================================
  // Poder mutations
  // =====================================================================

  const togglePoder = async (pid: string, verificado: boolean) => {
    if (!asamblea) return;
    try {
      await api.put(`/asambleas/${asamblea.id}/poderes/${pid}`, { verificado });
      toast.success(verificado ? "Poder verificado" : "Verificación removida");
      fetchPoderes();
    } catch {
      toast.error("Error al actualizar poder");
    }
  };

  // =====================================================================
  // Loading state
  // =====================================================================

  if (authLoading || initialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  // =====================================================================
  // Render
  // =====================================================================

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
            Administrar Asamblea
          </h1>
          <p className="text-sm text-text" style={{ opacity: 0.6 }}>
            Gestión de asambleas, votaciones y quórum
          </p>
        </div>
        <button
          onClick={() => {
            fetchSession();
            if (asamblea) fetchAll();
          }}
          className="p-2 rounded-full hover:bg-surface-2 transition-colors"
        >
          <RefreshCw size={18} className="text-text" />
        </button>
      </div>

      {/* ── Session Card ──────────────────────────────────────────────────── */}
      <div className="fade-up liquid-glass rounded-3xl p-6 border border-border shadow-2xl flex flex-col gap-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
          </div>
        ) : !asamblea ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <Video size={48} className="text-text" style={{ opacity: 0.3 }} />
            <div>
              <p className="text-text font-medium text-lg">No hay asamblea activa</p>
              <p className="text-xs text-text mt-1" style={{ opacity: 0.5 }}>
                Inicia una nueva asamblea desde el panel de administración.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Session info */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                  asamblea.activa
                    ? "bg-[#57bf00]/10 border border-[#57bf00]/30"
                    : "bg-text/10 border border-text/20"
                }`}>
                  {asamblea.activa
                    ? <Play size={24} className="text-[#57bf00]" />
                    : <Square size={24} className="text-text" />
                  }
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-text truncate">{asamblea.titulo}</h2>
                  {asamblea.descripcion && (
                    <p className="text-xs text-text truncate mt-0.5" style={{ opacity: 0.6 }}>
                      {asamblea.descripcion}
                    </p>
                  )}
                  <p className="text-[10px] text-text mt-1" style={{ opacity: 0.4 }}>
                    {fmtDate(asamblea.fecha)} · v{asamblea.version}
                  </p>
                </div>
              </div>

              <span className={`shrink-0 text-[10px] font-bold uppercase px-3 py-1 rounded-full border flex items-center gap-1.5 ${
                asamblea.activa
                  ? "bg-[#57bf00]/15 text-[#57bf00] border-[#57bf00]/30"
                  : "bg-text/10 text-text border-border"
              }`}>
                <span className={`w-2 h-2 rounded-full ${asamblea.activa ? "bg-[#57bf00] animate-pulse" : "bg-text/30"}`} />
                {asamblea.activa ? "En Vivo" : "Finalizada"}
              </span>
            </div>

            {/* Orden del día summary */}
            {Array.isArray(asamblea.ordenDia) && asamblea.ordenDia.length > 0 && (
              <div className="flex flex-col gap-1.5 p-3 rounded-2xl bg-surface-2 border border-border">
                <span className="text-[10px] text-text uppercase tracking-[0.2em] font-black flex items-center gap-1.5">
                  <ListOrdered size={12} />
                  Orden del día
                </span>
                <div className="flex flex-col gap-1">
                  {asamblea.ordenDia.map((item, i) => (
                    <div key={item.id ?? i} className="flex items-center gap-2 text-xs">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                        i === asamblea.itemActivoIndex
                          ? "bg-[#57bf00]/20 text-[#57bf00]"
                          : i < asamblea.itemActivoIndex
                            ? "bg-text/10 text-text"
                            : "bg-surface-2 text-text/40"
                      }`}>
                        {i + 1}
                      </span>
                      <span className={`truncate ${i === asamblea.itemActivoIndex ? "font-bold text-text" : i < asamblea.itemActivoIndex ? "text-text/40 line-through" : "text-text/60"}`}>
                        {item.titulo}
                      </span>
                      {i === asamblea.itemActivoIndex && (
                        <span className="text-[#57bf00] text-[9px] font-bold uppercase shrink-0 ml-auto">
                          Actual
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              {!asamblea.activa ? (
                <button
                  disabled={savingSession}
                  onClick={() => toggleSession(true)}
                  className="flex-1 py-3 rounded-full bg-[#57bf00] text-white font-bold text-sm shadow-lg shadow-[#57bf00]/30 active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {savingSession ? (
                    <><Loader2 size={16} className="animate-spin" /> Iniciando...</>
                  ) : (
                    <><Play size={16} /> Iniciar Asamblea</>
                  )}
                </button>
              ) : (
                <button
                  disabled={savingSession}
                  onClick={() => toggleSession(false)}
                  className="flex-1 py-3 rounded-full bg-[#EF4444] text-white font-bold text-sm shadow-lg shadow-[#EF4444]/30 active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {savingSession ? (
                    <><Loader2 size={16} className="animate-spin" /> Finalizando...</>
                  ) : (
                    <><Square size={16} /> Finalizar Asamblea</>
                  )}
                </button>
              )}

              {asamblea.activa && (
                <button
                  onClick={fetchLiveKitToken}
                  className="px-5 py-3 rounded-full bg-[#009df2]/15 text-[#009df2] border border-[#009df2]/30 font-bold text-xs active:scale-95 transition-transform flex items-center gap-2"
                >
                  <Video size={16} />
                  LiveKit
                </button>
              )}
            </div>

            {liveKitToken && (
              <div className="p-3 rounded-2xl bg-surface-2 border border-border text-xs text-text break-all">
                <span className="text-[10px] text-text uppercase tracking-[0.2em] font-black block mb-1">LiveKit Token</span>
                <p className="truncate">{liveKitToken.token}</p>
                <p className="text-text/60 mt-1">URL: {liveKitToken.url}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Tabs (only visible when asamblea is active) ──────────────────── */}
      {asamblea && (
        <>
          <div className="fade-up flex bg-surface-2 rounded-full p-1 border border-border">
            {([
              ["sesion", "Sesión", <Play key="s" size={14} />],
              ["votaciones", "Votaciones", <Vote key="v" size={14} />],
              ["asistencias", "Quórum", <Users key="q" size={14} />],
              ["turnos", "Turnos", <Hand key="t" size={14} />],
              ["poderes", "Poderes", <FileCheck key="p" size={14} />],
            ] as [TabKey, string, React.ReactNode][]).map(([key, label, icon]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center justify-center gap-1.5 flex-1 py-3 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
                  tab === key
                    ? "bg-accent text-primary shadow-md"
                    : "text-text hover:text-text"
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* TAB: VOTACIONES */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {tab === "votaciones" && (
            <div className="flex flex-col gap-4">
              {/* Header + Create button */}
              <div className="fade-up flex items-center justify-between">
                <span className="text-[10px] text-text uppercase tracking-[0.2em] font-black">
                  {votaciones.length} votacion{votaciones.length !== 1 ? "es" : ""}
                </span>
                <button
                  onClick={() => {
                    setVotacionForm({ titulo: "", descripcion: "", opciones: "" });
                    setShowVotacionModal(true);
                  }}
                  className="flex items-center gap-1.5 bg-[#57bf00] text-white rounded-full shadow-lg shadow-[#57bf00]/30 px-4 py-2 text-xs font-bold active:scale-95 transition-transform"
                >
                  <Plus size={14} />
                  Nueva
                </button>
              </div>

              {loadingVotaciones ? (
                <div className="w-full py-12 flex justify-center">
                  <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
                </div>
              ) : votaciones.length === 0 ? (
                <div className="fade-up liquid-glass rounded-3xl p-8 border border-border text-center">
                  <Vote size={40} className="mx-auto text-text mb-3" style={{ opacity: 0.4 }} />
                  <p className="text-text font-medium">Sin votaciones</p>
                  <p className="text-xs text-text mt-1" style={{ opacity: 0.5 }}>
                    Crea la primera votación usando el botón superior.
                  </p>
                </div>
              ) : (
                votaciones.map((v) => (
                  <div
                    key={v.id}
                    className="fade-up liquid-glass rounded-3xl p-5 border border-border shadow-2xl flex flex-col gap-3 group hover:border-accent/30 transition-all"
                  >
                    {/* Top row */}
                    <div className="flex justify-between items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-bold text-text block truncate">{v.titulo}</span>
                        {v.descripcion && (
                          <p className="text-xs text-text mt-0.5 line-clamp-2" style={{ opacity: 0.6 }}>
                            {v.descripcion}
                          </p>
                        )}
                      </div>
                      <span className={`shrink-0 text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border flex items-center gap-1 ${
                        v.activa
                          ? "bg-[#57bf00]/15 text-[#57bf00] border-[#57bf00]/30"
                          : "bg-text/10 text-text border-border"
                      }`}>
                        {v.activa ? <ToggleRight size={10} /> : <ToggleLeft size={10} />}
                        {v.activa ? "Abierta" : "Cerrada"}
                      </span>
                    </div>

                    {/* Opciones */}
                    {v.opciones && v.opciones.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {v.opciones.map((op) => (
                          <span key={op} className="px-2.5 py-1 rounded-full bg-surface-2 border border-border text-[10px] font-bold text-text uppercase tracking-wide">
                            {op}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Bottom: date + toggle */}
                    <div className="flex items-center justify-between pt-2 border-t border-border/50">
                      <span className="text-[10px] text-text" style={{ opacity: 0.4 }}>
                        Creada: {fmtDate(v.createdAt)}
                      </span>
                      <button
                        onClick={() => toggleVotacion(v.id, !v.activa)}
                        className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border transition-all active:scale-95 ${
                          v.activa
                            ? "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/30 hover:bg-[#EF4444]/20"
                            : "bg-[#57bf00]/10 text-[#57bf00] border-[#57bf00]/30 hover:bg-[#57bf00]/20"
                        }`}
                      >
                        {v.activa ? "Cerrar" : "Abrir"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* TAB: ASISTENCIAS / QUÓRUM */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {tab === "asistencias" && (
            <div className="flex flex-col gap-4">
              {loadingQuorum ? (
                <div className="w-full py-12 flex justify-center">
                  <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
                </div>
              ) : !quorum ? (
                <div className="fade-up liquid-glass rounded-3xl p-8 border border-border text-center">
                  <AlertCircle size={40} className="mx-auto text-text mb-3" style={{ opacity: 0.4 }} />
                  <p className="text-text font-medium">Error al cargar quórum</p>
                </div>
              ) : (
                <>
                  {/* Quorum circle */}
                  <div className="fade-up liquid-glass rounded-3xl p-6 border border-border shadow-2xl flex flex-col items-center gap-4">
                    <div className="relative w-28 h-28">
                      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                        <circle
                          cx="18" cy="18" r="15.915"
                          fill="none" stroke="currentColor"
                          className="text-text/10" strokeWidth="3"
                        />
                        <circle
                          cx="18" cy="18" r="15.915"
                          fill="none"
                          stroke="currentColor"
                          className={Number(quorum.quorumPorcentaje) >= 50 ? "text-[#57bf00]" : "text-[#EAB308]"}
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeDasharray={`${Math.min(Number(quorum.quorumPorcentaje), 100)} 100`}
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-2xl font-black text-text">
                        {Number(quorum.quorumPorcentaje).toFixed(0)}%
                      </span>
                    </div>
                    <span className="text-[10px] text-text uppercase tracking-[0.2em] font-black">
                      Quórum
                    </span>
                  </div>

                  {/* Stats grid */}
                  <div className="fade-up grid grid-cols-3 gap-2">
                    {[
                      { label: "Presentes", value: quorum.asistencias.length, icon: <Users size={16} />, color: "text-[#57bf00]" },
                      { label: "Coef. Presente", value: Number(quorum.presenteCoeficiente).toFixed(2), icon: <Shield size={16} />, color: "text-[#009df2]" },
                      { label: "Coef. Total", value: Number(quorum.totalCoeficiente).toFixed(2), icon: <Shield size={16} />, color: "text-text" },
                    ].map((s) => (
                      <div key={s.label} className="liquid-glass rounded-2xl p-4 border border-border flex flex-col items-center gap-1.5">
                        <span className={s.color}>{s.icon}</span>
                        <span className="text-lg font-black text-text">{s.value}</span>
                        <span className="text-[9px] text-text font-bold uppercase tracking-wider text-center">{s.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Attendance list */}
                  <div className="fade-up liquid-glass rounded-3xl border border-border shadow-2xl overflow-hidden">
                    <div className="px-5 py-3 bg-surface-2 border-b border-border">
                      <span className="text-[10px] text-text uppercase tracking-[0.2em] font-black">
                        Asistencias ({quorum.asistencias.length})
                      </span>
                    </div>
                    {quorum.asistencias.length === 0 ? (
                      <div className="px-5 py-8 text-center">
                        <p className="text-xs text-text" style={{ opacity: 0.5 }}>Nadie ha registrado asistencia aún</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-border/50 max-h-64 overflow-y-auto">
                        {quorum.asistencias.map((a) => (
                          <div key={a.id} className="px-5 py-3 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-7 h-7 rounded-full bg-surface-2 border border-border flex items-center justify-center shrink-0">
                                <UserCheck size={14} className="text-text" />
                              </div>
                              <span className="font-medium text-text truncate">{a.usuarioId.slice(0, 12)}...</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] font-bold uppercase text-text/60">{a.tipo}</span>
                              {a.verificado ? (
                                <CheckCircle2 size={14} className="text-[#57bf00]" />
                              ) : (
                                <XCircle size={14} className="text-[#EAB308]" />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* TAB: TURNOS */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {tab === "turnos" && (
            <div className="flex flex-col gap-4">
              {loadingTurnos ? (
                <div className="w-full py-12 flex justify-center">
                  <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
                </div>
              ) : turnos.length === 0 ? (
                <div className="fade-up liquid-glass rounded-3xl p-8 border border-border text-center">
                  <Hand size={40} className="mx-auto text-text mb-3" style={{ opacity: 0.4 }} />
                  <p className="text-text font-medium">Sin turnos de habla</p>
                  <p className="text-xs text-text mt-1" style={{ opacity: 0.5 }}>
                    Los residentes solicitarán turnos durante la asamblea.
                  </p>
                </div>
              ) : (
                turnos.map((t) => {
                  const badge = ESTADO_TURNO_BADGE[t.estado] || { label: t.estado, className: "bg-text/10 text-text border border-border" };
                  return (
                    <div
                      key={t.id}
                      className="fade-up liquid-glass rounded-3xl p-5 border border-border shadow-2xl flex flex-col gap-3 group hover:border-accent/30 transition-all"
                    >
                      {/* Top row */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center shrink-0">
                            <MessageSquare size={20} className="text-text" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-sm font-bold text-text block truncate">{t.nombre}</span>
                            {t.apto && (
                              <span className="text-[10px] text-text bg-accent/20 px-1.5 py-0.5 rounded font-black uppercase">
                                {t.apto}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className={`shrink-0 text-[10px] uppercase font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${badge.className}`}>
                          {t.estado === "HABLANDO" ? <Clock size={10} /> : t.estado === "COMPLETADO" ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                          {badge.label}
                        </span>
                      </div>

                      {/* Bottom: timestamp + actions */}
                      <div className="flex items-center justify-between pt-2 border-t border-border/50">
                        <span className="text-[10px] text-text" style={{ opacity: 0.4 }}>
                          {fmtTime(t.createdAt)}
                        </span>
                        <div className="flex gap-2">
                          {t.estado === "PENDIENTE" && (
                            <button
                              onClick={() => updateTurno(t.id, "HABLANDO")}
                              className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-[#57bf00]/10 text-[#57bf00] border border-[#57bf00]/30 hover:bg-[#57bf00]/20 active:scale-95 transition-all"
                            >
                            Dar turno
                            </button>
                          )}
                          {t.estado === "HABLANDO" && (
                            <button
                              onClick={() => updateTurno(t.id, "COMPLETADO")}
                              className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-[#009df2]/10 text-[#009df2] border border-[#009df2]/30 hover:bg-[#009df2]/20 active:scale-95 transition-all"
                            >
                              Completar
                            </button>
                          )}
                          {t.estado === "PENDIENTE" && (
                            <button
                              onClick={() => updateTurno(t.id, "COMPLETADO")}
                              className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-text/5 text-text border border-border hover:bg-text/10 active:scale-95 transition-all"
                            >
                              Saltar
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* TAB: PODERES */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {tab === "poderes" && (
            <div className="flex flex-col gap-4">
              {loadingPoderes ? (
                <div className="w-full py-12 flex justify-center">
                  <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
                </div>
              ) : poderes.length === 0 ? (
                <div className="fade-up liquid-glass rounded-3xl p-8 border border-border text-center">
                  <FileCheck size={40} className="mx-auto text-text mb-3" style={{ opacity: 0.4 }} />
                  <p className="text-text font-medium">Sin poderes registrados</p>
                  <p className="text-xs text-text mt-1" style={{ opacity: 0.5 }}>
                    Los residentes pueden cargar poderes desde la app.
                  </p>
                </div>
              ) : (
                poderes.map((p) => (
                  <div
                    key={p.id}
                    className="fade-up liquid-glass rounded-3xl p-5 border border-border shadow-2xl flex flex-col gap-3 group hover:border-accent/30 transition-all"
                  >
                    {/* Top row */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                          p.verificado
                            ? "bg-[#57bf00]/10 border-[#57bf00]/30"
                            : "bg-[#EAB308]/10 border-[#EAB308]/30"
                        }`}>
                          {p.verificado
                            ? <UserCheck size={20} className="text-[#57bf00]" />
                            : <UserX size={20} className="text-[#EAB308]" />
                          }
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-text block truncate">
                            Otorgante: {p.otorganteId.slice(0, 12)}...
                          </span>
                          <span className="text-xs text-text block truncate" style={{ opacity: 0.6 }}>
                            Apoderado: {p.apoderadoId.slice(0, 12)}...
                          </span>
                        </div>
                      </div>
                      <span className={`shrink-0 text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border flex items-center gap-1 ${
                        p.verificado
                          ? "bg-[#57bf00]/15 text-[#57bf00] border-[#57bf00]/30"
                          : "bg-[#EAB308]/15 text-[#EAB308] border-[#EAB308]/30"
                      }`}>
                        {p.verificado ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                        {p.verificado ? "Verificado" : "Pendiente"}
                      </span>
                    </div>

                    {/* Documento URL */}
                    {p.documentoUrl && (
                      <a
                        href={p.documentoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-[#009df2] underline flex items-center gap-1 truncate"
                      >
                        <FileCheck size={12} />
                        Ver documento
                      </a>
                    )}

                    {/* Verify toggle */}
                    <div className="pt-2 border-t border-border/50 flex justify-end">
                      <button
                        onClick={() => togglePoder(p.id, !p.verificado)}
                        className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border transition-all active:scale-95 ${
                          p.verificado
                            ? "bg-[#EAB308]/10 text-[#EAB308] border-[#EAB308]/30 hover:bg-[#EAB308]/20"
                            : "bg-[#57bf00]/10 text-[#57bf00] border-[#57bf00]/30 hover:bg-[#57bf00]/20"
                        }`}
                      >
                        {p.verificado ? "Marcar no verificado" : "Verificar poder"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* CREATE VOTACION MODAL */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {showVotacionModal && (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300">
          <div
            className="absolute inset-0"
            onClick={() => !savingVotacion && setShowVotacionModal(false)}
          />
          <div className="liquid-glass rounded-t-[32px] sm:rounded-[32px] w-full max-w-[480px] max-h-[90vh] overflow-y-auto p-6 pb-10 sm:pb-6 relative z-10 shadow-2xl border-t border-border/40 animate-in slide-in-from-bottom-full sm:zoom-in-95 duration-300">
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-border">
              <h3 className="text-lg font-bold text-text">Nueva Votación</h3>
              <button
                onClick={() => !savingVotacion && setShowVotacionModal(false)}
                className="w-10 h-10 rounded-full bg-surface-2 border border-border flex items-center justify-center text-text hover:bg-text/10 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateVotacion} className="flex flex-col gap-4">
              {/* Título */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">
                  Título *
                </label>
                <input
                  type="text"
                  required
                  value={votacionForm.titulo}
                  onChange={(e) => setVotacionForm((prev) => ({ ...prev, titulo: e.target.value }))}
                  placeholder="Ej: Aprobación del presupuesto 2026"
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent placeholder:text-text"
                />
              </div>

              {/* Descripción */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">
                  Descripción
                </label>
                <textarea
                  rows={2}
                  value={votacionForm.descripcion}
                  onChange={(e) => setVotacionForm((prev) => ({ ...prev, descripcion: e.target.value }))}
                  placeholder="Descripción opcional de la votación..."
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent placeholder:text-text resize-none"
                />
              </div>

              {/* Opciones */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">
                  Opciones
                </label>
                <input
                  type="text"
                  value={votacionForm.opciones}
                  onChange={(e) => setVotacionForm((prev) => ({ ...prev, opciones: e.target.value }))}
                  placeholder="Ej: Si, No, Abstencion"
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent placeholder:text-text"
                />
                <span className="text-[10px] text-text" style={{ opacity: 0.4 }}>
                  Separadas por coma. Por defecto: Sí, No, Abstención
                </span>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={savingVotacion}
                className="w-full py-3.5 rounded-full bg-[#57bf00] text-white font-bold text-sm shadow-lg shadow-[#57bf00]/30 active:scale-[0.98] transition-transform disabled:opacity-50 mt-2 flex items-center justify-center gap-2"
              >
                {savingVotacion ? (
                  <><Loader2 size={18} className="animate-spin" /> Creando...</>
                ) : "Crear Votación"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer>
        <div className="py-10 text-center opacity-10 pointer-events-none">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text">
            ConjuntOS · Administrar Asamblea
          </p>
        </div>
      </footer>
    </div>
  );
}
