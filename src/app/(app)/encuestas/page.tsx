"use client";

import { useEffect, useState } from "react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { BarChart3, Plus, X, Check, Lock } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api/client";
import { useAuth } from "@/hooks/useAuth";
import { useWsSubscription } from "@/hooks/useWebSocket";

interface Opcion { id: string; texto: string }
interface Conteo { opcionId: string; texto: string; votos: number }
interface Encuesta {
  id: string;
  titulo: string;
  descripcion: string | null;
  opciones: Opcion[];
  multiple: boolean;
  anonima: boolean;
  cierraAt: string | null;
  cerrada: boolean;
  createdAt: string;
  yaVote: boolean;
  total: number;
  resultados: Conteo[];
}

// Must match backend encuestas ADMIN_ROLES (Administrador, Concejo, SuperAdmin).
const ADMIN_ROLES = ["ADMINISTRADOR", "CONCEJO", "SUPER_ADMIN"];

export default function EncuestasPage() {
  const role = useAuth((s) => s.user?.rol);
  const isAdmin = !!role && ADMIN_ROLES.includes(role);
  const [encuestas, setEncuestas] = useState<Encuesta[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selection, setSelection] = useState<Record<string, string[]>>({});

  // Creator form
  const [titulo, setTitulo] = useState("");
  const [opciones, setOpciones] = useState<string[]>(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [anonima, setAnonima] = useState(false);

  useEffect(() => {
    api.get<Encuesta[]>("/encuestas").then(setEncuestas).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useWsSubscription("encuesta", (event) => {
    const dto = event.payload as Encuesta | undefined;
    if (!dto) return;
    setEncuestas((prev) => {
      const exists = prev.some((e) => e.id === dto.id);
      return exists ? prev.map((e) => (e.id === dto.id ? dto : e)) : [dto, ...prev];
    });
  });

  function toggle(encuesta: Encuesta, opcionId: string) {
    setSelection((prev) => {
      const cur = prev[encuesta.id] ?? [];
      if (encuesta.multiple) {
        return { ...prev, [encuesta.id]: cur.includes(opcionId) ? cur.filter((o) => o !== opcionId) : [...cur, opcionId] };
      }
      return { ...prev, [encuesta.id]: [opcionId] };
    });
  }

  async function votar(encuesta: Encuesta) {
    const sel = selection[encuesta.id] ?? [];
    if (sel.length === 0) { toast.error("Selecciona una opción"); return; }
    try {
      const dto = await api.post<Encuesta>(`/encuestas/${encuesta.id}/votar`, { opciones: sel });
      setEncuestas((prev) => prev.map((e) => (e.id === dto.id ? dto : e)));
      toast.success("¡Voto registrado!");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : "No se pudo votar");
    }
  }

  async function cerrar(id: string) {
    try {
      const dto = await api.post<Encuesta>(`/encuestas/${id}/cerrar`);
      setEncuestas((prev) => prev.map((e) => (e.id === dto.id ? dto : e)));
    } catch {
      toast.error("No se pudo cerrar la encuesta");
    }
  }

  async function crear() {
    const ops = opciones.map((o) => o.trim()).filter(Boolean);
    if (!titulo.trim() || ops.length < 2) { toast.error("Título y al menos 2 opciones"); return; }
    try {
      const dto = await api.post<Encuesta>("/encuestas", { titulo: titulo.trim(), opciones: ops, multiple, anonima });
      setEncuestas((prev) => [dto, ...prev]);
      setCreating(false);
      setTitulo(""); setOpciones(["", ""]); setMultiple(false); setAnonima(false);
      toast.success("Encuesta publicada");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : "No se pudo crear");
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
      <ProfileHeader />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-accent/20 border border-accent/30 flex items-center justify-center text-accent">
            <BarChart3 size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text">Encuestas</h2>
            <p className="text-xs text-text/70">Participa y mira los resultados en vivo</p>
          </div>
        </div>
        {isAdmin && (
          <button onClick={() => setCreating((v) => !v)} className="px-3 py-2 rounded-xl bg-accent text-primary text-sm font-bold flex items-center gap-1">
            {creating ? <X size={16} /> : <Plus size={16} />} {creating ? "Cerrar" : "Nueva"}
          </button>
        )}
      </div>

      {isAdmin && creating && (
        <div className="liquid-glass rounded-3xl p-5 border border-border flex flex-col gap-3">
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Pregunta de la encuesta"
            className="w-full bg-primary-light/50 border border-border rounded-2xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent" />
          {opciones.map((o, i) => (
            <div key={i} className="flex gap-2">
              <input value={o} onChange={(e) => setOpciones((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))}
                placeholder={`Opción ${i + 1}`}
                className="flex-1 bg-primary-light/50 border border-border rounded-2xl py-2.5 px-4 text-sm text-text focus:outline-none focus:border-accent" />
              {opciones.length > 2 && (
                <button onClick={() => setOpciones((prev) => prev.filter((_, j) => j !== i))} className="px-3 rounded-2xl bg-text/10 border border-border text-text"><X size={14} /></button>
              )}
            </div>
          ))}
          <button onClick={() => setOpciones((prev) => [...prev, ""])} className="text-xs text-accent font-bold self-start">+ Añadir opción</button>
          <div className="flex gap-4 text-xs text-text/80">
            <label className="flex items-center gap-2"><input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} /> Selección múltiple</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={anonima} onChange={(e) => setAnonima(e.target.checked)} /> Anónima</label>
          </div>
          <button onClick={crear} className="w-full py-3 rounded-2xl bg-accent text-primary font-bold">Publicar encuesta</button>
        </div>
      )}

      {loading && <p className="text-text/50 text-sm text-center py-8">Cargando…</p>}
      {!loading && encuestas.length === 0 && <p className="text-text/50 text-sm text-center py-8">No hay encuestas todavía.</p>}

      {encuestas.map((e) => {
        const mostrarResultados = e.yaVote || e.cerrada;
        const sel = selection[e.id] ?? [];
        return (
          <div key={e.id} className="liquid-glass rounded-3xl p-5 border border-border flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-text">{e.titulo}</h3>
                <p className="text-[10px] text-text/50 uppercase tracking-wider">
                  {e.total} voto(s){e.anonima ? " · anónima" : ""}{e.cerrada ? " · cerrada" : ""}
                </p>
              </div>
              {isAdmin && !e.cerrada && (
                <button onClick={() => cerrar(e.id)} className="text-[10px] text-text/60 flex items-center gap-1 border border-border rounded-lg px-2 py-1"><Lock size={11} /> Cerrar</button>
              )}
            </div>

            {mostrarResultados ? (
              <div className="flex flex-col gap-2">
                {e.resultados.map((r) => {
                  const pct = e.total > 0 ? Math.round((r.votos / e.total) * 100) : 0;
                  return (
                    <div key={r.opcionId} className="flex flex-col gap-1">
                      <div className="flex justify-between text-xs text-text"><span>{r.texto}</span><span className="font-bold">{pct}% ({r.votos})</span></div>
                      <div className="h-2.5 rounded-full bg-text/10 overflow-hidden">
                        <div className="h-full bg-accent rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                {e.yaVote && !e.cerrada && <p className="text-[10px] text-accent font-bold">Ya votaste · resultados en vivo</p>}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {e.opciones.map((o) => {
                  const checked = sel.includes(o.id);
                  return (
                    <button key={o.id} onClick={() => toggle(e, o.id)}
                      className={`flex items-center gap-3 p-3 rounded-2xl border text-left transition-all ${checked ? "border-accent bg-accent/10" : "border-border"}`}>
                      <span className={`w-5 h-5 ${e.multiple ? "rounded-md" : "rounded-full"} border flex items-center justify-center ${checked ? "bg-accent border-accent text-primary" : "border-text/30"}`}>
                        {checked && <Check size={12} />}
                      </span>
                      <span className="text-sm text-text">{o.texto}</span>
                    </button>
                  );
                })}
                <button onClick={() => votar(e)} className="mt-1 w-full py-3 rounded-2xl bg-accent text-primary font-bold">Votar</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
