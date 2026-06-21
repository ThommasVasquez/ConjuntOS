"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api/client";
import type { PaseTemporalDto, CrearPaseTemporalRequest, VehiculoTemporalInput } from "@/lib/api/types";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { ArrowRight, Calendar, Car, ClipboardList, DoorOpen, Dumbbell, Megaphone, MessageCircle, Pencil, PlusCircle, ShieldAlert, Trash2, Users, Waves, XCircle } from "lucide-react";

type FormData = Omit<CrearPaseTemporalRequest, "fecha_inicio" | "fecha_fin"> & {
  fecha_inicio: string;
  fecha_fin: string;
};

export default function PasesTemporalesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const role = user?.rol;

  const [pases, setPases] = useState<PaseTemporalDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [unidades, setUnidades] = useState<{ id: string; numero: string; torre?: string }[]>([]);

  const [formData, setFormData] = useState<FormData>({
    unidad_id: "",
    nombre_anfitrion: user?.nombre || "",
    nombre_huesped: "",
    email_huesped: "",
    telefono_huesped: "",
    fecha_inicio: "",
    fecha_fin: "",
    permiso_gimnasio: false,
    permiso_piscina: false,
    permiso_entrada_salida: true,
    permiso_vehiculo: false,
    permiso_asamblea: false,
    vehiculos: [],
  });

  const [vehiculosForm, setVehiculosForm] = useState<VehiculoTemporalInput[]>([
    { placa: "", marca: "", modelo: "", color: "" },
  ]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchPases = async () => {
    try {
      const data = await api.get<PaseTemporalDto[]>("/pases-temporales/mis-pases");
      setPases(data);
    } catch {
      toast.error("Error al cargar pases temporales");
    } finally {
      setLoading(false);
    }
  };

  const fetchUnidades = () => {
    // Use user's unit from auth context — each propietario has one unit
    if (user?.unidadId) {
      const u = { 
        id: user.unidadId, 
        numero: user.apto || user.torre || user.unidadId.slice(0, 8),
        torre: user.torre || undefined 
      };
      setUnidades([u]);
      if (!formData.unidad_id) {
        setFormData(prev => ({ ...prev, unidad_id: u.id }));
      }
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }

    const allowed = ["PROPIETARIO", "ADMINISTRADOR", "SUPER_ADMIN"];
    if (!role || !allowed.includes(role)) {
      toast.error("Solo propietarios pueden acceder a esta sección.");
      router.push("/inicio");
      return;
    }

    fetchPases();
    fetchUnidades();
    setFormData(prev => ({ ...prev, nombre_anfitrion: user?.nombre || "" }));
  }, [user, authLoading, role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nombre_huesped || !formData.fecha_inicio || !formData.fecha_fin) {
      return toast.error("Campos obligatorios: huésped y fechas");
    }
    if (!editingId && !formData.unidad_id) {
      return toast.error("Selecciona una unidad");
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        vehiculos: formData.permiso_vehiculo ? vehiculosForm.filter(v => v.placa.trim()) : undefined,
      };
      if (editingId) {
        // PUT: enviar solo campos presentes
        await api.put<PaseTemporalDto>(`/pases-temporales/${editingId}`, payload);
        toast.success("Pase actualizado");
      } else {
        await api.post<PaseTemporalDto>("/pases-temporales", payload);
        toast.success("Pase temporal emitido exitosamente");
      }
      setShowForm(false);
      setEditingId(null);
      resetForm();
      fetchPases();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al guardar pase";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      unidad_id: "",
      nombre_anfitrion: user?.nombre || "",
      nombre_huesped: "",
      email_huesped: "",
      telefono_huesped: "",
      fecha_inicio: "",
      fecha_fin: "",
      permiso_gimnasio: false,
      permiso_piscina: false,
      permiso_entrada_salida: true,
      permiso_vehiculo: false,
      permiso_asamblea: false,
      vehiculos: [],
    });
    setVehiculosForm([{ placa: "", marca: "", modelo: "", color: "" }]);
  };

  const handleRevocar = async (paseId: string) => {
    try {
      await api.put(`/pases-temporales/${paseId}/revocar`, {});
      toast.success("Pase revocado exitosamente");
      fetchPases();
    } catch {
      toast.error("Error al revocar el pase");
    }
  };

  const startEditing = (pase: PaseTemporalDto) => {
    setEditingId(pase.id);
    setFormData({
      unidad_id: "", // no se edita
      nombre_anfitrion: pase.nombre_anfitrion,
      nombre_huesped: pase.nombre_huesped,
      email_huesped: pase.email_huesped || "",
      telefono_huesped: pase.telefono_huesped || "",
      fecha_inicio: pase.fecha_inicio,
      fecha_fin: pase.fecha_fin,
      permiso_gimnasio: pase.permiso_gimnasio,
      permiso_piscina: pase.permiso_piscina,
      permiso_entrada_salida: pase.permiso_entrada_salida,
      permiso_vehiculo: pase.permiso_vehiculo,
      permiso_asamblea: pase.permiso_asamblea,
      vehiculos: [],
    });
    if (pase.vehiculos.length > 0) {
      setVehiculosForm(pase.vehiculos.map(v => ({
        placa: v.placa,
        marca: v.marca || "",
        modelo: v.modelo || "",
        color: v.color || "",
      })));
    } else {
      setVehiculosForm([{ placa: "", marca: "", modelo: "", color: "" }]);
    }
    setShowForm(true);
  };

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case "ACTIVO": return { bg: "bg-[#57bf00]/10", border: "border-[#57bf00]/30", text: "text-[#57bf00]", label: "ACTIVO" };
      case "EXPIRADO": return { bg: "bg-text/10", border: "border-text/30", text: "text-text", label: "EXPIRADO" };
      case "REVOCADO": return { bg: "bg-[#EF4444]/10", border: "border-[#EF4444]/30", text: "text-[#EF4444]", label: "REVOCADO" };
      default: return { bg: "bg-text/10", border: "border-text/30", text: "text-text", label: estado };
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  const PermisoIcon = ({ activo, label }: { activo: boolean; label: string }) => (
    <div className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${activo ? "bg-accent/10 border-accent/30 text-accent" : "bg-text/5 border-border/30 text-text/40"}`}>
      {label}
    </div>
  );

  return (
    <div className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen">
      <ProfileHeader />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-medium text-text tracking-wide">Pases Temporales</h1>
          <p className="text-sm text-text">Huéspedes de alquiler corto (AirBnB)</p>
        </div>
        <button
          onClick={() => {
            if (showForm) { setEditingId(null); resetForm(); }
            setShowForm(!showForm);
          }}
          className="flex items-center gap-2 bg-accent text-on-accent px-5 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-accent/20 active:scale-95 transition-all"
        >
          {showForm ? <XCircle size={16} /> : <PlusCircle size={16} />}
          {showForm ? "Cancelar" : "Nuevo Pase"}
        </button>
      </div>

      {/* Formulario */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="liquid-glass-card rounded-[28px] p-6 border border-border flex flex-col gap-4 animate-in slide-in-from-top-4 duration-300"
        >
          <h2 className="text-base font-bold text-text pb-2 border-b border-border">
            {editingId ? "Editar Pase Temporal" : "Emitir Pase Temporal"}
          </h2>

          {/* Unidad — solo al crear */}
          {!editingId && (
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">Unidad *</label>
            <select
              required
              value={formData.unidad_id}
              onChange={(e) => setFormData(prev => ({ ...prev, unidad_id: e.target.value }))}
              className="w-full bg-surface-2 border border-border rounded-xl px-4 py-3 text-xs text-text outline-none focus:border-accent"
            >
              <option value="">Seleccionar unidad...</option>
              {unidades.map(u => (
                <option key={u.id} value={u.id}>{u.torre ? `Torre ${u.torre} - ` : ""}Apto {u.numero}</option>
              ))}
            </select>
          </div>
          )}

          {/* Huésped y Anfitrión */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">Anfitrión</label>
              <input
                type="text"
                value={formData.nombre_anfitrion}
                onChange={(e) => setFormData(prev => ({ ...prev, nombre_anfitrion: e.target.value }))}
                className="w-full bg-surface-2 border border-border rounded-xl px-4 py-3 text-xs text-text outline-none focus:border-accent"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">Huésped *</label>
              <input
                required
                type="text"
                value={formData.nombre_huesped}
                onChange={(e) => setFormData(prev => ({ ...prev, nombre_huesped: e.target.value }))}
                placeholder="Nombre del huésped"
                className="w-full bg-surface-2 border border-border rounded-xl px-4 py-3 text-xs text-text outline-none focus:border-accent"
              />
            </div>
          </div>

          {/* Email y Teléfono */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">Email</label>
              <input
                type="email"
                value={formData.email_huesped || ""}
                onChange={(e) => setFormData(prev => ({ ...prev, email_huesped: e.target.value }))}
                placeholder="huesped@email.com"
                className="w-full bg-surface-2 border border-border rounded-xl px-4 py-3 text-xs text-text outline-none focus:border-accent"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">Teléfono</label>
              <input
                type="tel"
                value={formData.telefono_huesped || ""}
                onChange={(e) => setFormData(prev => ({ ...prev, telefono_huesped: e.target.value }))}
                placeholder="+57 300..."
                className="w-full bg-surface-2 border border-border rounded-xl px-4 py-3 text-xs text-text outline-none focus:border-accent"
              />
            </div>
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">Fecha Inicio *</label>
              <input
                required
                type="date"
                value={formData.fecha_inicio}
                onChange={(e) => setFormData(prev => ({ ...prev, fecha_inicio: e.target.value }))}
                className="w-full bg-surface-2 border border-border rounded-xl px-4 py-3 text-xs text-text outline-none focus:border-accent"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">Fecha Fin *</label>
              <input
                required
                type="date"
                value={formData.fecha_fin}
                onChange={(e) => setFormData(prev => ({ ...prev, fecha_fin: e.target.value }))}
                className="w-full bg-surface-2 border border-border rounded-xl px-4 py-3 text-xs text-text outline-none focus:border-accent"
              />
            </div>
          </div>

          {/* Permisos */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">Permisos</label>
            <div className="grid grid-cols-2 gap-3">
              {([
                { key: "permiso_gimnasio", label: "Gimnasio", icon: <Dumbbell size={14} /> },
                { key: "permiso_piscina", label: "Piscina", icon: <Waves size={14} /> },
                { key: "permiso_entrada_salida", label: "Entrada/Salida", icon: <DoorOpen size={14} /> },
                { key: "permiso_vehiculo", label: "Vehículo", icon: <Car size={14} /> },
                { key: "permiso_asamblea", label: "Asamblea", icon: <Megaphone size={14} /> },
              ] as const).map(({ key, label, icon }) => (
                <label
                  key={key}
                  className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${
                    formData[key] ? "bg-accent/10 border-accent/30 text-accent" : "bg-surface-2 border-border text-text"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={formData[key]}
                    onChange={(e) => setFormData(prev => ({ ...prev, [key]: e.target.checked }))}
                    className="hidden"
                  />
                  {icon}
                  <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Vehículos (si permiso_vehiculo está activo) */}
          {formData.permiso_vehiculo && (
            <div className="flex flex-col gap-3 p-4 rounded-2xl bg-surface-2 border border-border">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black">Vehículos Autorizados</label>
                <button
                  type="button"
                  onClick={() => setVehiculosForm(prev => [...prev, { placa: "", marca: "", modelo: "", color: "" }])}
                  className="text-[10px] font-bold uppercase tracking-wider text-accent flex items-center gap-1"
                >
                  <PlusCircle size={12} /> Agregar
                </button>
              </div>
              {vehiculosForm.map((v, i) => (
                <div key={i} className="grid grid-cols-4 gap-2">
                  <input
                    type="text"
                    placeholder="Placa *"
                    value={v.placa}
                    onChange={(e) => {
                      const updated = [...vehiculosForm];
                      updated[i].placa = e.target.value;
                      setVehiculosForm(updated);
                    }}
                    className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-xs text-text outline-none focus:border-accent"
                  />
                  <input
                    type="text"
                    placeholder="Marca"
                    value={v.marca || ""}
                    onChange={(e) => {
                      const updated = [...vehiculosForm];
                      updated[i].marca = e.target.value;
                      setVehiculosForm(updated);
                    }}
                    className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-xs text-text outline-none focus:border-accent"
                  />
                  <input
                    type="text"
                    placeholder="Modelo"
                    value={v.modelo || ""}
                    onChange={(e) => {
                      const updated = [...vehiculosForm];
                      updated[i].modelo = e.target.value;
                      setVehiculosForm(updated);
                    }}
                    className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-xs text-text outline-none focus:border-accent"
                  />
                  <input
                    type="text"
                    placeholder="Color"
                    value={v.color || ""}
                    onChange={(e) => {
                      const updated = [...vehiculosForm];
                      updated[i].color = e.target.value;
                      setVehiculosForm(updated);
                    }}
                    className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-xs text-text outline-none focus:border-accent"
                  />
                </div>
              ))}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 bg-accent rounded-2xl font-bold text-xs uppercase tracking-widest text-on-accent shadow-xl shadow-accent/20 active:scale-[0.98] transition-all disabled:opacity-50 mt-2"
          >
            {isSubmitting ? (editingId ? "Guardando..." : "Emitiendo...") : (editingId ? "Guardar Cambios" : "Emitir Pase Temporal")}
          </button>
        </form>
      )}

      {/* Lista de pases */}
      <div className="flex flex-col gap-4">
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-text px-1">
          Pases Emitidos ({pases.length})
        </h3>

        {loading ? (
          <div className="w-full py-10 flex justify-center">
            <div className="w-6 h-6 border-2 border-border border-t-accent rounded-full animate-spin" />
          </div>
        ) : pases.length === 0 ? (
          <div className="liquid-glass rounded-3xl p-8 border border-border text-center text-text text-xs italic">
            No has emitido ningún pase temporal.
          </div>
        ) : (
          pases.map((pase) => {
            const badge = getEstadoBadge(pase.estado);
            return (
              <div key={pase.id} className="liquid-glass-card rounded-2xl p-5 border border-border flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Users size={14} className="text-accent" />
                      <span className="text-sm font-bold text-text">{pase.nombre_huesped}</span>
                    </div>
                    <span className="text-[10px] text-text">Anfitrión: {pase.nombre_anfitrion}</span>
                  </div>
                  <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border ${badge.bg} ${badge.border} ${badge.text}`}>
                    {badge.label}
                  </span>
                </div>

                {/* Fechas */}
                <div className="flex items-center gap-2 text-[10px] text-text bg-surface-2 rounded-xl px-3 py-2 border border-border">
                  <Calendar size={12} />
                  {pase.fecha_inicio} → {pase.fecha_fin}
                </div>

                {/* Permisos */}
                <div className="flex flex-wrap gap-1.5">
                  <PermisoIcon activo={pase.permiso_gimnasio} label="Gimnasio" />
                  <PermisoIcon activo={pase.permiso_piscina} label="Piscina" />
                  <PermisoIcon activo={pase.permiso_entrada_salida} label="Entrada/Salida" />
                  <PermisoIcon activo={pase.permiso_vehiculo} label="Vehículo" />
                  <PermisoIcon activo={pase.permiso_asamblea} label="Asamblea" />
                </div>

                {/* Código y vehículos */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(pase.codigo_acceso);
                      toast.success("Código copiado al portapapeles");
                    }}
                    className="flex items-center gap-2 text-accent hover:text-accent/80 active:scale-95 transition-all"
                    title="Copiar código de acceso"
                  >
                    <ClipboardList size={14} />
                    <span className="text-[10px] font-mono text-text font-bold tracking-wider">{pase.codigo_acceso}</span>
                  </button>

                  {pase.estado === "ACTIVO" && (
                    <div className="flex items-center gap-2">
                      {pase.usuario_id && (
                        <button
                          onClick={() => router.push(`/chat?huespedId=${pase.usuario_id}`)}
                          className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#57bf00] bg-[#57bf00]/10 border border-[#57bf00]/30 rounded-full px-3 py-1 hover:bg-[#57bf00]/20 active:scale-95 transition-all"
                        >
                          <MessageCircle size={12} /> Mensajes
                        </button>
                      )}
                      <button
                        onClick={() => startEditing(pase)}
                        className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-accent bg-accent/10 border border-accent/30 rounded-full px-3 py-1 hover:bg-accent/20 active:scale-95 transition-all"
                      >
                        <Pencil size={12} /> Editar
                      </button>
                      <button
                        onClick={() => handleRevocar(pase.id)}
                        className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-full px-3 py-1 hover:bg-[#EF4444]/20 active:scale-95 transition-all"
                      >
                        <ShieldAlert size={12} /> Revocar
                      </button>
                    </div>
                  )}
                </div>

                {pase.vehiculos.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/40">
                    {pase.vehiculos.map((v) => (
                      <span key={v.id} className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-text/5 border border-border/30 rounded-full px-2 py-1 text-text">
                        <Car size={10} /> {v.placa}
                        {v.marca && ` (${v.marca})`}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
