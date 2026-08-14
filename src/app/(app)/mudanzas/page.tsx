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
  AlertTriangle,
  FileText,
  User,
  Building2,
  Search,
  Filter,
  Check,
  Ban,
  ArrowRight,
  Sparkles,
  DollarSign
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api/client';
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
      setActiveTab('solicitar');
    }
  }, [user?.rol, isStaff, isVigilancia]);

  const loadMudanzas = async () => {
    try {
      setLoading(true);
      const res = await api.get<MudanzaItem[]>('/api/v1/mudanzas');
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
        await api.post('/api/v1/mudanzas', {
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
      await api.put(`/api/v1/mudanzas/${id}/aprobar`, {});
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
      await api.put(`/api/v1/mudanzas/${rejectingId}/rechazar`, {
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
      await api.put(`/api/v1/mudanzas/${id}/estado`, {
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
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8 space-y-8">
      
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-[#57bf00]/10 border border-slate-800 p-6 sm:p-8 shadow-2xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#57bf00]/10 border border-[#57bf00]/20 text-[#57bf00] text-xs font-black tracking-wider uppercase">
              <ShieldCheck className="w-4 h-4" />
              Módulo Oficial de Trasteos & Paz y Salvo
            </div>
            <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              Solicitud de Mudanza & Paz y Salvo <span className="text-[#57bf00]">ConjuntOS®</span>
            </h1>
            <p className="text-sm text-slate-400 max-w-2xl">
              Gestión centralizada de mudanzas entrantes y salientes. Autorización de paz y salvo en tiempo real comunicada directamente a portería y vigilantes de estacionamientos.
            </p>
          </div>

          {!isStaff && !isVigilancia && (
            <button
              onClick={() => setActiveTab('solicitar')}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-[#57bf00] hover:bg-[#46a000] text-white font-extrabold text-sm transition shadow-lg shadow-[#57bf00]/25 hover:scale-[1.02]"
            >
              <Plus className="w-5 h-5" />
              Solicitar Mudanza
            </button>
          )}
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-4">
        {!isStaff && !isVigilancia && (
          <button
            onClick={() => setActiveTab('solicitar')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition ${
              activeTab === 'solicitar'
                ? 'bg-[#57bf00] text-white shadow-lg shadow-[#57bf00]/20'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Plus className="w-4 h-4" />
            Nueva Solicitud
          </button>
        )}

        {!isStaff && !isVigilancia && (
          <button
            onClick={() => setActiveTab('mis_solicitudes')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition ${
              activeTab === 'mis_solicitudes'
                ? 'bg-[#57bf00] text-white shadow-lg shadow-[#57bf00]/20'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            Mis Solicitudes ({mudanzas.length})
          </button>
        )}

        {isStaff && (
          <button
            onClick={() => setActiveTab('gestion_admin')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition ${
              activeTab === 'gestion_admin'
                ? 'bg-[#57bf00] text-white shadow-lg shadow-[#57bf00]/20'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Gestión de Paz y Salvo (Administración)
          </button>
        )}

        {(isVigilancia || isStaff) && (
          <button
            onClick={() => setActiveTab('vigilancia')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition ${
              activeTab === 'vigilancia'
                ? 'bg-[#57bf00] text-white shadow-lg shadow-[#57bf00]/20'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Truck className="w-4 h-4" />
            Programación Portería & Estacionamientos ({filteredMudanzas.length})
          </button>
        )}
      </div>

      {/* Tab Content 1: Formulario Solicitar Mudanza */}
      {activeTab === 'solicitar' && (
        <form onSubmit={handleCrearMudanza} className="max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
          <div className="border-b border-slate-800 pb-4">
            <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
              <Truck className="w-5 h-5 text-[#57bf00]" />
              Formulario de Solicitud de Mudanza
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Diligencia los datos del trasteo. La Administración verificará tu paz y salvo de expensas para expedir el certificado oficial de <strong className="text-[#57bf00]">ConjuntOS®</strong>.
            </p>
          </div>

          {/* Tipo de Mudanza */}
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setTipo('ENTRANTE')}
              className={`p-4 rounded-2xl border text-center font-bold text-sm transition ${
                tipo === 'ENTRANTE'
                  ? 'border-[#57bf00] bg-[#57bf00]/10 text-white shadow-md'
                  : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:bg-slate-800'
              }`}
            >
              📥 Mudanza Entrante (Llegada)
            </button>
            <button
              type="button"
              onClick={() => setTipo('SALIENTE')}
              className={`p-4 rounded-2xl border text-center font-bold text-sm transition ${
                tipo === 'SALIENTE'
                  ? 'border-[#57bf00] bg-[#57bf00]/10 text-white shadow-md'
                  : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:bg-slate-800'
              }`}
            >
              📤 Mudanza Saliente (Salida)
            </button>
          </div>

          {/* Date and Time Windows */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-2">Fecha Programada *</label>
              <input
                type="date"
                required
                value={fechaMudanza}
                onChange={(e) => setFechaMudanza(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-medium text-white focus:outline-none focus:border-[#57bf00]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-2">Hora de Inicio Permiso *</label>
              <input
                type="text"
                required
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
                placeholder="ej. 08:00 AM"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-medium text-white focus:outline-none focus:border-[#57bf00]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-2">Hora de Finalización *</label>
              <input
                type="text"
                required
                value={horaFin}
                onChange={(e) => setHoraFin(e.target.value)}
                placeholder="ej. 02:00 PM"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-medium text-white focus:outline-none focus:border-[#57bf00]"
              />
            </div>
          </div>

          {/* Vehicle Checkbox */}
          <div className="flex items-center gap-3 p-4 bg-slate-950/60 border border-slate-800 rounded-2xl">
            <input
              type="checkbox"
              id="tiene_vehiculo"
              checked={tieneVehiculo}
              onChange={(e) => setTieneVehiculo(e.target.checked)}
              className="w-5 h-5 accent-[#57bf00] rounded cursor-pointer"
            />
            <label htmlFor="tiene_vehiculo" className="text-sm font-bold text-slate-200 cursor-pointer">
              ¿Ingresará vehículo o camión de trasteo a la coprocedimiento / parqueaderos?
            </label>
          </div>

          {/* Vehicle Fields */}
          {tieneVehiculo && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-950/40 border border-slate-800/80 rounded-2xl">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-2">Placa del Vehículo / Camión</label>
                <input
                  type="text"
                  value={vehiculoPlaca}
                  onChange={(e) => setVehiculoPlaca(e.target.value)}
                  placeholder="ej. ABC-123"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm uppercase font-mono text-white focus:outline-none focus:border-[#57bf00]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-2">Tipo de Vehículo</label>
                <input
                  type="text"
                  value={vehiculoTipo}
                  onChange={(e) => setVehiculoTipo(e.target.value)}
                  placeholder="Camión Furgón / Camioneta"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#57bf00]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-2">Nombre del Conductor</label>
                <input
                  type="text"
                  value={conductorNombre}
                  onChange={(e) => setConductorNombre(e.target.value)}
                  placeholder="Nombre completo"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#57bf00]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-2">Cédula del Conductor</label>
                <input
                  type="text"
                  value={conductorDocumento}
                  onChange={(e) => setConductorDocumento(e.target.value)}
                  placeholder="Documento de identidad"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#57bf00]"
                />
              </div>
            </div>
          )}

          {/* Observaciones */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase mb-2">Observaciones Aclaratorias</label>
            <textarea
              rows={3}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Indica cualquier detalle adicional sobre ascensores, depósito o cajas..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-white focus:outline-none focus:border-[#57bf00]"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-4 rounded-2xl bg-[#57bf00] hover:bg-[#46a000] text-white font-black text-sm uppercase tracking-wider transition shadow-xl shadow-[#57bf00]/25 disabled:opacity-50"
          >
            {isPending ? 'Enviando Solicitud...' : 'Enviar Solicitud a la Administración'}
          </button>
        </form>
      )}

      {/* Tab Content 2 & 3: List / Grid of Mudanzas */}
      {(activeTab === 'mis_solicitudes' || activeTab === 'gestion_admin' || activeTab === 'vigilancia') && (
        <div className="space-y-6">
          
          {/* Search Bar */}
          <div className="flex flex-col sm:flex-row items-center gap-4 justify-between bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por apto, nombre, placa o código..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white focus:outline-none focus:border-[#57bf00]"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={filterEstado}
                onChange={(e) => setFilterEstado(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#57bf00]"
              >
                <option value="TODOS">Todos los Estados</option>
                <option value="PENDIENTE_PAZ_Y_SALVO">Pendientes de Paz y Salvo</option>
                <option value="APROBADO">Aprobados con Paz y Salvo</option>
                <option value="EN_PROCESO">En Proceso (Portería)</option>
                <option value="FINALIZADO">Finalizados</option>
                <option value="RECHAZADO">Rechazados</option>
              </select>
            </div>
          </div>

          {/* Empty State */}
          {!loading && filteredMudanzas.length === 0 && (
            <div className="text-center py-16 bg-slate-900/60 border border-slate-800 rounded-3xl p-8 space-y-4">
              <Truck className="w-12 h-12 text-slate-600 mx-auto" />
              <h3 className="text-lg font-bold text-white">No se encontraron solicitudes de mudanza</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                No hay mudanzas registradas bajo este criterio de búsqueda.
              </p>
            </div>
          )}

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredMudanzas.map((m) => (
              <div
                key={m.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-3xl p-6 space-y-5 transition shadow-xl flex flex-col justify-between"
              >
                <div className="space-y-4">
                  
                  {/* Top Status Badge */}
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                        m.tipo === 'ENTRANTE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                      }`}
                    >
                      Mudanza {m.tipo}
                    </span>

                    {m.estado === 'APROBADO' && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#57bf00]/15 text-[#57bf00] border border-[#57bf00]/30 text-xs font-extrabold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Paz y Salvo Aprobado
                      </span>
                    )}

                    {m.estado === 'PENDIENTE_PAZ_Y_SALVO' && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 text-xs font-bold">
                        <Clock className="w-3.5 h-3.5" />
                        En Revisión Paz y Salvo
                      </span>
                    )}

                    {m.estado === 'RECHAZADO' && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 text-xs font-bold">
                        <XCircle className="w-3.5 h-3.5" />
                        Rechazado
                      </span>
                    )}

                    {m.estado === 'EN_PROCESO' && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-bold animate-pulse">
                        <Truck className="w-3.5 h-3.5" />
                        En Proceso (Portería)
                      </span>
                    )}

                    {m.estado === 'FINALIZADO' && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-xs font-bold">
                        <Check className="w-3.5 h-3.5" />
                        Finalizada
                      </span>
                    )}
                  </div>

                  {/* Title & Resident Info */}
                  <div>
                    <div className="text-lg font-black text-white flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-[#57bf00]" />
                      Torre {m.torre || 'N/A'} - Apto {m.apto || 'N/A'}
                    </div>
                    <p className="text-xs text-slate-300 font-medium mt-1">
                      {m.usuario_nombre || 'Residente'} ({m.usuario_email || 'Sin correo'})
                    </p>
                  </div>

                  {/* Schedule Info */}
                  <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-300 font-bold">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-[#57bf00]" />
                        Fecha:
                      </span>
                      <span className="text-white">
                        {new Date(m.fecha_mudanza + 'T00:00:00').toLocaleDateString('es-CO', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-300 font-bold">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-[#57bf00]" />
                        Permiso Horario:
                      </span>
                      <span className="text-emerald-400 font-extrabold">
                        {m.hora_inicio} - {m.hora_fin}
                      </span>
                    </div>

                    {m.tiene_vehiculo && (
                      <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-slate-300">
                        <span className="flex items-center gap-1.5">
                          <Truck className="w-4 h-4 text-blue-400" />
                          Placa Camión:
                        </span>
                        <span className="font-mono font-extrabold text-white px-2 py-0.5 rounded bg-slate-800">
                          {m.vehiculo_placa || 'Registrado'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Code Paz y Salvo */}
                  {m.paz_y_salvo_codigo && (
                    <div className="p-3 rounded-xl bg-[#57bf00]/10 border border-[#57bf00]/30 flex items-center justify-between text-xs">
                      <span className="text-slate-300 font-bold">Código Paz y Salvo:</span>
                      <span className="font-black text-[#57bf00] font-mono">{m.paz_y_salvo_codigo}</span>
                    </div>
                  )}

                  {/* Rejection Motivo */}
                  {m.motivo_rechazo && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
                      <strong>Motivo de rechazo:</strong> {m.motivo_rechazo}
                    </div>
                  )}

                </div>

                {/* Card Actions */}
                <div className="pt-4 border-t border-slate-800 space-y-2">
                  
                  {/* View / Print Certificate Button */}
                  {m.estado === 'APROBADO' || m.estado === 'EN_PROCESO' || m.estado === 'FINALIZADO' ? (
                    <button
                      onClick={() => setSelectedMudanza(m)}
                      className="w-full py-2.5 rounded-xl bg-[#57bf00]/20 hover:bg-[#57bf00]/30 text-[#57bf00] border border-[#57bf00]/40 font-bold text-xs flex items-center justify-center gap-2 transition"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      Ver Certificado de Paz y Salvo ConjuntOS®
                    </button>
                  ) : null}

                  {/* Admin Actions */}
                  {isStaff && m.estado === 'PENDIENTE_PAZ_Y_SALVO' && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleAprobar(m.id)}
                        className="py-2.5 rounded-xl bg-[#57bf00] hover:bg-[#46a000] text-white font-extrabold text-xs flex items-center justify-center gap-1 transition shadow-md shadow-[#57bf00]/20"
                      >
                        <Check className="w-4 h-4" />
                        Aprobar Paz y Salvo
                      </button>
                      <button
                        onClick={() => setRejectingId(m.id)}
                        className="py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs flex items-center justify-center gap-1 transition"
                      >
                        <Ban className="w-4 h-4" />
                        Rechazar
                      </button>
                    </div>
                  )}

                  {/* Vigilancia Operations */}
                  {(isVigilancia || isStaff) && (m.estado === 'APROBADO' || m.estado === 'EN_PROCESO') && (
                    <div className="pt-2 flex items-center gap-2">
                      {m.estado === 'APROBADO' && (
                        <button
                          onClick={() => handleUpdateEstado(m.id, 'EN_PROCESO')}
                          className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition"
                        >
                          <Truck className="w-4 h-4" />
                          Marcar Ingreso Mudanza
                        </button>
                      )}
                      {m.estado === 'EN_PROCESO' && (
                        <button
                          onClick={() => handleUpdateEstado(m.id, 'FINALIZADO')}
                          className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 font-bold text-xs flex items-center justify-center gap-1.5 transition border border-emerald-500/30"
                        >
                          <CheckCircle2 className="w-4 h-4 text-[#57bf00]" />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Ban className="w-5 h-5 text-rose-500" />
              Rechazar Solicitud de Mudanza
            </h3>
            <p className="text-xs text-slate-400">
              Ingresa el motivo del rechazo para notificar al residente (ej. saldos pendientes de cuota de administración).
            </p>
            <form onSubmit={handleRechazarSubmit} className="space-y-4">
              <textarea
                required
                rows={3}
                value={motivoRechazo}
                onChange={(e) => setMotivoRechazo(e.target.value)}
                placeholder="Motivo del rechazo..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-rose-500"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectingId(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700"
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
