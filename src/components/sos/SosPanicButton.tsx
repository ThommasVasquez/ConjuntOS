"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api/client";
import { useWsSubscription } from "@/hooks/useWebSocket";
import { useAuth } from "@/hooks/useAuth";
import type { SosDto, TipoSos } from "./types";

const RESIDENT_ROLES = ["PROPIETARIO", "ARRENDATARIO", "HUESPED_TEMPORAL"];

const TIPOS: { value: TipoSos; label: string; emoji: string }[] = [
  { value: "SEGURIDAD", label: "Seguridad", emoji: "🛡️" },
  { value: "MEDICA", label: "Médica", emoji: "🚑" },
  { value: "INCENDIO", label: "Incendio", emoji: "🔥" },
  { value: "OTRO", label: "Otro", emoji: "⚠️" },
];

interface SosPanicButtonProps {
  /** Compact mode: icon-only button for headers (default false = full card). */
  compact?: boolean;
}

/**
 * Resident-facing panic button. Press → pick emergency type → notifies security
 * instantly. Shows an "active" state until the alert is resolved (over WS).
 *
 * In compact mode, renders as a small circular icon button (like notifications).
 * In card mode, renders as a full-width card with description.
 */
export default function SosPanicButton({ compact = false }: SosPanicButtonProps) {
  const [open, setOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [active, setActive] = useState<SosDto | null>(null);
  const role = useAuth((s) => s.user?.rol);

  // Clear the active banner when security resolves our own alert.
  useWsSubscription("sos", (event) => {
    if (event.action !== "updated") return;
    const dto = event.payload as SosDto | undefined;
    if (dto && active && dto.id === active.id && dto.estado === "RESUELTA") {
      setActive(null);
      toast.success("Tu alerta SOS fue atendida y resuelta.");
    }
  });

  async function enviar(tipo: TipoSos) {
    setSending(true);
    try {
      const dto = await api.post<SosDto>("/sos", { tipo });
      setActive(dto);
      setOpen(false);
      toast.success("🚨 Alerta enviada. Seguridad fue notificada.");
    } catch (e) {
      setOpen(false);
      if (e instanceof ApiError && e.status === 409) {
        toast.error("Ya tienes una alerta SOS activa.");
      } else {
        toast.error("No se pudo enviar la alerta. Intenta de nuevo.");
      }
    } finally {
      setSending(false);
    }
  }

  async function cancelar() {
    if (!active) return;
    setCancelling(true);
    try {
      await api.post(`/sos/${active.id}/cancelar`);
      setActive(null);
      toast.success("Alerta SOS cancelada.");
    } catch {
      toast.error("No se pudo cancelar la alerta.");
    } finally {
      setCancelling(false);
    }
  }

  // Restore active SOS from server on page reload.
  useEffect(() => {
    if (!role || !RESIDENT_ROLES.includes(role)) return;
    api
      .get<SosDto | null>("/sos/activa")
      .then((dto) => { if (dto) setActive(dto); })
      .catch(() => {});
  }, [role]);

  // Residents only — security/admin have their own console.
  if (!role || !RESIDENT_ROLES.includes(role)) return null;

  if (active) {
    // ── Active SOS banner (card mode) ──
    if (!compact) {
      return (
        <div className="liquid-glass rounded-2xl p-4 border border-red-500/40 bg-red-500/10 animate-pulse">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-red-400 shrink-0" size={22} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-red-300">Alerta SOS activa</p>
              <p className="text-[11px] text-text/60">
                Seguridad fue notificada y está en camino.
              </p>
            </div>
          </div>
          <button
            onClick={() => setConfirmCancel(true)}
            disabled={cancelling}
            className="mt-3 w-full text-center text-xs font-semibold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded-xl py-2 transition-colors disabled:opacity-50"
          >
            {cancelling ? "Cancelando..." : "Cancelar alerta"}
          </button>
        </div>
      );
    }

    // ── Active SOS indicator (compact mode): glowing red button ──
    // ⚠️  Opens a confirmation dialog — NOT a direct cancel. Touching the pulsating
    // red button out of curiosity should not immediately cancel the SOS.
    return (
      <button
        onClick={() => setConfirmCancel(true)}
        disabled={cancelling}
        className="relative w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-xl border active:scale-95 bg-red-500/20 border-red-500/50 text-red-400 animate-pulse"
        title={cancelling ? "Cancelando..." : "Alerta SOS activa — toca para cancelar"}
      >
        <AlertTriangle size={22} />
        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-primary shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
      </button>
    );
  }

  return (
    <>
      {/* ── Compact mode: icon button only ── */}
      {compact ? (
        <button
          onClick={() => setOpen(true)}
          className="relative w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-xl group border border-border active:scale-95 liquid-glass text-text hover:text-text"
          title="Botón de Pánico (SOS)"
        >
          <AlertTriangle size={22} className="text-red-400 group-hover:text-red-300 transition-colors" />
        </button>
      ) : (
        /* ── Card mode: full-width card ── */
        <button
          onClick={() => setOpen(true)}
          className="w-full liquid-glass-card rounded-2xl p-4 border border-red-500/40 bg-gradient-to-br from-red-500/20 to-red-600/5 flex items-center gap-3 hover:scale-[1.02] active:scale-95 transition-all"
        >
          <div className="w-11 h-11 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400">
            <AlertTriangle size={24} />
          </div>
          <div className="text-left">
            <h4 className="text-sm font-bold text-text">Botón de Pánico (SOS)</h4>
            <p className="text-[10px] text-text/50 mt-0.5">
              Emergencia — notifica a seguridad al instante
            </p>
          </div>
        </button>
      )}

      {confirmCancel && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 p-4"
          onClick={() => setConfirmCancel(false)}
        >
          <div
            className="bg-primary rounded-3xl p-5 border border-red-500/40 w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={22} className="text-red-400 shrink-0" />
              <div>
                <h3 className="text-base font-bold text-text">¿Cancelar alerta SOS?</h3>
                <p className="text-[11px] text-text/50 mt-0.5">
                  Esto notificará a seguridad que ya no necesitas ayuda.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmCancel(false)}
                className="flex-1 py-3 rounded-xl border border-border text-text/70 text-sm font-semibold active:scale-95 transition-all"
              >
                No, mantener
              </button>
              <button
                onClick={() => { setConfirmCancel(false); cancelar(); }}
                disabled={cancelling}
                className="flex-1 py-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-400 text-sm font-bold active:scale-95 transition-all disabled:opacity-50"
              >
                {cancelling ? "Cancelando..." : "Sí, cancelar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4"
          onClick={() => !sending && setOpen(false)}
        >
          <div
            className="bg-primary rounded-3xl p-5 border border-red-500/40 w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-text">
                ¿Qué tipo de emergencia?
              </h3>
              <button
                onClick={() => setOpen(false)}
                disabled={sending}
                className="text-text/50"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {TIPOS.map((t) => (
                <button
                  key={t.value}
                  disabled={sending}
                  onClick={() => enviar(t.value)}
                  className="liquid-glass-card rounded-2xl p-4 border border-border flex flex-col items-center gap-1 hover:border-red-500/40 active:scale-95 transition-all disabled:opacity-50"
                >
                  <span className="text-2xl">{t.emoji}</span>
                  <span className="text-xs font-bold text-text">{t.label}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-text/40 text-center mt-3">
              Se notificará a portería y seguridad de inmediato.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
