"use client";

import { useState, useEffect, useRef } from "react";
import ProfileHeader from "@/components/shell/ProfileHeader";
import {
  Building2,
  Users,
  Clock,
  Calendar,
  DollarSign,
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  RefreshCw,
  Filter,
  MapPin,
  User,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  Search,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { gsap } from "gsap";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api/client";
import { useRouter } from "next/navigation";
import { useWsSubscription } from "@/hooks/useWebSocket";
import type { AreaComunDto } from "@/lib/api/types";

// ---------------------------------------------------------------------------
// Local DTOs matching the Rust backend admin_areas.rs
// ---------------------------------------------------------------------------

/** Reservation as returned by GET /admin/reservas */
interface ReservaAdminDto {
  id: string;
  usuarioId: string;
  residenteNombre: string;
  residenteTorre: string | null;
  residenteApto: string | null;
  areaId: string;
  areaNombre: string;
  fechaInicio: string;
  fechaFin: string;
  estado: "PENDIENTE" | "CONFIRMADA" | "CANCELADA" | "COMPLETADA";
  notas: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Form shapes
// ---------------------------------------------------------------------------

interface AreaFormData {
  nombre: string;
  descripcion: string;
  capacidadMax: number;
  requiereDeposito: boolean;
  depositoMonto: string;
  horaApertura: string;
  horaCierre: string;
  diasDisponibles: string;
  duracionSlot: number;
  activa: boolean;
}

const EMPTY_AREA_FORM: AreaFormData = {
  nombre: "",
  descripcion: "",
  capacidadMax: 10,
  requiereDeposito: false,
  depositoMonto: "",
  horaApertura: "06:00",
  horaCierre: "22:00",
  diasDisponibles: "Lunes a Domingo",
  duracionSlot: 60,
  activa: true,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ESTADO_COLORS: Record<string, string> = {
  CONFIRMADA: "bg-[#57bf00]/10 text-[#57bf00] border-[#57bf00]/30",
  PENDIENTE: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30",
  CANCELADA: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/30",
  COMPLETADA: "bg-[#009df2]/10 text-[#009df2] border-[#009df2]/30",
};

const ESTADO_LABEL: Record<string, string> = {
  PENDIENTE: "Pendiente",
  CONFIRMADA: "Confirmada",
  CANCELADA: "Cancelada",
  COMPLETADA: "Completada",
};

function formatCOP(value: string | null | undefined): string {
  if (!value) return "$0";
  const n = Number(value);
  if (isNaN(n)) return "$0";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

// --------------------------------------------------------------------------- 
// Component
// ---------------------------------------------------------------------------

export default function AdminAreasPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const role = user?.rol;
  const containerRef = useRef<HTMLDivElement>(null);

  const [tab, setTab] = useState<"areas" | "reservas">("areas");
  const [loading, setLoading] = useState(true);

  // ── Areas state ──────────────────────────────────────────────────────────
  const [areas, setAreas] = useState<AreaComunDto[]>([]);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<AreaFormData>({ ...EMPTY_AREA_FORM });
  const [savingCreate, setSavingCreate] = useState(false);

  // Edit modal
  const [editingArea, setEditingArea] = useState<AreaComunDto | null>(null);
  const [editForm, setEditForm] = useState<AreaFormData>({ ...EMPTY_AREA_FORM });
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete confirmation modal
  const [areaToDelete, setAreaToDelete] = useState<AreaComunDto | null>(null);
  const [deletingArea, setDeletingArea] = useState(false);

  // ── Reservas state ───────────────────────────────────────────────────────
  const [reservas, setReservas] = useState<ReservaAdminDto[]>([]);
  const [loadingReservas, setLoadingReservas] = useState(false);
  const [filterEstado, setFilterEstado] = useState<string>("");
  const [filterAreaId, setFilterAreaId] = useState<string>("");

  // ── Data fetching ────────────────────────────────────────────────────────

  const fetchAreas = async () => {
    setLoading(true);
    try {
      const data = await api.get<AreaComunDto[]>("/admin/areas-comunes");
      setAreas(data);
    } catch {
      toast.error("Error al cargar áreas comunes");
    } finally {
      setLoading(false);
    }
  };

  const fetchReservas = async () => {
    setLoadingReservas(true);
    try {
      const params = new URLSearchParams();
      if (filterEstado) params.set("estado", filterEstado);
      if (filterAreaId) params.set("area_id", filterAreaId);

      const qs = params.toString();
      const data = await api.get<ReservaAdminDto[]>(
        `/admin/reservas${qs ? `?${qs}` : ""}`
      );
      // Sort reverse chronological (newest first)
      data.sort(
        (a, b) =>
          new Date(b.fechaInicio).getTime() - new Date(a.fechaInicio).getTime()
      );
      setReservas(data);
    } catch {
      toast.error("Error al cargar reservas");
    } finally {
      setLoadingReservas(false);
    }
  };

  // Real-time WebSocket subscriptions
  useWsSubscription("reserva", () => {
    fetchReservas();
    fetchAreas();
  });

  // ── Auth guard + initial load ────────────────────────────────────────────

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    const allowed = ["ADMINISTRADOR", "SUPER_ADMIN"];
    if (!role || !allowed.includes(role)) {
      toast.error("No tienes permisos para acceder a esta sección.");
      router.push("/inicio");
      return;
    }

    fetchAreas();
    fetchReservas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, role, router]);

  // Re-fetch reservas when filters change
  useEffect(() => {
    if (tab === "reservas" && user) {
      fetchReservas();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterEstado, filterAreaId, tab]);

  // ── Animations ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!loading) {
      const ctx = gsap.context(() => {
        gsap.fromTo(
          ".fade-up",
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, stagger: 0.1, duration: 0.4, ease: "power2.out" }
        );
      }, containerRef);
      return () => ctx.revert();
    }
  }, [loading, tab]);

  // ── Area CRUD handlers ───────────────────────────────────────────────────

  const openCreateModal = () => {
    setCreateForm({ ...EMPTY_AREA_FORM });
    setShowCreate(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.nombre.trim()) {
      toast.error("El nombre es requerido");
      return;
    }
    setSavingCreate(true);
    try {
      const body: Record<string, unknown> = {
        nombre: createForm.nombre.trim(),
        descripcion: createForm.descripcion.trim() || null,
        capacidadMax: createForm.capacidadMax,
        requiereDeposito: createForm.requiereDeposito,
        depositoMonto: createForm.requiereDeposito
          ? createForm.depositoMonto || null
          : null,
        horaApertura: createForm.horaApertura,
        horaCierre: createForm.horaCierre,
        diasDisponibles: createForm.diasDisponibles.trim(),
        duracionSlot: createForm.duracionSlot,
        activa: createForm.activa,
      };
      await api.post<AreaComunDto>("/admin/areas-comunes", body);
      toast.success("Área creada exitosamente");
      setShowCreate(false);
      fetchAreas();
    } catch (e: unknown) {
      toast.error(
        e instanceof ApiError ? e.detail : "Error al crear el área"
      );
    } finally {
      setSavingCreate(false);
    }
  };

  const openEditModal = (area: AreaComunDto) => {
    setEditingArea(area);
    setEditForm({
      nombre: area.nombre,
      descripcion: area.descripcion || "",
      capacidadMax: area.capacidadMax,
      requiereDeposito: area.requiereDeposito,
      depositoMonto: area.depositoMonto || "",
      horaApertura: area.horaApertura,
      horaCierre: area.horaCierre,
      diasDisponibles: area.diasDisponibles,
      duracionSlot: area.duracionSlot,
      activa: area.activa,
    });
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingArea) return;
    setSavingEdit(true);
    try {
      const body: Record<string, unknown> = {
        nombre: editForm.nombre.trim() || undefined,
        descripcion: editForm.descripcion.trim() || undefined,
        capacidadMax: editForm.capacidadMax,
        requiereDeposito: editForm.requiereDeposito,
        depositoMonto: editForm.requiereDeposito
          ? editForm.depositoMonto || null
          : null,
        horaApertura: editForm.horaApertura,
        horaCierre: editForm.horaCierre,
        diasDisponibles: editForm.diasDisponibles.trim(),
        duracionSlot: editForm.duracionSlot,
        activa: editForm.activa,
      };
      await api.put(`/admin/areas-comunes/${editingArea.id}`, body);
      toast.success("Área actualizada exitosamente");
      setEditingArea(null);
      fetchAreas();
    } catch (e: unknown) {
      toast.error(
        e instanceof ApiError ? e.detail : "Error al actualizar el área"
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmDeleteArea = async () => {
    if (!areaToDelete) return;
    setDeletingArea(true);
    try {
      await api.delete(`/admin/areas-comunes/${areaToDelete.id}`);
      toast.success("Área eliminada correctamente");
      setAreaToDelete(null);
      fetchAreas();
    } catch (e: unknown) {
      toast.error(
        e instanceof ApiError ? e.detail : "Error al eliminar el área"
      );
    } finally {
      setDeletingArea(false);
    }
  };

  // ── Loading state ────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-6 p-6 pt-16 pb-32 min-h-screen relative overflow-x-hidden"
    >
      <ProfileHeader />

      {/* Header */}
      <div className="fade-up flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-medium text-text tracking-wide">
            Áreas Comunes
          </h1>
          <p className="text-sm text-text" style={{ opacity: 0.6 }}>
            Gestión de espacios y reservas
          </p>
        </div>
        {tab === "areas" && (
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 bg-[#57bf00] text-white rounded-full shadow-lg shadow-[#57bf00]/30 px-5 py-2.5 text-sm font-bold active:scale-95 transition-transform"
          >
            <Plus size={18} />
            Nueva Área
          </button>
        )}
        {tab === "reservas" && (
          <button
            onClick={fetchReservas}
            className="p-2 rounded-full hover:bg-surface-2 transition-colors"
          >
            <RefreshCw size={18} className="text-text" />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="fade-up flex bg-surface-2 rounded-full p-1 border border-border">
        <button
          onClick={() => setTab("areas")}
          className={`flex-1 py-3 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
            tab === "areas"
              ? "bg-accent text-primary shadow-md"
              : "text-text hover:text-text"
          }`}
        >
          Áreas
        </button>
        <button
          onClick={() => setTab("reservas")}
          className={`flex-1 py-3 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
            tab === "reservas"
              ? "bg-accent text-primary shadow-md"
              : "text-text hover:text-text"
          }`}
        >
          Reservas
        </button>
      </div>

      {/* ── TAB: Áreas ──────────────────────────────────────────────────── */}
      {tab === "areas" && (
        <div className="flex flex-col gap-4">
          {loading ? (
            <div className="w-full py-12 flex justify-center">
              <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
            </div>
          ) : areas.length === 0 ? (
            <div className="fade-up liquid-glass rounded-3xl p-8 border border-border text-center">
              <Building2
                size={40}
                className="mx-auto text-text mb-3"
                style={{ opacity: 0.4 }}
              />
              <p className="text-text font-medium">Sin áreas comunes</p>
              <p className="text-xs text-text mt-1" style={{ opacity: 0.5 }}>
                Crea la primera área usando el botón superior.
              </p>
            </div>
          ) : (
            areas.map((area) => (
              <div
                key={area.id}
                className="fade-up liquid-glass rounded-3xl p-6 border border-border shadow-2xl flex flex-col gap-4 group hover:border-accent/30 transition-all"
              >
                {/* Top row: Name + Status + Actions */}
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-surface-2 border border-border flex items-center justify-center text-text">
                      <Building2 size={22} />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-text">
                        {area.nombre}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            area.activa ? "bg-[#57bf00]" : "bg-text/30"
                          }`}
                        />
                        <span
                          className="text-[10px] text-text"
                          style={{ opacity: 0.5 }}
                        >
                          {area.activa ? "Activa" : "Inactiva"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(area);
                      }}
                      className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/25 flex items-center justify-center text-accent hover:bg-accent/20 active:scale-95 transition-all"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setAreaToDelete(area);
                      }}
                      className="w-10 h-10 rounded-xl bg-text/10 border border-text/25 flex items-center justify-center text-text hover:bg-text/20 active:scale-95 transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Description */}
                {area.descripcion && (
                  <p className="text-xs text-text leading-relaxed" style={{ opacity: 0.7 }}>
                    {area.descripcion}
                  </p>
                )}

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50">
                  <div className="flex items-center gap-2 text-xs text-text">
                    <Users size={14} style={{ opacity: 0.5 }} />
                    <span>
                      Cap. máxima:{" "}
                      <strong>{area.capacidadMax}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-text">
                    <Clock size={14} style={{ opacity: 0.5 }} />
                    <span>
                      {area.horaApertura} – {area.horaCierre}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-text">
                    <Calendar size={14} style={{ opacity: 0.5 }} />
                    <span>{area.diasDisponibles}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-text">
                    <Clock size={14} style={{ opacity: 0.5 }} />
                    <span>Slot: {area.duracionSlot} min</span>
                  </div>
                </div>

                {/* Deposit info */}
                {area.requiereDeposito && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                    <DollarSign size={14} className="text-yellow-500" />
                    <span className="text-xs text-text font-medium">
                      Depósito requerido:{" "}
                      <strong>{formatCOP(area.depositoMonto)}</strong>
                    </span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── TAB: Reservas ───────────────────────────────────────────────── */}
      {tab === "reservas" && (
        <div className="flex flex-col gap-4">
          {/* Filters */}
          <div className="fade-up flex flex-col sm:flex-row gap-3">
            {/* Estado filter */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {[
                { label: "Todas", value: "" },
                { label: "Pendiente", value: "PENDIENTE" },
                { label: "Confirmada", value: "CONFIRMADA" },
                { label: "Cancelada", value: "CANCELADA" },
                { label: "Completada", value: "COMPLETADA" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFilterEstado(opt.value)}
                  className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap active:scale-95 ${
                    filterEstado === opt.value
                      ? "bg-[#009df2] text-white shadow-lg shadow-[#009df2]/30"
                      : "bg-text/5 border border-border text-text hover:bg-text/10"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Área filter */}
            <div className="relative">
              <MapPin
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text"
                style={{ opacity: 0.5 }}
              />
              <select
                value={filterAreaId}
                onChange={(e) => setFilterAreaId(e.target.value)}
                className="w-full sm:w-auto bg-surface-2 border border-border rounded-xl pl-10 pr-4 py-3 text-xs text-text outline-none focus:border-accent appearance-none"
              >
                <option value="">Todas las áreas</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Reservations list */}
          {loadingReservas ? (
            <div className="w-full py-12 flex justify-center">
              <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
            </div>
          ) : reservas.length === 0 ? (
            <div className="fade-up liquid-glass rounded-3xl p-8 border border-border text-center">
              <Calendar
                size={40}
                className="mx-auto text-text mb-3"
                style={{ opacity: 0.4 }}
              />
              <p className="text-text font-medium">Sin reservas</p>
              <p className="text-xs text-text mt-1" style={{ opacity: 0.5 }}>
                No hay reservas que coincidan con los filtros seleccionados.
              </p>
            </div>
          ) : (
            reservas.map((r) => (
              <div
                key={r.id}
                className="fade-up liquid-glass rounded-3xl p-5 border border-border shadow-2xl flex flex-col gap-3 group hover:border-accent/30 transition-all"
              >
                {/* Top: Resident + Area */}
                <div className="flex justify-between items-start gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center shrink-0">
                      <User size={20} className="text-text" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-bold text-text truncate">
                        {r.residenteNombre}
                      </span>
                      <span className="text-[10px] bg-accent/20 text-accent px-2 py-0.5 rounded-md font-black uppercase w-fit">
                        {r.residenteTorre && r.residenteApto
                          ? `T${r.residenteTorre} - A${r.residenteApto}`
                          : "Sin unidad"}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${ESTADO_COLORS[r.estado]}`}
                  >
                    {ESTADO_LABEL[r.estado] || r.estado}
                  </span>
                </div>

                {/* Middle: Area + Date/Time */}
                <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-surface-2 border border-border">
                  <div className="flex items-center gap-2 text-xs text-text">
                    <Building2 size={14} style={{ opacity: 0.5 }} />
                    <span className="font-medium">{r.areaNombre}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-text">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={13} style={{ opacity: 0.5 }} />
                      <span>
                        {new Date(r.fechaInicio).toLocaleDateString("es-CO", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock size={13} style={{ opacity: 0.5 }} />
                      <span>
                        {new Date(r.fechaInicio).toLocaleTimeString("es-CO", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        –{" "}
                        {new Date(r.fechaFin).toLocaleTimeString("es-CO", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom: Notes */}
                {r.notas && (
                  <div className="text-[11px] text-text italic leading-relaxed px-1 border-t border-border/40 pt-2">
                    &quot;{r.notas}&quot;
                  </div>
                )}

                {/* Created */}
                <div className="text-[9px] text-text" style={{ opacity: 0.4 }}>
                  Creada:{" "}
                  {new Date(r.createdAt).toLocaleString("es-CO", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* CREATE AREA MODAL */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {showCreate && (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300">
          <div
            className="absolute inset-0"
            onClick={() => !savingCreate && setShowCreate(false)}
          />
          <div className="liquid-glass rounded-t-[32px] sm:rounded-[32px] w-full max-w-[500px] max-h-[90vh] overflow-y-auto p-6 pb-10 sm:pb-6 relative z-10 shadow-2xl border-t border-border/40 animate-in slide-in-from-bottom-full sm:zoom-in-95 duration-300">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-text">
                Nueva Área Común
              </h3>
              <button
                onClick={() => !savingCreate && setShowCreate(false)}
                className="w-10 h-10 rounded-full bg-surface-2 border border-border flex items-center justify-center text-text hover:bg-text/10 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <AreaFormFields
                form={createForm}
                setForm={setCreateForm}
                saving={savingCreate}
                submitLabel="Crear Área"
              />
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* EDIT AREA MODAL */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {editingArea && (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300">
          <div
            className="absolute inset-0"
            onClick={() => !savingEdit && setEditingArea(null)}
          />
          <div className="liquid-glass rounded-t-[32px] sm:rounded-[32px] w-full max-w-[500px] max-h-[90vh] overflow-y-auto p-6 pb-10 sm:pb-6 relative z-10 shadow-2xl border-t border-border/40 animate-in slide-in-from-bottom-full sm:zoom-in-95 duration-300">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-text">
                Editar Área Común
              </h3>
              <button
                onClick={() => !savingEdit && setEditingArea(null)}
                className="w-10 h-10 rounded-full bg-surface-2 border border-border flex items-center justify-center text-text hover:bg-text/10 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleEdit} className="flex flex-col gap-4">
              <AreaFormFields
                form={editForm}
                setForm={setEditForm}
                saving={savingEdit}
                submitLabel="Guardar Cambios"
              />
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* DELETE CONFIRMATION MODAL */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {areaToDelete && (
        <div className="fixed inset-0 z-100 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={() => setAreaToDelete(null)}
          />
          <div className="liquid-glass rounded-t-[32px] sm:rounded-[32px] w-full max-w-[430px] p-8 pb-12 sm:pb-8 relative z-10 shadow-2xl border-t border-border/40 animate-in slide-in-from-bottom-full duration-300">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-[#EF4444]/15 border border-[#EF4444]/40 flex items-center justify-center">
                <Trash2 size={28} className="text-[#EF4444]" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-accent font-bold uppercase tracking-[0.2em]">
                  Eliminar Área
                </span>
                <h3 className="text-2xl font-display font-bold text-text">
                  ¿Estás seguro?
                </h3>
              </div>
              <p className="text-sm text-text/80 leading-relaxed">
                Esta acción no se puede deshacer. Se eliminará el área{" "}
                <strong className="text-text">{areaToDelete.nombre}</strong> y
                no podrá ser recuperada.
              </p>
              <div className="flex gap-3 w-full mt-2">
                <button
                  type="button"
                  onClick={() => setAreaToDelete(null)}
                  className="flex-1 py-4 rounded-2xl bg-text/5 border border-border/50 text-text font-bold text-sm hover:bg-text/10 active:scale-95 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deletingArea}
                  onClick={confirmDeleteArea}
                  className="flex-1 py-4 rounded-2xl bg-[#EF4444] text-white font-bold text-sm shadow-xl shadow-[#EF4444]/20 active:scale-95 transition-all disabled:opacity-60"
                >
                  {deletingArea ? "Eliminando..." : "Eliminar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer>
        <div className="py-10 text-center opacity-10 pointer-events-none">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text">
            ConjuntOS · Áreas Comunes
          </p>
        </div>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reusable form fields for create/edit
// ─────────────────────────────────────────────────────────────────────────────

function AreaFormFields({
  form,
  setForm,
  saving,
  submitLabel,
}: {
  form: AreaFormData;
  setForm: React.Dispatch<React.SetStateAction<AreaFormData>>;
  saving: boolean;
  submitLabel: string;
}) {
  return (
    <>
      {/* Nombre */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">
          Nombre *
        </label>
        <input
          type="text"
          required
          value={form.nombre}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, nombre: e.target.value }))
          }
          placeholder="Ej: Salón Social, Piscina, BBQ"
          className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent placeholder:text-text"
        />
      </div>

      {/* Descripción */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">
          Descripción
        </label>
        <textarea
          rows={2}
          value={form.descripcion}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, descripcion: e.target.value }))
          }
          placeholder="Breve descripción del espacio..."
          className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent placeholder:text-text resize-none"
        />
      </div>

      {/* Capacidad máxima + Duración slot */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">
            Capacidad Máx.
          </label>
          <input
            type="number"
            min={1}
            required
            value={form.capacidadMax}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                capacidadMax: parseInt(e.target.value, 10) || 1,
              }))
            }
            className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">
            Slot (min)
          </label>
          <input
            type="number"
            min={1}
            required
            value={form.duracionSlot}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                duracionSlot: parseInt(e.target.value, 10) || 1,
              }))
            }
            className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Horarios */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">
            Hora Apertura *
          </label>
          <input
            type="time"
            required
            value={form.horaApertura}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, horaApertura: e.target.value }))
            }
            className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">
            Hora Cierre *
          </label>
          <input
            type="time"
            required
            value={form.horaCierre}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, horaCierre: e.target.value }))
            }
            className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Días disponibles */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">
          Días Disponibles *
        </label>
        <input
          type="text"
          required
          value={form.diasDisponibles}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, diasDisponibles: e.target.value }))
          }
          placeholder="Ej: Lunes a Viernes, Sábados y Domingos"
          className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent placeholder:text-text"
        />
      </div>

      {/* Requiere depósito toggle */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-border">
        <span className="text-sm text-text font-medium">
          Requiere depósito
        </span>
        <button
          type="button"
          onClick={() =>
            setForm((prev) => ({
              ...prev,
              requiereDeposito: !prev.requiereDeposito,
            }))
          }
          className={`relative w-12 h-7 rounded-full transition-colors ${
            form.requiereDeposito ? "bg-[#57bf00]" : "bg-text/20"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
              form.requiereDeposito ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* Depósito monto (only if toggle on) */}
      {form.requiereDeposito && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">
            Monto del Depósito (COP)
          </label>
          <input
            type="number"
            min={0}
            value={form.depositoMonto}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, depositoMonto: e.target.value }))
            }
            placeholder="Ej: 50000"
            className="w-full bg-surface-2 border border-border rounded-xl py-3 px-4 text-sm text-text focus:outline-none focus:border-accent placeholder:text-text"
          />
          {form.depositoMonto && (
            <span className="text-[10px] text-text" style={{ opacity: 0.5 }}>
              ≈ {formatCOP(form.depositoMonto)}
            </span>
          )}
        </div>
      )}

      {/* Activa toggle */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-border">
        <span className="text-sm text-text font-medium">Área activa</span>
        <button
          type="button"
          onClick={() =>
            setForm((prev) => ({ ...prev, activa: !prev.activa }))
          }
          className={`relative w-12 h-7 rounded-full transition-colors ${
            form.activa ? "bg-[#57bf00]" : "bg-text/20"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
              form.activa ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={saving}
        className="w-full py-3.5 rounded-full bg-[#57bf00] text-white font-bold text-sm shadow-lg shadow-[#57bf00]/30 active:scale-[0.98] transition-transform disabled:opacity-50 mt-2 flex items-center justify-center gap-2"
      >
        {saving ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Guardando...
          </>
        ) : (
          submitLabel
        )}
      </button>
    </>
  );
}
