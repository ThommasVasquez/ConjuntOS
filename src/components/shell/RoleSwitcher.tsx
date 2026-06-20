"use client";

/**
 * ROLE SWITCHER (testers only)
 *
 * Lets whitelisted tester accounts change their *real* role at runtime without
 * logging out. The backend persists the role change and re-issues the session,
 * so every role is a fully real profile (not simulated). Visible only when
 * `user.isTester` is true.
 */

import { useState } from "react";
import { ChevronDown, Check, FlaskConical } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { Rol } from "@/lib/api/types";
import { toast } from "sonner";

const ROLES: { value: Rol; label: string }[] = [
  { value: "SUPER_ADMIN", label: "Super Admin" },
  { value: "ADMINISTRADOR", label: "Administrador" },
  { value: "CONCEJO", label: "Concejo" },
  { value: "PROPIETARIO", label: "Propietario" },
  { value: "ARRENDATARIO", label: "Arrendatario" },
  { value: "VIGILANTE", label: "Vigilante" },
  { value: "SUPERVISOR_VIGILANCIA", label: "Supervisor Vigilancia" },
  { value: "ENCARGADO_PARQUEADERO", label: "Encargado Parqueadero" },
  { value: "HUESPED_TEMPORAL", label: "Huésped" },
];

export default function RoleSwitcher() {
  const { user, switchRole } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Only testers see this control.
  if (!user) return null;
  if (!user.isTester) return null;

  const currentLabel =
    ROLES.find((r) => r.value === user.rol)?.label ?? user.rol;

  const handleSelect = async (rol: Rol) => {
    if (rol === user.rol) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await switchRole(rol);
      toast.success(`Rol cambiado a ${ROLES.find((r) => r.value === rol)?.label ?? rol}`);
      setOpen(false);
      // Reload so every page re-fetches data under the new real role.
      setTimeout(() => window.location.reload(), 300);
    } catch {
      toast.error("No se pudo cambiar de rol");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative w-full mb-4 z-[60]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-linear-to-r from-text/15 to-text/15 border border-text/30 text-text shadow-lg hover:border-text/50 transition-all active:scale-[0.99] disabled:opacity-60"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-text/20 border border-text/40 flex items-center justify-center text-text">
            <FlaskConical size={18} />
          </div>
          <div className="flex flex-col items-start leading-tight">
            <span className="text-[9px] text-text font-black uppercase tracking-widest">
              Modo Tester · Rol activo
            </span>
            <span className="text-sm font-bold text-text">{currentLabel}</span>
          </div>
        </div>
        <ChevronDown
          size={18}
          className={`text-text transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-2 liquid-glass backdrop-blur-3xl rounded-2xl border border-border shadow-[0_20px_50px_rgba(0,0,0,0.6)] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="max-h-[320px] overflow-y-auto hide-scrollbar">
            {ROLES.map((r) => {
              const active = r.value === user.rol;
              return (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => handleSelect(r.value)}
                  disabled={busy}
                  className={`w-full px-4 py-3 flex items-center justify-between text-left text-sm transition-colors border-b border-border last:border-0 hover:bg-text/5 disabled:opacity-50 ${
                    active ? "text-text font-bold" : "text-text"
                  }`}
                >
                  <span>{r.label}</span>
                  {active && <Check size={16} className="text-text" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
