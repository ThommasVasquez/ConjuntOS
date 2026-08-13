"use client";

/**
 * ACCOUNT SWITCHER (testers only)
 *
 * Lets whitelisted tester accounts swap between real demo accounts without
 * logging out. Each entry performs a full login (different user ID, session,
 * and data) so every role is a fully real profile. Visible only when
 * `user.isTester` is true.
 */

import { useState } from "react";
import { ChevronDown, Check, FlaskConical, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const DEMO_PASSWORD = "123456789";

const ACCOUNTS: { email: string; label: string; icon: string }[] = [
  { email: "superadmin@demo.conjuntos.app", label: "Super Admin", icon: "👑" },
  { email: "admin@demo.conjuntos.app", label: "Administrador", icon: "🏢" },
  { email: "concejo@demo.conjuntos.app", label: "Concejo", icon: "🏛️" },
  { email: "residente@demo.conjuntos.app", label: "Propietario", icon: "🏠" },
  { email: "arrendatario@demo.conjuntos.app", label: "Arrendatario", icon: "🔑" },
  { email: "vigilante@demo.conjuntos.app", label: "Vigilante", icon: "🛡️" },
  { email: "supervisor@demo.conjuntos.app", label: "Supervisor Vigilancia", icon: "📋" },
  { email: "parqueadero@demo.conjuntos.app", label: "Encargado Parqueadero", icon: "🅿️" },
  { email: "huesped@demo.conjuntos.app", label: "Huésped", icon: "👤" },
  { email: "piscina@demo.conjuntos.app", label: "Admin. Piscina", icon: "🏊" },
  { email: "gym@demo.conjuntos.app", label: "Admin. Gym", icon: "💪" },
  { email: "mantenimiento@demo.conjuntos.app", label: "Mantenimiento", icon: "🔧" },
  { email: "limpieza@demo.conjuntos.app", label: "Limpieza", icon: "🧹" },
];

export default function RoleSwitcher() {
  const { user, login } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Only testers see this control.
  if (!user) return null;
  if (!user.isTester) return null;

  const currentAccount = ACCOUNTS.find((a) => a.email === user.email);
  const currentLabel = currentAccount?.label ?? user.rol;

  const handleSelect = async (email: string) => {
    if (email === user.email) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await login(email, DEMO_PASSWORD);
      toast.success(`Cambiado a ${ACCOUNTS.find((a) => a.email === email)?.label ?? email}`);
      setOpen(false);
      setTimeout(() => window.location.reload(), 300);
    } catch {
      toast.error("No se pudo cambiar de cuenta");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative w-full mb-4 z-[50]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-primary-light border border-border text-text shadow-md hover:border-blue-500/30 transition-all active:scale-[0.99] disabled:opacity-60"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center text-blue-500">
            <FlaskConical size={18} />
          </div>
          <div className="flex flex-col items-start leading-tight">
            <span className="text-[9px] text-text-muted font-black uppercase tracking-widest">
              Modo Tester · Cuenta activa
            </span>
            <span className="text-sm font-bold text-text">{currentLabel}</span>
          </div>
        </div>
        <ChevronDown
          size={18}
          className={`text-blue-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-2 liquid-glass backdrop-blur-3xl rounded-2xl border border-border shadow-[0_20px_50px_rgba(0,0,0,0.6)] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="max-h-[400px] overflow-y-auto hide-scrollbar">
            {ACCOUNTS.map((a) => {
              const active = a.email === user.email;
              return (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => handleSelect(a.email)}
                  disabled={busy}
                  className={`w-full px-4 py-3 flex items-center justify-between text-left text-sm transition-colors border-b border-border last:border-0 hover:bg-text/5 disabled:opacity-50 ${
                    active ? "text-text font-bold" : "text-text"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{a.icon}</span>
                    <div className="flex flex-col">
                      <span>{a.label}</span>
                      <span className="text-[10px] text-text-muted">{a.email}</span>
                    </div>
                  </div>
                  {active && <Check size={16} className="text-text" />}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                window.location.href = "/login";
              }}
              disabled={busy}
              className="w-full px-4 py-3 flex items-center gap-2 text-left text-sm text-blue-500 font-semibold hover:bg-blue-500/5 transition-colors disabled:opacity-50"
            >
              <Plus size={16} />
              <span>Añadir cuenta</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
