"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api/client";
import { Calendar, Clock, Plus, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";

interface AreaComunDto {
  id: string;
  nombre: string;
  descripcion?: string;
  capacidadMax: number;
  imagenUrl?: string;
  requiereDeposito: boolean;
  depositoMonto?: string;
  horaApertura: string;
  horaCierre: string;
  diasDisponibles: string;
  duracionSlot: number;
  activa: boolean;
}

interface ReservaDto {
  id: string;
  areaId: string;
  fechaInicio: string;
  fechaFin: string;
  estado: string;
  notas?: string;
  createdAt: string;
  areaNombre: string;
  areaImagenUrl?: string;
}

export default function ReservaSection({ excludedAreas }: { excludedAreas?: string[] }) {
  const { user } = useAuth();
  const [areas, setAreas] = useState<AreaComunDto[]>([]);
  const [reservas, setReservas] = useState<ReservaDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedArea, setSelectedArea] = useState<string>("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [hora, setHora] = useState(() => {
    const h = new Date().getHours();
    return String(h).padStart(2, "0") + ":00";
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchData = async () => {
    try {
      const [areasData, reservasData] = await Promise.all([
        api.get<AreaComunDto[]>("/areas-comunes"),
        api.get<ReservaDto[]>("/reservas"),
      ]);
      const activas = areasData.filter(a => a.activa);
      // Filtrar áreas excluidas por permisos (piscina, gimnasio)
      const filtradas = excludedAreas
        ? activas.filter(a => !excludedAreas.some(e => a.nombre.toLowerCase().includes(e.toLowerCase())))
        : activas;
      setAreas(filtradas);
      setReservas(reservasData);
    } catch { /* silently ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const handleReservar = async () => {
    if (!selectedArea) return;
    setSubmitting(true);
    try {
      const area = areas.find(a => a.id === selectedArea);
      if (!area) return;
      const fechaInicio = new Date(`${fecha}T${hora}:00`);
      const duracionMin = area.duracionSlot || 60;
      const fechaFin = new Date(fechaInicio.getTime() + duracionMin * 60000);

      await api.post("/reservas", {
        areaId: selectedArea,
        fechaInicio: fechaInicio.toISOString(),
        fechaFin: fechaFin.toISOString(),
        notas: null,
      });
      toast.success(`Reserva creada: ${area.nombre}`);
      setShowModal(false);
      fetchData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al reservar";
      toast.error(msg.includes("overlaps") ? "Horario ya ocupado" : msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={20} className="animate-spin text-accent" />
      </div>
    );
  }

  const reservasActivas = reservas.filter(r =>
    r.estado !== "CANCELADA" && new Date(r.fechaFin) > new Date()
  );

  return (
    <>
      {/* Mis Reservas */}
      {reservasActivas.length > 0 && (
        <div className="space-y-2 mb-4">
          <h3 className="text-text-secondary text-[10px] font-bold uppercase tracking-wider px-1">
            Mis reservas activas
          </h3>
          {reservasActivas.map(r => (
            <div key={r.id} className="flex items-center gap-3 bg-surface rounded-lg p-3">
              {r.areaImagenUrl ? (
                <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0">
                  <img src={r.areaImagenUrl} alt={r.areaNombre} className="w-full h-full object-cover" />
                </div>
              ) : (
                <Calendar size={16} className="text-accent shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <span className="text-sm text-text font-medium block truncate">{r.areaNombre}</span>
                <span className="text-[10px] text-text/60">
                  {new Date(r.fechaInicio).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" })}
                  {" · "}
                  {new Date(r.fechaInicio).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                  {" → "}
                  {new Date(r.fechaFin).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase shrink-0 ${
                r.estado === "APROBADA" ? "bg-[#57bf00]/20 text-[#57bf00]" :
                r.estado === "PENDIENTE" ? "bg-[#FACC15]/20 text-[#FACC15]" :
                "bg-text/10 text-text/60"
              }`}>
                {r.estado === "APROBADA" ? "Aprobada" : r.estado === "PENDIENTE" ? "Pendiente" : r.estado}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Botón Reservar — solo si hay áreas disponibles */}
      {areas.length > 0 && (
      <button
        onClick={() => setShowModal(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-accent text-on-accent text-sm font-bold hover:opacity-90 transition-opacity"
      >
        <Plus size={18} />
        Reservar área común
      </button>
      )}

      {areas.length === 0 && !loading && (
        <p className="text-text/40 text-xs text-center py-2">No tienes áreas disponibles para reservar</p>
      )}

      {/* Modal de Reserva */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-primary border border-border rounded-[28px] p-6 w-full max-w-sm flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-text">Reservar área</h2>

            {/* Select área */}
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-text/60 font-bold">Área</span>
              <select
                value={selectedArea}
                onChange={(e) => setSelectedArea(e.target.value)}
                className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text"
              >
                <option value="">Seleccionar área...</option>
                {areas.map(a => (
                  <option key={a.id} value={a.id}>{a.nombre}</option>
                ))}
              </select>
            </label>

            {selectedArea && (() => {
              const area = areas.find(a => a.id === selectedArea);
              if (!area) return null;
              return (
                <div className="bg-surface-2 rounded-xl p-3 text-xs text-text/70 space-y-2">
                  {area.imagenUrl && (
                    <div className="relative w-full h-32 rounded-lg overflow-hidden mb-2">
                      <img src={area.imagenUrl} alt={area.nombre} className="w-full h-full object-cover" />
                    </div>
                  )}
                  {area.descripcion && <p>{area.descripcion}</p>}
                  <p className="flex items-center gap-1"><Clock size={12} /> {area.horaApertura} → {area.horaCierre}</p>
                  <p className="flex items-center gap-1"><MapPin size={12} /> Capacidad: {area.capacidadMax} personas</p>
                  {area.requiereDeposito && (
                    <p className="text-[#FACC15]">Depósito: ${area.depositoMonto || "—"}</p>
                  )}
                </div>
              );
            })()}

            {/* Fecha */}
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-text/60 font-bold">Fecha</span>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text"
              />
            </label>

            {/* Hora */}
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-text/60 font-bold">Hora</span>
              <input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text"
              />
            </label>

            <div className="flex gap-3 mt-2">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-2xl bg-surface-2 border border-border text-text text-sm font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={handleReservar}
                disabled={!selectedArea || submitting}
                className="flex-1 py-2.5 rounded-2xl bg-accent text-on-accent text-sm font-bold disabled:opacity-50"
              >
                {submitting ? "Reservando..." : "Reservar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
