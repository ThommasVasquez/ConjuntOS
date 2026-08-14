'use client';

import React, { useEffect, useState, useTransition } from 'react';
import {
  Truck,
  ShieldCheck,
  Calendar,
  Clock,
  Plus,
  CheckCircle2,
  XCircle,
  FileText,
  Building2,
  Search,
  Check,
  Ban,
  PlusCircle,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api/client';
import ProfileHeader from '@/components/shell/ProfileHeader';
import PazYSalvoModal, { MudanzaItem } from '@/components/mudanzas/PazYSalvoModal';

export default function MudanzasPage() {
  const { user } = useAuth();
  const [mudanzas, setMudanzas] = useState<MudanzaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'solicitar' | 'mis_solicitudes' | 'gestion_admin' | 'vigilancia'>('mis_solicitudes');
  const [isPending, startTransition] = useTransition();

  // Selected item for Paz y Salvo modal
  const [selectedMudanza, setSelectedMudanza] = useState<MudanzaItem | null>(null);

  // Form State for Resident Creation
  const [torre, setTorre] = useState(user?.torre || '');
  const [apto, setApto] = useState(user?.apto || '');
  const [tipo, setTipo] = useState<'ENTRANTE' | 'SALIENTE'>('ENTRANTE');
  const [fechaMudanza, setFechaMudanza] = useState('');
  const [horaInicio, setHoraInicio] = useState('08:00 AM');
  const [horaFin, setHoraFin] = useState('02:00 PM');
  const [tieneVehiculo, setTieneVehiculo] = useState(true);
  const [vehiculoPlaca, setVehiculoPlaca] = useState('');
  const [vehiculoTipo, setVehiculoTipo] = useState('Camión de Trasteo');
  const [conductorNombre, setConductorNombre] = useState('');
  const [conductorDocumento, setConductorDocumento] = useState('');
  const [observaciones, setObservaciones] = useState('');

  // Rejection modal state
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');

  // Search and Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterEstado, setFilterEstado] = useState<string>('TODOS');

  const isStaff = user?.rol === 'ADMINISTRADOR' || user?.rol === 'SUPER_ADMIN';
  const isVigilancia =
    user?.rol === 'VIGILANTE' ||
    user?.rol === 'SUPERVISOR_VIGILANCIA' ||
    user?.rol === 'ENCARGADO_PARQUEADERO';

  useEffect(() => {
    if (isStaff) {
      setActiveTab('gestion_admin');
    } else if (isVigilancia) {
      setActiveTab('vigilancia');
    } else {
      setActiveTab('mis_solicitudes');
    }
  }, [user?.rol, isStaff, isVigilancia]);

  useEffect(() => {
    if (user?.torre) setTorre(user.torre);
    if (user?.apto) setApto(user.apto);
  }, [user?.torre, user?.apto]);

  const loadMudanzas = async () => {
    try {
      setLoading(true);
      const res = await api.get<MudanzaItem[]>('/mudanzas');
      setMudanzas(res);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Error cargando solicitudes de mudanza');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMudanzas();
  }, []);

  const handleCrearMudanza = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fechaMudanza) {
      toast.error('Selecciona la fecha de la mudanza');
      return;
    }

    startTransition(async () => {
      try {
        await api.post('/mudanzas', {
          torre: torre || null,
          apto: apto || null,
          tipo,
          fecha_mudanza: fechaMudanza,
          hora_inicio: horaInicio,
          hora_fin: horaFin,
          tiene_vehiculo: tieneVehiculo,
          vehiculo_placa: tieneVehiculo ? vehiculoPlaca : null,
          vehiculo_tipo: tieneVehiculo ? vehiculoTipo : null,
          conductor_nombre: tieneVehiculo ? conductorNombre : null,
          conductor_documento: tieneVehiculo ? conductorDocumento : null,
          observaciones,
        });

        toast.success('Solicitud enviada a la Administración. En espera de Paz y Salvo.');
        loadMudanzas();
        setActiveTab('mis_solicitudes');
        // Reset form
        setFechaMudanza('');
        setObservaciones('');
        setVehiculoPlaca('');
      } catch (err: any) {
        toast.error(err?.message || 'Error creando solicitud de mudanza');
      }
    });
  };

  const handleAprobar = async (id: string) => {
    try {
      await api.put(`/mudanzas/${id}/aprobar`, {});
      toast.success('Paz y Salvo expedido exitosamente. Permiso comunicado a Portería y Estacionamientos.');
      loadMudanzas();
    } catch (err: any) {
      toast.error(err?.message || 'Error al aprobar paz y salvo');
    }
  };

  const handleRechazarSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingId || !motivoRechazo) return;

    try {
      await api.put(`/mudanzas/${rejectingId}/rechazar`, {
        motivo: motivoRechazo,
      });
      toast.info('Solicitud rechazada');
      setRejectingId(null);
      setMotivoRechazo('');
      loadMudanzas();
    } catch (err: any) {
      toast.error(err?.message || 'Error rechazando solicitud');
    }
  };

  const handleUpdateEstado = async (id: string, nuevoEstado: string) => {
    try {
      await api.put(`/mudanzas/${id}/estado`, {
        estado: nuevoEstado,
      });
      toast.success(`Estado actualizado a: ${nuevoEstado}`);
      loadMudanzas();
    } catch (err: any) {
      toast.error(err?.message || 'Error actualizando estado');
    }
  };

  const filteredMudanzas = mudanzas.filter((m) => {
    const matchesSearch =
      (m.usuario_nombre?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (m.apto?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (m.torre?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (m.vehiculo_placa?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (m.paz_y_salvo_codigo?.toLowerCase() || '').includes(searchQuery.toLowerCase());

    const matchesEstado = filterEstado === 'TODOS' || m.estado === filterEstado;
    return matchesSearch && matchesEstado;
  });

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 pt-16 pb-32 min-h-screen w-full max-w-full overflow-x-hidden">
      {/* Shell Top Navigation & Profile Banner */}
      <ProfileHeader />

      {/* Main Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-medium text-text tracking-wide">
            Mudanzas & Paz y Salvo
          </h1>
          <p className="text-xs sm:text-sm text-text/70 mt-0.5">
            Gestión de trasteos, expedición de paz y salvo y control en portería/estacionamientos
          </p>
        </div>

        {!isStaff && !isVigilancia && (
          <button
            onClick={() => setActiveTab(activeTab === 'solicitar' ? 'mis_solicitudes' : 'solicitar')}
            className="flex items-center justify-center gap-2 bg-accent text-on-accent px-4 py-2.5 rounded-2xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-accent/20 active:scale-95 transition-all self-start sm:self-auto shrink-0"
          >
            {activeTab === 'solicitar' ? <XCircle size={16} /> : <PlusCircle size={16} />}
            {activeTab === 'solicitar' ? 'Cancelar' : 'Solicitar Mudanza'}
          </button>
        )}
      </div>

      {/* Liquid Glass Tabs Switcher */}
      <div className="flex items-center gap-2 border-b border-border pb-3 w-full overflow-x-auto scrollbar-hide">
        {!isStaff && !isVigilancia && (
          <button
            onClick={() => setActiveTab('solicitar')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap ${
              activeTab === 'solicitar'
                ? 'bg-accent text-on-accent shadow-lg shadow-accent/20'
                : 'liquid-glass text-text hover:bg-primary-light/50'
            }`}
          >
            <Plus className="w-4 h-4" />
            Nueva Solicitud
          </button>
        )}

        {!isStaff && !isVigilancia && (
          <button
            onClick={() => setActiveTab('mis_solicitudes')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap ${
              activeTab === 'mis_solicitudes'
                ? 'bg-accent text-on-accent shadow-lg shadow-accent/20'
                : 'liquid-glass text-text hover:bg-primary-light/50'
            }`}
          >
            <FileText className="w-4 h-4" />
            Mis Solicitudes ({mudanzas.length})
          </button>
        )}

        {isStaff && (
          <button
            onClick={() => setActiveTab('gestion_admin')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap ${
              activeTab === 'gestion_admin'
                ? 'bg-accent text-on-accent shadow-lg shadow-accent/20'
                : 'liquid-glass text-text hover:bg-primary-light/50'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Gestión Paz y Salvo (Admin)
          </button>
        )}

        {(isVigilancia || isStaff) && (
          <button
            onClick={() => setActiveTab('vigilancia')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap ${
              activeTab === 'vigilancia'
                ? 'bg-accent text-on-accent shadow-lg shadow-accent/20'
                : 'liquid-glass text-text hover:bg-primary-light/50'
            }`}
          >
            <Truck className="w-4 h-4" />
            Programación Portería ({filteredMudanzas.length})
          </button>
        )}
      </div>

      {/* Tab Content 1: Formulario Solicitar Mudanza */}
      {activeTab === 'solicitar' && (
        <form onSubmit={handleCrearMudanza} className="liquid-glass-card rounded-[28px] p-5 sm:p-6 border border-border flex flex-col gap-5 w-full">
          <div className="border-b border-border pb-3">
            <h2 className="text-base font-bold text-text flex items-center gap-2">
              <Truck className="w-5 h-5 text-[#57bf00]" />
              Formulario de Solicitud de Mudanza
            </h2>
            <p className="text-xs text-text/60 mt-1">
              La administración verificará tu estado financiero para expedir el Paz y Salvo oficial de <strong className="text-[#57bf00]">ConjuntOS®</strong>.
            </p>
          </div>

          {/* Torre & Apto Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">Torre / Bloque</label>
              <input
                type="text"
                placeholder="ej. Torre B"
                value={torre}
                onChange={(e) => setTorre(e.target.value)}
                className="w-full bg-primary-light/50 border border-border rounded-[20px] p-3 text-xs text-text focus:outline-none focus:border-accent/40"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">Apartamento / Unidad</label>
              <input
                type="text"
                placeholder="ej. 202"
                value={apto}
                onChange={(e) => setApto(e.target.value)}
                className="w-full bg-primary-light/50 border border-border rounded-[20px] p-3 text-xs text-text focus:outline-none focus:border-accent/40"
              />
            </div>
          </div>

          {/* Tipo de Mudanza */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTipo('ENTRANTE')}
              className={`p-3.5 rounded-2xl border text-center font-bold text-xs uppercase tracking-wider transition-all ${
                tipo === 'ENTRANTE'
                  ? 'border-[#57bf00] bg-[#57bf00]/10 text-text shadow-md'
                  : 'border-border bg-primary-light/30 text-text/60 hover:bg-primary-light/50'
              }`}
            >
              📥 Mudanza Entrante
            </button>
            <button
              type="button"
              onClick={() => setTipo('SALIENTE')}
              className={`p-3.5 rounded-2xl border text-center font-bold text-xs uppercase tracking-wider transition-all ${
                tipo === 'SALIENTE'
                  ? 'border-[#57bf00] bg-[#57bf00]/10 text-text shadow-md'
                  : 'border-border bg-primary-light/30 text-text/60 hover:bg-primary-light/50'
              }`}
            >
              📤 Mudanza Saliente
            </button>
          </div>

          {/* Date and Time Windows */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">Fecha Programada *</label>
              <input
                type="date"
                required
                value={fechaMudanza}
                onChange={(e) => setFechaMudanza(e.target.value)}
                className="w-full bg-primary-light/50 border border-border rounded-[20px] p-3 text-xs text-text focus:outline-none focus:border-accent/40"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">Hora Inicio Permiso *</label>
              <input
                type="text"
                required
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
                placeholder="ej. 08:00 AM"
                className="w-full bg-primary-light/50 border border-border rounded-[20px] p-3 text-xs text-text focus:outline-none focus:border-accent/40"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">Hora Finalización *</label>
              <input
                type="text"
                required
                value={horaFin}
                onChange={(e) => setHoraFin(e.target.value)}
                placeholder="ej. 02:00 PM"
                className="w-full bg-primary-light/50 border border-border rounded-[20px] p-3 text-xs text-text focus:outline-none focus:border-accent/40"
              />
            </div>
          </div>

          {/* Vehicle Checkbox */}
          <div className="flex items-center gap-3 p-3.5 bg-primary-light/30 border border-border rounded-2xl">
            <input
              type="checkbox"
              id="tiene_vehiculo"
              checked={tieneVehiculo}
              onChange={(e) => setTieneVehiculo(e.target.checked)}
              className="w-4 h-4 accent-[#57bf00] rounded cursor-pointer shrink-0"
            />
            <label htmlFor="tiene_vehiculo" className="text-xs font-bold text-text cursor-pointer">
              ¿Ingresará camión o vehículo de trasteo?
            </label>
          </div>

          {/* Vehicle Fields */}
          {tieneVehiculo && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-primary-light/20 border border-border rounded-2xl">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">Placa Camión / Vehículo</label>
                <input
                  type="text"
                  value={vehiculoPlaca}
                  onChange={(e) => setVehiculoPlaca(e.target.value)}
                  placeholder="ej. ABC-123"
                  className="w-full bg-primary-light/50 border border-border rounded-[20px] p-3 text-xs font-mono text-text focus:outline-none focus:border-accent/40 uppercase"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">Tipo de Vehículo</label>
                <input
                  type="text"
                  value={vehiculoTipo}
                  onChange={(e) => setVehiculoTipo(e.target.value)}
                  placeholder="Camión Furgón / Camioneta"
                  className="w-full bg-primary-light/50 border border-border rounded-[20px] p-3 text-xs text-text focus:outline-none focus:border-accent/40"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">Nombre Conductor</label>
                <input
                  type="text"
                  value={conductorNombre}
                  onChange={(e) => setConductorNombre(e.target.value)}
                  placeholder="Nombre completo"
                  className="w-full bg-primary-light/50 border border-border rounded-[20px] p-3 text-xs text-text focus:outline-none focus:border-accent/40"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">Cédula Conductor</label>
                <input
                  type="text"
                  value={conductorDocumento}
                  onChange={(e) => setConductorDocumento(e.target.value)}
                  placeholder="Documento de identidad"
                  className="w-full bg-primary-light/50 border border-border rounded-[20px] p-3 text-xs text-text focus:outline-none focus:border-accent/40"
                />
              </div>
            </div>
          )}

          {/* Observaciones */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-text uppercase tracking-[0.2em] font-black ml-1">Observaciones Aclaratorias</label>
            <textarea
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Notas sobre ascensor o cajas..."
              className="w-full bg-primary-light/50 border border-border rounded-[20px] p-3 text-xs text-text focus:outline-none focus:border-accent/40"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-4 rounded-[24px] bg-[#57bf00] hover:bg-[#46a000] text-white font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-[#57bf00]/20 disabled:opacity-50 mt-1 active:scale-95"
          >
            {isPending ? 'Enviando...' : 'Enviar Solicitud a la Administración'}
          </button>
        </form>
      )}

      {/* Tab Content 2 & 3: List of Mudanzas */}
      {(activeTab === 'mis_solicitudes' || activeTab === 'gestion_admin' || activeTab === 'vigilancia') && (
        <div className="flex flex-col gap-4 w-full">
          
          {/* Search & Filter Controls */}
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
            <div className="relative w-full sm:flex-1">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-text/40" />
              <input
                type="text"
                placeholder="Buscar por apto, nombre, placa..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-primary-light/50 border border-border rounded-full pl-11 pr-4 py-3 text-xs text-text focus:outline-none focus:border-accent/40"
              />
            </div>

            <select
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value)}
              className="w-full sm:w-auto bg-primary-light/50 border border-border rounded-full px-4 py-3 text-xs text-text focus:outline-none focus:border-accent/40 shrink-0"
            >
              <option value="TODOS">Todos los Estados</option>
              <option value="PENDIENTE_PAZ_Y_SALVO">Pendientes de Paz y Salvo</option>
              <option value="APROBADO">Aprobados con Paz y Salvo</option>
              <option value="EN_PROCESO">En Proceso (Portería)</option>
              <option value="FINALIZADO">Finalizados</option>
              <option value="RECHAZADO">Rechazados</option>
            </select>
          </div>

          {/* Empty State */}
          {!loading && filteredMudanzas.length === 0 && (
            <div className="text-center py-12 liquid-glass border border-border rounded-[28px] p-6 space-y-3 w-full">
              <Truck className="w-10 h-10 text-text/30 mx-auto" />
              <h3 className="text-sm font-bold text-text">No se encontraron solicitudes de mudanza</h3>
              <p className="text-xs text-text/60 max-w-xs mx-auto">
                No hay mudanzas registradas bajo este criterio.
              </p>
            </div>
          )}

          {/* Cards List (Full Width Stack) */}
          <div className="flex flex-col gap-4 w-full">
            {filteredMudanzas.map((m) => (
              <div
                key={m.id}
                className="liquid-glass-card rounded-[28px] p-4 sm:p-6 border border-border hover:border-accent/30 transition-all shadow-xl flex flex-col gap-4 w-full overflow-hidden relative"
              >
                {/* 1. Status Badges Bar (Floats inside top-left, never overlaps card boundary) */}
                <div className="flex flex-wrap items-center gap-1.5 w-full">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                      m.tipo === 'ENTRANTE' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    Mudanza {m.tipo}
                  </span>

                  {m.estado === 'PENDIENTE_PAZ_Y_SALVO' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[9px] font-bold uppercase">
                      <Clock size={12} />
                      En Revisión Paz y Salvo
                    </span>
                  )}

                  {m.estado === 'APROBADO' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#57bf00]/15 text-[#57bf00] border border-[#57bf00]/30 text-[9px] font-black uppercase">
                      <CheckCircle2 size={12} />
                      Paz y Salvo Aprobado
                    </span>
                  )}

                  {m.estado === 'RECHAZADO' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 text-[9px] font-bold uppercase">
                      <XCircle size={12} />
                      Rechazado
                    </span>
                  )}

                  {m.estado === 'EN_PROCESO' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[9px] font-bold uppercase animate-pulse">
                      <Truck size={12} />
                      En Proceso (Portería)
                    </span>
                  )}

                  {m.estado === 'FINALIZADO' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-text/10 text-text/60 border border-border text-[9px] font-bold uppercase">
                      <Check size={12} />
                      Finalizada
                    </span>
                  )}
                </div>

                {/* 2. Unit & Resident Info Row */}
                <div className="flex items-center gap-3 pt-1 border-t border-border/40 w-full">
                  <div className="w-10 h-10 rounded-2xl bg-[#57bf00]/15 flex items-center justify-center text-[#57bf00] shrink-0">
                    <Building2 size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-text truncate">
                      Torre {m.torre || user?.torre || 'A'} &middot; Apto {m.apto || user?.apto || 'N/A'}
                    </h3>
                    <p className="text-xs text-text/70 truncate flex items-center gap-1 mt-0.5">
                      <User size={12} className="text-accent shrink-0" />
                      <span className="truncate">{m.usuario_nombre || 'Residente'} ({m.usuario_email || 'Sin correo'})</span>
                    </p>
                  </div>
                </div>

                {/* 3. Schedule & Details Unified Box */}
                <div className="p-3.5 rounded-2xl bg-primary-light/40 border border-border flex flex-col gap-2.5 text-xs w-full">
                  <div className="flex flex-wrap items-center justify-between gap-1.5 pb-2 border-b border-border/50">
                    <span className="flex items-center gap-1.5 font-bold text-text/70 shrink-0">
                      <Calendar size={14} className="text-[#57bf00]" />
                      Fecha Programada:
                    </span>
                    <span className="font-bold text-text text-right">
                      {new Date(m.fecha_mudanza + 'T00:00:00').toLocaleDateString('es-CO', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="flex items-center gap-1.5 font-bold text-text/70 shrink-0">
                      <Clock size={14} className="text-[#57bf00]" />
                      Horario Permiso:
                    </span>
                    <span className="font-black text-[#57bf00] text-right">
                      {m.hora_inicio} - {m.hora_fin}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-border/50">
                    <span className="flex items-center gap-1.5 font-bold text-text/70 shrink-0">
                      <Truck size={14} className="text-blue-400" />
                      Vehículo / Camión:
                    </span>
                    <span className="font-bold text-text text-right">
                      {m.tiene_vehiculo ? (
                        <span>{m.vehiculo_tipo || 'Camión'} {m.vehiculo_placa ? `(${m.vehiculo_placa})` : ''}</span>
                      ) : (
                        <span className="text-text/50 italic">Sin vehículo</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* 4. Code Paz y Salvo Banner */}
                {m.paz_y_salvo_codigo && (
                  <div className="p-3 rounded-2xl bg-[#57bf00]/10 border border-[#57bf00]/30 flex items-center justify-between text-xs w-full">
                    <span className="text-text/80 font-bold flex items-center gap-2">
                      <ShieldCheck size={16} className="text-[#57bf00]" />
                      Código Paz y Salvo ConjuntOS®:
                    </span>
                    <span className="font-black text-[#57bf00] font-mono text-sm tracking-wider">{m.paz_y_salvo_codigo}</span>
                  </div>
                )}

                {/* 5. Rejection Motivo */}
                {m.motivo_rechazo && (
                  <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 w-full">
                    <strong>Motivo de rechazo:</strong> {m.motivo_rechazo}
                  </div>
                )}

                {/* 6. Card Action Buttons */}
                <div className="pt-2 flex flex-col sm:flex-row items-center gap-2 w-full">
                  
                  {/* View Certificate */}
                  {(m.estado === 'APROBADO' || m.estado === 'EN_PROCESO' || m.estado === 'FINALIZADO') && (
                    <button
                      onClick={() => setSelectedMudanza(m)}
                      className="w-full py-3 rounded-2xl bg-[#57bf00]/20 hover:bg-[#57bf00]/30 text-[#57bf00] border border-[#57bf00]/40 font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 uppercase tracking-wider"
                    >
                      <ShieldCheck size={16} />
                      Ver Certificado de Paz y Salvo ConjuntOS®
                    </button>
                  )}

                  {/* Admin Approval / Rejection */}
                  {isStaff && m.estado === 'PENDIENTE_PAZ_Y_SALVO' && (
                    <div className="grid grid-cols-2 gap-2 w-full">
                      <button
                        onClick={() => handleAprobar(m.id)}
                        className="py-3 rounded-2xl bg-[#57bf00] hover:bg-[#46a000] text-white font-black text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-[#57bf00]/20 uppercase tracking-wider"
                      >
                        <Check size={16} />
                        Aprobar Paz y Salvo
                      </button>
                      <button
                        onClick={() => setRejectingId(m.id)}
                        className="py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs flex items-center justify-center gap-1.5 transition-all uppercase tracking-wider"
                      >
                        <Ban size={16} />
                        Rechazar Solicitud
                      </button>
                    </div>
                  )}

                  {/* Vigilancia Operations */}
                  {(isVigilancia || isStaff) && (m.estado === 'APROBADO' || m.estado === 'EN_PROCESO') && (
                    <div className="w-full flex items-center gap-2">
                      {m.estado === 'APROBADO' && (
                        <button
                          onClick={() => handleUpdateEstado(m.id, 'EN_PROCESO')}
                          className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all uppercase tracking-wider"
                        >
                          <Truck size={16} />
                          Marcar Ingreso Mudanza
                        </button>
                      )}
                      {m.estado === 'EN_PROCESO' && (
                        <button
                          onClick={() => handleUpdateEstado(m.id, 'FINALIZADO')}
                          className="w-full py-3 rounded-2xl bg-primary-light hover:bg-primary-light/80 text-emerald-400 font-bold text-xs flex items-center justify-center gap-2 transition-all border border-emerald-500/30 uppercase tracking-wider"
                        >
                          <CheckCircle2 size={16} className="text-[#57bf00]" />
                          Marcar Mudanza Finalizada
                        </button>
                      )}
                    </div>
                  )}

                </div>

              </div>
            ))}
          </div>

        </div>
      )}

      {/* Modal Rejection Form */}
      {rejectingId && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md bg-primary border border-border rounded-[32px] p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-text flex items-center gap-2">
              <Ban size={20} className="text-rose-500" />
              Rechazar Solicitud de Mudanza
            </h3>
            <p className="text-xs text-text/60">
              Ingresa el motivo del rechazo para notificar al residente (ej. saldos pendientes de cuota de administración).
            </p>
            <form onSubmit={handleRechazarSubmit} className="space-y-4">
              <textarea
                required
                rows={3}
                value={motivoRechazo}
                onChange={(e) => setMotivoRechazo(e.target.value)}
                placeholder="Motivo del rechazo..."
                className="w-full bg-primary-light/50 border border-border rounded-[20px] p-4 text-xs text-text focus:outline-none focus:border-rose-500"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectingId(null)}
                  className="px-4 py-2 rounded-full bg-primary-light text-text/80 text-xs font-bold hover:bg-primary-light/80"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-full bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 uppercase tracking-wider"
                >
                  Confirmar Rechazo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Paz y Salvo Certificate */}
      {selectedMudanza && (
        <PazYSalvoModal
          mudanza={selectedMudanza}
          onClose={() => setSelectedMudanza(null)}
        />
      )}

    </div>
  );
}
