/**
 * ASAMBLEA - CONJUNTOSAPP (mobile port)
 * Sala de asamblea en vivo para residentes.
 *
 * Ported from web src/app/asamblea/page.tsx (+ src/components/asamblea/LiveRoom.tsx):
 *  - GET /asambleas/activa/session → AsambleaDto (ordenDia, itemActivoIndex,
 *    version); 404/empty → "No hay asamblea activa".
 *  - Tabs: video / agenda / votos / chat (opiniones) / info. The web renders
 *    them as a bottom nav; here they are top chips because the app already has
 *    a global floating tab bar.
 *  - Votaciones: GET /asambleas/{id}/votaciones, POST /votaciones/{id}/votos
 *    {respuesta}, GET /votaciones/{id}/votos on demand. Result bars are
 *    coeficiente-weighted (falling back to raw counts when every coeficiente
 *    is 0), showing `count (pct%)` like the web.
 *  - Asistencia: POST /asambleas/{id}/asistencias {tipo:'VIRTUAL'} + quorum
 *    ring drawn from QuorumResponse with react-native-svg.
 *  - Opiniones GET/POST, turnos GET/POST (pedir turno de habla).
 *  - Realtime: useWsSubscription('asamblea') → refetch session + all data.
 *  - VIDEO: viewer-only LiveKit room (GET /asambleas/{id}/livekit-token),
 *    following the @livekit/react-native v2 pattern already used by
 *    src/providers/CallProvider.tsx. The viewer publishes nothing
 *    (audio/video={false}); remote audio auto-plays via registered globals.
 *  - Admin session controls (avanzar agenda, abrir/cerrar votación, dar
 *    turno) are intentionally NOT ported (web/admin-only for now).
 */

import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import {
  BarChart3,
  CheckCircle,
  Circle,
  FileCheck,
  Hand,
  Info,
  ListOrdered,
  MessageSquare,
  Play,
  Send,
  Shield,
  Users,
  Video,
} from 'lucide-react-native';
import {
  AudioSession,
  LiveKitRoom,
  VideoTrack,
  isTrackReference,
  registerGlobals,
  useTracks,
} from '@livekit/react-native';
import { Track } from 'livekit-client';

import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api } from '@/lib/api/client';
import type {
  AsambleaDto,
  AsistenciaDto,
  LiveKitTokenDto,
  OpinionDto,
  OrdenDiaItem,
  PoderDto,
  QuorumResponse,
  TurnoDto,
  VotacionDto,
  VotoDto,
} from '@/lib/api/types';
import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { toast } from '@/components/ui/toast';

// Accent tints (pure b/w theme + the two allowed accents).
const ICON_COLOR = '#FFFFFF';
const INFO = '#009df2';
const SUCCESS = '#57bf00';

type Tab = 'video' | 'agenda' | 'votos' | 'chat' | 'info';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Coeficiente-weighted tally per option. The web's tally() divides raw vote
 * counts; here the percentage weights each vote by its `coeficiente` (the
 * legally binding measure in propiedad horizontal), falling back to raw
 * counts when the total coefficient is 0 (e.g. demo data).
 */
function tally(votes: VotoDto[], options: string[]) {
  const counts: Record<string, number> = {};
  const weights: Record<string, number> = {};
  options.forEach((o) => {
    counts[o] = 0;
    weights[o] = 0;
  });
  let totalWeight = 0;
  for (const v of votes) {
    counts[v.respuesta] = (counts[v.respuesta] ?? 0) + 1;
    const c = Number(v.coeficiente) || 0;
    weights[v.respuesta] = (weights[v.respuesta] ?? 0) + c;
    totalWeight += c;
  }
  const totalCount = votes.length;
  return options.map((o) => {
    const pct =
      totalWeight > 0
        ? Math.round(((weights[o] ?? 0) / totalWeight) * 100)
        : totalCount > 0
          ? Math.round(((counts[o] ?? 0) / totalCount) * 100)
          : 0;
    return { option: o, count: counts[o] ?? 0, pct };
  });
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

// Register the WebRTC globals exactly once for this JS runtime (same guard as
// CallProvider — registerGlobals is safe to call again but not free).
let lkGlobalsRegistered = false;
function ensureGlobals() {
  if (lkGlobalsRegistered) return;
  try {
    registerGlobals();
    lkGlobalsRegistered = true;
  } catch (e) {
    console.warn('LiveKit registerGlobals failed:', e);
  }
}

// ---------------------------------------------------------------------------
// LiveKit viewer (mirrors src/components/asamblea/LiveRoom.tsx, viewer-only)
// ---------------------------------------------------------------------------

/** Renders every remote camera / screen-share track of the assembly room. */
function RoomTracks() {
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare]);
  const videoTracks = tracks.filter(isTrackReference);

  if (videoTracks.length === 0) {
    return (
      <View className="h-[220px] items-center justify-center">
        <Text className="text-xs text-text/60">
          Esperando transmisión de video...
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-2">
      {videoTracks.map((t) => (
        <View
          key={t.publication.trackSid}
          className="overflow-hidden rounded-2xl bg-black"
          style={{ height: 220 }}
        >
          <VideoTrack trackRef={t} style={{ flex: 1 }} />
        </View>
      ))}
    </View>
  );
}

function LiveRoomView({ asambleaId }: { asambleaId: string }) {
  const [token, setToken] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        ensureGlobals();
        await AudioSession.startAudioSession();
        const data = await api.get<LiveKitTokenDto>(
          `/asambleas/${asambleaId}/livekit-token`
        );
        if (active) {
          setToken(data.token);
          setUrl(data.url);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : 'No se pudo conectar a la sala'
          );
        }
      }
    })();
    return () => {
      active = false;
      AudioSession.stopAudioSession().catch(() => {});
    };
  }, [asambleaId]);

  if (error) {
    return (
      <View className="h-[220px] items-center justify-center rounded-2xl border border-border bg-surface p-8">
        <Text className="mb-2 font-bold text-text">Error de conexion</Text>
        <Text className="text-center text-sm text-text/70">{error}</Text>
      </View>
    );
  }

  if (!token || !url) {
    return (
      <View className="h-[220px] items-center justify-center rounded-2xl border border-border bg-surface">
        <ActivityIndicator color={ICON_COLOR} />
        <Text className="mt-3 text-sm text-text/70">Conectando a la sala...</Text>
      </View>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={url}
      token={token}
      connect={true}
      audio={false}
      video={false}
      options={{ adaptiveStream: { pixelDensity: 'screen' } }}
    >
      <RoomTracks />
    </LiveKitRoom>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function Asamblea() {
  const { user, loading: authLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<Tab>('video');
  const [asamblea, setAsamblea] = useState<AsambleaDto | null>(null);
  const [asambleaId, setAsambleaId] = useState('');
  const [loading, setLoading] = useState(true);

  const [opiniones, setOpiniones] = useState<OpinionDto[]>([]);
  const [votaciones, setVotaciones] = useState<VotacionDto[]>([]);
  const [asistencias, setAsistencias] = useState<AsistenciaDto[]>([]);
  const [turnos, setTurnos] = useState<TurnoDto[]>([]);
  const [poderes, setPoderes] = useState<PoderDto[]>([]);

  const [quorum, setQuorum] = useState<{
    totalCoeficiente: number;
    presenteCoeficiente: number;
    quorumPorcentaje: number;
  } | null>(null);
  const [votos, setVotos] = useState<Record<string, VotoDto[]>>({});
  const [newOpinion, setNewOpinion] = useState('');

  const fetchSession = useCallback(async () => {
    try {
      const data = await api.get<AsambleaDto>('/asambleas/activa/session');
      setAsamblea(data);
      setAsambleaId(data.id);
    } catch {
      setAsamblea(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    if (!asambleaId) return;
    try {
      const [op, vot, asi, tur, pod] = await Promise.all([
        api.get<OpinionDto[]>(`/asambleas/${asambleaId}/opiniones`),
        api.get<VotacionDto[]>(`/asambleas/${asambleaId}/votaciones`),
        api.get<QuorumResponse>(`/asambleas/${asambleaId}/asistencias`),
        api.get<TurnoDto[]>(`/asambleas/${asambleaId}/turnos`),
        api.get<PoderDto[]>(`/asambleas/${asambleaId}/poderes`),
      ]);
      setOpiniones(op);
      setVotaciones(vot);
      setAsistencias(asi.asistencias ?? []);
      setQuorum({
        totalCoeficiente: asi.totalCoeficiente,
        presenteCoeficiente: asi.presenteCoeficiente,
        quorumPorcentaje: asi.quorumPorcentaje,
      });
      setTurnos(tur);
      setPoderes(pod);
    } catch (err) {
      console.error('fetch asamblea data:', err);
    }
  }, [asambleaId]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useWsSubscription('asamblea', () => {
    fetchSession();
    fetchAll();
  });

  const postOpinion = async () => {
    if (!newOpinion.trim() || !asambleaId) return;
    try {
      await api.post(`/asambleas/${asambleaId}/opiniones`, {
        contenido: newOpinion.trim(),
      });
      setNewOpinion('');
      toast.success('Opinión enviada');
    } catch {
      toast.error('Error al enviar opinión');
    }
  };

  const requestTurn = async () => {
    if (!asambleaId) return;
    try {
      await api.post(`/asambleas/${asambleaId}/turnos`);
      toast.success('Turno solicitado');
    } catch {
      toast.error('Error al solicitar turno');
    }
  };

  const castVote = async (votacionId: string, respuesta: string) => {
    try {
      await api.post(`/votaciones/${votacionId}/votos`, { respuesta });
      toast.success('Voto registrado');
      fetchAll();
    } catch {
      toast.error('Error al votar');
    }
  };

  const fetchVotos = async (votacionId: string) => {
    try {
      const d = await api.get<VotoDto[]>(`/votaciones/${votacionId}/votos`);
      setVotos((p) => ({ ...p, [votacionId]: d }));
    } catch {
      /* silent */
    }
  };

  const registerAttendance = async () => {
    if (!asambleaId) return;
    try {
      await api.post(`/asambleas/${asambleaId}/asistencias`, {
        tipo: 'VIRTUAL',
      });
      toast.success('Asistencia registrada');
      fetchAll();
    } catch {
      toast.error('Error al registrar asistencia');
    }
  };

  if (authLoading || loading) {
    return (
      <Screen scroll={false} className="bg-primary">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={ICON_COLOR} />
        </View>
      </Screen>
    );
  }

  if (!user || !asamblea) {
    return (
      <Screen scroll={false} className="bg-primary">
        <View className="flex-1 items-center justify-center px-6">
          <Animated.View entering={FadeInDown.duration(500)} className="items-center">
            <View className="mb-4 h-20 w-20 items-center justify-center rounded-full bg-surface">
              <Video size={40} color={ICON_COLOR} />
            </View>
            <Text className="mb-2 text-xl font-bold text-text">
              No hay asamblea activa
            </Text>
            <Text className="text-center text-sm text-text/70">
              Cuando un administrador inicie una asamblea, aparecerá aquí.
            </Text>
          </Animated.View>
        </View>
      </Screen>
    );
  }

  const ordenDia: OrdenDiaItem[] = Array.isArray(asamblea.ordenDia)
    ? asamblea.ordenDia
    : [];
  const currentItem = ordenDia[asamblea.itemActivoIndex];
  const activeVotaciones = votaciones.filter((v) => v.activa);
  const pendingTurnos = turnos.filter(
    (t) => t.estado === 'PENDIENTE' || t.estado === 'HABLANDO'
  );

  const tabs: {
    id: Tab;
    label: string;
    icon: (color: string) => ReactElement;
    badge?: number;
  }[] = [
    { id: 'video', label: 'Video', icon: (c) => <Video size={14} color={c} /> },
    { id: 'agenda', label: 'Agenda', icon: (c) => <ListOrdered size={14} color={c} /> },
    {
      id: 'votos',
      label: 'Votos',
      icon: (c) => <BarChart3 size={14} color={c} />,
      badge: activeVotaciones.length || undefined,
    },
    {
      id: 'chat',
      label: 'Chat',
      icon: (c) => <MessageSquare size={14} color={c} />,
      badge: opiniones.length || undefined,
    },
    { id: 'info', label: 'Info', icon: (c) => <Info size={14} color={c} /> },
  ];

  return (
    <Screen scroll={false} className="bg-primary">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <View className="flex-1 px-6 pt-4">
          {/* HEADER */}
          <Animated.View entering={FadeInDown.duration(500)}>
            <Text className="text-lg font-bold text-text" numberOfLines={1}>
              {asamblea.titulo}
            </Text>
            {currentItem ? (
              <Text
                className="text-xs font-bold"
                style={{ color: INFO }}
                numberOfLines={1}
              >
                Punto {asamblea.itemActivoIndex + 1}: {currentItem.titulo}
              </Text>
            ) : null}
          </Animated.View>

          {/* TAB CHIPS */}
          <Animated.View entering={FadeInDown.delay(80).duration(500)} className="mt-4">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -24 }}
              contentContainerStyle={{ paddingHorizontal: 24, gap: 10 }}
            >
              {tabs.map((t) => {
                const active = activeTab === t.id;
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => setActiveTab(t.id)}
                    className={`flex-row items-center gap-1.5 rounded-2xl border px-4 py-2.5 ${
                      active ? 'border-accent bg-accent' : 'border-border bg-surface2'
                    }`}
                  >
                    {t.icon(active ? '#000000' : ICON_COLOR)}
                    <Text
                      className={`text-[10px] font-bold uppercase tracking-widest ${
                        active ? 'text-on-accent' : 'text-text'
                      }`}
                    >
                      {t.label}
                    </Text>
                    {typeof t.badge === 'number' && t.badge > 0 ? (
                      <View
                        className="h-4 min-w-[16px] items-center justify-center rounded-full px-1"
                        style={{ backgroundColor: active ? '#000000' : INFO }}
                      >
                        <Text className="text-[9px] font-black text-white">
                          {t.badge > 9 ? '9+' : t.badge}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Animated.View>

          {/* CONTENT */}
          <ScrollView
            className="mt-4 flex-1"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 16, paddingBottom: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* VIDEO */}
            {activeTab === 'video' ? (
              <Animated.View entering={FadeInDown.duration(400)} className="gap-4">
                <LiveRoomView asambleaId={asambleaId} />

                {currentItem ? (
                  <LiquidGlass radius={16} className="rounded-2xl border border-border p-4">
                    <Text
                      className="mb-1 text-[10px] font-bold uppercase tracking-widest"
                      style={{ color: INFO }}
                    >
                      Punto actual
                    </Text>
                    <Text className="text-sm font-bold text-text">
                      {currentItem.titulo}
                    </Text>
                    {currentItem.descripcion ? (
                      <Text className="mt-1 text-xs text-text/70">
                        {currentItem.descripcion}
                      </Text>
                    ) : null}
                  </LiquidGlass>
                ) : null}

                <Pressable
                  onPress={requestTurn}
                  style={({ pressed }) => ({
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                    borderColor: 'rgba(0,157,242,0.4)',
                    backgroundColor: 'rgba(0,157,242,0.2)',
                  })}
                  className="flex-row items-center justify-center gap-2 rounded-2xl border py-3"
                >
                  <Hand size={16} color={INFO} />
                  <Text className="text-xs font-bold" style={{ color: INFO }}>
                    Pedir turno de habla
                  </Text>
                </Pressable>

                {pendingTurnos.length > 0 ? (
                  <LiquidGlass radius={16} className="gap-2 rounded-2xl border border-border p-3">
                    <Text className="text-[10px] font-bold uppercase tracking-widest text-text/70">
                      Turnos de habla
                    </Text>
                    {pendingTurnos.map((t) => (
                      <View key={t.id} className="flex-row items-center gap-2">
                        <Text className="flex-shrink text-sm font-bold text-text" numberOfLines={1}>
                          {t.nombre}
                        </Text>
                        {t.apto ? (
                          <Text className="text-xs text-text/60">{t.apto}</Text>
                        ) : null}
                        <Text
                          className="ml-auto text-[10px] font-bold uppercase"
                          style={{
                            color: t.estado === 'HABLANDO' ? SUCCESS : 'rgba(255,255,255,0.6)',
                          }}
                        >
                          {t.estado === 'HABLANDO' ? 'Hablando' : 'Espera'}
                        </Text>
                      </View>
                    ))}
                  </LiquidGlass>
                ) : null}
              </Animated.View>
            ) : null}

            {/* AGENDA */}
            {activeTab === 'agenda' ? (
              <Animated.View entering={FadeInDown.duration(400)} className="gap-3">
                <Text className="text-xs font-bold uppercase tracking-widest text-text/70">
                  Orden del día
                </Text>
                {ordenDia.map((item, i) => {
                  const done = i < asamblea.itemActivoIndex;
                  const current = i === asamblea.itemActivoIndex;
                  return (
                    <View
                      key={item.id ?? i}
                      className={`rounded-2xl border p-4 ${
                        current ? '' : 'border-border bg-surface'
                      } ${done ? 'opacity-60' : ''}`}
                      style={
                        current
                          ? {
                              borderColor: INFO,
                              backgroundColor: 'rgba(0,157,242,0.10)',
                            }
                          : undefined
                      }
                    >
                      <View className="flex-row items-start gap-3">
                        {done ? (
                          <CheckCircle size={20} color={SUCCESS} />
                        ) : current ? (
                          <Play size={20} color={INFO} />
                        ) : (
                          <Circle size={20} color={ICON_COLOR} />
                        )}
                        <View className="flex-1">
                          <Text className="text-sm font-bold text-text">
                            {item.titulo}
                          </Text>
                          {item.descripcion ? (
                            <Text className="mt-0.5 text-xs text-text/70">
                              {item.descripcion}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </Animated.View>
            ) : null}

            {/* VOTOS */}
            {activeTab === 'votos' ? (
              <Animated.View entering={FadeInDown.duration(400)} className="gap-4">
                <Text className="text-xs font-bold uppercase tracking-widest text-text/70">
                  Votaciones
                </Text>

                {votaciones.length === 0 ? (
                  <Text className="py-8 text-center text-sm text-text/70">
                    No hay votaciones creadas aún.
                  </Text>
                ) : (
                  votaciones.map((v) => {
                    const results = votos[v.id];
                    return (
                      <View
                        key={v.id}
                        className={`rounded-2xl border p-4 ${
                          v.activa ? '' : 'border-border bg-surface'
                        }`}
                        style={
                          v.activa
                            ? {
                                borderColor: INFO,
                                backgroundColor: 'rgba(0,157,242,0.05)',
                              }
                            : undefined
                        }
                      >
                        <View className="mb-3 flex-row items-center justify-between">
                          <View className="flex-1 pr-2">
                            <Text className="text-sm font-bold text-text" numberOfLines={1}>
                              {v.titulo}
                            </Text>
                            {v.descripcion ? (
                              <Text className="text-xs text-text/70">{v.descripcion}</Text>
                            ) : null}
                          </View>
                          <View
                            className="rounded-full px-2 py-1"
                            style={{
                              backgroundColor: v.activa
                                ? 'rgba(87,191,0,0.2)'
                                : 'rgba(255,255,255,0.1)',
                            }}
                          >
                            <Text
                              className="text-[10px] font-bold uppercase"
                              style={{ color: v.activa ? SUCCESS : ICON_COLOR }}
                            >
                              {v.activa ? 'Abierta' : 'Cerrada'}
                            </Text>
                          </View>
                        </View>

                        {v.activa ? (
                          <View className="mb-3 flex-row flex-wrap gap-2">
                            {(v.opciones ?? []).map((op) => (
                              <Pressable
                                key={op}
                                onPress={() => castVote(v.id, op)}
                                style={({ pressed }) => ({
                                  transform: [{ scale: pressed ? 0.95 : 1 }],
                                })}
                                className="min-w-[80px] flex-1 items-center rounded-xl bg-text/10 py-3"
                              >
                                <Text className="text-xs font-bold uppercase text-text">
                                  {op}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        ) : null}

                        <Pressable onPress={() => fetchVotos(v.id)}>
                          <Text
                            className="text-[10px] font-bold uppercase tracking-widest"
                            style={{ color: INFO }}
                          >
                            Ver resultados
                          </Text>
                        </Pressable>

                        {results ? (
                          <View className="mt-2 gap-1.5">
                            {tally(results, v.opciones ?? []).map(
                              ({ option, count, pct }) => (
                                <View key={option} className="flex-row items-center gap-2">
                                  <Text className="w-20 text-xs text-text" numberOfLines={1}>
                                    {option}
                                  </Text>
                                  <View className="h-2 flex-1 overflow-hidden rounded-full bg-text/10">
                                    <View
                                      className="h-full rounded-full"
                                      style={{
                                        width: `${pct}%`,
                                        backgroundColor: v.activa ? INFO : SUCCESS,
                                      }}
                                    />
                                  </View>
                                  <Text className="w-16 text-right text-[10px] text-text/70">
                                    {count} ({pct}%)
                                  </Text>
                                </View>
                              )
                            )}
                          </View>
                        ) : null}
                      </View>
                    );
                  })
                )}
              </Animated.View>
            ) : null}

            {/* CHAT (opiniones) */}
            {activeTab === 'chat' ? (
              <Animated.View entering={FadeInDown.duration(400)} className="gap-3">
                <Text className="text-xs font-bold uppercase tracking-widest text-text/70">
                  Opiniones
                </Text>
                {opiniones.length === 0 ? (
                  <Text className="py-8 text-center text-sm text-text/70">
                    No hay opiniones aún. Sé el primero en opinar.
                  </Text>
                ) : (
                  opiniones.map((o) => (
                    <View
                      key={o.id}
                      className="rounded-2xl border border-border bg-surface p-3"
                    >
                      <View className="mb-1 flex-row items-center gap-2">
                        <View
                          className="h-7 w-7 items-center justify-center rounded-full"
                          style={{ backgroundColor: 'rgba(0,157,242,0.3)' }}
                        >
                          <Text className="text-[10px] font-bold" style={{ color: INFO }}>
                            {(o.nombre || '?').charAt(0)}
                          </Text>
                        </View>
                        <View className="flex-1">
                          <Text className="text-xs font-bold text-text" numberOfLines={1}>
                            {o.nombre}
                          </Text>
                          {o.apto ? (
                            <Text className="text-[10px] text-text/60">{o.apto}</Text>
                          ) : null}
                        </View>
                        <Text className="text-[10px] text-text/60">
                          {fmtTime(o.createdAt)}
                        </Text>
                      </View>
                      <Text className="pl-9 text-sm text-text">{o.contenido}</Text>
                    </View>
                  ))
                )}
              </Animated.View>
            ) : null}

            {/* INFO */}
            {activeTab === 'info' ? (
              <Animated.View entering={FadeInDown.duration(400)} className="gap-4">
                {/* Quorum */}
                <LiquidGlass radius={16} className="rounded-2xl border border-border p-4">
                  <View className="mb-3 flex-row items-center gap-2">
                    <Users size={14} color={ICON_COLOR} />
                    <Text className="text-xs font-bold uppercase tracking-widest text-text">
                      Quórum
                    </Text>
                  </View>
                  {quorum ? (
                    <View className="flex-row items-center gap-4">
                      <View style={{ width: 80, height: 80 }}>
                        <Svg width={80} height={80} viewBox="0 0 36 36">
                          <SvgCircle
                            cx={18}
                            cy={18}
                            r={15.915}
                            fill="none"
                            stroke="rgba(255,255,255,0.1)"
                            strokeWidth={3}
                          />
                          <SvgCircle
                            cx={18}
                            cy={18}
                            r={15.915}
                            fill="none"
                            stroke={INFO}
                            strokeWidth={3}
                            strokeLinecap="round"
                            strokeDasharray={`${Math.min(
                              Number(quorum.quorumPorcentaje),
                              100
                            )} 100`}
                            rotation={-90}
                            originX={18}
                            originY={18}
                          />
                        </Svg>
                        <View className="absolute inset-0 items-center justify-center">
                          <Text className="text-sm font-bold text-text">
                            {Number(quorum.quorumPorcentaje).toFixed(1)}%
                          </Text>
                        </View>
                      </View>
                      <View className="gap-1">
                        <Text className="text-xs text-text">
                          Coef. presente:{' '}
                          <Text className="font-bold">
                            {Number(quorum.presenteCoeficiente).toFixed(2)}
                          </Text>
                        </Text>
                        <Text className="text-xs text-text">
                          Coef. total:{' '}
                          <Text className="font-bold">
                            {Number(quorum.totalCoeficiente).toFixed(2)}
                          </Text>
                        </Text>
                        <Text className="text-xs text-text">
                          Asistentes:{' '}
                          <Text className="font-bold">{asistencias.length}</Text>
                        </Text>
                      </View>
                    </View>
                  ) : null}
                  <Pressable
                    onPress={registerAttendance}
                    style={({ pressed }) => ({
                      transform: [{ scale: pressed ? 0.97 : 1 }],
                      borderColor: 'rgba(0,157,242,0.4)',
                      backgroundColor: 'rgba(0,157,242,0.2)',
                    })}
                    className="mt-4 items-center rounded-2xl border py-3"
                  >
                    <Text
                      className="text-xs font-bold uppercase tracking-widest"
                      style={{ color: INFO }}
                    >
                      Registrar mi asistencia
                    </Text>
                  </Pressable>
                </LiquidGlass>

                {/* Asistencias */}
                <LiquidGlass radius={16} className="rounded-2xl border border-border p-4">
                  <View className="mb-3 flex-row items-center gap-2">
                    <Shield size={14} color={ICON_COLOR} />
                    <Text className="text-xs font-bold uppercase tracking-widest text-text">
                      Asistencias ({asistencias.length})
                    </Text>
                  </View>
                  <View className="gap-2">
                    {asistencias.map((a) => (
                      <View
                        key={a.id}
                        className="flex-row items-center justify-between border-b border-border py-1"
                      >
                        <Text className="text-xs font-bold text-text">
                          {a.usuarioId ? `${a.usuarioId.slice(0, 8)}...` : '—'}
                        </Text>
                        <Text
                          className="text-[10px] font-bold uppercase"
                          style={{ color: SUCCESS }}
                        >
                          {a.tipo}
                        </Text>
                      </View>
                    ))}
                  </View>
                </LiquidGlass>

                {/* Poderes */}
                {poderes.length > 0 ? (
                  <LiquidGlass radius={16} className="rounded-2xl border border-border p-4">
                    <View className="mb-3 flex-row items-center gap-2">
                      <FileCheck size={14} color={ICON_COLOR} />
                      <Text className="text-xs font-bold uppercase tracking-widest text-text">
                        Poderes ({poderes.length})
                      </Text>
                    </View>
                    <View className="gap-2">
                      {poderes.map((p) => (
                        <View
                          key={p.id}
                          className="flex-row items-center justify-between border-b border-border py-1"
                        >
                          <Text className="flex-1 text-xs text-text" numberOfLines={1}>
                            Otorgante: {p.otorganteId ? `${p.otorganteId.slice(0, 8)}...` : '—'}
                          </Text>
                          <Text
                            className="text-[10px] font-bold"
                            style={{ color: p.verificado ? SUCCESS : INFO }}
                          >
                            {p.verificado ? 'Verificado' : 'Pendiente'}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </LiquidGlass>
                ) : null}
              </Animated.View>
            ) : null}
          </ScrollView>

          {/* CHAT INPUT — pinned under the list, above the floating tab bar. */}
          {activeTab === 'chat' ? (
            <View className="flex-row gap-2 border-t border-border pt-3">
              <TextInput
                value={newOpinion}
                onChangeText={setNewOpinion}
                onSubmitEditing={postOpinion}
                returnKeyType="send"
                placeholder="Escribe tu opinión..."
                placeholderTextColor="rgba(255,255,255,0.5)"
                className="flex-1 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text"
              />
              <Pressable
                onPress={postOpinion}
                disabled={!newOpinion.trim()}
                style={({ pressed }) => ({
                  opacity: !newOpinion.trim() ? 0.3 : pressed ? 0.8 : 1,
                  backgroundColor: INFO,
                })}
                className="w-12 items-center justify-center rounded-xl"
              >
                <Send size={18} color="#FFFFFF" />
              </Pressable>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
