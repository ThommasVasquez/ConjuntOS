"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import ProfileHeader from "@/components/shell/ProfileHeader";
import {
  Video, Plus, X, ListOrdered, Play, Square, Users,
  ArrowRight, Calendar, RefreshCw, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api/client";
import { useWsSubscription } from "@/hooks/useWebSocket";
import { estaEnSesion } from "@/lib/asamblea";
import { useDialogA11y } from "@/hooks/useDialogA11y";
import { SkeletonRows } from "@/components/ui/Skeleton";

// ---------------------------------------------------------------------------
// Local DTOs (mirror backend/api/src/domains/asamblea/dto.rs)
// ---------------------------------------------------------------------------

interface OrdenDiaItem { id?: string; titulo: string; descripcion?: string }

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

interface QuorumResponse {
  asistencias: { id: string }[];
  quorumPorcentaje: number;
}

function fmtFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-CO", {
      day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

/** `datetime-local` needs a local-time string, not the ISO/UTC one. */
function nowForDatetimeLocal(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/**
 * Lobby for the assembly. Creating, opening and entering happen here; running
 * the session — agenda, votes, the floor, powers — happens inside the room, so
 * moderators are not driving a live meeting from a second tab.
 */
export default function AdminAsambleaPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const role = user?.rol;

  const [asamblea, setAsamblea] = useState<AsambleaDto | null>(null);
  const [quorum, setQuorum] = useState<QuorumResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showCrear, setShowCrear] = useState(false);
  const [form, setForm] = useState({ titulo: "", descripcion: "", fecha: "" });
  const [ordenDia, setOrdenDia] = useState<{ titulo: string }[]>([]);
  const [creando, setCreando] = useState(false);
  const { dialogProps } = useDialogA11y({
    open: showCrear,
    onClose: () => !creando && setShowCrear(false),
  });

  const fetchSession = useCallback(async () => {
    try {
      const data = await api.get<AsambleaDto>("/asambleas/activa/session");
      setAsamblea(data);
      if (data?.id) {
        api
          .get<QuorumResponse>(`/asambleas/${data.id}/asistencias`)
          .then(setQuorum)
          .catch(() => setQuorum(null));
      }
    } catch {
      setAsamblea(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    if (!role || !["ADMINISTRADOR", "SUPER_ADMIN"].includes(role)) {
      toast.error("No tienes permisos para acceder a esta sección.");
      router.push("/inicio");
      return;
    }
    fetchSession();
  }, [user, authLoading, role, router, fetchSession]);

  useWsSubscription("asamblea", () => fetchSession());

  const openCrear = () => {
    setForm({ titulo: "", descripcion: "", fecha: nowForDatetimeLocal() });
    setOrdenDia([]);
    setShowCrear(true);
  };

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titulo.trim()) return;
    setCreando(true);
    try {
      const creada = await api.post<AsambleaDto>("/asambleas", {
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim() || undefined,
        // The input is local time; send the absolute instant the backend stores.
        fecha: form.fecha ? new Date(form.fecha).toISOString() : undefined,
        ordenDia: ordenDia.filter((i) => i.titulo.trim()).map((i) => ({ titulo: i.titulo.trim() })),
      });
      setAsamblea(creada);
      setShowCrear(false);
      toast.success("Asamblea creada");
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.detail : "Error al crear la asamblea");
    } finally {
      setCreando(false);
    }
  };

  const setSession = async (patch: Record<string, unknown>, ok: string, fail: string) => {
    if (!asamblea) return;
    setSaving(true);
    try {
      await api.put("/asambleas/activa/session", { ...patch, version: asamblea.version });
      toast.success(ok);
      fetchSession();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.detail : fail);
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <SkeletonRows />
      </div>
    );
  }

  const enSesion = asamblea ? estaEnSesion(asamblea) : false;
  const agenda = Array.isArray(asamblea?.ordenDia) ? asamblea!.ordenDia : [];

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
      <ProfileHeader />

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-medium text-text tracking-wide">Asamblea</h1>
          <p className="text-sm text-text" style={{ opacity: 0.6 }}>
            Crea la asamblea y entra a la sala para dirigirla
          </p>
        </div>
        <button
          onClick={fetchSession}
          aria-label="Actualizar"
          className="p-2 rounded-full hover:bg-surface-2 transition-colors"
        >
          <RefreshCw size={18} className="text-text" />
        </button>
      </div>

      {!asamblea ? (
        /* ── Empty state ──────────────────────────────────────────────── */
        <div className="liquid-glass rounded-[28px] p-8 border border-border shadow-2xl flex flex-col items-center gap-5 text-center">
          <div className="w-16 h-16 rounded-3xl bg-surface-2 border border-border grid place-items-center">
            <Video size={26} className="text-text" style={{ opacity: 0.4 }} />
          </div>
          <div>
            <p className="text-text font-medium text-lg">No hay asamblea activa</p>
            <p className="text-xs text-text mt-1.5 max-w-xs" style={{ opacity: 0.55 }}>
              Crea la convocatoria con su orden del día. Después podrás entrar a la sala
              y dirigir la sesión desde ahí.
            </p>
          </div>
          <button
            onClick={openCrear}
            className="px-6 py-3 rounded-full bg-accent text-on-accent font-bold text-sm shadow-lg active:scale-95 transition-transform flex items-center gap-2"
          >
            <Plus size={16} /> Crear asamblea
          </button>
        </div>
      ) : (
        /* ── Session card ─────────────────────────────────────────────── */
        <div className="liquid-glass rounded-[28px] border border-border shadow-2xl overflow-hidden">
          <div className="p-6 flex flex-col gap-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className={`w-12 h-12 rounded-2xl grid place-items-center shrink-0 border ${
                    enSesion
                      ? "bg-success/10 border-success/30"
                      : "bg-surface-2 border-border"
                  }`}
                >
                  {enSesion ? (
                    <Play size={22} className="text-success" />
                  ) : (
                    <Clock size={22} className="text-text" />
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-text leading-tight">{asamblea.titulo}</h2>
                  {asamblea.descripcion && (
                    <p className="text-xs text-text mt-1" style={{ opacity: 0.6 }}>
                      {asamblea.descripcion}
                    </p>
                  )}
                  <p className="text-[11px] text-text mt-2 flex items-center gap-1.5" style={{ opacity: 0.45 }}>
                    <Calendar size={11} /> {fmtFecha(asamblea.fecha)}
                  </p>
                </div>
              </div>

              <span
                className={`shrink-0 text-[10px] font-bold uppercase px-3 py-1 rounded-full border flex items-center gap-1.5 ${
                  enSesion
                    ? "bg-success/15 text-success border-success/30"
                    : "bg-text/10 text-text border-border"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${enSesion ? "bg-success animate-pulse" : "bg-text/30"}`} />
                {enSesion ? "En vivo" : "Programada"}
              </span>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Puntos", value: String(agenda.length), icon: <ListOrdered size={13} /> },
                { label: "Asistentes", value: String(quorum?.asistencias?.length ?? 0), icon: <Users size={13} /> },
                { label: "Quórum", value: `${Number(quorum?.quorumPorcentaje ?? 0).toFixed(0)}%`, icon: <Users size={13} /> },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl bg-surface-2 border border-border p-3">
                  <span className="text-[9px] uppercase tracking-widest text-text font-black flex items-center gap-1" style={{ opacity: 0.4 }}>
                    {s.icon} {s.label}
                  </span>
                  <p className="text-xl font-bold text-text mt-1 tabular-nums">{s.value}</p>
                </div>
              ))}
            </div>

            {/* Agenda preview */}
            {agenda.length > 0 && (
              <div className="rounded-2xl bg-surface-2 border border-border p-4">
                <span className="text-[9px] uppercase tracking-widest text-text font-black flex items-center gap-1.5 mb-2" style={{ opacity: 0.4 }}>
                  <ListOrdered size={11} /> Orden del día
                </span>
                <div className="flex flex-col gap-1.5">
                  {agenda.map((item, i) => (
                    <div key={item.id ?? i} className="flex items-center gap-2 text-xs">
                      <span
                        className={`w-5 h-5 rounded-full grid place-items-center text-[9px] font-bold shrink-0 ${
                          i === asamblea.itemActivoIndex
                            ? "bg-accent text-on-accent"
                            : "bg-text/10 text-text"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span
                        className={`truncate ${
                          i === asamblea.itemActivoIndex ? "font-bold text-text" : "text-text"
                        }`}
                        style={i === asamblea.itemActivoIndex ? undefined : { opacity: 0.55 }}
                      >
                        {item.titulo}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Primary action — the point of this page */}
            <button
              onClick={() => router.push("/asamblea")}
              className="w-full py-4 rounded-full bg-accent text-on-accent font-bold text-sm shadow-lg active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
            >
              <Video size={17} />
              Entrar a la asamblea
              <ArrowRight size={15} />
            </button>

            <p className="text-[11px] text-text text-center -mt-2" style={{ opacity: 0.45 }}>
              {enSesion
                ? "Dentro de la sala controlas la agenda, las votaciones, los turnos de palabra y los poderes."
                : "La sesión aún no ha empezado. Entra y pulsa «Iniciar la sesión» en el panel Moderar."}
            </p>

            {/* Secondary: closing the assembly for good */}
            {enSesion && (
              <button
                disabled={saving}
                onClick={() =>
                  setSession(
                    { activa: false, sessionState: "FINALIZADA" },
                    "Asamblea finalizada",
                    "Error al finalizar la asamblea",
                  )
                }
                className="w-full py-3 rounded-full border border-danger/30 bg-danger/10 text-danger font-bold text-xs uppercase tracking-widest active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Square size={14} /> Finalizar asamblea
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Create modal ───────────────────────────────────────────────── */}
      {showCrear && (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300">
          <div className="absolute inset-0" onClick={() => !creando && setShowCrear(false)} />
          <div
            {...dialogProps}
            aria-labelledby="crear-asamblea-titulo"
            className="liquid-glass rounded-t-[32px] sm:rounded-[32px] w-full max-w-[480px] max-h-[90vh] overflow-y-auto p-6 pb-10 sm:pb-6 relative z-10 shadow-2xl border-t border-border/40 animate-in slide-in-from-bottom-full sm:zoom-in-95 duration-300 focus:outline-none"
          >
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-border">
              <h3 id="crear-asamblea-titulo" className="text-lg font-bold text-text">Nueva asamblea</h3>
              <button
                onClick={() => !creando && setShowCrear(false)}
                aria-label="Cerrar"
                className="w-10 h-10 rounded-full bg-surface-2 border border-border grid place-items-center text-text hover:bg-text/10 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCrear} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">
                  Título *
                </label>
                <input
                  type="text"
                  required
                  value={form.titulo}
                  onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))}
                  placeholder="Ej: Asamblea General Ordinaria 2026"
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent placeholder:text-text-muted"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">
                  Descripción
                </label>
                <textarea
                  rows={2}
                  value={form.descripcion}
                  onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))}
                  placeholder="Convocatoria, lugar, modalidad…"
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent placeholder:text-text-muted resize-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">
                  Fecha y hora
                </label>
                <input
                  type="datetime-local"
                  value={form.fecha}
                  onChange={(e) => setForm((p) => ({ ...p, fecha: e.target.value }))}
                  className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1 flex items-center gap-1.5">
                  <ListOrdered size={12} /> Orden del día
                </label>
                <div className="flex flex-col gap-2">
                  {ordenDia.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-6 h-6 shrink-0 rounded-full bg-surface-2 border border-border grid place-items-center text-[10px] font-bold text-text">
                        {i + 1}
                      </span>
                      <input
                        type="text"
                        value={item.titulo}
                        onChange={(e) =>
                          setOrdenDia((prev) =>
                            prev.map((it, idx) => (idx === i ? { titulo: e.target.value } : it)),
                          )
                        }
                        placeholder={`Punto ${i + 1}`}
                        className="flex-1 min-w-0 bg-surface-2 border border-border rounded-xl py-2.5 px-3 text-sm text-text focus:outline-none focus:border-accent placeholder:text-text-muted"
                      />
                      <button
                        type="button"
                        onClick={() => setOrdenDia((prev) => prev.filter((_, idx) => idx !== i))}
                        aria-label={`Quitar punto ${i + 1}`}
                        className="w-8 h-8 shrink-0 rounded-full bg-danger/10 border border-danger/30 text-danger grid place-items-center hover:bg-danger/20 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setOrdenDia((prev) => [...prev, { titulo: "" }])}
                  className="self-start mt-1 px-4 py-2 rounded-full bg-surface-2 border border-border text-text text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 hover:bg-text/10 transition-colors"
                >
                  <Plus size={12} /> Agregar punto
                </button>
              </div>

              <button
                type="submit"
                disabled={creando || !form.titulo.trim()}
                className="w-full py-3.5 rounded-full bg-accent text-on-accent font-bold text-sm shadow-lg active:scale-[0.98] transition-transform disabled:opacity-50 mt-2"
              >
                {creando ? "Creando…" : "Crear asamblea"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
