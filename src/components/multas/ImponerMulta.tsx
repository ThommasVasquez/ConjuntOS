"use client";

import { useEffect, useState } from "react";
import { Gavel } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api/client";
import { useAuth } from "@/hooks/useAuth";

interface Residente {
  id: string;
  nombre: string;
  torre: string | null;
  apto: string | null;
}

const ADMIN_ROLES = ["ADMINISTRADOR", "CONCEJO", "SUPER_ADMIN"];

/** Admin-only: issue a fine to a resident. Self-gates by role. */
export default function ImponerMulta({ casoId }: { casoId?: string }) {
  const role = useAuth((s) => s.user?.rol);
  const isAdmin = !!role && ADMIN_ROLES.includes(role);
  const [open, setOpen] = useState(false);
  const [residentes, setResidentes] = useState<Residente[]>([]);
  const [usuarioId, setUsuarioId] = useState("");
  const [monto, setMonto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [fechaLimite, setFechaLimite] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && residentes.length === 0) {
      api.get<Residente[]>("/directorio").then(setResidentes).catch(() => {});
    }
  }, [open, residentes.length]);

  if (!isAdmin) return null;

  async function emitir() {
    if (!usuarioId || !monto || !motivo.trim()) {
      toast.error("Completa residente, monto y motivo");
      return;
    }
    setBusy(true);
    try {
      await api.post("/multas", {
        usuarioId,
        casoId,
        monto,
        motivo: motivo.trim(),
        fechaLimite: fechaLimite || undefined,
      });
      toast.success("Multa impuesta y notificada");
      setOpen(false);
      setUsuarioId(""); setMonto(""); setMotivo(""); setFechaLimite("");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : "No se pudo imponer la multa");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full py-3 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-300 text-sm font-bold flex items-center justify-center gap-2">
        <Gavel size={16} /> Imponer multa
      </button>
    );
  }

  return (
    <div className="liquid-glass rounded-3xl p-5 border border-red-500/30 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-text font-bold"><Gavel size={16} className="text-red-400" /> Imponer multa</div>
      <select value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)}
        className="w-full bg-primary-light/50 border border-border rounded-2xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent">
        <option value="">Selecciona residente…</option>
        {residentes.map((r) => (
          <option key={r.id} value={r.id} className="bg-primary text-text">
            {r.nombre}{r.torre && r.apto ? ` — Torre ${r.torre} Apto ${r.apto}` : ""}
          </option>
        ))}
      </select>
      <input value={monto} inputMode="numeric" onChange={(e) => setMonto(e.target.value.replace(/[^\d.]/g, ""))}
        placeholder="Monto (COP)"
        className="w-full bg-primary-light/50 border border-border rounded-2xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent" />
      <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo de la multa" rows={2}
        className="w-full bg-primary-light/50 border border-border rounded-2xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent resize-none" />
      <input type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)}
        className="w-full bg-primary-light/50 border border-border rounded-2xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent" />
      <div className="flex gap-2">
        <button onClick={() => setOpen(false)} className="flex-1 py-3 rounded-2xl bg-text/10 border border-border text-text text-sm font-bold">Cancelar</button>
        <button onClick={emitir} disabled={busy} className="flex-1 py-3 rounded-2xl bg-red-500 text-white text-sm font-bold disabled:opacity-50">
          {busy ? "Imponiendo…" : "Imponer"}
        </button>
      </div>
    </div>
  );
}
