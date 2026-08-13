"use client";

import { useEffect, useState } from "react";
import { Building2, ChevronDown, Check, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api/client";
import type { ConjuntoDto } from "@/lib/api/types";
import { toast } from "sonner";

export default function ConjuntoSwitcher() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [conjuntos, setConjuntos] = useState<ConjuntoDto[]>([]);
  const [activeConjunto, setActiveConjunto] = useState<ConjuntoDto | null>(null);

  // Only render for Administrators, SuperAdmins or Council members
  const isEligibleRole =
    user?.rol === "ADMINISTRADOR" ||
    user?.rol === "SUPER_ADMIN" ||
    user?.rol === "CONCEJO";

  useEffect(() => {
    if (!user || !isEligibleRole) return;

    async function loadConjuntos() {
      setLoading(true);
      try {
        // Fetch all conjuntos from backend API
        const data = await api.get<ConjuntoDto[]>("/superadmin/conjuntos").catch(() => []);
        if (data && data.length > 0) {
          setConjuntos(data);
          
          // Determine active conjunto from saved preference or first entry
          const savedSubdomain = localStorage.getItem("active_conjunto_subdomain");
          const found = data.find((c) => c.subdominio === savedSubdomain) || data[0];
          setActiveConjunto(found);
        }
      } catch {
        // Silent catch for non-superadmin users if endpoint is restricted
      } finally {
        setLoading(false);
      }
    }

    loadConjuntos();
  }, [user, isEligibleRole]);

  if (!user || !isEligibleRole || conjuntos.length === 0) return null;

  const handleSelectConjunto = (c: ConjuntoDto) => {
    if (activeConjunto?.id === c.id) {
      setOpen(false);
      return;
    }

    setActiveConjunto(c);
    localStorage.setItem("active_conjunto_subdomain", c.subdominio);
    localStorage.setItem("active_conjunto_nombre", c.nombre);
    setOpen(false);
    toast.success(`Copropiedad cambiada a: ${c.nombre}`, {
      description: `Gestión activa en ${c.subdominio}.conjuntos.app`,
      icon: "🏢",
    });

    // Refresh active context
    setTimeout(() => {
      window.location.reload();
    }, 400);
  };

  return (
    <div className="relative w-full mb-4 z-[55]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={loading}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl liquid-glass-card border border-accent/30 text-text shadow-lg hover:border-accent/60 transition-all active:scale-[0.99] group cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent shrink-0 group-hover:scale-105 transition-transform">
            <Building2 size={18} />
          </div>
          <div className="flex flex-col items-start leading-tight min-w-0">
            <span className="text-[9px] text-accent font-black uppercase tracking-widest flex items-center gap-1">
              <Sparkles size={9} /> Copropiedad Activa
            </span>
            <span className="text-sm font-bold text-text truncate max-w-[220px] sm:max-w-xs">
              {activeConjunto ? activeConjunto.nombre : "Seleccionar Copropiedad"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {conjuntos.length > 1 && (
            <span className="text-[10px] font-mono font-bold bg-surface-2 border border-border px-2 py-0.5 rounded-full text-text/80">
              {conjuntos.length} conjuntos
            </span>
          )}
          <ChevronDown
            size={18}
            className={`text-accent transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-2 liquid-glass backdrop-blur-3xl rounded-2xl border border-border shadow-[0_20px_50px_rgba(0,0,0,0.6)] overflow-hidden animate-in fade-in zoom-in-95 duration-150 z-50">
          <div className="p-3 border-b border-border/40 bg-surface-2/50">
            <span className="text-[10px] font-black uppercase tracking-widest text-accent block">
              Cambiar Copropiedad
            </span>
            <p className="text-xs text-text/70 mt-0.5">
              Selecciona el conjunto residencial que deseas gestionar:
            </p>
          </div>

          <div className="max-h-[320px] overflow-y-auto hide-scrollbar">
            {conjuntos.map((c) => {
              const active = activeConjunto?.id === c.id;
              return (
                <button
                  key={c.id || c.subdominio}
                  type="button"
                  onClick={() => handleSelectConjunto(c)}
                  className={`w-full px-4 py-3 flex items-center justify-between text-left text-sm transition-colors border-b border-border/40 last:border-0 hover:bg-accent/10 cursor-pointer ${
                    active ? "bg-accent/15 font-bold text-text" : "text-text"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-bold shrink-0 ${
                        active
                          ? "bg-accent text-on-accent border-accent"
                          : "bg-surface-2 border-border text-text"
                      }`}
                    >
                      {c.nombre.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="truncate font-semibold text-text">{c.nombre}</span>
                      <span className="text-[10px] font-mono text-text/70">
                        {c.subdominio}.conjuntos.app
                      </span>
                    </div>
                  </div>
                  {active && <Check size={18} className="text-accent shrink-0 ml-2" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
