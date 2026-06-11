"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api/client";
import { useWsSubscription } from "@/hooks/useWebSocket";
import {
  Video, ListOrdered, BarChart3, MessageSquare, Info,
  CheckCircle, Circle, Play, Send, Hand, Users, Shield,
  FileCheck, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import dynamic from "next/dynamic";

const LiveRoom = dynamic(() => import("@/components/asamblea/LiveRoom"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-8 h-8 animate-spin text-white/40" />
    </div>
  ),
});

type Tab = "video" | "agenda" | "votos" | "chat" | "info";

function voteColor(op: string): string {
  const n = op.toUpperCase().trim();
  if (["SI", "SÍ", "APROBAR"].includes(n)) return "bg-emerald-600";
  if (["NO", "RECHAZAR"].includes(n)) return "bg-rose-600";
  if (["ABSTENCION", "ABSTENCIÓN", "BLANCO"].includes(n)) return "bg-amber-600";
  return "bg-blue-600";
}

function tally(votes: any[], options: string[]) {
  const counts: Record<string, number> = {};
  options.forEach((o) => (counts[o] = 0));
  votes.forEach((v) => (counts[v.respuesta] = (counts[v.respuesta] || 0) + 1));
  const total = votes.length || 1;
  return options.map((o) => ({ option: o, count: counts[o] || 0, pct: Math.round(((counts[o] || 0) / total) * 100) }));
}

function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

export default function AsambleaPage() {
  const { user, loading: authLoading } = useAuth();
  const isAdmin =
    user?.rol === "ADMINISTRADOR" || user?.rol === "SUPER_ADMIN";

  const [activeTab, setActiveTab] = useState<Tab>("video");
  const [asamblea, setAsamblea] = useState<any>(null);
  const [asambleaId, setAsambleaId] = useState("");
  const [loading, setLoading] = useState(true);

  const [opiniones, setOpiniones] = useState<any[]>([]);
  const [votaciones, setVotaciones] = useState<any[]>([]);
  const [asistencias, setAsistencias] = useState<any[]>([]);
  const [turnos, setTurnos] = useState<any[]>([]);
  const [poderes, setPoderes] = useState<any[]>([]);

  const [quorum, setQuorum] = useState<{
    totalCoeficiente: number;
    presenteCoeficiente: number;
    quorumPorcentaje: number;
  } | null>(null);
  const [votos, setVotos] = useState<Record<string, any[]>>({});
  const [newOpinion, setNewOpinion] = useState("");

  const fetchSession = useCallback(async () => {
    try {
      const data = await api.get<any>("/asambleas/activa/session");
      setAsamblea(data);
      setAsambleaId(data.id);
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
        api.get<any[]>(`/asambleas/${asambleaId}/opiniones`),
        api.get<any[]>(`/asambleas/${asambleaId}/votaciones`),
        api.get<any>(`/asambleas/${asambleaId}/asistencias`),
        api.get<any[]>(`/asambleas/${asambleaId}/turnos`),
        api.get<any[]>(`/asambleas/${asambleaId}/poderes`),
      ]);
      setOpiniones(op);
      setVotaciones(vot);
      setAsistencias(asi.asistencias ?? []);
      setQuorum({
        totalCoeficiente: asi.totalCoeficiente,
        presenteCoeficiente: asi.presenteCoeficiente,
        quorumPorcentaje: asi.quorumPorcentaje,
      });
      setTurnos(tur);
      setPoderes(pod);
    } catch (err) {
      console.error("fetch asamblea data:", err);
    }
  }, [asambleaId]);

  useEffect(() => { fetchSession(); }, [fetchSession]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  useWsSubscription("asamblea", () => { fetchSession(); fetchAll(); });

  const postOpinion = async () => {
    if (!newOpinion.trim() || !asambleaId) return;
    try {
      await api.post(`/asambleas/${asambleaId}/opiniones`, { contenido: newOpinion.trim() });
      setNewOpinion("");
      toast.success("Opinión enviada");
    } catch { toast.error("Error al enviar opinión"); }
  };

  const requestTurn = async () => {
    if (!asambleaId) return;
    try { await api.post(`/asambleas/${asambleaId}/turnos`); toast.success("Turno solicitado"); }
    catch { toast.error("Error al solicitar turno"); }
  };

  const castVote = async (votacionId: string, respuesta: string) => {
    try { await api.post(`/votaciones/${votacionId}/votos`, { respuesta }); toast.success("Voto registrado"); fetchAll(); }
    catch { toast.error("Error al votar"); }
  };

  const fetchVotos = async (votacionId: string) => {
    try { const d = await api.get<any[]>(`/votaciones/${votacionId}/votos`); setVotos((p) => ({ ...p, [votacionId]: d })); }
    catch { /* silent */ }
  };

  const registerAttendance = async () => {
    if (!asambleaId) return;
    try { await api.post(`/asambleas/${asambleaId}/asistencias`, { tipo: "VIRTUAL" }); toast.success("Asistencia registrada"); fetchAll(); }
    catch { toast.error("Error al registrar asistencia"); }
  };

  const advanceAgenda = async () => {
    if (!asamblea) return;
    try { await api.put("/asambleas/activa/session", { itemActivoIndex: asamblea.itemActivoIndex + 1, version: asamblea.version }); toast.success("Punto avanzado"); }
    catch { toast.error("Error al avanzar agenda"); }
  };

  const toggleVotacion = async (vid: string, activa: boolean) => {
    if (!asambleaId) return;
    try { await api.put(`/asambleas/${asambleaId}/votaciones/${vid}`, { activa }); toast.success(activa ? "Votación abierta" : "Votación cerrada"); fetchAll(); }
    catch { toast.error("Error al actualizar votación"); }
  };

  const updateTurno = async (tid: string, estado: string) => {
    if (!asambleaId) return;
    try { await api.put(`/asambleas/${asambleaId}/turnos/${tid}`, { estado }); fetchAll(); }
    catch { toast.error("Error al actualizar turno"); }
  };

  if (authLoading || loading) return (
    <div className="min-h-screen bg-[#0D041A] flex items-center justify-center">
      <Loader2 className="w-10 h-10 animate-spin text-accent" />
    </div>
  );

  if (!asamblea) return (
    <div className="min-h-screen bg-[#0D041A] flex items-center justify-center p-6">
      <div className="text-center">
        <Video className="w-16 h-16 text-white/20 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">No hay asamblea activa</h1>
        <p className="text-white/60 text-sm">Cuando un administrador inicie una asamblea, aparecerá aquí.</p>
      </div>
    </div>
  );

  const ordenDia: any[] = Array.isArray(asamblea.ordenDia) ? asamblea.ordenDia : [];
  const currentItem = ordenDia[asamblea.itemActivoIndex];
  const activeVotaciones = votaciones.filter((v: any) => v.activa);
  const pendingTurnos = turnos.filter((t: any) => t.estado === "PENDIENTE" || t.estado === "HABLANDO");

  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "video", label: "Video", icon: <Video size={20} /> },
    { id: "agenda", label: "Agenda", icon: <ListOrdered size={20} /> },
    { id: "votos", label: "Votos", icon: <BarChart3 size={20} />, badge: activeVotaciones.length || undefined },
    { id: "chat", label: "Chat", icon: <MessageSquare size={20} />, badge: opiniones.length || undefined },
    { id: "info", label: "Info", icon: <Info size={20} /> },
  ];

  return (
    <div className="min-h-screen bg-[#0D041A] text-white flex flex-col">
      {/* Header */}
      <header className="px-4 pt-4 pb-2 shrink-0">
        <h1 className="text-lg font-bold truncate">{asamblea.titulo}</h1>
        {currentItem && (
          <p className="text-xs text-accent truncate">
            Punto {asamblea.itemActivoIndex + 1}: {currentItem.titulo}
          </p>
        )}
      </header>

      {/* Content area — scrollable, padded for bottom bar */}
      <main className="flex-1 overflow-y-auto px-4 pb-24">
        {/* VIDEO */}
        {activeTab === "video" && (
          <div className="flex flex-col gap-4">
            <div
              className="bg-black rounded-2xl overflow-hidden"
              style={{ minHeight: "40vh" }}
            >
              {asambleaId && <LiveRoom asambleaId={asambleaId} />}
            </div>

            {currentItem && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <p className="text-[10px] text-accent font-bold uppercase tracking-wide mb-1">
                  Punto actual
                </p>
                <p className="font-bold text-sm">{currentItem.titulo}</p>
                {currentItem.descripcion && (
                  <p className="text-white/60 text-xs mt-1">
                    {currentItem.descripcion}
                  </p>
                )}
              </div>
            )}

            <button
              onClick={requestTurn}
              className="bg-accent/20 border border-accent/40 text-accent rounded-2xl py-3 text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
            >
              <Hand size={16} /> Pedir turno de habla
            </button>

            {pendingTurnos.length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3 space-y-2">
                <p className="text-[10px] text-white/40 font-bold uppercase tracking-wide">
                  Turnos de habla
                </p>
                {pendingTurnos.map((t: any) => (
                  <div key={t.id} className="flex items-center gap-2 text-sm">
                    <span className="font-bold truncate">{t.nombre}</span>
                    {t.apto && (
                      <span className="text-white/40 text-xs shrink-0">
                        {t.apto}
                      </span>
                    )}
                    <span
                      className={`ml-auto text-[10px] font-bold uppercase shrink-0 ${
                        t.estado === "HABLANDO"
                          ? "text-green-400"
                          : "text-white/40"
                      }`}
                    >
                      {t.estado === "HABLANDO" ? "Hablando" : "Espera"}
                    </span>
                    {isAdmin && t.estado === "PENDIENTE" && (
                      <button
                        onClick={() => updateTurno(t.id, "HABLANDO")}
                        className="text-[10px] text-accent font-bold shrink-0"
                      >
                        Dar turno
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* AGENDA */}
        {activeTab === "agenda" && (
          <div className="flex flex-col gap-3">
            <h2 className="text-xs font-bold text-white/60 uppercase tracking-widest">
              Orden del día
            </h2>
            {ordenDia.map((item: any, i: number) => (
              <div
                key={item.id ?? i}
                className={`p-4 rounded-2xl border transition-all ${
                  i === asamblea.itemActivoIndex
                    ? "border-accent bg-accent/10"
                    : i < asamblea.itemActivoIndex
                      ? "border-white/5 bg-white/5 opacity-60"
                      : "border-white/10 bg-white/5"
                }`}
              >
                <div className="flex items-start gap-3">
                  {i < asamblea.itemActivoIndex ? (
                    <CheckCircle size={20} className="text-green-400 shrink-0 mt-0.5" />
                  ) : i === asamblea.itemActivoIndex ? (
                    <Play size={20} className="text-accent shrink-0 mt-0.5" />
                  ) : (
                    <Circle size={20} className="text-white/20 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <p className="font-bold text-sm">{item.titulo}</p>
                    {item.descripcion && (
                      <p className="text-white/60 text-xs mt-0.5">
                        {item.descripcion}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {isAdmin && (
              <button
                onClick={advanceAgenda}
                disabled={asamblea.itemActivoIndex >= ordenDia.length - 1}
                className="w-full bg-accent text-white font-bold py-3 rounded-2xl text-xs uppercase tracking-wider disabled:opacity-30 mt-2 active:scale-95 transition-transform"
              >
                Avanzar al siguiente punto
              </button>
            )}
          </div>
        )}

        {/* VOTOS */}
        {activeTab === "votos" && (
          <div className="flex flex-col gap-4">
            <h2 className="text-xs font-bold text-white/60 uppercase tracking-widest">
              Votaciones
            </h2>

            {votaciones.length === 0 ? (
              <p className="text-white/40 text-sm text-center py-8">
                No hay votaciones creadas aún.
              </p>
            ) : (
              votaciones.map((v: any) => (
                <div
                  key={v.id}
                  className={`rounded-2xl border p-4 ${
                    v.activa
                      ? "border-accent bg-accent/5"
                      : "border-white/10 bg-white/5"
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate">{v.titulo}</p>
                      {v.descripcion && (
                        <p className="text-white/60 text-xs">{v.descripcion}</p>
                      )}
                    </div>
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full shrink-0 ml-2 ${
                        v.activa
                          ? "bg-green-500/20 text-green-400"
                          : "bg-white/10 text-white/40"
                      }`}
                    >
                      {v.activa ? "Abierta" : "Cerrada"}
                    </span>
                  </div>

                  {v.activa && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {(v.opciones ?? []).map((op: string) => (
                        <button
                          key={op}
                          onClick={() => castVote(v.id, op)}
                          className={`flex-1 min-w-[80px] py-3 rounded-xl text-xs font-bold uppercase text-white active:scale-95 transition-transform ${voteColor(op)}`}
                        >
                          {op}
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => fetchVotos(v.id)}
                    className="text-[10px] text-accent font-bold uppercase tracking-wide"
                  >
                    Ver resultados
                  </button>

                  {votos[v.id] && (
                    <div className="mt-2 space-y-1.5">
                      {tally(votos[v.id], v.opciones ?? []).map(
                        ({ option, count, pct }) => (
                          <div key={option} className="flex items-center gap-2">
                            <span className="text-xs w-20 truncate">
                              {option}
                            </span>
                            <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-accent rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-white/60 w-16 text-right">
                              {count} ({pct}%)
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  )}

                  {isAdmin && (
                    <button
                      onClick={() => toggleVotacion(v.id, !v.activa)}
                      className="mt-3 w-full text-xs font-bold py-2 rounded-xl border border-white/10 text-white/60 active:scale-95 transition-transform"
                    >
                      {v.activa ? "Cerrar votación" : "Reabrir votación"}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* CHAT */}
        {activeTab === "chat" && (
          <div className="flex flex-col gap-3 pb-16">
            <h2 className="text-xs font-bold text-white/60 uppercase tracking-widest">
              Opiniones
            </h2>
            {opiniones.length === 0 ? (
              <p className="text-white/40 text-sm text-center py-8">
                No hay opiniones aún. Sé el primero en opinar.
              </p>
            ) : (
              opiniones.map((o: any) => (
                <div
                  key={o.id}
                  className="bg-white/5 border border-white/10 rounded-2xl p-3"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-7 h-7 rounded-full bg-accent/30 flex items-center justify-center text-[10px] font-bold text-accent shrink-0">
                      {(o.nombre ?? "?")[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">{o.nombre}</p>
                      {o.apto && (
                        <p className="text-[10px] text-white/40">{o.apto}</p>
                      )}
                    </div>
                    <span className="text-[10px] text-white/30 ml-auto shrink-0">
                      {fmtTime(o.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-white/80 pl-9">{o.contenido}</p>
                </div>
              ))
            )}
          </div>
        )}

        {/* INFO */}
        {activeTab === "info" && (
          <div className="flex flex-col gap-4">
            {/* Quorum card */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <h3 className="text-xs font-bold text-white/60 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Users size={14} /> Quórum
              </h3>
              {quorum && (
                <div className="flex items-center gap-4">
                  <div className="relative w-20 h-20 shrink-0">
                    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                      <circle cx="18" cy="18" r="15.915" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                      <circle
                        cx="18" cy="18" r="15.915" fill="none"
                        className="text-accent" stroke="currentColor"
                        strokeWidth="3" strokeLinecap="round"
                        strokeDasharray={`${Math.min(Number(quorum.quorumPorcentaje), 100)} 100`}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">
                      {Number(quorum.quorumPorcentaje).toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-xs space-y-1">
                    <p>Coef. presente: <span className="font-bold">{Number(quorum.presenteCoeficiente).toFixed(2)}</span></p>
                    <p>Coef. total: <span className="font-bold">{Number(quorum.totalCoeficiente).toFixed(2)}</span></p>
                    <p>Asistentes: <span className="font-bold">{asistencias.length}</span></p>
                  </div>
                </div>
              )}
              <button
                onClick={registerAttendance}
                className="w-full mt-4 bg-accent/20 border border-accent/40 text-accent font-bold py-3 rounded-2xl text-xs uppercase tracking-wider active:scale-95 transition-transform"
              >
                Registrar mi asistencia
              </button>
            </div>

            {/* Asistencias */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <h3 className="text-xs font-bold text-white/60 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Shield size={14} /> Asistencias ({asistencias.length})
              </h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {asistencias.map((a: any) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between text-xs py-1 border-b border-white/5 last:border-0"
                  >
                    <span className="font-bold truncate">
                      {a.usuarioId?.slice(0, 8)}...
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase shrink-0 ${
                        a.tipo === "PRESENCIAL"
                          ? "text-green-400"
                          : "text-blue-400"
                      }`}
                    >
                      {a.tipo}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Poderes */}
            {poderes.length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <h3 className="text-xs font-bold text-white/60 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <FileCheck size={14} /> Poderes ({poderes.length})
                </h3>
                <div className="space-y-2">
                  {poderes.map((p: any) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between text-xs py-1 border-b border-white/5 last:border-0"
                    >
                      <span className="truncate">
                        Otorgante: {p.otorganteId?.slice(0, 8)}...
                      </span>
                      <span
                        className={`text-[10px] font-bold shrink-0 ${
                          p.verificado ? "text-green-400" : "text-yellow-400"
                        }`}
                      >
                        {p.verificado ? "Verificado" : "Pendiente"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Chat input */}
      {activeTab === "chat" && (
        <div className="fixed bottom-16 inset-x-0 bg-[#0D041A] border-t border-white/10 p-3 flex gap-2 z-10">
          <input
            value={newOpinion}
            onChange={(e) => setNewOpinion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && postOpinion()}
            placeholder="Escribe tu opinión..."
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-accent/40"
          />
          <button
            onClick={postOpinion}
            disabled={!newOpinion.trim()}
            className="bg-accent text-white w-12 rounded-xl flex items-center justify-center disabled:opacity-30 active:scale-95 transition-transform"
          >
            <Send size={18} />
          </button>
        </div>
      )}

      {/* Bottom tabs */}
      <nav className="fixed bottom-0 inset-x-0 bg-[#0D041A]/95 backdrop-blur-lg border-t border-white/10 flex z-20 pb-[env(safe-area-inset-bottom)]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 relative transition-colors ${
              activeTab === tab.id ? "text-accent" : "text-white/40"
            }`}
          >
            {tab.icon}
            <span className="text-[10px] font-bold">{tab.label}</span>
            {tab.badge != null && tab.badge > 0 && (
              <span className="absolute top-1 right-1/4 w-4 h-4 bg-accent text-[8px] text-white rounded-full flex items-center justify-center font-bold">
                {tab.badge > 9 ? "9+" : tab.badge}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
