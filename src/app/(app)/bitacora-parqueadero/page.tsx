"use client";

import { useEffect, useState } from "react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import {
  ScrollText, Check, X, Clock, User, ShieldAlert,
  CheckCircle2, XCircle, History,
} from "lucide-react";
import { gsap } from "gsap";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useWsSubscription } from "@/hooks/useWebSocket";

// Etiquetas legibles de acción/estado.
const ACCION_LABEL: Record<string, string> = {
  ASIGNAR: "Asignar a residente",
  LIBERAR: "Liberar celda",
  CAMBIAR_ESTADO: "Cambiar estado",
  CREAR: "Crear celda",
};

const ESTADO_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  PENDIENTE: { label: "Pendiente", color: "#FACC15", bg: "rgba(250,204,21,0.12)" },
  APROBADA: { label: "Aprobada", color: "#57bf00", bg: "rgba(87,191,0,0.12)" },
  RECHAZADA: { label: "Rechazada", color: "#EF4444", bg: "rgba(239,68,68,0.12)" },
  EJECUTADA: { label: "Ejecutada", color: "#009df2", bg: "rgba(0,157,242,0.12)" },
};

// Solicitud de la bitácora de parqueadero devuelta por el backend.
interface SolicitudParqueadero {
  id: string;
  estado: string;
  accion: string;
  detalle: string;
  celdaNumero: string;
  solicitanteNombre: string;
  solicitanteRol: string;
  creadoEn: string;
  aprobadorNombre?: string | null;
  resueltoEn?: string | null;
}

export default function BitacoraParqueaderoPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const role = user?.rol;

  const [log, setLog] = useState<SolicitudParqueadero[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"TODOS" | "PENDIENTE">("PENDIENTE");

  const esAdmin = role === "ADMINISTRADOR" || role === "SUPER_ADMIN";

  useWsSubscription("parqueadero", () => loadLog());

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    if (!esAdmin) {
      toast.error("Solo el administrador puede ver la bitácora de parqueadero.");
      router.push("/inicio");
      return;
    }
    loadLog();
    // esAdmin se deriva de role (ya en deps); loadLog se recrea cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, role, router]);

  useEffect(() => {
    if (!loading) {
      gsap.fromTo(".fade-up", { opacity: 0, y: 20 }, { opacity: 1, y: 0, stagger: 0.05, duration: 0.4 });
    }
  }, [loading]);

  async function loadLog() {
    try {
      const data = await api.get<SolicitudParqueadero[]>("/parqueadero/solicitudes");
      setLog(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cargar la bitácora");
    } finally {
      setLoading(false);
    }
  }

  async function resolver(id: string, accion: "aprobar" | "rechazar") {
    setBusy(id);
    try {
      await api.post(`/parqueadero/solicitudes/${id}/${accion}`, {});
      toast.success(accion === "aprobar" ? "Solicitud aprobada y aplicada." : "Solicitud rechazada.");
      loadLog();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo procesar");
    } finally {
      setBusy(null);
    }
  }

  const visibles = log.filter((s) => (filtro === "TODOS" ? true : s.estado === "PENDIENTE"));
  const pendientes = log.filter((s) => s.estado === "PENDIENTE").length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-text/25 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
      <ProfileHeader />

      <div className="fade-up flex items-center gap-3 mb-1">
        <div className="w-12 h-12 rounded-2xl bg-accent/15 border border-accent/40 flex items-center justify-center text-accent">
          <ScrollText size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Bitácora de Parqueadero</h1>
          <p className="text-xs text-text uppercase tracking-widest font-medium">
            Registro inmutable · solo administración
          </p>
        </div>
      </div>

      {/* Aviso de inmutabilidad */}
      <div className="fade-up liquid-glass rounded-2xl p-4 border border-border/40 flex items-start gap-3">
        <ShieldAlert size={18} className="text-[#FACC15] shrink-0 mt-0.5" />
        <p className="text-xs text-text/80 leading-relaxed">
          Toda solicitud sobre celdas <strong>asignadas a residentes</strong> requiere tu aprobación.
          Este registro guarda <strong>quién</strong> lo pidió, <strong>cuándo</strong> y quién lo aprobó.
          No puede modificarse ni borrarse (solo el superusuario puede hacerlo).
        </p>
      </div>

      {/* Filtros */}
      <div className="fade-up flex items-center gap-2">
        {([
          { v: "PENDIENTE", label: `Pendientes${pendientes ? ` (${pendientes})` : ""}` },
          { v: "TODOS", label: "Historial completo" },
        ] as const).map((f) => (
          <button
            key={f.v}
            onClick={() => setFiltro(f.v)}
            className={`px-4 py-2 rounded-xl border text-xs font-bold uppercase tracking-widest transition-all active:scale-95 ${
              filtro === f.v
                ? "bg-accent text-on-accent border-accent shadow-lg shadow-accent/20"
                : "bg-text/5 text-text border-border/40 hover:bg-text/10"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="flex flex-col gap-3">
        {visibles.length === 0 && (
          <div className="liquid-glass rounded-3xl p-10 border border-dashed border-border/30 text-center">
            <History size={32} className="text-text/30 mx-auto mb-2" />
            <p className="text-text/70 text-sm">
              {filtro === "PENDIENTE" ? "No hay solicitudes pendientes." : "La bitácora está vacía."}
            </p>
          </div>
        )}

        {visibles.map((s) => {
          const est = ESTADO_STYLE[s.estado] || ESTADO_STYLE.EJECUTADA;
          const fecha = new Date(s.creadoEn);
          return (
            <div key={s.id} className="fade-up liquid-glass p-5 rounded-3xl border border-border/30 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-bold text-text">Celda {s.celdaNumero}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider"
                          style={{ color: est.color, backgroundColor: est.bg }}>
                      {est.label}
                    </span>
                  </div>
                  <span className="text-xs text-text/70">{ACCION_LABEL[s.accion] || s.accion}</span>
                </div>
              </div>

              <p className="text-sm text-text/90 leading-relaxed border-l-2 border-border/40 pl-3">
                {s.detalle}
              </p>

              {/* Trazabilidad */}
              <div className="flex flex-col gap-1.5 text-[11px] text-text/70">
                <div className="flex items-center gap-2">
                  <User size={12} className="text-accent" />
                  <span><strong className="text-text">{s.solicitanteNombre}</strong> ({s.solicitanteRol})</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={12} className="text-accent" />
                  <span>{fecha.toLocaleDateString("es-CO")} · {fecha.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                {s.aprobadorNombre && (
                  <div className="flex items-center gap-2">
                    {s.estado === "APROBADA"
                      ? <CheckCircle2 size={12} className="text-[#57bf00]" />
                      : <XCircle size={12} className="text-[#EF4444]" />}
                    <span>
                      {s.estado === "APROBADA" ? "Aprobado" : "Rechazado"} por{" "}
                      <strong className="text-text">{s.aprobadorNombre}</strong>
                      {s.resueltoEn && ` · ${new Date(s.resueltoEn).toLocaleDateString("es-CO")}`}
                    </span>
                  </div>
                )}
              </div>

              {/* Acciones (solo pendientes) */}
              {s.estado === "PENDIENTE" && (
                <div className="flex gap-3 pt-1">
                  <button
                    disabled={busy === s.id}
                    onClick={() => resolver(s.id, "rechazar")}
                    className="flex-1 py-3 rounded-2xl bg-text/5 border border-border/50 text-text font-bold text-sm hover:bg-[#EF4444]/10 hover:border-[#EF4444]/40 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <X size={16} /> Rechazar
                  </button>
                  <button
                    disabled={busy === s.id}
                    onClick={() => resolver(s.id, "aprobar")}
                    className="flex-1 py-3 rounded-2xl bg-[#57bf00] text-white font-bold text-sm shadow-xl shadow-[#57bf00]/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Check size={16} /> {busy === s.id ? "Procesando..." : "Aprobar"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
