"use client";

import { useEffect, useState } from "react";
import { Gavel, FileText } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api/client";
import { useWsSubscription } from "@/hooks/useWebSocket";

interface Multa {
  id: string;
  monto: string;
  motivo: string;
  estado: "IMPUESTA" | "PAGADA" | "APELADA" | "ANULADA";
  fechaLimite: string | null;
  pdfUrl: string | null;
  createdAt: string;
}

const ESTADO_STYLE: Record<string, string> = {
  IMPUESTA: "text-amber-300 border-amber-500/30 bg-amber-500/10",
  APELADA: "text-blue-300 border-blue-500/30 bg-blue-500/10",
  PAGADA: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  ANULADA: "text-text/50 border-border bg-text/5",
};

/** Resident's own fines, with appeal + notice download. Renders nothing when empty. */
export default function MultasResidente() {
  const [multas, setMultas] = useState<Multa[]>([]);

  useEffect(() => {
    api.get<Multa[]>("/multas").then(setMultas).catch(() => {});
  }, []);

  useWsSubscription("multa", (event) => {
    const dto = event.payload as Multa | undefined;
    if (!dto) return;
    setMultas((prev) =>
      prev.some((m) => m.id === dto.id) ? prev.map((m) => (m.id === dto.id ? dto : m)) : [dto, ...prev],
    );
  });

  async function apelar(id: string) {
    try {
      const dto = await api.post<Multa>(`/multas/${id}/apelar`);
      setMultas((prev) => prev.map((m) => (m.id === id ? dto : m)));
      toast.success("Apelación registrada");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : "No se pudo apelar");
    }
  }

  if (multas.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-bold uppercase tracking-widest text-text/60 px-1 flex items-center gap-2">
        <Gavel size={14} /> Multas
      </h3>
      {multas.map((m) => (
        <div key={m.id} className="liquid-glass rounded-2xl p-4 border border-border flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-text">${Number(m.monto).toLocaleString("es-CO")}</p>
              <p className="text-[11px] text-text/60">{m.motivo}</p>
            </div>
            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border ${ESTADO_STYLE[m.estado]}`}>
              {m.estado}
            </span>
          </div>
          <div className="flex gap-2">
            {m.pdfUrl && (
              <a href={m.pdfUrl} target="_blank" rel="noopener noreferrer"
                className="flex-1 text-center py-2 rounded-xl bg-text/10 border border-border text-text text-xs font-bold flex items-center justify-center gap-1">
                <FileText size={13} /> Notificación
              </a>
            )}
            {m.estado === "IMPUESTA" && (
              <button onClick={() => apelar(m.id)}
                className="flex-1 py-2 rounded-xl bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs font-bold">
                Apelar
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
