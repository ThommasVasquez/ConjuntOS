"use client";

import { useState, useEffect, useCallback } from "react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { Package, CheckCircle2, ScanLine, Clock, MapPin, History } from "lucide-react";
import { gsap } from "gsap";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api/client";
import { useRouter } from "next/navigation";
import { useWsSubscription } from "@/hooks/useWebSocket";
import { SkeletonRows } from "@/components/ui/Skeleton";

interface ResidenteDirectorio {
  id: string;
  nombre: string;
  torre: string | null;
  apto: string | null;
  telefono: string | null;
}

interface PaqueteItem {
  id: string;
  descripcion: string;
  remitente: string;
  fechaLlegada: string;
  entregadoEn?: string | null;
  residente?: {
    nombre: string | null;
    torre: string | null;
    apto: string | null;
  } | null;
}

type Tab = "pendientes" | "historial";

export default function PaqueteriaPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const role = user?.rol;

  const [activeTab, setActiveTab] = useState<Tab>("pendientes");
  const [paquetes, setPaquetes] = useState<PaqueteItem[]>([]);
  const [entregados, setEntregados] = useState<PaqueteItem[]>([]);
  const [residentes, setResidentes] = useState<ResidenteDirectorio[]>([]);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({
    usuarioId: "",
    remitente: "",
    descripcion: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refetchPaquetes = useCallback(async () => {
    try {
      const data = await api.get<PaqueteItem[]>('/vigilancia/paquetes');
      setPaquetes(data);
    } catch {}
  }, []);

  const refetchEntregados = useCallback(async () => {
    try {
      const data = await api.get<PaqueteItem[]>('/vigilancia/paquetes/entregados');
      setEntregados(data);
    } catch {}
  }, []);

  useWsSubscription('paquete', () => { refetchPaquetes(); refetchEntregados(); });

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }

    const allowed = ['VIGILANTE', 'SUPERVISOR_VIGILANCIA', 'ADMINISTRADOR', 'SUPER_ADMIN'];
    if (!role || !allowed.includes(role)) {
      toast.error("No tienes permisos para acceder a esta sección.");
      router.push("/inicio");
      return;
    }

    async function loadData() {
      try {
        const [paqData, dirData, entData] = await Promise.all([
          api.get<PaqueteItem[]>('/vigilancia/paquetes'),
          api.get<ResidenteDirectorio[]>('/directorio'),
          api.get<PaqueteItem[]>('/vigilancia/paquetes/entregados').catch(() => [])
        ]);
        setPaquetes(paqData);
        setResidentes(dirData);
        setEntregados(entData);
      } catch {
        toast.error("Error al cargar datos");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user, authLoading, role, router]);

  useEffect(() => {
    if (!loading) {
      
}
  }, [loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!formData.usuarioId) return toast.error("Selecciona un residente destino");

    setIsSubmitting(true);
    try {
      await api.post('/vigilancia/paquetes', formData);
      toast.success("Paquete registrado y Residente notificado");
      const freshPaquetes = await api.get<PaqueteItem[]>('/vigilancia/paquetes');
      setPaquetes(freshPaquetes);
      setFormData({ usuarioId: "", remitente: "", descripcion: "" });
    } catch {
      toast.error("Error de conexión");
    } finally {
      setIsSubmitting(false);
    }
  };

  const markAsDelivered = async (id: string) => {
    try {
      await api.put(`/vigilancia/paquetes/${id}/entregar`);
      toast.success("Entrega confirmada");
      setPaquetes(paquetes.filter(p => p.id !== id));
      refetchEntregados();
    } catch {
      toast.error("Error de red");
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><SkeletonRows /></div>;

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
      <ProfileHeader />

      <div className="bg-primary-light rounded-3xl p-6 border border-border shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: '#f973161a', color: '#f97316' }}
          >
            <ScanLine size={22} />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-text leading-tight">Recepción de Envíos</h2>
            <p className="text-[11px] text-text/55 mt-0.5">Mensajería y domicilios</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-text/55 font-bold uppercase tracking-wider pl-1">Destinatario</label>
            <select
              value={formData.usuarioId}
              onChange={e => setFormData({ ...formData, usuarioId: e.target.value })}
              className="w-full bg-surface-2 border border-border rounded-2xl py-3 px-4 text-sm text-text focus:outline-none focus:border-border"
            >
              <option value="" className="bg-primary text-text">Seleccione apartamento/residente...</option>
              {residentes.map(r => (
                <option key={r.id} value={r.id} className="bg-primary text-text">{r.torre} - Apto {r.apto} ({r.nombre})</option>
              ))}
            </select>
          </div>
          <div className="flex gap-4">
            <div className="flex-1 flex flex-col gap-1.5">
              <label className="text-[10px] text-text/55 font-bold uppercase tracking-wider pl-1">Empresa / Remitente</label>
              <input
                required
                type="text"
                placeholder="Amazon, Rappi..."
                value={formData.remitente}
                onChange={e => setFormData({ ...formData, remitente: e.target.value })}
                className="w-full bg-surface-2 border border-border rounded-2xl py-3 px-4 text-sm text-text focus:outline-none focus:border-border"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-text/55 font-bold uppercase tracking-wider pl-1">Descripción Rápida</label>
            <input
              required
              type="text"
              placeholder="Caja mediana, Documento..."
              value={formData.descripcion}
              onChange={e => setFormData({ ...formData, descripcion: e.target.value })}
              className="w-full bg-surface-2 border border-border rounded-2xl py-3 px-4 text-sm text-text focus:outline-none focus:border-border"
            />
          </div>
          <button type="submit" disabled={isSubmitting} className="mt-2 w-full py-4 bg-text/10 hover:bg-text/10 transition-colors rounded-2xl font-bold text-black shadow-[0_0_20px_rgba(128,128,128,0.3)] flex justify-center items-center gap-2">
            {isSubmitting ? "Registrando..." : <><Package size={18} /> Clasificar Envío</>}
          </button>
        </form>
      </div>

      {/* TAB SWITCHER */}
      <div className="flex gap-2 bg-surface-2 rounded-2xl p-1.5 border border-border">
        <button
          onClick={() => setActiveTab("pendientes")}
          className={`flex-1 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer ${activeTab === "pendientes" ? "bg-primary text-text shadow-md" : "text-text/60"}`}
        >
          <Package size={14} /> Pendientes ({paquetes.length})
        </button>
        <button
          onClick={() => setActiveTab("historial")}
          className={`flex-1 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer ${activeTab === "historial" ? "bg-primary text-text shadow-md" : "text-text/60"}`}
        >
          <History size={14} /> Historial ({entregados.length})
        </button>
      </div>

      {/* CONTENT */}
      {activeTab === "pendientes" ? (
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center ml-2">
            <h3 className="text-sm font-bold text-text uppercase tracking-widest flex items-center gap-2"><Clock size={16} style={{ color: "#f97316" }} /> Inventario Portería</h3>
            <span className="bg-surface-2 text-text text-[10px] px-2 py-0.5 rounded-full font-bold">{paquetes.length} ÍTEMS</span>
          </div>

          {paquetes.length === 0 && <div className="bg-primary-light rounded-3xl p-8 border border-border shadow-sm text-center"><p className="text-text font-medium text-sm">Portería libre de paquetes</p><p className="text-xs text-text/55 mt-1">Los envíos recibidos aparecerán aquí.</p></div>}

          {paquetes.map((p) => (
            <div key={p.id} className="bg-primary-light shadow-sm p-5 rounded-3xl border border-border flex flex-col gap-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-text/10 rounded-full blur-2xl pointer-events-none translate-x-1/2 -translate-y-1/2" />
              <div className="flex justify-between items-start relative z-10">
                <div>
                  <p className="text-text font-bold text-lg leading-tight">{p.descripcion}</p>
                  <p className="text-text/55 font-bold text-[10px] tracking-wider uppercase mt-0.5">{p.remitente}</p>
                </div>
                <div className="bg-surface-2 px-3 py-1 rounded-full border border-border text-[10px] font-bold text-text">
                  Hace {Math.floor((new Date().getTime() - new Date(p.fechaLlegada).getTime()) / 60000)} min
                </div>
              </div>
              <div className="flex items-center gap-2 text-text/70 text-xs font-semibold relative z-10">
                <MapPin size={14} /> {p.residente?.torre} - Apto {p.residente?.apto} ({p.residente?.nombre})
              </div>
              <button onClick={() => markAsDelivered(p.id)} className="w-full mt-2 py-3 bg-surface-2 border border-border hover:bg-text/10 hover:border-text/40 hover:text-text transition-all rounded-xl font-bold flex items-center justify-center gap-2 text-xs uppercase tracking-widest relative z-10 text-text">
                <CheckCircle2 size={16} /> Marcar como Entregado
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center ml-2">
            <h3 className="text-sm font-bold text-text uppercase tracking-widest flex items-center gap-2"><History size={16} style={{ color: "#10b981" }} /> Entregados</h3>
            <span className="bg-surface-2 text-text text-[10px] px-2 py-0.5 rounded-full font-bold">{entregados.length} ÍTEMS</span>
          </div>

          {entregados.length === 0 && <div className="bg-primary-light rounded-3xl p-8 border border-border shadow-sm text-center"><p className="text-text font-medium text-sm">Sin historial de entregas</p><p className="text-xs text-text/55 mt-1">Los paquetes entregados quedarán registrados aquí.</p></div>}

          {entregados.map((p) => (
            <div key={p.id} className="bg-primary-light shadow-sm p-5 rounded-3xl border border-border flex flex-col gap-3 relative overflow-hidden opacity-70">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-text font-bold text-lg leading-tight">{p.descripcion}</p>
                  <p className="text-text/55 font-bold text-[10px] tracking-wider uppercase mt-0.5">{p.remitente}</p>
                </div>
                <div className="bg-green-500/10 px-3 py-1 rounded-full border border-green-500/20 text-[10px] font-bold text-green-500 flex items-center gap-1">
                  <CheckCircle2 size={12} /> Entregado
                </div>
              </div>
              <div className="flex items-center gap-2 text-text/70 text-xs font-semibold">
                <MapPin size={14} /> {p.residente?.torre} - Apto {p.residente?.apto} ({p.residente?.nombre})
              </div>
              {p.entregadoEn && (
                <span className="text-[9px] text-text/50 uppercase tracking-widest">
                  Entregado {new Date(p.entregadoEn).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
