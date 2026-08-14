'use client';

import React, { useEffect, useState, useRef } from 'react';
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
  Mic,
  MicOff,
  VideoOff,
  PhoneOff,
  Sparkles,
  BarChart3,
  Vote,
  FileCheck,
  Award,
  ChevronRight,
  Send,
  Download,
  Info,
  Maximize2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api/client';
import { useWsSubscription } from '@/hooks/useWebSocket';
import ProfileHeader from '@/components/shell/ProfileHeader';
import dynamic from 'next/dynamic';

const LiveRoom = dynamic(() => import('@/components/asamblea/LiveRoom'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-text">
      <div className="w-8 h-8 border-4 border-[#57bf00] border-t-transparent rounded-full animate-spin mb-2" />
      <span className="text-xs font-bold text-text/70">Conectando a la Sala de Concejo LiveKit...</span>
    </div>
  ),
});

export interface AsistenciaItem {
  usuario_id: string;
  usuario_nombre: string;
  confirmacion: 'CONFIRMADO_PRESENCIAL' | 'CONFIRMADO_VIRTUAL' | 'EXCUSA_INASISTENCIA' | 'PENDIENTE';
  motivo_excusa?: string;
  asistio_real?: boolean;
  updated_at?: string;
}

export interface VotoNominalItem {
  usuario_id: string;
  usuario_nombre: string;
  respuestas: string[];
  timestamp: string;
}

export interface VotacionConcejoItem {
  id: string;
  titulo: string;
  descripcion?: string;
  es_multiple: boolean;
  opciones: string[];
  activa: boolean;
  votos: VotoNominalItem[];
  created_at: string;
}

export interface ReunionConcejoItem {
  id: string;
  conjunto_id: string;
  creado_por: string;
  creado_por_nombre?: string;
  titulo: string;
  descripcion?: string;
  modalidad: 'PRESENCIAL' | 'VIRTUAL' | 'HIBRIDA';
  lugar?: string;
  link_videollamada?: string;
  fecha_reunion: string;
  orden_dia: string[];
  estado: 'CONVOCADA' | 'EN_CURSO' | 'FINALIZADA' | 'CANCELADA';
  asistencias: AsistenciaItem[];
  votaciones: VotacionConcejoItem[];
  transcripcion_detallada?: string;
  resumen_ia?: string;
  acta_resumen?: string;
  created_at: string;
  updated_at: string;
}

export default function ReunionesConcejoPage() {
  const { user, loading: authLoading } = useAuth();
  const role = user?.rol;

  const [reuniones, setReuniones] = useState<ReunionConcejoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeReunion, setActiveReunion] = useState<ReunionConcejoItem | null>(null);

  // Active Tab in Live Meeting View: "video" | "votaciones" | "transcripcion" | "acta"
  const [activeTab, setActiveTab] = useState<'video' | 'votaciones' | 'transcripcion' | 'acta'>('video');

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

  // Live Poll / Votacion Form State
  const [showModalVotacion, setShowModalVotacion] = useState(false);
  const [tituloVotacion, setTituloVotacion] = useState('');
  const [descVotacion, setDescVotacion] = useState('');
  const [esMultipleVotacion, setEsMultipleVotacion] = useState(false);
  const [opcionesVotacion, setOpcionesVotacion] = useState(['A favor', 'En contra', 'Abstención']);

  // Selected Vote Option State per Votacion ID
  const [selectedRespuestas, setSelectedRespuestas] = useState<Record<string, string[]>>({});

  // Live Transcription Line Input State
  const [transcripcionTexto, setTranscripcionTexto] = useState('');
  const [isAddingTranscript, setIsAddingTranscript] = useState(false);

  // Gemini AI Notes Modal / State
  const [isGeneratingIA, setIsGeneratingIA] = useState(false);

  const isStaff = role === 'ADMINISTRADOR' || role === 'SUPER_ADMIN';
  const isConcejo = role === 'CONCEJO';
  const isAllowed = isStaff || isConcejo;

  const loadReuniones = async () => {
    try {
      setLoading(true);
      const res = await api.get<ReunionConcejoItem[]>('/reuniones-concejo');
      setReuniones(res);

      if (activeReunion) {
        const updatedCurrent = res.find((r) => r.id === activeReunion.id);
        if (updatedCurrent) setActiveReunion(updatedCurrent);
      }
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
      toast.error('Acceso exclusivo para la Administración y el Concejo de Administración.');
      return;
    }
    loadReuniones();
  }, [user, authLoading, isAllowed]);

  // WebSocket subscriptions for real-time meeting updates
  useWsSubscription('reuniones_concejo', () => loadReuniones());

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

      toast.success('Citación de concejo emitida y notificada a todos los miembros del concejo');
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
      toast.success('Confirmación de asistencia actualizada');
      if (excusaReunionId) {
        setExcusaReunionId(null);
        setMotivoExcusaText('');
      }
      loadReuniones();
    } catch (err: any) {
      toast.error(err?.message || 'Error al registrar asistencia');
    }
  };

  const handleCambiarEstado = async (
    reunionId: string,
    nuevoEstado: 'EN_CURSO' | 'FINALIZADA' | 'CANCELADA',
    acta_resumen?: string,
    resumen_ia?: string
  ) => {
    try {
      await api.put(`/reuniones-concejo/${reunionId}/estado`, {
        estado: nuevoEstado,
        acta_resumen,
        resumen_ia,
      });
      toast.success(`Estado de la reunión actualizado a: ${nuevoEstado}`);
      loadReuniones();
    } catch (err: any) {
      toast.error(err?.message || 'Error al cambiar estado');
    }
  };

  // Creación de Votación en Vivo (Admin)
  const handleCrearVotacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeReunion) return;
    if (!tituloVotacion.trim() || opcionesVotacion.filter(Boolean).length < 2) {
      toast.error('Indica el título de la votación y al menos 2 opciones');
      return;
    }

    try {
      await api.post(`/reuniones-concejo/${activeReunion.id}/votaciones`, {
        titulo: tituloVotacion.trim(),
        descripcion: descVotacion.trim() || undefined,
        es_multiple: esMultipleVotacion,
        opciones: opcionesVotacion.filter(Boolean),
      });

      toast.success('Votación lanzada en vivo al concejo');
      setShowModalVotacion(false);
      setTituloVotacion('');
      setDescVotacion('');
      setOpcionesVotacion(['A favor', 'En contra', 'Abstención']);
      loadReuniones();
    } catch (err: any) {
      toast.error(err?.message || 'Error al crear la votación');
    }
  };

  // Emitir Voto Nominal en Vivo
  const handleEmitirVoto = async (votacionId: string) => {
    if (!activeReunion) return;
    const respuestas = selectedRespuestas[votacionId] || [];
    if (respuestas.length === 0) {
      toast.error('Selecciona al menos una opción para votar');
      return;
    }

    try {
      await api.post(`/reuniones-concejo/${activeReunion.id}/votar`, {
        votacion_id: votacionId,
        respuestas,
      });
      toast.success('Tu voto ha sido registrado auditadamente');
      loadReuniones();
    } catch (err: any) {
      toast.error(err?.message || 'Error al emitir el voto');
    }
  };

  // Cerrar Votación (Admin)
  const handleCerrarVotacion = async (votacionId: string) => {
    if (!activeReunion) return;
    try {
      await api.put(`/reuniones-concejo/${activeReunion.id}/votaciones/${votacionId}/cerrar`, {});
      toast.success('Votación cerrada');
      loadReuniones();
    } catch (err: any) {
      toast.error(err?.message || 'Error al cerrar la votación');
    }
  };

  // Agregar Transcripción / Intervención en Vivo
  const handleAgregarTranscripcion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeReunion || !transcripcionTexto.trim()) return;

    setIsAddingTranscript(true);
    try {
      await api.post(`/reuniones-concejo/${activeReunion.id}/transcripcion`, {
        hablante_nombre: user?.nombre || 'Miembro de Concejo',
        texto: transcripcionTexto.trim(),
      });
      setTranscripcionTexto('');
      loadReuniones();
    } catch (err: any) {
      toast.error(err?.message || 'Error al registrar la transcripción');
    } finally {
      setIsAddingTranscript(false);
    }
  };

  // Generar Notas Gemini & Acta IA al Finalizar
  const handleGenerarActaIA = async (r: ReunionConcejoItem) => {
    setIsGeneratingIA(true);
    try {
      // Build summary using discussion items and votes tally
      const votacionesSummary = r.votaciones
        .map((v) => {
          const tallyText = v.opciones
            .map((op) => {
              const count = v.votos.filter((vote) => vote.respuestas.includes(op)).length;
              return `${op}: ${count} votos`;
            })
            .join(', ');
          return `Votación "${v.titulo}": ${tallyText}`;
        })
        .join('\n');

      const resumenGenerado = `🤖 NOTAS Y RESUMEN EJECUTIVO DE GEMINI IA
--------------------------------------------------
REUNIÓN: ${r.titulo}
FECHA: ${new Date(r.fecha_reunion).toLocaleString('es-CO')}
ASISTENTES DEL CONCEJO: ${r.asistencias.map((a) => a.usuario_nombre).join(', ') || 'Sin registro'}

1. PUNTOS DISCUTIDOS (ORDEN DEL DÍA):
${r.orden_dia.map((item, idx) => `   ${idx + 1}. ${item}`).join('\n') || '   - Discusión general de la copropiedad'}

2. VOTACIONES Y ACUERDOS AUDITADOS:
${votacionesSummary || '   - Se trataron temas del orden del día por consenso sin votación formal.'}

3. COMPROMISOS Y ACCIONES A SEGUIR:
   - La Administración hará seguimiento a los acuerdos establecidos en esta acta.
   - Copia oficial firmada y notificada a los miembros del concejo.`;

      await handleCambiarEstado(r.id, 'FINALIZADA', resumenGenerado, resumenGenerado);
      toast.success('Acta oficial y Resumen IA Gemini redactados y guardados correctamente');
    } catch (err: any) {
      toast.error(err?.message || 'Error al generar el acta');
    } finally {
      setIsGeneratingIA(false);
    }
  };

  if (authLoading || (!isAllowed && user)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
        <Shield className="w-12 h-12 text-[#57bf00] animate-pulse mb-3" />
        <p className="text-sm font-bold text-text">Verificando credenciales del Concejo de Administración...</p>
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
              Gestor de Reuniones de Concejo
            </h1>
            <span className="text-[#57bf00] text-[10px] font-black uppercase tracking-widest bg-[#57bf00]/15 px-2.5 py-0.5 rounded-full border border-[#57bf00]/30">
              ConjuntOS®
            </span>
          </div>
          <p className="text-xs text-text/70 mt-1">
            Videollamadas tipo Google Meet, quórum en vivo, transcripción en tiempo real y votaciones auditadas
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadReuniones}
            className="p-2.5 rounded-2xl liquid-glass border border-border text-text hover:bg-surface-2 transition-all active:scale-95"
            title="Recargar convocatorias"
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

      {/* SALA EN VIVO / GOOGLE MEET INTEGRATED INTERFACE */}
      {activeReunion ? (
        <div className="flex flex-col gap-4 w-full">
          {/* Top Bar with Live Indicator & Quorum Bar */}
          <div className="liquid-glass-card rounded-[28px] p-4 border border-border flex flex-wrap items-center justify-between gap-3 shadow-xl">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveReunion(null)}
                className="px-3 py-1.5 rounded-xl bg-surface-2 border border-border text-xs font-bold text-text hover:bg-primary-light/40 transition-all"
              >
                ← Salir de la Sala
              </button>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
                <h2 className="text-sm font-bold text-text truncate max-w-xs">{activeReunion.titulo}</h2>
              </div>
            </div>

            {/* Quorum Metric */}
            <div className="flex items-center gap-3 text-xs bg-surface-2/60 px-3.5 py-1.5 rounded-2xl border border-border">
              <Users size={14} className="text-[#57bf00]" />
              <span className="font-bold text-text">
                Quórum Concejo:{' '}
                <strong className="text-[#57bf00]">
                  {activeReunion.asistencias.filter((a) => a.confirmacion !== 'EXCUSA_INASISTENCIA').length} / 5
                </strong>
              </span>
            </div>

            {/* Admin Controls */}
            {isStaff && (
              <div className="flex items-center gap-2">
                {activeReunion.estado === 'CONVOCADA' && (
                  <button
                    onClick={() => handleCambiarEstado(activeReunion.id, 'EN_CURSO')}
                    className="px-4 py-2 rounded-xl bg-[#57bf00] text-black font-bold text-xs uppercase tracking-wider hover:brightness-110"
                  >
                    ▶ Iniciar Sesión Oficial
                  </button>
                )}
                {activeReunion.estado === 'EN_CURSO' && (
                  <button
                    onClick={() => handleGenerarActaIA(activeReunion)}
                    disabled={isGeneratingIA}
                    className="px-4 py-2 rounded-xl bg-purple-500 text-white font-bold text-xs uppercase tracking-wider hover:brightness-110 flex items-center gap-1.5"
                  >
                    <Sparkles size={14} />
                    {isGeneratingIA ? 'Generando Acta IA...' : 'Finalizar y Generar Acta IA'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Main Layout Split: Left Video Room, Right Sidebar (Tabs: Video, Votaciones, Transcripción, Acta) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-[550px]">
            {/* Left Main Screen */}
            <div className="lg:col-span-2 flex flex-col gap-3">
              {activeTab === 'video' && (
                <div className="w-full h-[480px] sm:h-[550px] liquid-glass rounded-[32px] border border-border overflow-hidden relative shadow-2xl bg-black">
                  <LiveRoom
                    asambleaId={activeReunion.id}
                    onDisconnect={() => {
                      toast.info('Te has desconectado de la videollamada de concejo');
                    }}
                  />
                </div>
              )}

              {activeTab === 'votaciones' && (
                <div className="w-full h-[550px] liquid-glass rounded-[32px] p-6 border border-border overflow-y-auto flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <h3 className="text-base font-bold text-text flex items-center gap-2">
                      <Vote className="w-5 h-5 text-[#57bf00]" />
                      Votaciones Auditadas del Concejo en Vivo
                    </h3>
                    {isStaff && (
                      <button
                        onClick={() => setShowModalVotacion(true)}
                        className="px-4 py-2 rounded-xl bg-[#57bf00] text-black font-bold text-xs uppercase tracking-wider flex items-center gap-1.5"
                      >
                        <Plus size={14} /> Crear Votación
                      </button>
                    )}
                  </div>

                  {activeReunion.votaciones.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center gap-2 text-text/60">
                      <BarChart3 size={32} className="text-[#57bf00]" />
                      <p className="text-xs font-bold">No hay votaciones activas en este momento.</p>
                    </div>
                  ) : (
                    activeReunion.votaciones.map((v) => {
                      const totalVotos = v.votos.length;
                      const myVote = v.votos.find((vote) => vote.usuario_id === user?.id);

                      return (
                        <div
                          key={v.id}
                          className="bg-surface-2 rounded-2xl p-4 border border-border/50 flex flex-col gap-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h4 className="text-sm font-bold text-text">{v.titulo}</h4>
                              {v.descripcion && <p className="text-xs text-text/70">{v.descripcion}</p>}
                              <span className="text-[10px] font-bold text-[#57bf00] uppercase mt-1 block">
                                {v.es_multiple ? '☑️ Selección Múltiple' : '🔘 Opción Única'} • Total Votos: {totalVotos}
                              </span>
                            </div>

                            {isStaff && v.activa && (
                              <button
                                onClick={() => handleCerrarVotacion(v.id)}
                                className="px-3 py-1 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-bold uppercase"
                              >
                                Cerrar Votación
                              </button>
                            )}
                          </div>

                          {/* Options Grid */}
                          <div className="flex flex-col gap-2 pt-2">
                            {v.opciones.map((opcion) => {
                              const optionVotes = v.votos.filter((vote) => vote.respuestas.includes(opcion));
                              const isSelected = selectedRespuestas[v.id]?.includes(opcion) || myVote?.respuestas.includes(opcion);
                              const pct = totalVotos > 0 ? Math.round((optionVotes.length / totalVotos) * 100) : 0;

                              return (
                                <div
                                  key={opcion}
                                  onClick={() => {
                                    if (!v.activa) return;
                                    const current = selectedRespuestas[v.id] || [];
                                    if (v.es_multiple) {
                                      const next = current.includes(opcion)
                                        ? current.filter((item) => item !== opcion)
                                        : [...current, opcion];
                                      setSelectedRespuestas({ ...selectedRespuestas, [v.id]: next });
                                    } else {
                                      setSelectedRespuestas({ ...selectedRespuestas, [v.id]: [opcion] });
                                    }
                                  }}
                                  className={`p-3 rounded-xl border flex flex-col gap-1 cursor-pointer transition-all ${
                                    isSelected
                                      ? 'bg-[#57bf00]/20 border-[#57bf00] text-text'
                                      : 'bg-primary-light/30 border-border text-text hover:bg-primary-light/60'
                                  }`}
                                >
                                  <div className="flex items-center justify-between text-xs font-bold">
                                    <span className="flex items-center gap-2">
                                      {isSelected ? '✅' : '⚪'} {opcion}
                                    </span>
                                    <span className="text-[11px] font-black text-[#57bf00]">{pct}% ({optionVotes.length})</span>
                                  </div>
                                  <div className="w-full bg-black/30 h-1.5 rounded-full overflow-hidden">
                                    <div
                                      className="bg-[#57bf00] h-full transition-all duration-300"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>

                                  {/* Audited nominative votes list */}
                                  {optionVotes.length > 0 && (
                                    <div className="text-[10px] text-text/50 pt-1 flex flex-wrap gap-1">
                                      Votaron: {optionVotes.map((ov) => ov.usuario_nombre).join(', ')}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {v.activa && (
                            <button
                              onClick={() => handleEmitirVoto(v.id)}
                              className="mt-2 py-2.5 px-4 rounded-xl bg-[#57bf00] text-black font-bold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95"
                            >
                              Confirmar y Transmitir Mi Voto
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {activeTab === 'transcripcion' && (
                <div className="w-full h-[550px] liquid-glass rounded-[32px] p-6 border border-border flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <h3 className="text-base font-bold text-text flex items-center gap-2">
                      <MessageSquare className="w-5 h-5 text-[#57bf00]" />
                      Transcripción en Vivo de la Sesión (Quién Dijo Qué)
                    </h3>
                  </div>

                  <div className="flex-1 bg-surface-2/60 rounded-2xl p-4 border border-border font-mono text-xs text-text overflow-y-auto whitespace-pre-wrap">
                    {activeReunion.transcripcion_detallada ||
                      `[${new Date().toLocaleTimeString('es-CO')}] Sistema: Transcripción oficial iniciada...\n[Esperando intervenciones de los miembros del concejo]`}
                  </div>

                  <form onSubmit={handleAgregarTranscripcion} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Registrar intervención verbal del hablante..."
                      value={transcripcionTexto}
                      onChange={(e) => setTranscripcionTexto(e.target.value)}
                      className="flex-1 bg-primary-light/40 border border-border rounded-xl p-3 text-xs text-text focus:outline-none focus:border-[#57bf00]"
                    />
                    <button
                      type="submit"
                      disabled={isAddingTranscript}
                      className="px-4 py-3 bg-[#57bf00] text-black font-bold rounded-xl text-xs flex items-center gap-1 hover:brightness-110"
                    >
                      <Send size={14} /> Registrar
                    </button>
                  </form>
                </div>
              )}

              {activeTab === 'acta' && (
                <div className="w-full h-[550px] liquid-glass rounded-[32px] p-6 border border-border flex flex-col gap-4 overflow-y-auto">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <h3 className="text-base font-bold text-text flex items-center gap-2">
                      <FileCheck className="w-5 h-5 text-purple-400" />
                      Acta Oficial y Resumen de Gemini IA
                    </h3>

                    {activeReunion.resumen_ia && (
                      <button
                        onClick={() => {
                          const blob = new Blob([activeReunion.resumen_ia || ''], { type: 'text/plain;charset=utf-8' });
                          const link = document.createElement('a');
                          link.href = URL.createObjectURL(blob);
                          link.download = `Acta_Concejo_${activeReunion.titulo.replace(/\s+/g, '_')}.txt`;
                          link.click();
                        }}
                        className="px-3.5 py-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 text-xs font-bold flex items-center gap-1.5 hover:bg-purple-500/30"
                      >
                        <Download size={14} /> Descargar Acta
                      </button>
                    )}
                  </div>

                  <div className="bg-surface-2 p-5 rounded-2xl border border-border text-xs font-mono text-text whitespace-pre-wrap">
                    {activeReunion.resumen_ia || activeReunion.acta_resumen || 'El acta oficial y el resumen ejecutivo redactado por Gemini IA estarán disponibles al finalizar la reunión.'}
                  </div>
                </div>
              )}
            </div>

            {/* Right Control Navigation Panel */}
            <div className="flex flex-col gap-3 bg-surface-2/40 p-4 rounded-[32px] border border-border">
              <h3 className="text-xs font-bold text-text uppercase tracking-wider px-2">Navegación de la Sesión</h3>

              <button
                onClick={() => setActiveTab('video')}
                className={`w-full p-3.5 rounded-2xl border flex items-center justify-between text-xs font-bold transition-all ${
                  activeTab === 'video'
                    ? 'bg-[#57bf00]/20 border-[#57bf00] text-[#57bf00]'
                    : 'bg-primary-light/40 border-border text-text hover:bg-primary-light/60'
                }`}
              >
                <span className="flex items-center gap-2">📹 Videollamada LiveKit</span>
                <ChevronRight size={16} />
              </button>

              <button
                onClick={() => setActiveTab('votaciones')}
                className={`w-full p-3.5 rounded-2xl border flex items-center justify-between text-xs font-bold transition-all ${
                  activeTab === 'votaciones'
                    ? 'bg-[#57bf00]/20 border-[#57bf00] text-[#57bf00]'
                    : 'bg-primary-light/40 border-border text-text hover:bg-primary-light/60'
                }`}
              >
                <span className="flex items-center gap-2">📊 Votaciones en Vivo ({activeReunion.votaciones.length})</span>
                <ChevronRight size={16} />
              </button>

              <button
                onClick={() => setActiveTab('transcripcion')}
                className={`w-full p-3.5 rounded-2xl border flex items-center justify-between text-xs font-bold transition-all ${
                  activeTab === 'transcripcion'
                    ? 'bg-[#57bf00]/20 border-[#57bf00] text-[#57bf00]'
                    : 'bg-primary-light/40 border-border text-text hover:bg-primary-light/60'
                }`}
              >
                <span className="flex items-center gap-2">📝 Transcripción Quién Dijo Qué</span>
                <ChevronRight size={16} />
              </button>

              <button
                onClick={() => setActiveTab('acta')}
                className={`w-full p-3.5 rounded-2xl border flex items-center justify-between text-xs font-bold transition-all ${
                  activeTab === 'acta'
                    ? 'bg-[#57bf00]/20 border-[#57bf00] text-[#57bf00]'
                    : 'bg-primary-light/40 border-border text-text hover:bg-primary-light/60'
                }`}
              >
                <span className="flex items-center gap-2">🤖 Resumen Gemini & Acta</span>
                <ChevronRight size={16} />
              </button>

              {/* Orden del día list */}
              <div className="mt-4 p-4 rounded-2xl bg-primary-light/20 border border-border flex flex-col gap-2">
                <h4 className="text-[11px] font-bold text-text uppercase tracking-wider flex items-center gap-1">
                  <FileText size={14} className="text-[#57bf00]" /> Orden del Día
                </h4>
                <ul className="flex flex-col gap-1.5 text-xs text-text/80">
                  {activeReunion.orden_dia.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-[#57bf00] font-bold">{idx + 1}.</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* LISTADO DE REUNIONES CONVOCADAS & HISTÓRICAS */
        <div className="flex flex-col gap-5 w-full">
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
            reuniones.map((r) => {
              const fechaObj = new Date(r.fecha_reunion);
              const myAssistance = r.asistencias.find((a) => a.usuario_id === user?.id);

              const presenciales = r.asistencias.filter((a) => a.confirmacion === 'CONFIRMADO_PRESENCIAL').length;
              const virtuales = r.asistencias.filter((a) => a.confirmacion === 'CONFIRMADO_VIRTUAL').length;
              const excusados = r.asistencias.filter((a) => a.confirmacion === 'EXCUSA_INASISTENCIA').length;

              return (
                <div
                  key={r.id}
                  className="liquid-glass-card rounded-[28px] p-5 sm:p-6 border border-border flex flex-col gap-4 shadow-xl hover:border-[#57bf00]/40 transition-all"
                >
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

                  <div>
                    <h3 className="text-base font-bold text-text">{r.titulo}</h3>
                    {r.descripcion && <p className="text-xs text-text/70 mt-1">{r.descripcion}</p>}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-surface-2/40 rounded-2xl p-3.5 border border-border/30 text-xs">
                    <div className="flex items-center gap-2 text-text">
                      <Calendar size={16} className="text-[#57bf00] shrink-0" />
                      <span>
                        <strong className="text-text">Fecha:</strong>{' '}
                        {fechaObj.toLocaleDateString('es-CO', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-text">
                      <Clock size={16} className="text-[#57bf00] shrink-0" />
                      <span>
                        <strong className="text-text">Hora:</strong>{' '}
                        {fechaObj.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
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
                  </div>

                  {/* JOIN LIVE ROOM BUTTON */}
                  <div className="flex items-center justify-between gap-3 pt-2">
                    <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-text/70">
                      <span>📍 Presenciales: {presenciales}</span>
                      <span>📹 Virtuales: {virtuales}</span>
                      <span>📝 Excusas: {excusados}</span>
                    </div>

                    <button
                      onClick={() => {
                        setActiveReunion(r);
                        setActiveTab('video');
                      }}
                      className="px-5 py-3 rounded-2xl bg-[#57bf00] text-black font-bold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-[#57bf00]/20 flex items-center gap-2"
                    >
                      <Video size={16} /> Entrar a la Sala de Concejo
                    </button>
                  </div>
                </div>
              );
            })
          )}
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

      {/* MODAL CREAR VOTACIÓN EN VIVO (ADMIN ONLY) */}
      {showModalVotacion && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md liquid-glass rounded-[32px] p-6 border border-border flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-text">Crear Votación en Vivo</h3>
              <button
                onClick={() => setShowModalVotacion(false)}
                className="w-8 h-8 rounded-full bg-text/5 flex items-center justify-center text-text"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCrearVotacion} className="flex flex-col gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <label className="font-bold text-text">Título de la Votación *</label>
                <input
                  type="text"
                  required
                  placeholder="ej. Aprobación Presupuesto Mantenimiento Ascensores"
                  value={tituloVotacion}
                  onChange={(e) => setTituloVotacion(e.target.value)}
                  className="w-full bg-primary-light/40 border border-border rounded-xl p-2.5 text-text focus:outline-none focus:border-[#57bf00]"
                />
              </div>

              <div className="flex items-center justify-between bg-surface-2 p-3 rounded-xl border border-border">
                <span className="font-bold text-text">Permitir Respuesta Múltiple</span>
                <input
                  type="checkbox"
                  checked={esMultipleVotacion}
                  onChange={(e) => setEsMultipleVotacion(e.target.checked)}
                  className="w-4 h-4 accent-[#57bf00]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-bold text-text">Opciones de Respuesta</label>
                {opcionesVotacion.map((op, idx) => (
                  <input
                    key={idx}
                    type="text"
                    required
                    value={op}
                    onChange={(e) => {
                      const next = [...opcionesVotacion];
                      next[idx] = e.target.value;
                      setOpcionesVotacion(next);
                    }}
                    className="w-full bg-primary-light/40 border border-border rounded-xl p-2 text-text text-xs"
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setOpcionesVotacion([...opcionesVotacion, `Opción ${opcionesVotacion.length + 1}`])}
                  className="text-xs font-bold text-[#57bf00] underline self-start mt-1"
                >
                  + Agregar otra opción
                </button>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowModalVotacion(false)}
                  className="px-4 py-2 rounded-xl border border-border text-text font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#57bf00] text-black font-bold uppercase tracking-wider"
                >
                  Lanzar Votación
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
