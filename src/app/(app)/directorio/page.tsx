"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, Phone, Users, X, Loader2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { gsap } from "gsap";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { useAuth } from "@/hooks/useAuth";
import { useCall } from "@/components/providers/CallContext";

interface DirectorioUser {
  id: string;
  nombre: string;
  torre?: string | null;
  apto?: string | null;
  telefono?: string | null;
}

export default function DirectorioPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const role = user?.rol;
  const { callState, startCall } = useCall();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DirectorioUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // ── Auth gate ──────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    const allowed = ["VIGILANTE", "SUPERVISOR_VIGILANCIA", "ADMINISTRADOR", "SUPER_ADMIN"];
    if (!role || !allowed.includes(role)) {
      toast.error("No tienes permisos para acceder al directorio.");
      router.push("/inicio");
      return;
    }
  }, [user, authLoading, role, router]);

  // ── GSAP fade-up on mount ─────────────────────────────────
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".fade-up",
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.1, ease: "power2.out" }
      );
    }, containerRef);
    return () => ctx.revert();
  }, []);

  // ── Debounced search ──────────────────────────────────────
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 1) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await api.get<DirectorioUser[]>(
          `/directorio?q=${encodeURIComponent(q)}`
        );
        setSearchResults(res ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // ── Call a resident ───────────────────────────────────────
  const callDirectorioUser = (u: DirectorioUser) => {
    if (callState !== "IDLE") return;
    startCall(`user-${u.id}`, u.nombre);
  };

  return (
    <div
      ref={containerRef}
      className="min-h-screen flex flex-col p-6 pt-16 pb-32 overflow-x-hidden gap-6"
    >
      <ProfileHeader className="fade-up" />

      {/* ── PAGE HEADER ──────────────────────────────────── */}
      <section className="fade-up w-full liquid-glass-card rounded-[32px] p-5 border border-border flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center text-accent shrink-0">
            <Building2 size={20} />
          </div>
          <div>
            <h1 className="text-xl font-display font-bold text-text">Directorio</h1>
            <p className="text-[11px] text-text/50">
              Busca residentes y contacta por citofonía
            </p>
          </div>
        </div>
      </section>

      {/* ── SEARCH BAR ───────────────────────────────────── */}
      <section className="fade-up liquid-glass-card rounded-[28px] p-4 border border-border">
        <div className="flex items-center gap-2 bg-text/5 rounded-2xl px-4 py-3 border border-border">
          <Search size={18} className="text-text/50 shrink-0" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre, torre o apartamento…"
            className="flex-1 bg-transparent outline-none text-sm text-text placeholder:text-text/40"
          />
          {searchLoading && (
            <Loader2 size={16} className="animate-spin text-text/50 shrink-0" />
          )}
          {searchQuery && !searchLoading && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-text/50 shrink-0 cursor-pointer hover:text-text transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* ── RESULTS ──────────────────────────────────── */}
        {searchResults.length > 0 && (
          <div className="mt-3 flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
            {searchResults.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-text/5 border border-border"
              >
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-bold text-text truncate">
                    {u.nombre}
                  </span>
                  <span className="text-[11px] text-text/50">
                    {u.torre && u.apto
                      ? `${u.torre}-${u.apto}`
                      : u.apto
                        ? `Apto ${u.apto}`
                        : u.torre
                          ? `Torre ${u.torre}`
                          : "Sin unidad"}
                    {" · "}
                    {u.telefono
                      ? u.telefono
                      : "Sin teléfono"}
                  </span>
                </div>

                {/* Quick-action buttons */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => callDirectorioUser(u)}
                    disabled={callState !== "IDLE"}
                    className="w-9 h-9 rounded-full bg-accent/15 hover:bg-accent/25 flex items-center justify-center text-accent transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Llamar por citofonía"
                  >
                    <Phone size={16} />
                  </button>
                  <button
                    onClick={() =>
                      toast.info(`${u.nombre} — ${u.torre && u.apto ? `${u.torre}-${u.apto}` : "Sin unidad"}`)
                    }
                    className="w-9 h-9 rounded-full bg-secondary/15 hover:bg-secondary/25 flex items-center justify-center text-secondary transition-colors cursor-pointer"
                    title="Ver información"
                  >
                    <Users size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── EMPTY STATE ──────────────────────────────── */}
        {searchQuery.trim().length >= 1 &&
          !searchLoading &&
          searchResults.length === 0 && (
            <p className="mt-4 text-center text-xs text-text/40">
              No se encontraron residentes con ese criterio.
            </p>
          )}
      </section>

      {/* ── QUICK ACTIONS ──────────────────────────────── */}
      <section className="fade-up grid grid-cols-1 gap-4">
        <button
          onClick={() => router.push("/citofonia")}
          className="liquid-glass-card rounded-[28px] p-5 border border-border flex items-center gap-4 active:scale-[0.98] transition-transform cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center text-accent shrink-0">
            <Phone size={20} />
          </div>
          <div className="text-left">
            <span className="text-sm font-bold text-text block">
              Ir al citófono
            </span>
            <span className="text-[11px] text-text/50">
              Marcador completo y control de llamadas
            </span>
          </div>
        </button>
      </section>
    </div>
  );
}
