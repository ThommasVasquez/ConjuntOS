'use client';

import React, { useEffect, useState } from 'react';
import {
  Users,
  Calendar,
  Clock,
  MapPin,
  Video,
  Globe,
  Plus,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  Building2,
  RefreshCw,
  X,
  MessageSquare,
  Check,
  Ban,
  Shield,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api/client';
import ProfileHeader from '@/components/shell/ProfileHeader';

export interface AsistenciaItem {
  usuario_id: string;
  usuario_nombre: string;
  confirmacion: 'CONFIRMADO_PRESENCIAL' | 'CONFIRMADO_VIRTUAL' | 'EXCUSA_INASISTENCIA' | 'PENDIENTE';
  motivo_excusa?: string;
  asistio_real?: boolean;
  updated_at?: string;
}

export interface ReunionConcejoItem {
  id: string;
  conjunto_id: string;
  creado_por: string;
  creado_por_nombre?: string;
  titulo: String;
  descripcion?: string;
  modalidad: 'PRESENCIAL' | 'VIRTUAL' | 'HIBRIDA';
  lugar?: string;
  link_videollamada?: string;
  fecha_reunion: string;
  orden_dia: string[];
  estado: 'CONVOCADA' | 'EN_CURSO' | 'FINALIZADA' | 'CANCELADA';
  asistencias: AsistenciaItem[];
  acta_resumen?: string;
  created_at: string;
  updated_at: string;
}

export default function ReunionesConcejoPage() {
  const { user, loading: authLoading } = useAuth();
  const role = user?.rol;

  const [reuniones, setReuniones] = useState<ReunionConcejoItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State for Summoning New Meeting (Admin only)
  const [showModalCrear, setShowModalCrear] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [modalidad, setModalidad] = useState<'PRESENCIAL' | 'VIRTUAL' | 'HIBRIDA'>('PRESENCIAL');
  const [lugar, setLugar] = useState('');
  const [linkVideollamada, setLinkVideollamada] = useState('');
  const [fechaReunion, setFechaReunion] = useState('');
  const [ordenDiaText, setOrdenDiaText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Modal Excusa State
  const [excusaReunionId, setExcusaReunionId] = useState<string | null>(null);
  const [motivoExcusaText, setMotivoExcusaText] = useState('');

  const isStaff = role === 'ADMINISTRADOR' || role === 'SUPER_ADMIN';
  const isConcejo = role === 'CONCEJO';
  const isAllowed = isStaff || isConcejo;

  const loadReuniones = async () => {
    try {
      setLoading(true);
      const res = await api.get<ReunionConcejoItem[]>('/reuniones-concejo');
      setReuniones(res);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Error al cargar citaciones de concejo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user || !isAllowed) {
      toast.error('Acceso exclusivo para el Administrador y miembros del Concejo.');
      return;
    }
    loadReuniones();
  }, [user, authLoading, isAllowed]);

  const handleCrearReunion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || !fechaReunion) {
      toast.error('Indica el título y la fecha/hora de la reunión');
      return;
    }

    setSubmitting(true);
    try {
      const itemsOrdenDia = ordenDiaText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      await api.post('/reuniones-concejo', {
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || undefined,
        modalidad,
        lugar: modalidad !== 'VIRTUAL' ? lugar.trim() || undefined : undefined,
        link_videollamada: modalidad !== 'PRESENCIAL' ? linkVideollamada.trim() || undefined : undefined,
        fecha_reunion: new Date(fechaReunion).toISOString(),
        orden_dia: itemsOrdenDia,
      });

      toast.success('Citación de concejo emitida y notificada exitosamente');
      setShowModalCrear(false);
      setTitulo('');
      setDescripcion('');
      setLugar('');
      setLinkVideollamada('');
      setFechaReunion('');
      setOrdenDiaText('');
      loadReuniones();
    } catch (err: any) {
      toast.error(err?.message || 'Error al emitir la citación');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmarAsistencia = async (
    reunionId: string,
    confirmacion: 'CONFIRMADO_PRESENCIAL' | 'CONFIRMADO_VIRTUAL' | 'EXCUSA_INASISTENCIA',
    motivo_excusa?: string
  ) => {
    try {
      await api.put(`/reuniones-concejo/${reunionId}/asistencia`, {
        confirmacion,
        motivo_excusa,
      });
      toast.success('Respuesta de asistencia registrada exitosamente');
      if (excusaReunionId) {
        setExcusaReunionId(null);
        setMotivoExcusaText('');
      }
      loadReuniones();
    } catch (err: any) {
      toast.error(err?.message || 'Error al registrar respuesta');
    }
  };

  if (authLoading || (!isAllowed && user)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
        <Shield className="w-12 h-12 text-[#57bf00] animate-pulse mb-3" />
        <p className="text-sm font-bold text-text">Verificando credenciales de Concejo & Administración...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 pt-16 pb-32 min-h-screen w-full max-w-full overflow-x-hidden relative">
      <ProfileHeader />

      {/* HEADER BAR */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-display font-medium text-text tracking-wide">
              Citador y Reuniones de Concejo
            </h1>
            <span className="text-[#57bf00] text-[10px] font-black uppercase tracking-widest bg-[#57bf00]/15 px-2 py-0.5 rounded-full border border-[#57bf00]/30">
              ConjuntOS®
            </span>
          </div>
          <p className="text-xs text-text/70 mt-1">
            Convocatorias exclusivas para la Administración y el Concejo de Administración
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadReuniones}
            className="p-2.5 rounded-2xl liquid-glass border border-border text-text hover:bg-surface-2 transition-all active:scale-95"
            title="Recargar citaciones"
          >
            <RefreshCw size={18} />
          </button>
          {isStaff && (
            <button
              onClick={() => setShowModalCrear(true)}
              className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#57bf00] text-black font-bold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-[#57bf00]/20"
            >
              <Plus size={16} />
              Convocar Reunión
            </button>
          )}
        </div>
      </div>

      {/* LISTADO DE REUNIONES */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-[#57bf00] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : reuniones.length === 0 ? (
        <div className="liquid-glass rounded-[32px] p-8 border border-border text-center flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-[#57bf00]/15 border border-[#57bf00]/30 flex items-center justify-center text-[#57bf00]">
            <Building2 size={28} />
          </div>
          <h3 className="text-base font-bold text-text">No hay citaciones de concejo programadas</h3>
          <p className="text-xs text-text/60 max-w-md">
            Las convocatorias emitidas por la administración aparecerán aquí de forma automática.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5 w-full">
          {reuniones.map((r) => {
            const fechaObj = new Date(r.fecha_reunion);
            const myAssistance = r.asistencias.find((a) => a.usuario_id === user?.id);

            const presenciales = r.asistencias.filter((a) => a.confirmacion === 'CONFIRMADO_PRESENCIAL').length;
            const virtuales = r.asistencias.filter((a) => a.confirmacion === 'CONFIRMADO_VIRTUAL').length;
            const excusados = r.asistencias.filter((a) => a.confirmacion === 'EXCUSA_INASISTENCIA').length;

            return (
              <div
                key={r.id}
                className="liquid-glass-card rounded-[28px] p-5 sm:p-6 border border-border flex flex-col gap-4 shadow-xl"
              >
                {/* Top Badges */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
                  <div className="flex items-center gap-2">
                    {r.modalidad === 'PRESENCIAL' && (
                      <span className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-[10px] font-black uppercase px-3 py-1 rounded-full flex items-center gap-1">
                        <MapPin size={12} /> Presencial
                      </span>
                    )}
                    {r.modalidad === 'VIRTUAL' && (
                      <span className="bg-blue-500/15 border border-blue-500/40 text-blue-400 text-[10px] font-black uppercase px-3 py-1 rounded-full flex items-center gap-1">
                        <Video size={12} /> Virtual
                      </span>
                    )}
                    {r.modalidad === 'HIBRIDA' && (
                      <span className="bg-purple-500/15 border border-purple-500/40 text-purple-400 text-[10px] font-black uppercase px-3 py-1 rounded-full flex items-center gap-1">
                        <Globe size={12} /> Híbrida (Presencial + Virtual)
                      </span>
                    )}
                  </div>

                  <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-surface-2 border border-border text-text">
                    {r.estado}
                  </span>
                </div>

                {/* Title and Date */}
                <div>
                  <h3 className="text-base font-bold text-text">{r.titulo}</h3>
                  {r.descripcion && <p className="text-xs text-text/70 mt-1">{r.descripcion}</p>}
                </div>

                {/* Info Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-surface-2/40 rounded-2xl p-3.5 border border-border/30 text-xs">
                  <div className="flex items-center gap-2 text-text">
                    <Calendar size={16} className="text-[#57bf00] shrink-0" />
                    <span>
                      <strong className="text-text">Fecha:</strong> {fechaObj.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-text">
                    <Clock size={16} className="text-[#57bf00] shrink-0" />
                    <span>
                      <strong className="text-text">Hora:</strong> {fechaObj.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {r.lugar && (
                    <div className="flex items-center gap-2 text-text sm:col-span-2">
                      <MapPin size={16} className="text-emerald-400 shrink-0" />
                      <span>
                        <strong className="text-text">Lugar Físico:</strong> {r.lugar}
                      </span>
                    </div>
                  )}

                  {r.link_videollamada && (
                    <div className="flex items-center gap-2 text-text sm:col-span-2">
                      <Video size={16} className="text-blue-400 shrink-0" />
                      <span className="truncate">
                        <strong className="text-text">Videollamada:</strong>{' '}
                        <a
                          href={r.link_videollamada}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-400 font-bold underline hover:text-blue-300"
                        >
                          Unirse a la Sesión Virtual
                        </a>
                      </span>
                    </div>
                  )}
                </div>

                {/* Orden del Día */}
                {r.orden_dia && r.orden_dia.length > 0 && (
                  <div className="flex flex-col gap-2 bg-primary-light/20 p-4 rounded-2xl border border-border/30">
                    <h4 className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-1.5">
                      <FileText size={14} className="text-[#57bf00]" /> Orden del Día / Puntos a Tratar
                    </h4>
                    <ul className="flex flex-col gap-1.5 pl-2 text-xs text-text/80">
                      {r.orden_dia.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-[#57bf00] font-bold shrink-0">{idx + 1}.</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Breakdown Summary */}
                <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-text/70 pt-1 border-t border-border/30">
                  <span>
                    👥 <strong className="text-text">Confirmados Presenciales:</strong> {presenciales}
                  </span>
                  <span>
                    📹 <strong className="text-text">Confirmados Virtuales:</strong> {virtuales}
                  </span>
                  <span>
                    📝 <strong className="text-text">Excusas:</strong> {excusados}
                  </span>
                </div>

                {/* User Response Box (Only for Council members & staff) */}
                <div className="bg-surface-2 rounded-2xl p-4 border border-border/40 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-text uppercase tracking-wider">
                      Tu Confirmación de Asistencia
                    </span>
                    {myAssistance && (
                      <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-[#57bf00]/20 text-[#57bf00]">
                        {myAssistance.confirmacion.replace('_', ' ')}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {(r.modalidad === 'PRESENCIAL' || r.modalidad === 'HIBRIDA') && (
                      <button
                        onClick={() => handleConfirmarAsistencia(r.id, 'CONFIRMADO_PRESENCIAL')}
                        className={`flex-1 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all active:scale-95 ${
                          myAssistance?.confirmacion === 'CONFIRMADO_PRESENCIAL'
                            ? 'bg-[#57bf00] text-black border-[#57bf00]'
                            : 'bg-primary-light/40 border-border text-text hover:bg-primary-light/60'
                        }`}
                      >
                        📍 Asistiré Presencial
                      </button>
                    )}

                    {(r.modalidad === 'VIRTUAL' || r.modalidad === 'HIBRIDA') && (
                      <button
                        onClick={() => handleConfirmarAsistencia(r.id, 'CONFIRMADO_VIRTUAL')}
                        className={`flex-1 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all active:scale-95 ${
                          myAssistance?.confirmacion === 'CONFIRMADO_VIRTUAL'
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'bg-primary-light/40 border-border text-text hover:bg-primary-light/60'
                        }`}
                      >
                        📹 Asistiré Virtual
                      </button>
                    )}

                    <button
                      onClick={() => setExcusaReunionId(r.id)}
                      className={`flex-1 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all active:scale-95 ${
                        myAssistance?.confirmacion === 'EXCUSA_INASISTENCIA'
                          ? 'bg-amber-500 text-black border-amber-500'
                          : 'bg-primary-light/40 border-border text-text hover:bg-primary-light/60'
                      }`}
                    >
                      📝 Presentar Excusa
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL CREAR CONVOCATORIA (ADMIN ONLY) */}
      {showModalCrear && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-xl liquid-glass rounded-[32px] p-6 border border-border flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-text flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#57bf00]" />
                Convocar Reunión de Concejo
              </h3>
              <button
                onClick={() => setShowModalCrear(false)}
                className="w-8 h-8 rounded-full bg-text/5 flex items-center justify-center text-text hover:bg-text/10"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCrearReunion} className="flex flex-col gap-4 text-xs">
              <div className="flex flex-col gap-1.5">
                <label className="font-bold text-text uppercase tracking-wider">Título de la Convocatoria *</label>
                <input
                  type="text"
                  required
                  placeholder="ej. Reunión Ordinaria de Concejo - Cierre Presupuestal Q3"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  className="w-full bg-primary-light/40 border border-border rounded-2xl p-3 text-text focus:outline-none focus:border-[#57bf00]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-bold text-text uppercase tracking-wider">Modalidad de la Reunión *</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setModalidad('PRESENCIAL')}
                    className={`p-3 rounded-2xl border font-bold uppercase tracking-wider text-[11px] ${
                      modalidad === 'PRESENCIAL' ? 'bg-[#57bf00]/20 border-[#57bf00] text-[#57bf00]' : 'border-border text-text/60'
                    }`}
                  >
                    📍 Presencial
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalidad('VIRTUAL')}
                    className={`p-3 rounded-2xl border font-bold uppercase tracking-wider text-[11px] ${
                      modalidad === 'VIRTUAL' ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'border-border text-text/60'
                    }`}
                  >
                    📹 Virtual
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalidad('HIBRIDA')}
                    className={`p-3 rounded-2xl border font-bold uppercase tracking-wider text-[11px] ${
                      modalidad === 'HIBRIDA' ? 'bg-purple-500/20 border-purple-500 text-purple-400' : 'border-border text-text/60'
                    }`}
                  >
                    🌐 Híbrida
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="font-bold text-text uppercase tracking-wider">Fecha y Hora Programada *</label>
                  <input
                    type="datetime-local"
                    required
                    value={fechaReunion}
                    onChange={(e) => setFechaReunion(e.target.value)}
                    className="w-full bg-primary-light/40 border border-border rounded-2xl p-3 text-text focus:outline-none focus:border-[#57bf00]"
                  />
                </div>

                {modalidad !== 'VIRTUAL' && (
                  <div className="flex flex-col gap-1.5">
                    <label className="font-bold text-text uppercase tracking-wider">Lugar Físico</label>
                    <input
                      type="text"
                      placeholder="ej. Salón Social Torre A"
                      value={lugar}
                      onChange={(e) => setLugar(e.target.value)}
                      className="w-full bg-primary-light/40 border border-border rounded-2xl p-3 text-text focus:outline-none focus:border-[#57bf00]"
                    />
                  </div>
                )}
              </div>

              {modalidad !== 'PRESENCIAL' && (
                <div className="flex flex-col gap-1.5">
                  <label className="font-bold text-text uppercase tracking-wider">Enlace de Videollamada</label>
                  <input
                    type="url"
                    placeholder="ej. https://meet.conjuntos.app/concejo o Zoom/Meet"
                    value={linkVideollamada}
                    onChange={(e) => setLinkVideollamada(e.target.value)}
                    className="w-full bg-primary-light/40 border border-border rounded-2xl p-3 text-text focus:outline-none focus:border-[#57bf00]"
                  />
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="font-bold text-text uppercase tracking-wider">Orden del Día (un punto por línea)</label>
                <textarea
                  rows={3}
                  placeholder="1. Verificación de quórum&#10;2. Informe de cartera&#10;3. Aprobación de presupuestos"
                  value={ordenDiaText}
                  onChange={(e) => setOrdenDiaText(e.target.value)}
                  className="w-full bg-primary-light/40 border border-border rounded-2xl p-3 text-text focus:outline-none focus:border-[#57bf00]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowModalCrear(false)}
                  className="px-4 py-2.5 rounded-xl border border-border text-text font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-[#57bf00] text-black font-bold uppercase tracking-wider hover:brightness-110"
                >
                  {submitting ? 'Emitiendo Citación...' : 'Emitir Citación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PRESENTAR EXCUSA */}
      {excusaReunionId && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md liquid-glass rounded-[32px] p-6 border border-border flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-text">Presentar Excusa de Inasistencia</h3>
              <button
                onClick={() => setExcusaReunionId(null)}
                className="w-8 h-8 rounded-full bg-text/5 flex items-center justify-center text-text"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-text">Motivo de Inasistencia *</label>
              <textarea
                rows={3}
                required
                placeholder="Indica el motivo por el cual no podrás asistir..."
                value={motivoExcusaText}
                onChange={(e) => setMotivoExcusaText(e.target.value)}
                className="w-full bg-primary-light/40 border border-border rounded-2xl p-3 text-xs text-text focus:outline-none focus:border-[#57bf00]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setExcusaReunionId(null)}
                className="px-4 py-2.5 rounded-xl border border-border text-xs text-text font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!motivoExcusaText.trim()) {
                    toast.error('Escribe el motivo de la excusa');
                    return;
                  }
                  handleConfirmarAsistencia(excusaReunionId, 'EXCUSA_INASISTENCIA', motivoExcusaText.trim());
                }}
                className="px-5 py-2.5 rounded-xl bg-amber-500 text-black font-bold text-xs uppercase tracking-wider"
              >
                Enviar Excusa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
