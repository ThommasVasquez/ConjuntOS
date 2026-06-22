"use client";

import { useState } from "react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { Scale, Send, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";

interface Turno { pregunta: string; respuesta: string }

const SUGERENCIAS = [
  "¿Puedo tener mascotas según el reglamento?",
  "¿Qué dice la Ley 675 sobre las cuotas de administración?",
  "¿Cómo se eligen los miembros del consejo?",
  "¿Qué es el coeficiente de copropiedad?",
];

export default function AsistentePage() {
  const [pregunta, setPregunta] = useState("");
  const [historial, setHistorial] = useState<Turno[]>([]);
  const [loading, setLoading] = useState(false);

  async function preguntar(texto: string) {
    const q = texto.trim();
    if (!q || loading) return;
    setLoading(true);
    setPregunta("");
    try {
      const { respuesta } = await api.post<{ respuesta: string }>("/ai/asistente", { pregunta: q });
      setHistorial((prev) => [...prev, { pregunta: q, respuesta }]);
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : "No se pudo consultar en este momento.";
      setHistorial((prev) => [...prev, { pregunta: q, respuesta: msg }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
      <ProfileHeader />

      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-accent/20 border border-accent/30 flex items-center justify-center text-accent">
          <Scale size={24} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-text">Asistente legal</h2>
          <p className="text-xs text-text/70">Consultas sobre Ley 675 y el reglamento</p>
        </div>
      </div>

      {historial.length === 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-text/50 px-1">Prueba con:</p>
          {SUGERENCIAS.map((s) => (
            <button key={s} onClick={() => preguntar(s)}
              className="text-left liquid-glass rounded-2xl p-3 border border-border text-sm text-text/90 hover:border-accent/40 transition-all">
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {historial.map((t, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="self-end max-w-[85%] bg-accent/20 border border-accent/30 rounded-2xl rounded-br-md px-4 py-2.5 text-sm text-text">{t.pregunta}</div>
            <div className="self-start max-w-[90%] liquid-glass border border-border rounded-2xl rounded-bl-md px-4 py-3 text-sm text-text whitespace-pre-wrap">{t.respuesta}</div>
          </div>
        ))}
        {loading && (
          <div className="self-start liquid-glass border border-border rounded-2xl px-4 py-3 flex items-center gap-2 text-text/60 text-sm">
            <Loader2 size={16} className="animate-spin" /> Consultando…
          </div>
        )}
      </div>

      <div className="fixed bottom-24 left-0 right-0 px-6">
        <div className="flex gap-2 max-w-2xl mx-auto">
          <input value={pregunta} onChange={(e) => setPregunta(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && preguntar(pregunta)}
            placeholder="Escribe tu consulta…"
            className="flex-1 bg-surface-2 border border-border rounded-2xl py-3.5 px-4 text-sm text-text shadow-xl focus:outline-none focus:border-accent" />
          <button onClick={() => preguntar(pregunta)} disabled={loading || !pregunta.trim()}
            className="px-5 rounded-2xl bg-accent text-primary font-bold disabled:opacity-50 shadow-xl">
            <Send size={18} />
          </button>
        </div>
      </div>

      <p className="text-[10px] text-text/30 text-center mt-2">
        Información orientativa basada en la Ley 675. Para casos específicos, contacta a la administración.
      </p>
    </div>
  );
}
