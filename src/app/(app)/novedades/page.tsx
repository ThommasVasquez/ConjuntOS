"use client";

import { useEffect, useState } from "react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { 
  FileText, PlusCircle, Clock, User, AlertCircle, Wrench, RefreshCw, HelpCircle, ChevronLeft 
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api/client";
import { toast } from "sonner";
import { gsap } from "gsap";

interface Novedad {
  id: string;
  titulo: string;
  descripcion: string;
  tipo: "INCIDENTE" | "DAÑO" | "CAMBIO_TURNO" | "SOSPECHOSO" | "OTRO";
  creadoEn: string;
  usuario?: {
    nombre: string;
    rol: string;
  } | null;
}

export default function NovedadesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const role = user?.rol;

  const [novedades, setNovedades] = useState<Novedad[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [formData, setFormData] = useState({
    titulo: "",
    descripcion: "",
    tipo: "INCIDENTE" as Novedad["tipo"]
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadNovedades = async () => {
    try {
      // Las novedades de vigilancia se manejan desde los trámites del backend
      const data = await api.get<Novedad[]>("/solicitudes-servicio");
      setNovedades(data.filter((n: any) => n.tipo === "INCIDENTE" || n.tipo === "CAMBIO_TURNO" || n.tipo === "SOSPECHOSO" || n.tipo === "DAÑO" || n.tipo === "OTRO"));
    } catch {
      setNovedades([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    const allowed = ['VIGILANTE', 'SUPERVISOR_VIGILANCIA', 'ADMINISTRADOR', 'SUPER_ADMIN'];
    if (!role || !allowed.includes(role)) {
      toast.error("No tienes permisos para acceder a esta sección.");
      router.push("/inicio");
      return;
    }
    loadNovedades();
  }, [user, authLoading, role, router]);

  useEffect(() => {
    if (!loading) {
      gsap.fromTo(".fade-up", { opacity: 0, y: 15 }, { opacity: 1, y: 0, stagger: 0.1, duration: 0.5 });
    }
  }, [loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      await api.post("/solicitudes-servicio", {
        categoria: "OTRO",
        tipo: formData.tipo,
        descripcion: `${formData.titulo}: ${formData.descripcion}`,
        urgente: formData.tipo === "INCIDENTE"
      });
      toast.success("Novedad registrada exitosamente");
      setFormData({ titulo: "", descripcion: "", tipo: "INCIDENTE" });
      loadNovedades();
    } catch {
      toast.error("Error al registrar novedad");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTipoIcon = (tipo: Novedad["tipo"]) => {
    const cls = "text-text";
    switch (tipo) {
      case "INCIDENTE": return <AlertCircle className={cls} size={16} />;
      case "DAÑO": return <Wrench className={cls} size={16} />;
      case "CAMBIO_TURNO": return <RefreshCw className={cls} size={16} />;
      case "SOSPECHOSO": return <AlertCircle className={cls} size={16} />;
      default: return <HelpCircle className={cls} size={16} />;
    }
  };

  const getTipoLabel = (tipo: Novedad["tipo"]) => {
    switch (tipo) {
      case "INCIDENTE": return "Incidente Crítico";
      case "DAÑO": return "Daño / Falla Técnica";
      case "CAMBIO_TURNO": return "Cambio de Turno";
      case "SOSPECHOSO": return "Actividad Sospechosa";
      default: return "Otro Reporte";
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" /></div>;

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen relative overflow-x-hidden">
      <ProfileHeader />

      <div className="fade-up flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => router.push('/inicio')} 
            className="w-10 h-10 rounded-full bg-text/5 hover:bg-text/10 flex items-center justify-center text-text transition-all cursor-pointer"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-text flex items-center gap-2">
              <FileText size={22} className="text-[#009df2]"/> Libro de Novedades
            </h2>
            <p className="text-xs text-text">Bitácora digital de incidentes y entregas de turno</p>
          </div>
        </div>
      </div>

      <div className="fade-up liquid-glass rounded-3xl p-6 border border-border shadow-2xl z-10">
        <h3 className="text-sm font-bold text-text uppercase tracking-widest mb-4">Registrar Novedad</h3>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex gap-4 flex-col sm:flex-row">
            <div className="flex-1 flex flex-col gap-1.5">
              <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1">Título de Novedad</label>
              <input 
                required
                type="text" 
                placeholder="Ej: Fuga de agua en sótano 1" 
                value={formData.titulo}
                onChange={e => setFormData({ ...formData, titulo: e.target.value })}
                className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent transition-all" 
              />
            </div>
            
            <div className="w-full sm:w-[220px] flex flex-col gap-1.5">
              <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1">Tipo de Reporte</label>
              <select 
                value={formData.tipo}
                onChange={e => setFormData({ ...formData, tipo: e.target.value as Novedad["tipo"] })}
                className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent transition-all"
              >
                <option value="INCIDENTE">Incidente</option>
                <option value="DAÑO">Daño</option>
                <option value="CAMBIO_TURNO">Cambio de Turno</option>
                <option value="SOSPECHOSO">Sospechoso</option>
                <option value="OTRO">Otro</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-text font-bold uppercase tracking-widest pl-1">Descripción Detallada</label>
            <textarea 
              required
              rows={3}
              placeholder="Describe los acontecimientos, personas involucradas, medidas preventivas." 
              value={formData.descripcion}
              onChange={e => setFormData({ ...formData, descripcion: e.target.value })}
              className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent transition-all" 
            />
          </div>

          <button type="submit" disabled={isSubmitting} className="mt-2 w-full py-4 bg-[#57bf00] hover:bg-[#57bf00]/80 transition-colors rounded-full font-bold text-white shadow-lg shadow-[#57bf00]/30 flex justify-center items-center gap-2 cursor-pointer">
            {isSubmitting ? "Registrando..." : <><PlusCircle size={18}/> Guardar Reporte</>}
          </button>
        </form>
      </div>

      <div className="fade-up flex flex-col gap-4 z-10">
        <h3 className="text-sm font-bold text-text uppercase tracking-widest ml-2 flex items-center gap-2">
          <Clock size={16} className="text-[#009df2]"/> Historial de Novedades
        </h3>

        {novedades.length === 0 ? (
          <div className="liquid-glass p-8 rounded-3xl text-center border border-dashed border-border">
            <p className="text-xs text-text">No hay novedades reportadas.</p>
          </div>
        ) : (
          <div className="relative pl-6 border-l-2 border-border/40 flex flex-col gap-6 ml-4">
            {novedades.map((nov) => (
              <div key={nov.id} className="relative bg-surface-2/10 border border-border/60 backdrop-blur-md rounded-[24px] p-5 shadow-lg">
                <div className="absolute -left-[33px] top-6 w-4 h-4 rounded-full bg-text border-2 border-[#009df2] flex items-center justify-center shadow-lg">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#009df2]" />
                </div>

                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-border/40 pb-3 mb-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1.5 bg-text/5 border border-border px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider text-text">
                        {getTipoIcon(nov.tipo)} {getTipoLabel(nov.tipo)}
                      </span>
                      <span className="text-[10px] text-text">Reporte: #{nov.id.substring(0, 8)}</span>
                    </div>
                    <h4 className="text-base font-bold text-text mt-1">{nov.titulo}</h4>
                  </div>
                  
                  <div className="flex items-center gap-1 text-[10px] text-text bg-text/5 px-2.5 py-1 rounded-full border border-border">
                    <Clock size={10} /> {new Date(nov.creadoEn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                <p className="text-xs text-text leading-relaxed">{nov.descripcion}</p>

                <div className="mt-4 pt-3 border-t border-border/30 flex justify-between items-center text-[10px] text-text">
                  <div className="flex items-center gap-1">
                    <User size={12} /> Vigilante: <span className="font-bold text-text">{nov.usuario?.nombre || "N/A"}</span>
                  </div>
                  <span className="uppercase text-[8px] bg-text/5 px-1.5 py-0.5 rounded border border-border text-text">{nov.usuario?.rol || "PORTERÍA"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
