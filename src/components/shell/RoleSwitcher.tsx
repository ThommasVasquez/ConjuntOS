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
    <div className="fixed bottom-20 left-4 md:bottom-6 md:left-6 z-[999]">
      {/* Floating trigger button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        className="flex items-center gap-2 px-3 py-2.5 rounded-full bg-surface-2/90 backdrop-blur-xl border border-blue-500/40 text-text shadow-2xl hover:bg-blue-500/10 hover:border-blue-500 transition-all active:scale-95 cursor-pointer disabled:opacity-60 group"
      >
        <div className="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
          <FlaskConical size={14} />
        </div>
        <div className="flex flex-col items-start leading-none pr-1">
          <span className="text-[8px] text-blue-400 font-black uppercase tracking-widest block">
            Tester
          </span>
          <span className="text-xs font-bold text-text truncate max-w-[110px] sm:max-w-[140px]">
            {currentLabel}
          </span>
        </div>
        <ChevronDown
          size={14}
          className={`text-blue-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Floating popup menu */}
      {open && (
        <div className="absolute bottom-full left-0 mb-3 w-72 max-w-[calc(100vw-2rem)] bg-surface border border-border rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.9)] overflow-hidden animate-in fade-in zoom-in-95 duration-150 z-[1000]">
          <div className="p-3 border-b border-border/40 bg-surface-2/80">
            <span className="text-[10px] font-black uppercase tracking-widest text-blue-400 block">
              Modo Tester · Cambiar Rol
            </span>
            <p className="text-[11px] text-text/70 mt-0.5">
              Alterna instantáneamente entre perfiles demo:
            </p>
          </div>

          <div className="max-h-[320px] overflow-y-auto hide-scrollbar">
            {ACCOUNTS.map((a) => {
              const active = a.email === user.email;
              return (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => handleSelect(a.email)}
                  disabled={busy}
                  className={`w-full px-3.5 py-2.5 flex items-center justify-between text-left text-xs transition-colors border-b border-border/40 last:border-0 hover:bg-blue-500/10 cursor-pointer disabled:opacity-50 ${
                    active ? "bg-blue-500/15 text-text font-bold" : "text-text"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-base shrink-0">{a.icon}</span>
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{a.label}</span>
                      <span className="text-[9px] text-text-muted font-mono truncate">{a.email}</span>
                    </div>
                  </div>
                  {active && <Check size={15} className="text-blue-400 shrink-0 ml-1" />}
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
              className="w-full px-3.5 py-2.5 flex items-center gap-2 text-left text-xs text-blue-400 font-bold hover:bg-blue-500/10 transition-colors cursor-pointer border-t border-border/40"
            >
              <Plus size={14} />
              <span>Añadir otra cuenta</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
