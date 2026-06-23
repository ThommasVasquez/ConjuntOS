"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Eye } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { useWsSubscription } from "@/hooks/useWebSocket";
import type { SosDto } from "./types";

const TIPO_LABEL: Record<string, string> = {
  SEGURIDAD: "🛡️ Seguridad",
  MEDICA: "🚑 Médica",
  INCENDIO: "🔥 Incendio",
  OTRO: "⚠️ Otro",
};

/**
 * Security console: live list of active SOS alerts. Renders nothing when the
 * queue is empty so it can sit at the top of the vigilancia dashboard unobtrusively.
 */
export default function SosConsole() {
  const [alertas, setAlertas] = useState<SosDto[]>([]);

  useEffect(() => {
    api
      .get<SosDto[]>("/sos")
      .then(setAlertas)
      .catch(() => {});
  }, []);

  useWsSubscription("sos", (event) => {
    const dto = event.payload as SosDto | undefined;
    if (!dto) return;
    if (event.action === "created") {
      setAlertas((prev) =>
        prev.some((a) => a.id === dto.id) ? prev : [dto, ...prev],
      );
      toast.error(`🚨 SOS — ${dto.usuarioNombre ?? "Residente"}`, {
        duration: 10000,
      });
    } else if (event.action === "updated") {
      setAlertas((prev) =>
        dto.estado === "RESUELTA"
          ? prev.filter((a) => a.id !== dto.id)
          : prev.map((a) => (a.id === dto.id ? dto : a)),
      );
    }
  });

  async function accion(id: string, kind: "atender" | "resolver") {
    try {
      const dto = await api.post<SosDto>(`/sos/${id}/${kind}`);
      setAlertas((prev) =>
        dto.estado === "RESUELTA"
          ? prev.filter((a) => a.id !== id)
          : prev.map((a) => (a.id === id ? dto : a)),
      );
    } catch {
      toast.error("No se pudo actualizar la alerta.");
    }
  }

  if (alertas.length === 0) return null;

  return (
    <div className="fade-up flex flex-col gap-2">
      <h3 className="text-xs font-bold uppercase tracking-widest text-red-400 px-1 flex items-center gap-2">
        <AlertTriangle size={14} /> Alertas SOS activas ({alertas.length})
      </h3>
      {alertas.map((a) => (
        <div
          key={a.id}
          className="liquid-glass rounded-2xl p-4 border border-red-500/40 bg-red-500/10 flex items-center gap-3"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-text truncate">
              {TIPO_LABEL[a.tipo] ?? a.tipo} — {a.usuarioNombre ?? "Residente"}
            </p>
            <p className="text-[11px] text-text/60">
              {(a.torre || a.apto) && (
                <span className="text-accent font-semibold">
                  Torre {a.torre ?? "—"} Apto {a.apto ?? "—"} ·{" "}
                </span>
              )}
              {a.ubicacion || "Ubicación no especificada"} ·{" "}
              {a.estado === "ATENDIDA" ? "En atención" : "Sin atender"}
            </p>
          </div>
          {a.estado === "ABIERTA" && (
            <button
              onClick={() => accion(a.id, "atender")}
              className="px-3 py-2 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center gap-1 active:scale-95 transition-all"
            >
              <Eye size={14} /> Atender
            </button>
          )}
          <button
            onClick={() => accion(a.id, "resolver")}
            className="px-3 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-1 active:scale-95 transition-all"
          >
            <Check size={14} /> Resolver
          </button>
        </div>
      ))}
    </div>
  );
}
