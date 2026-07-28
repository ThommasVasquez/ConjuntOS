"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api/client";
import { useWsSubscription } from "@/hooks/useWebSocket";
import { estaEnSesion } from "@/lib/asamblea";
import {
  Video, ListOrdered, BarChart3, MessageSquare, Users,
  CheckCircle2, Circle, Play, Send, Hand, Shield, X,
  ChevronRight, UserCheck, Radio, ArrowRight, SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import ModeratorPanel from "@/components/asamblea/ModeratorPanel";

const LiveRoom = dynamic(() => import("@/components/asamblea/LiveRoom"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full grid place-items-center">
      <span className="w-9 h-9 rounded-full border-2 border-white/15 border-t-white animate-spin" />
    </div>
  ),
});

type Panel = "agenda" | "votos" | "chat" | "personas" | "moderar";

// Local DTOs mirroring backend/api/src/domains/asamblea/dto.rs
// (these are not part of the shared src/lib/api/types.ts).
interface OrdenDiaItem { id?: string; titulo: string; descripcion?: string }

interface Asamblea {
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

interface Opinion {
  id: string; asambleaId: string; usuarioId: string;
  nombre: string; apto: string | null; contenido: string; createdAt: string;
}

interface Votacion {
  id: string; asambleaId: string; titulo: string; descripcion: string | null;
  opciones: string[]; activa: boolean; createdAt: string;
}

interface Voto {
  id: string; votacionId: string; usuarioId: string; unidadId: string | null;
  respuesta: string; coeficiente: number; esVirtual: boolean;
  hashFirma: string; createdAt: string;
}

interface Asistencia {
  id: string; asambleaId: string; usuarioId: string; tipo: string;
  verificado: boolean; ip: string | null; dispositivo: string | null; createdAt: string;
}

interface QuorumResponse {
  asistencias: Asistencia[];
  totalCoeficiente: number;
  presenteCoeficiente: number;
  quorumPorcentaje: number;
}

interface Turno {
  id: string; asambleaId: string; usuarioId: string;
  nombre: string; apto: string | null; estado: string; createdAt: string;
}

interface Poder {
  id: string; asambleaId: string; otorganteId: string; apoderadoId: string;
  documentoUrl: string; verificado: boolean; createdAt: string;
}

function tally(votes: Voto[], options: string[]) {
  const counts: Record<string, number> = {};
  options.forEach((o) => (counts[o] = 0));
  votes.forEach((v) => (counts[v.respuesta] = (counts[v.respuesta] || 0) + 1));
  const total = votes.length || 1;
  return options.map((o) => ({
    option: o,
    count: counts[o] || 0,
    pct: Math.round(((counts[o] || 0) / total) * 100),
  }));
}

function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

/** Wall-clock length of the session, like the timer every call app shows. */
function useElapsed(startIso?: string): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!startIso) return "";
  const start = new Date(startIso).getTime();
  if (Number.isNaN(start)) return "";
  const secs = Math.max(0, Math.floor((now - start) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export default function AsambleaPage() {
  const { user, loading: authLoading } = useAuth();
  const isAdmin = user?.rol === "ADMINISTRADOR" || user?.rol === "SUPER_ADMIN";

  const [asamblea, setAsamblea] = useState<Asamblea | null>(null);
  const [asambleaId, setAsambleaId] = useState("");
  const [loading, setLoading] = useState(true);

  const [panel, setPanel] = useState<Panel | null>(null);
  const [opiniones, setOpiniones] = useState<Opinion[]>([]);
  const [votaciones, setVotaciones] = useState<Votacion[]>([]);
  const [asistencias, setAsistencias] = useState<Asistencia[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [poderes, setPoderes] = useState<Poder[]>([]);
  const [quorum, setQuorum] = useState<QuorumResponse | null>(null);
  const [votos, setVotos] = useState<Record<string, Voto[]>>({});
  const [misVotos, setMisVotos] = useState<Record<string, string>>({});
  const [newOpinion, setNewOpinion] = useState("");
  const [seenOpiniones, setSeenOpiniones] = useState(0);

  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchSession = useCallback(async () => {
    try {
      const data = await api.get<Asamblea>("/asambleas/activa/session");
      setAsamblea(data);
      setAsambleaId(data?.id ?? "");
    } catch {
      setAsamblea(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    if (!asambleaId) return;
    try {
      const [op, vot, asi, tur, pod] = await Promise.all([
        api.get<Opinion[]>(`/asambleas/${asambleaId}/opiniones`),
        api.get<Votacion[]>(`/asambleas/${asambleaId}/votaciones`),
        api.get<QuorumResponse>(`/asambleas/${asambleaId}/asistencias`),
        api.get<Turno[]>(`/asambleas/${asambleaId}/turnos`),
        api.get<Poder[]>(`/asambleas/${asambleaId}/poderes`).catch(() => [] as Poder[]),
      ]);
      setOpiniones(op);
      setVotaciones(vot);
      setAsistencias(asi.asistencias ?? []);
      setQuorum(asi);
      setTurnos(tur);
      setPoderes(pod);
    } catch (err) {
      console.error("fetch asamblea data:", err);
    }
  }, [asambleaId]);

  useEffect(() => { fetchSession(); }, [fetchSession]);
  useEffect(() => { fetchAll(); }, [fetchAll]);
  useWsSubscription("asamblea", () => { fetchSession(); fetchAll(); });

  // Keep the chat pinned to the newest message while the panel is open.
  useEffect(() => {
    if (panel === "chat") {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setSeenOpiniones(opiniones.length);
    }
  }, [panel, opiniones.length]);

  const elapsed = useElapsed(asamblea?.fecha);

  const ordenDia = useMemo<OrdenDiaItem[]>(
    () => (Array.isArray(asamblea?.ordenDia) ? asamblea!.ordenDia : []),
    [asamblea],
  );
  const currentItem = ordenDia[asamblea?.itemActivoIndex ?? 0];
  const activeVotacion = votaciones.find((v) => v.activa);
  const misTurnos = turnos.filter((t) => t.usuarioId === user?.id);
  const handRaised = misTurnos.some((t) => t.estado === "PENDIENTE");
  const tengoLaPalabra = misTurnos.some((t) => t.estado === "HABLANDO");
  const colaTurnos = turnos.filter((t) => t.estado === "PENDIENTE" || t.estado === "HABLANDO");
  const yaRegistrado = asistencias.some((a) => a.usuarioId === user?.id);
  const chatBadge = Math.max(0, opiniones.length - seenOpiniones);

  const postOpinion = async () => {
    if (!newOpinion.trim() || !asambleaId) return;
    const text = newOpinion.trim();
    setNewOpinion("");
    try {
      await api.post(`/asambleas/${asambleaId}/opiniones`, { contenido: text });
      fetchAll();
    } catch {
      toast.error("Error al enviar el mensaje");
      setNewOpinion(text);
    }
  };

  const requestTurn = async () => {
    if (!asambleaId) return;
    if (handRaised) { toast.info("Ya tienes la mano levantada"); return; }
    try {
      await api.post(`/asambleas/${asambleaId}/turnos`);
      toast.success("Pediste la palabra — espera a que te den el turno");
      fetchAll();
    } catch { toast.error("Error al pedir la palabra"); }
  };

  const castVote = async (votacionId: string, respuesta: string) => {
    try {
      await api.post(`/votaciones/${votacionId}/votos`, { respuesta });
      setMisVotos((p) => ({ ...p, [votacionId]: respuesta }));
      toast.success(`Voto registrado: ${respuesta}`);
      fetchVotos(votacionId);
    } catch { toast.error("Error al votar"); }
  };

  const fetchVotos = async (votacionId: string) => {
    try {
      const d = await api.get<Voto[]>(`/votaciones/${votacionId}/votos`);
      setVotos((p) => ({ ...p, [votacionId]: d }));
    } catch { /* silent */ }
  };

  const registerAttendance = async () => {
    if (!asambleaId) return;
    try {
      await api.post(`/asambleas/${asambleaId}/asistencias`, { tipo: "VIRTUAL" });
      toast.success("Asistencia registrada");
      fetchAll();
    } catch { toast.error("Error al registrar asistencia"); }
  };

  const advanceAgenda = async () => {
    if (!asamblea) return;
    try {
      await api.put("/asambleas/activa/session", {
        itemActivoIndex: asamblea.itemActivoIndex + 1,
        version: asamblea.version,
      });
    } catch { toast.error("Error al avanzar la agenda"); }
  };

  const setSession = async (patch: Record<string, unknown>, errMsg: string) => {
    if (!asamblea) return;
    try {
      await api.put("/asambleas/activa/session", { ...patch, version: asamblea.version });
      fetchSession();
    } catch { toast.error(errMsg); }
  };

  const startSession = () =>
    setSession({ activa: true, sessionState: "INICIADA" }, "Error al iniciar la sesión");

  const finishSession = () =>
    setSession({ activa: false, sessionState: "FINALIZADA" }, "Error al finalizar la asamblea");

  const goToItem = (index: number) =>
    setSession({ itemActivoIndex: index }, "Error al cambiar de punto");

  const createVotacion = async (titulo: string, opciones: string[]) => {
    if (!asambleaId || !titulo) return;
    try {
      await api.post(`/asambleas/${asambleaId}/votaciones`, {
        titulo,
        ...(opciones.length > 0 ? { opciones } : {}),
      });
      toast.success("Votación creada");
      fetchAll();
    } catch { toast.error("Error al crear la votación"); }
  };

  const verifyPoder = async (pid: string, verificado: boolean) => {
    if (!asambleaId) return;
    try {
      await api.put(`/asambleas/${asambleaId}/poderes/${pid}`, { verificado });
      fetchAll();
    } catch { toast.error("Error al actualizar el poder"); }
  };

  const updateTurno = async (tid: string, estado: string) => {
    if (!asambleaId) return;
    try { await api.put(`/asambleas/${asambleaId}/turnos/${tid}`, { estado }); fetchAll(); }
    catch { toast.error("Error al actualizar el turno"); }
  };

  const toggleVotacion = async (vid: string, activa: boolean) => {
    if (!asambleaId) return;
    try {
      await api.put(`/asambleas/${asambleaId}/votaciones/${vid}`, { activa });
      fetchAll();
    } catch { toast.error("Error al actualizar la votación"); }
  };

  // ── Loading / empty ─────────────────────────────────────────────────────

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-black grid place-items-center">
        <span className="w-10 h-10 rounded-full border-2 border-white/15 border-t-white animate-spin" />
      </div>
    );
  }

  if (!asamblea) {
    return (
      <div className="min-h-screen bg-black grid place-items-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 grid place-items-center mx-auto mb-5">
            <Video className="w-8 h-8 text-white/40" />
          </div>
          <h1 className="text-xl font-semibold text-white mb-2">No hay asamblea activa</h1>
          <p className="text-white/45 text-sm leading-relaxed">
            Cuando la administración inicie una asamblea, la sala se abrirá aquí automáticamente.
          </p>
        </div>
      </div>
    );
  }

  const quorumPct = Number(quorum?.quorumPorcentaje ?? 0);

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col overflow-hidden">
      {/* ── Top bar ────────────────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center gap-3 px-3 sm:px-5 h-14 border-b border-white/10 bg-black/80 backdrop-blur-xl z-20">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/15 border border-red-500/30 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-red-400">
              En vivo
            </span>
          </span>
          <h1 className="text-sm font-semibold truncate">{asamblea.titulo}</h1>
        </div>

        <span className="hidden sm:block text-xs text-white/40 tabular-nums shrink-0">{elapsed}</span>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          {tengoLaPalabra && (
            <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white text-black">
              <Radio size={11} />
              <span className="text-[9px] font-bold uppercase tracking-widest">Tienes la palabra</span>
            </span>
          )}

          <button
            onClick={() => setPanel(panel === "personas" ? null : "personas")}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
            title="Quórum y asistentes"
          >
            <Users size={13} className="text-white/70" />
            <span className="text-[11px] font-semibold tabular-nums">
              {quorumPct.toFixed(1)}%
            </span>
          </button>

          {!yaRegistrado && (
            <button
              onClick={registerAttendance}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-black text-[10px] font-bold uppercase tracking-widest hover:bg-white/90 transition-colors"
            >
              <UserCheck size={12} /> Registrar asistencia
            </button>
          )}
        </div>
      </header>

      {/* ── Agenda strip ───────────────────────────────────────────────── */}
      {currentItem && (
        <div className="shrink-0 flex items-center gap-2 px-3 sm:px-5 py-2 border-b border-white/[0.06] bg-white/[0.02]">
          <span className="text-[9px] font-bold uppercase tracking-widest text-white/35 shrink-0">
            Punto {(asamblea.itemActivoIndex ?? 0) + 1}/{ordenDia.length}
          </span>
          <ChevronRight size={12} className="text-white/20 shrink-0" />
          <p className="text-xs text-white/80 truncate">{currentItem.titulo}</p>
          {isAdmin && asamblea.itemActivoIndex < ordenDia.length - 1 && (
            <button
              onClick={advanceAgenda}
              className="ml-auto shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/8 border border-white/12 hover:bg-white/15 transition-colors text-[10px] font-semibold"
            >
              Siguiente <ArrowRight size={11} />
            </button>
          )}
        </div>
      )}

      {/* ── Stage + side panel ─────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex">
        <main className="flex-1 min-w-0 min-h-0 relative">
          {asambleaId && (
            <LiveRoom
              asambleaId={asambleaId}
              titulo={asamblea.titulo}
              onRequestFloor={requestTurn}
              handRaised={handRaised}
              onOpenPanel={(p) => setPanel((cur) => (cur === p ? null : p))}
              chatBadge={chatBadge}
              participantCount={asistencias.length || 1}
            />
          )}

          {/* Live vote — floats over the stage so nobody misses it */}
          {activeVotacion && (
            <div className="absolute top-3 right-3 z-20 w-[min(92vw,320px)] rounded-2xl bg-black/75 backdrop-blur-xl border border-white/15 shadow-2xl overflow-hidden">
              <div className="px-4 pt-3 pb-2 border-b border-white/10 flex items-start gap-2">
                <BarChart3 size={14} className="text-white/60 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-white/40">
                    Votación abierta
                  </p>
                  <p className="text-sm font-semibold leading-tight mt-0.5">{activeVotacion.titulo}</p>
                </div>
              </div>

              {misVotos[activeVotacion.id] ? (
                <div className="px-4 py-3">
                  <p className="text-xs text-white/60">
                    Votaste{" "}
                    <span className="font-bold text-white">{misVotos[activeVotacion.id]}</span>
                  </p>
                </div>
              ) : (
                <div className="p-3 grid grid-cols-3 gap-2">
                  {(activeVotacion.opciones ?? []).map((op) => (
                    <button
                      key={op}
                      onClick={() => castVote(activeVotacion.id, op)}
                      className="py-2.5 rounded-xl bg-white/10 border border-white/15 hover:bg-white hover:text-black transition-all text-[11px] font-bold uppercase tracking-wide active:scale-95"
                    >
                      {op}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>

        {/* Side panel: docked on desktop, bottom sheet on mobile */}
        {panel && (
          <>
            <div
              className="sm:hidden fixed inset-0 bg-black/60 z-30"
              onClick={() => setPanel(null)}
            />
            <aside
              className="
                z-40 flex flex-col bg-[#0a0a0a] border-white/10
                fixed inset-x-0 bottom-0 h-[70vh] rounded-t-3xl border-t
                sm:static sm:h-auto sm:w-[340px] sm:rounded-none sm:border-l sm:border-t-0
              "
            >
              <div className="shrink-0 flex items-center gap-1 p-2 border-b border-white/10">
                {([
                  ["agenda", "Agenda", <ListOrdered key="a" size={13} />],
                  ["votos", "Votos", <BarChart3 key="v" size={13} />],
                  ["chat", "Chat", <MessageSquare key="c" size={13} />],
                  ["personas", "Personas", <Users key="p" size={13} />],
                  ...(isAdmin
                    ? ([["moderar", "Moderar", <SlidersHorizontal key="m" size={13} />]] as [Panel, string, React.ReactNode][])
                    : []),
                ] as [Panel, string, React.ReactNode][]).map(([id, label, icon]) => (
                  <button
                    key={id}
                    onClick={() => setPanel(id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wide transition-all ${
                      panel === id ? "bg-white text-black" : "text-white/50 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {icon}
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
                <button
                  onClick={() => setPanel(null)}
                  className="w-8 h-8 rounded-xl grid place-items-center text-white/40 hover:text-white hover:bg-white/5 transition-colors"
                  aria-label="Cerrar panel"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-3">
                {/* AGENDA */}
                {panel === "agenda" && (
                  <div className="flex flex-col gap-2">
                    {ordenDia.length === 0 && (
                      <p className="text-white/35 text-xs text-center py-8">
                        Esta asamblea no tiene orden del día.
                      </p>
                    )}
                    {ordenDia.map((item, i) => {
                      const done = i < asamblea.itemActivoIndex;
                      const current = i === asamblea.itemActivoIndex;
                      return (
                        <div
                          key={item.id ?? i}
                          className={`p-3 rounded-2xl border transition-all ${
                            current
                              ? "border-white/40 bg-white/[0.07]"
                              : "border-white/8 bg-white/[0.02]"
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            {done ? (
                              <CheckCircle2 size={15} className="text-white/35 shrink-0 mt-0.5" />
                            ) : current ? (
                              <Play size={15} className="text-white shrink-0 mt-0.5" />
                            ) : (
                              <Circle size={15} className="text-white/20 shrink-0 mt-0.5" />
                            )}
                            <div className="min-w-0">
                              <p className={`text-xs font-semibold ${done ? "text-white/35 line-through" : "text-white"}`}>
                                {item.titulo}
                              </p>
                              {item.descripcion && (
                                <p className="text-[11px] text-white/45 mt-0.5">{item.descripcion}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* VOTOS */}
                {panel === "votos" && (
                  <div className="flex flex-col gap-3">
                    {votaciones.length === 0 && (
                      <p className="text-white/35 text-xs text-center py-8">
                        Todavía no hay votaciones.
                      </p>
                    )}
                    {votaciones.map((v) => {
                      const results = votos[v.id] ? tally(votos[v.id], v.opciones ?? []) : null;
                      return (
                        <div
                          key={v.id}
                          className={`rounded-2xl border p-3 ${
                            v.activa ? "border-white/30 bg-white/[0.06]" : "border-white/8 bg-white/[0.02]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <p className="text-xs font-semibold min-w-0">{v.titulo}</p>
                            <span
                              className={`shrink-0 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                v.activa ? "bg-white text-black" : "bg-white/10 text-white/50"
                              }`}
                            >
                              {v.activa ? "Abierta" : "Cerrada"}
                            </span>
                          </div>

                          {v.activa && !misVotos[v.id] && (
                            <div className="grid grid-cols-3 gap-1.5 mb-2">
                              {(v.opciones ?? []).map((op) => (
                                <button
                                  key={op}
                                  onClick={() => castVote(v.id, op)}
                                  className="py-2 rounded-lg bg-white/10 border border-white/12 hover:bg-white hover:text-black transition-all text-[10px] font-bold uppercase active:scale-95"
                                >
                                  {op}
                                </button>
                              ))}
                            </div>
                          )}

                          {misVotos[v.id] && (
                            <p className="text-[11px] text-white/50 mb-2">
                              Tu voto: <span className="font-bold text-white">{misVotos[v.id]}</span>
                            </p>
                          )}

                          {results ? (
                            <div className="space-y-1.5">
                              {results.map(({ option, count, pct }) => (
                                <div key={option} className="flex items-center gap-2">
                                  <span className="text-[10px] w-16 truncate text-white/60">{option}</span>
                                  <div className="flex-1 h-1.5 bg-white/8 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-white rounded-full transition-all duration-500"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] text-white/45 w-12 text-right tabular-nums">
                                    {count} · {pct}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <button
                              onClick={() => fetchVotos(v.id)}
                              className="text-[10px] text-white/45 hover:text-white font-semibold uppercase tracking-wide transition-colors"
                            >
                              Ver resultados
                            </button>
                          )}

                          {isAdmin && (
                            <button
                              onClick={() => toggleVotacion(v.id, !v.activa)}
                              className="mt-2.5 w-full py-1.5 rounded-lg border border-white/10 text-[10px] font-semibold text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                            >
                              {v.activa ? "Cerrar votación" : "Reabrir votación"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* CHAT */}
                {panel === "chat" && (
                  <div className="flex flex-col gap-2.5">
                    {opiniones.length === 0 && (
                      <p className="text-white/35 text-xs text-center py-8">
                        Nadie ha escrito todavía.
                      </p>
                    )}
                    {opiniones.map((o) => {
                      const mine = o.usuarioId === user?.id;
                      return (
                        <div key={o.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                          <div className="w-7 h-7 rounded-full bg-white/10 border border-white/10 grid place-items-center text-[10px] font-bold text-white/70 shrink-0">
                            {(o.nombre ?? "?")[0]}
                          </div>
                          <div className={`min-w-0 max-w-[80%] ${mine ? "items-end" : ""}`}>
                            <div className={`flex items-baseline gap-1.5 mb-0.5 ${mine ? "justify-end" : ""}`}>
                              <span className="text-[10px] font-semibold text-white/70 truncate">
                                {mine ? "Tú" : o.nombre}
                              </span>
                              {o.apto && <span className="text-[9px] text-white/30">{o.apto}</span>}
                              <span className="text-[9px] text-white/25 tabular-nums">
                                {fmtTime(o.createdAt)}
                              </span>
                            </div>
                            <div
                              className={`px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                                mine
                                  ? "bg-white text-black rounded-tr-sm"
                                  : "bg-white/[0.07] border border-white/10 text-white/90 rounded-tl-sm"
                              }`}
                            >
                              {o.contenido}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={chatEndRef} />
                  </div>
                )}

                {/* MODERAR */}
                {panel === "moderar" && isAdmin && (
                  <ModeratorPanel
                    enSesion={estaEnSesion(asamblea)}
                    ordenDia={ordenDia}
                    itemActivoIndex={asamblea.itemActivoIndex}
                    votaciones={votaciones}
                    turnos={turnos}
                    poderes={poderes}
                    onStartSession={startSession}
                    onFinishSession={finishSession}
                    onGoToItem={goToItem}
                    onCreateVotacion={createVotacion}
                    onToggleVotacion={toggleVotacion}
                    onUpdateTurno={updateTurno}
                    onVerifyPoder={verifyPoder}
                  />
                )}

                {/* PERSONAS */}
                {panel === "personas" && (
                  <div className="flex flex-col gap-4">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex items-center gap-4">
                        <div className="relative w-16 h-16 shrink-0">
                          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                            <circle cx="18" cy="18" r="15.915" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                            <circle
                              cx="18" cy="18" r="15.915" fill="none" stroke="white"
                              strokeWidth="3" strokeLinecap="round"
                              strokeDasharray={`${Math.min(quorumPct, 100)} 100`}
                              className="transition-all duration-700"
                            />
                          </svg>
                          <span className="absolute inset-0 grid place-items-center text-[11px] font-bold tabular-nums">
                            {quorumPct.toFixed(0)}%
                          </span>
                        </div>
                        <div className="text-[11px] space-y-0.5 text-white/60">
                          <p className="text-[9px] uppercase tracking-widest text-white/35 font-bold mb-1">
                            Quórum
                          </p>
                          <p>Presente: <span className="text-white font-semibold tabular-nums">
                            {Number(quorum?.presenteCoeficiente ?? 0).toFixed(2)}
                          </span></p>
                          <p>Total: <span className="text-white font-semibold tabular-nums">
                            {Number(quorum?.totalCoeficiente ?? 0).toFixed(2)}
                          </span></p>
                          <p>Asistentes: <span className="text-white font-semibold tabular-nums">
                            {asistencias.length}
                          </span></p>
                        </div>
                      </div>

                      {!yaRegistrado && (
                        <button
                          onClick={registerAttendance}
                          className="w-full mt-3 py-2.5 rounded-xl bg-white text-black text-[10px] font-bold uppercase tracking-widest hover:bg-white/90 transition-colors"
                        >
                          Registrar mi asistencia
                        </button>
                      )}
                    </div>

                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-white/35 mb-2 flex items-center gap-1.5">
                        <Hand size={11} /> Cola de palabra ({colaTurnos.length})
                      </p>
                      {colaTurnos.length === 0 ? (
                        <p className="text-white/30 text-[11px] py-2">Nadie ha pedido la palabra.</p>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {colaTurnos.map((t, i) => (
                            <div
                              key={t.id}
                              className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
                                t.estado === "HABLANDO"
                                  ? "border-white/40 bg-white/[0.08]"
                                  : "border-white/8 bg-white/[0.02]"
                              }`}
                            >
                              <span className="w-5 h-5 rounded-full bg-white/8 grid place-items-center text-[9px] font-bold text-white/50 shrink-0">
                                {t.estado === "HABLANDO" ? <Radio size={10} /> : i + 1}
                              </span>
                              <div className="min-w-0">
                                <p className="text-[11px] font-semibold truncate">{t.nombre}</p>
                                {t.apto && <p className="text-[9px] text-white/35">{t.apto}</p>}
                              </div>
                              {isAdmin && (
                                <button
                                  onClick={() =>
                                    updateTurno(t.id, t.estado === "HABLANDO" ? "COMPLETADO" : "HABLANDO")
                                  }
                                  className="ml-auto shrink-0 px-2.5 py-1 rounded-lg bg-white/10 border border-white/12 hover:bg-white hover:text-black transition-all text-[9px] font-bold uppercase"
                                >
                                  {t.estado === "HABLANDO" ? "Terminar" : "Dar palabra"}
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-white/35 mb-2 flex items-center gap-1.5">
                        <Shield size={11} /> Asistencia registrada ({asistencias.length})
                      </p>
                      <div className="flex flex-col gap-1">
                        {asistencias.map((a) => (
                          <div
                            key={a.id}
                            className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.06]"
                          >
                            <span className="text-[11px] text-white/70 truncate">
                              {a.usuarioId === user?.id ? "Tú" : `${a.usuarioId.slice(0, 8)}…`}
                            </span>
                            <span className="text-[9px] font-bold uppercase text-white/35 shrink-0">
                              {a.tipo}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Chat composer */}
              {panel === "chat" && (
                <div className="shrink-0 p-2.5 border-t border-white/10 flex gap-2 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
                  <input
                    value={newOpinion}
                    onChange={(e) => setNewOpinion(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && postOpinion()}
                    placeholder="Escribe un mensaje…"
                    className="flex-1 min-w-0 bg-white/[0.06] border border-white/10 rounded-full px-4 py-2.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors"
                  />
                  <button
                    onClick={postOpinion}
                    disabled={!newOpinion.trim()}
                    aria-label="Enviar mensaje"
                    className="w-10 h-10 shrink-0 rounded-full bg-white text-black grid place-items-center disabled:opacity-25 active:scale-90 transition-all"
                  >
                    <Send size={15} />
                  </button>
                </div>
              )}
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
