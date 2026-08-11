/**
 * ASAMBLEA - CONJUNTOSAPP (mobile port)
 * Sala de asamblea en vivo: video, orden del día, votaciones, chat, quórum y
 * moderación.
 *
 * Ported from web `src/app/asamblea/page.tsx` (+ `src/components/asamblea/*`):
 *  - GET /asambleas/activa/session → AsambleaDto; 404/empty → "No hay asamblea
 *    activa". `estaEnSesion()` decides whether the session is actually running,
 *    so a PROGRAMADA assembly no longer renders as live.
 *  - Granular fetchers (opiniones / votaciones / asistencias / turnos /
 *    poderes), each with its own catch: /poderes is admin-only and used to 403
 *    the whole Promise.all, leaving every panel empty for residents.
 *  - Realtime: `useWsSubscription('asamblea')` routes each action to just what
 *    it invalidates, with a keyed trailing debounce (a 150-resident vote used to
 *    mean 150 broadcasts x 6 GETs x 150 clients).
 *  - Attendance is registered ONCE on entering (idempotent on
 *    (asamblea_id, usuario_id)); the manual button remains for retries. The
 *    quorum is legally binding, so it cannot depend on pressing a button.
 *  - "Have I already voted?" comes from GET /votaciones/{id}/votos, not local
 *    state, so a reload does not offer the ballot twice.
 *  - Tallies are RAW vote counts, exactly like web's tally().
 *  - Video: full LiveKit room (green room → stage → control bar → reactions),
 *    see src/components/asamblea/LiveRoom.tsx.
 *
 * Theming: the stage is a call screen and stays dark in both schemes, which is
 * what web does too (it hardcodes `bg-[#050d0c] text-white` under its `.light`
 * html class) — see src/components/asamblea/stageChrome.ts. Everything around
 * it (header, agenda strip, side panel) uses the scheme-reactive tokens.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Circle,
  Hand,
  ListOrdered,
  MessageSquare,
  Play,
  Radio,
  Send,
  Shield,
  SlidersHorizontal,
  UserCheck,
  Users,
  Video,
  X,
} from 'lucide-react-native';

import LiveRoom, { Spinner } from '@/components/asamblea/LiveRoom';
import ModeratorPanel from '@/components/asamblea/ModeratorPanel';
import { chrome, ink, scrim } from '@/components/asamblea/stageChrome';
import { estaEnSesion, sessionIniciadaEn } from '@/components/asamblea/session';
import { withAlpha } from '@/components/visitas/colorAlpha';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api } from '@/lib/api/client';
import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor } from '@/theme/tokens';
import { BACK_CHROME_HEIGHT, BackButton, useBackChrome } from '@/components/shell/BackChrome';
import type {
  AsambleaDto,
  AsistenciaDto,
  OpinionDto,
  OrdenDiaItem,
  PoderDto,
  QuorumResponse,
  TurnoDto,
  VotacionDto,
  VotoDto,
} from '@/lib/api/types';

type Panel = 'agenda' | 'votos' | 'chat' | 'personas' | 'moderar';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Raw headcount per option — identical to web's tally(). */
function tally(votes: VotoDto[], options: string[]) {
  const counts: Record<string, number> = {};
  options.forEach((o) => (counts[o] = 0));
  votes.forEach((v) => (counts[v.respuesta] = (counts[v.respuesta] || 0) + 1));
  const total = votes.length || 1;
  return options.map((o) => ({
    option: o,
    count: counts[o] || 0,
    pct: Math.round(((counts[o] || 0) / total) * 100),
  }));
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** Wall-clock length of the session, like the timer every call app shows. */
function useElapsed(startIso?: string): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!startIso) return '';
  const start = new Date(startIso).getTime();
  if (Number.isNaN(start)) return '';
  const secs = Math.max(0, Math.floor((now - start) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Web's `tabular-nums` (timer, quórum, vote counts) — RN's equivalent. */
const TABULAR = { fontVariant: ['tabular-nums' as const] };

/** `animate-pulse` dot for the "En vivo" badge. */
function PulsingDot({ color, size = 6 }: { color: string; size?: number }) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.3, { duration: 900 }), -1, true);
    return () => {
      cancelAnimation(opacity);
    };
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[
        style,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function Asamblea() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Room for the layout's floating back button (BackChrome) — this screen
  // hand-rolls its top padding instead of using the <Screen> primitive.
  const { showBack } = useBackChrome();
  const backPad = showBack ? BACK_CHROME_HEIGHT : 0;
  const { width, height } = useWindowDimensions();
  const { theme } = useTheme();
  const t = tokensFor(theme);
  const isAdmin = user?.rol === 'ADMINISTRADOR' || user?.rol === 'SUPER_ADMIN';

  const [asamblea, setAsamblea] = useState<AsambleaDto | null>(null);
  const [asambleaId, setAsambleaId] = useState('');
  const [loading, setLoading] = useState(true);

  const [panel, setPanel] = useState<Panel | null>(null);
  const [opiniones, setOpiniones] = useState<OpinionDto[]>([]);
  const [votaciones, setVotaciones] = useState<VotacionDto[]>([]);
  const [asistencias, setAsistencias] = useState<AsistenciaDto[]>([]);
  const [turnos, setTurnos] = useState<TurnoDto[]>([]);
  const [poderes, setPoderes] = useState<PoderDto[]>([]);
  const [quorum, setQuorum] = useState<QuorumResponse | null>(null);
  const [votos, setVotos] = useState<Record<string, VotoDto[]>>({});
  const [misVotos, setMisVotos] = useState<Record<string, string>>({});
  const [newOpinion, setNewOpinion] = useState('');
  const [seenOpiniones, setSeenOpiniones] = useState(0);

  const chatScrollRef = useRef<ScrollView>(null);
  const votosRef = useRef<Record<string, VotoDto[]>>({});
  votosRef.current = votos;

  // Trailing debounce keyed by concern; timers are cleared on unmount.
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);
  const schedule = useCallback((key: string, fn: () => void, ms: number) => {
    const timers = timersRef.current;
    const prev = timers.get(key);
    if (prev) clearTimeout(prev);
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        fn();
      }, ms),
    );
  }, []);

  const fetchSession = useCallback(async () => {
    try {
      const data = await api.get<AsambleaDto>('/asambleas/activa/session');
      setAsamblea(data);
      setAsambleaId(data?.id ?? '');
    } catch {
      setAsamblea(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Granular fetchers. One handler that refetched everything on ANY asamblea
  // event turned a single 150-resident ballot into six figures of requests.
  const fetchOpiniones = useCallback(async () => {
    if (!asambleaId) return;
    try {
      setOpiniones(await api.get<OpinionDto[]>(`/asambleas/${asambleaId}/opiniones`));
    } catch {
      /* keep previous */
    }
  }, [asambleaId]);

  const fetchVotaciones = useCallback(async () => {
    if (!asambleaId) return;
    try {
      setVotaciones(await api.get<VotacionDto[]>(`/asambleas/${asambleaId}/votaciones`));
    } catch {
      /* keep previous */
    }
  }, [asambleaId]);

  const fetchQuorum = useCallback(async () => {
    if (!asambleaId) return;
    try {
      const asi = await api.get<QuorumResponse>(`/asambleas/${asambleaId}/asistencias`);
      setAsistencias(asi.asistencias ?? []);
      setQuorum(asi);
    } catch {
      /* keep previous */
    }
  }, [asambleaId]);

  const fetchTurnos = useCallback(async () => {
    if (!asambleaId) return;
    try {
      setTurnos(await api.get<TurnoDto[]>(`/asambleas/${asambleaId}/turnos`));
    } catch {
      /* keep previous */
    }
  }, [asambleaId]);

  const fetchPoderes = useCallback(async () => {
    if (!asambleaId) return;
    try {
      setPoderes(await api.get<PoderDto[]>(`/asambleas/${asambleaId}/poderes`));
    } catch {
      /* poderes are admin-only; ignore 403 */
    }
  }, [asambleaId]);

  /** Refresh the tallies the user actually has open. */
  const refreshOpenTallies = useCallback(async () => {
    const ids = Object.keys(votosRef.current);
    if (ids.length === 0) return;
    const pairs = await Promise.all(
      ids.map(async (id) => {
        try {
          return [id, await api.get<VotoDto[]>(`/votaciones/${id}/votos`)] as const;
        } catch {
          return null;
        }
      }),
    );
    setVotos((prev) => {
      const next = { ...prev };
      for (const pair of pairs) if (pair) next[pair[0]] = pair[1];
      return next;
    });
  }, []);

  const fetchAll = useCallback(async () => {
    await Promise.all([
      fetchOpiniones(),
      fetchVotaciones(),
      fetchQuorum(),
      fetchTurnos(),
      fetchPoderes(),
    ]);
  }, [fetchOpiniones, fetchVotaciones, fetchQuorum, fetchTurnos, fetchPoderes]);

  const fetchVotos = useCallback(async (votacionId: string) => {
    try {
      const d = await api.get<VotoDto[]>(`/votaciones/${votacionId}/votos`);
      setVotos((p) => ({ ...p, [votacionId]: d }));
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /**
   * Route each event to only what it invalidates, and coalesce bursts: during a
   * live vote the broadcasts arrive in a storm, and one trailing refetch is as
   * correct as 150 of them.
   */
  useWsSubscription('asamblea', (event) => {
    switch (event.action) {
      case 'session_updated':
      case 'asamblea_created':
        schedule('session', fetchSession, 150);
        break;
      case 'votacion_created':
      case 'votacion_updated':
        schedule(
          'votaciones',
          () => {
            fetchVotaciones();
            refreshOpenTallies();
          },
          250,
        );
        break;
      case 'voto_cast':
        // Keeps an open tally live instead of frozen at the moment it was opened.
        schedule('votos', refreshOpenTallies, 700);
        break;
      case 'opinion_created':
        schedule('opiniones', fetchOpiniones, 250);
        break;
      case 'asistencia_registered':
        schedule('quorum', fetchQuorum, 700);
        break;
      case 'turno_created':
      case 'turno_updated':
        schedule('turnos', fetchTurnos, 200);
        break;
      case 'poder_created':
      case 'poder_updated':
        schedule('poderes', fetchPoderes, 400);
        break;
      default:
        // "resync" after a dropped socket, or any action added later.
        schedule(
          'all',
          () => {
            fetchSession();
            fetchAll();
            refreshOpenTallies();
          },
          100,
        );
    }
  });

  /**
   * "Have I already voted?" must come from the server, not from local state:
   * after a reload (or the room's token-driven remount) the ballot used to be
   * offered again, and the second vote failed on the unique constraint with a
   * raw error. Optimistic local answers still win over the fetched ones.
   */
  useEffect(() => {
    if (!user?.id) return;
    const derived: Record<string, string> = {};
    for (const [vid, list] of Object.entries(votos)) {
      const mine = list.find((v) => v.usuarioId === user.id);
      if (mine) derived[vid] = mine.respuesta;
    }
    if (Object.keys(derived).length > 0) {
      setMisVotos((prev) => ({ ...derived, ...prev }));
    }
  }, [votos, user?.id]);

  // Load the open ballot's votes so the floating card knows whether this user
  // already voted, and can show a live tally.
  useEffect(() => {
    const id = votaciones.find((v) => v.activa)?.id;
    if (id) fetchVotos(id);
  }, [votaciones, fetchVotos]);

  /**
   * Register attendance once, on entering the room.
   *
   * It used to be a manual button only, so the quorum percentage the assembly
   * relies on legally counted just the handful of people who happened to press
   * it — everyone else was present on video but absent from the quorum. The
   * endpoint is idempotent (unique (asamblea_id, usuario_id)), and a duplicate
   * 409 is the expected no-op on re-entry.
   */
  const asistenciaEnviada = useRef(false);
  useEffect(() => {
    if (!asambleaId || !user?.id || asistenciaEnviada.current) return;
    asistenciaEnviada.current = true;
    api
      .post(`/asambleas/${asambleaId}/asistencias`, { tipo: 'VIRTUAL' })
      .then(() => fetchQuorum())
      .catch(() => {
        /* already registered, or offline — the manual button remains */
      });
  }, [asambleaId, user?.id, fetchQuorum]);

  // Keep the chat pinned to the newest message while the panel is open.
  useEffect(() => {
    if (panel === 'chat') {
      chatScrollRef.current?.scrollToEnd({ animated: true });
      setSeenOpiniones(opiniones.length);
    }
  }, [panel, opiniones.length]);

  const enSesion = asamblea ? estaEnSesion(asamblea) : false;
  const elapsed = useElapsed(sessionIniciadaEn(asamblea?.sessionState) ?? asamblea?.fecha);

  const ordenDia = useMemo<OrdenDiaItem[]>(
    () => (Array.isArray(asamblea?.ordenDia) ? asamblea.ordenDia : []),
    [asamblea],
  );
  const currentItem = ordenDia[asamblea?.itemActivoIndex ?? 0];
  const activeVotacion = votaciones.find((v) => v.activa);
  const misTurnos = turnos.filter((turno) => turno.usuarioId === user?.id);
  const handRaised = misTurnos.some((turno) => turno.estado === 'PENDIENTE');
  const tengoLaPalabra = misTurnos.some((turno) => turno.estado === 'HABLANDO');
  const colaTurnos = turnos.filter(
    (turno) => turno.estado === 'PENDIENTE' || turno.estado === 'HABLANDO',
  );
  const yaRegistrado = asistencias.some((a) => a.usuarioId === user?.id);
  const chatBadge = Math.max(0, opiniones.length - seenOpiniones);

  const postOpinion = async () => {
    if (!newOpinion.trim() || !asambleaId) return;
    const text = newOpinion.trim();
    setNewOpinion('');
    try {
      await api.post(`/asambleas/${asambleaId}/opiniones`, { contenido: text });
      fetchAll();
    } catch {
      toast.error('Error al enviar el mensaje');
      setNewOpinion(text);
    }
  };

  const requestTurn = async () => {
    if (!asambleaId) return;
    if (handRaised) {
      toast.info('Ya tienes la mano levantada');
      return;
    }
    try {
      await api.post(`/asambleas/${asambleaId}/turnos`);
      toast.success('Pediste la palabra — espera a que te den el turno');
      fetchAll();
    } catch {
      toast.error('Error al pedir la palabra');
    }
  };

  const castVote = async (votacionId: string, respuesta: string) => {
    try {
      await api.post(`/votaciones/${votacionId}/votos`, { respuesta });
      setMisVotos((p) => ({ ...p, [votacionId]: respuesta }));
      toast.success(`Voto registrado: ${respuesta}`);
      fetchVotos(votacionId);
    } catch {
      toast.error('Error al votar');
    }
  };

  const registerAttendance = async () => {
    if (!asambleaId) return;
    try {
      await api.post(`/asambleas/${asambleaId}/asistencias`, { tipo: 'VIRTUAL' });
      toast.success('Asistencia registrada');
      fetchAll();
    } catch {
      toast.error('Error al registrar asistencia');
    }
  };

  const advanceAgenda = async () => {
    if (!asamblea) return;
    try {
      await api.put('/asambleas/activa/session', {
        itemActivoIndex: asamblea.itemActivoIndex + 1,
        version: asamblea.version,
      });
    } catch {
      toast.error('Error al avanzar la agenda');
    }
  };

  const setSession = async (patch: Record<string, unknown>, errMsg: string) => {
    if (!asamblea) return;
    try {
      await api.put('/asambleas/activa/session', { ...patch, version: asamblea.version });
      fetchSession();
    } catch {
      toast.error(errMsg);
    }
  };

  const startSession = () =>
    // Record WHEN it started: the call timer used to count from the scheduled
    // date, so an assembly convened for 9am and started at 11am opened showing
    // two hours already elapsed.
    setSession(
      {
        activa: true,
        sessionState: { estado: 'INICIADA', iniciadaEn: new Date().toISOString() },
      },
      'Error al iniciar la sesión',
    );

  const finishSession = () =>
    setSession({ activa: false, sessionState: 'FINALIZADA' }, 'Error al finalizar la asamblea');

  const goToItem = (index: number) =>
    setSession({ itemActivoIndex: index }, 'Error al cambiar de punto');

  const createVotacion = async (titulo: string, opciones: string[]) => {
    if (!asambleaId || !titulo) return;
    try {
      await api.post(`/asambleas/${asambleaId}/votaciones`, {
        titulo,
        ...(opciones.length > 0 ? { opciones } : {}),
      });
      toast.success('Votación creada');
      fetchAll();
    } catch {
      toast.error('Error al crear la votación');
    }
  };

  const verifyPoder = async (pid: string, verificado: boolean) => {
    if (!asambleaId) return;
    try {
      await api.put(`/asambleas/${asambleaId}/poderes/${pid}`, { verificado });
      fetchAll();
    } catch {
      toast.error('Error al actualizar el poder');
    }
  };

  const updateTurno = async (tid: string, estado: string) => {
    if (!asambleaId) return;
    try {
      await api.put(`/asambleas/${asambleaId}/turnos/${tid}`, { estado });
      fetchAll();
    } catch {
      toast.error('Error al actualizar el turno');
    }
  };

  const toggleVotacion = async (vid: string, activa: boolean) => {
    if (!asambleaId) return;
    try {
      await api.put(`/asambleas/${asambleaId}/votaciones/${vid}`, { activa });
      fetchAll();
    } catch {
      toast.error('Error al actualizar la votación');
    }
  };

  // ── Loading / empty ─────────────────────────────────────────────────────

  if (authLoading || loading) {
    return (
      <View className="flex-1 items-center justify-center bg-primary">
        <Spinner size={40} />
      </View>
    );
  }

  if (!asamblea) {
    return (
      <View className="flex-1 items-center justify-center bg-primary p-6">
        <View className="max-w-sm items-center">
          <View className="mb-5 h-20 w-20 items-center justify-center rounded-3xl border border-border bg-text/5">
            <Video size={32} color={withAlpha(t.text, 0.6)} />
          </View>
          <Text className="mb-2 text-xl font-semibold text-text">No hay asamblea activa</Text>
          <Text className="text-center text-sm leading-relaxed text-text/65">
            Cuando la administración inicie una asamblea, la sala se abrirá aquí
            automáticamente.
          </Text>
        </View>
      </View>
    );
  }

  const quorumPct = Number(quorum?.quorumPorcentaje ?? 0);
  // The floating tab bar of app/(app)/_layout.tsx overlays every screen, so the
  // control bar has to sit above it. See hoistNeeded: web renders /asamblea
  // outside the app shell entirely.
  const tabBarClearance = Math.max(insets.bottom, 16) + 68;
  type PanelTab = [Panel, string, (color: string) => ReactElement];
  const panelTabs: PanelTab[] = [
    ['agenda', 'Agenda', (c) => <ListOrdered size={13} color={c} />],
    ['votos', 'Votos', (c) => <BarChart3 size={13} color={c} />],
    ['chat', 'Chat', (c) => <MessageSquare size={13} color={c} />],
    ['personas', 'Personas', (c) => <Users size={13} color={c} />],
    ...(isAdmin
      ? ([['moderar', 'Moderar', (c) => <SlidersHorizontal size={13} color={c} />]] as PanelTab[])
      : []),
  ];

  const openPanel = (p: Panel) => setPanel((cur) => (cur === p ? null : p));

  return (
    <View className="flex-1 bg-primary" style={{ paddingTop: insets.top + backPad }}>
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <View className="flex-row items-center gap-3 border-b border-border px-3" style={{ height: 56 }}>
        <View className="flex-row items-center gap-2" style={{ flexShrink: 1 }}>
          <View className="flex-row items-center gap-1.5 rounded-full border border-danger/30 bg-danger/15 px-2 py-1">
            <PulsingDot color={t.danger} />
            <Text className="text-[9px] font-bold uppercase tracking-widest text-danger">
              En vivo
            </Text>
          </View>
          <Text numberOfLines={1} className="text-sm font-semibold text-text" style={{ flexShrink: 1 }}>
            {asamblea.titulo}
          </Text>
        </View>

        {/* Web pairs every live number with `tabular-nums` so it stops jittering
            once a second; NativeWind has no such utility, RN has fontVariant. */}
        {enSesion ? (
          <Text className="text-xs text-text/60" style={TABULAR}>
            {elapsed}
          </Text>
        ) : null}

        <Pressable
          onPress={() => openPanel('personas')}
          accessibilityRole="button"
          accessibilityLabel="Quórum y asistentes"
          className="ml-auto flex-row items-center gap-1.5 rounded-full border border-border bg-text/5 px-2.5 py-1.5"
        >
          <Users size={13} color={withAlpha(t.text, 0.7)} />
          <Text className="text-[11px] font-semibold text-text" style={TABULAR}>
            {`${quorumPct.toFixed(1)}%`}
          </Text>
        </Pressable>
      </View>

      {/* Floor / attendance pills. Web keeps them in the same header row, which
          only fits on a tablet (`hidden sm:flex`); on the phone they get a row. */}
      {tengoLaPalabra || !yaRegistrado ? (
        <View className="flex-row items-center gap-2 border-b border-border px-3 py-1.5">
          {tengoLaPalabra ? (
            <View className="flex-row items-center gap-1.5 rounded-full bg-accent px-2.5 py-1">
              <Radio size={11} color={t.onAccent} />
              <Text className="text-[9px] font-bold uppercase tracking-widest text-on-accent">
                Tienes la palabra
              </Text>
            </View>
          ) : null}
          {!yaRegistrado ? (
            <Pressable
              onPress={registerAttendance}
              accessibilityRole="button"
              className="flex-row items-center gap-1.5 rounded-full bg-accent px-3 py-1.5"
            >
              <UserCheck size={12} color={t.onAccent} />
              <Text className="text-[10px] font-bold uppercase tracking-widest text-on-accent">
                Registrar asistencia
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* ── Agenda strip ─────────────────────────────────────────────── */}
      {currentItem ? (
        <View className="flex-row items-center gap-2 border-b border-border bg-text/[0.02] px-3 py-2">
          <Text className="text-[9px] font-bold uppercase tracking-widest text-text/60">
            {`Punto ${(asamblea.itemActivoIndex ?? 0) + 1}/${ordenDia.length}`}
          </Text>
          <ChevronRight size={12} color={withAlpha(t.text, 0.2)} />
          <Text numberOfLines={1} className="text-xs text-text/80" style={{ flexShrink: 1 }}>
            {currentItem.titulo}
          </Text>
          {isAdmin && asamblea.itemActivoIndex < ordenDia.length - 1 ? (
            <Pressable
              onPress={advanceAgenda}
              accessibilityRole="button"
              className="ml-auto flex-row items-center gap-1 rounded-full border border-border bg-text/[0.08] px-2.5 py-1"
            >
              <Text className="text-[10px] font-semibold text-text">Siguiente</Text>
              <ArrowRight size={11} color={t.text} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* ── Stage ────────────────────────────────────────────────────── */}
      <View
        style={{
          flex: 1,
          position: 'relative',
          backgroundColor: chrome.primary,
          paddingBottom: tabBarClearance,
        }}
      >
        {asambleaId ? (
          <LiveRoom
            asambleaId={asambleaId}
            titulo={asamblea.titulo}
            // Hanging up used to disconnect the room and leave the user staring
            // at a dead stage with no way back.
            onDisconnect={() => router.replace('/(app)/inicio')}
            onRequestFloor={requestTurn}
            handRaised={handRaised}
            onOpenPanel={(p) => openPanel(p)}
            chatBadge={chatBadge}
            participantCount={asistencias.length || 1}
          />
        ) : null}

        {/* Live vote — floats over the stage so nobody misses it */}
        {activeVotacion ? (
          <View
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              zIndex: 20,
              width: Math.min(width * 0.92, 320),
              borderRadius: 16,
              overflow: 'hidden',
              backgroundColor: scrim(0.75),
              borderWidth: 1,
              borderColor: ink(0.15),
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 8,
                paddingHorizontal: 16,
                paddingTop: 12,
                paddingBottom: 8,
                borderBottomWidth: 1,
                borderBottomColor: ink(0.1),
              }}
            >
              <BarChart3 size={14} color={ink(0.6)} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 9,
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    letterSpacing: 1.5,
                    color: ink(0.6),
                  }}
                >
                  Votación abierta
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: chrome.text,
                    marginTop: 2,
                  }}
                >
                  {activeVotacion.titulo}
                </Text>
              </View>
            </View>

            {misVotos[activeVotacion.id] ? (
              <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                <Text style={{ fontSize: 12, color: ink(0.6) }}>
                  Votaste{' '}
                  <Text style={{ fontWeight: '700', color: chrome.text }}>
                    {misVotos[activeVotacion.id]}
                  </Text>
                </Text>
              </View>
            ) : (
              <View
                style={{
                  padding: 12,
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                {(activeVotacion.opciones ?? []).map((op) => (
                  <Pressable
                    key={op}
                    onPress={() => castVote(activeVotacion.id, op)}
                    accessibilityRole="button"
                    style={({ pressed }) => ({
                      flexGrow: 1,
                      flexBasis: '28%',
                      alignItems: 'center',
                      paddingVertical: 10,
                      borderRadius: 12,
                      backgroundColor: ink(0.1),
                      borderWidth: 1,
                      borderColor: ink(0.15),
                      transform: [{ scale: pressed ? 0.95 : 1 }],
                    })}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '700',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        color: chrome.text,
                      }}
                    >
                      {op}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        ) : null}
      </View>

      {/* ── Side panel: modal bottom sheet ───────────────────────────── */}
      <Modal
        visible={panel !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPanel(null)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable
            accessibilityLabel="Cerrar panel"
            onPress={() => setPanel(null)}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: scrim(0.6) }}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ height: height * 0.7 }}
          >
            <View
              accessibilityLabel="Panel de la asamblea"
              className="flex-1 rounded-t-3xl border-t border-border bg-primary-light"
            >
              {/* Tab row */}
              <View className="flex-row items-center gap-1 border-b border-border p-2">
                {panelTabs.map(([id, label, icon]) => {
                  const active = panel === id;
                  return (
                    <Pressable
                      key={id}
                      onPress={() => setPanel(id)}
                      accessibilityRole="tab"
                      accessibilityLabel={label}
                      accessibilityState={{ selected: active }}
                      className={`min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2 ${
                        active ? 'bg-accent' : ''
                      }`}
                    >
                      {/* Web shows the label only from `sm:` up
                          (page.tsx:656 `hidden sm:inline`), so the phone tab row
                          is icon-only; the label rides accessibilityLabel. */}
                      {icon(active ? t.onAccent : withAlpha(t.text, 0.5))}
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => setPanel(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar panel"
                  className="h-8 w-8 items-center justify-center rounded-xl"
                >
                  <X size={15} color={withAlpha(t.text, 0.6)} />
                </Pressable>
              </View>

              <ScrollView
                ref={chatScrollRef}
                className="flex-1"
                contentContainerStyle={{ padding: 12 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                onContentSizeChange={() => {
                  if (panel === 'chat') chatScrollRef.current?.scrollToEnd({ animated: true });
                }}
              >
                {/* AGENDA */}
                {panel === 'agenda' ? (
                  <View className="gap-2">
                    {ordenDia.length === 0 ? (
                      <Text className="py-8 text-center text-xs text-text/60">
                        Esta asamblea no tiene orden del día.
                      </Text>
                    ) : null}
                    {ordenDia.map((item, i) => {
                      const done = i < asamblea.itemActivoIndex;
                      const current = i === asamblea.itemActivoIndex;
                      return (
                        <View
                          key={item.id ?? i}
                          className={`rounded-2xl border p-3 ${
                            current
                              ? 'border-text/40 bg-text/[0.07]'
                              : 'border-text/[0.08] bg-text/[0.02]'
                          }`}
                        >
                          <View className="flex-row items-start gap-2.5">
                            {done ? (
                              <CheckCircle2 size={15} color={withAlpha(t.text, 0.6)} />
                            ) : current ? (
                              <Play size={15} color={t.text} />
                            ) : (
                              <Circle size={15} color={withAlpha(t.text, 0.2)} />
                            )}
                            <View className="flex-1">
                              <Text
                                className={`text-xs font-semibold ${
                                  done ? 'text-text/60 line-through' : 'text-text'
                                }`}
                              >
                                {item.titulo}
                              </Text>
                              {item.descripcion ? (
                                <Text className="mt-0.5 text-[11px] text-text/65">
                                  {item.descripcion}
                                </Text>
                              ) : null}
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                {/* VOTOS */}
                {panel === 'votos' ? (
                  <View className="gap-3">
                    {votaciones.length === 0 ? (
                      <Text className="py-8 text-center text-xs text-text/60">
                        Todavía no hay votaciones.
                      </Text>
                    ) : null}
                    {votaciones.map((v) => {
                      const results = votos[v.id] ? tally(votos[v.id], v.opciones ?? []) : null;
                      return (
                        <View
                          key={v.id}
                          className={`rounded-2xl border p-3 ${
                            v.activa
                              ? 'border-text/30 bg-text/[0.06]'
                              : 'border-text/[0.08] bg-text/[0.02]'
                          }`}
                        >
                          <View className="mb-2 flex-row items-start justify-between gap-2">
                            <Text className="flex-1 text-xs font-semibold text-text">
                              {v.titulo}
                            </Text>
                            <View
                              className={`rounded-full px-2 py-0.5 ${
                                v.activa ? 'bg-accent' : 'bg-text/10'
                              }`}
                            >
                              <Text
                                className={`text-[9px] font-bold uppercase ${
                                  v.activa ? 'text-on-accent' : 'text-text/50'
                                }`}
                              >
                                {v.activa ? 'Abierta' : 'Cerrada'}
                              </Text>
                            </View>
                          </View>

                          {v.activa && !misVotos[v.id] ? (
                            <View className="mb-2 flex-row flex-wrap gap-1.5">
                              {(v.opciones ?? []).map((op) => (
                                <Pressable
                                  key={op}
                                  onPress={() => castVote(v.id, op)}
                                  accessibilityRole="button"
                                  style={({ pressed }) => ({
                                    flexGrow: 1,
                                    flexBasis: '28%',
                                    transform: [{ scale: pressed ? 0.95 : 1 }],
                                  })}
                                  className="items-center rounded-lg border border-text/[0.12] bg-text/10 py-2"
                                >
                                  <Text className="text-[10px] font-bold uppercase text-text">
                                    {op}
                                  </Text>
                                </Pressable>
                              ))}
                            </View>
                          ) : null}

                          {misVotos[v.id] ? (
                            <Text className="mb-2 text-[11px] text-text/50">
                              Tu voto:{' '}
                              <Text className="font-bold text-text">{misVotos[v.id]}</Text>
                            </Text>
                          ) : null}

                          {results ? (
                            <View className="gap-1.5">
                              {results.map(({ option, count, pct }) => (
                                <View key={option} className="flex-row items-center gap-2">
                                  <Text
                                    numberOfLines={1}
                                    className="w-16 text-[10px] text-text/60"
                                  >
                                    {option}
                                  </Text>
                                  <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-text/[0.08]">
                                    <View
                                      className="h-full rounded-full bg-accent"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </View>
                                  <Text
                                    className="w-12 text-right text-[10px] text-text/65"
                                    style={TABULAR}
                                  >
                                    {`${count} · ${pct}%`}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          ) : (
                            <Pressable onPress={() => fetchVotos(v.id)} accessibilityRole="button">
                              <Text className="text-[10px] font-semibold uppercase tracking-wide text-text/65">
                                Ver resultados
                              </Text>
                            </Pressable>
                          )}

                          {isAdmin ? (
                            <Pressable
                              onPress={() => toggleVotacion(v.id, !v.activa)}
                              accessibilityRole="button"
                              className="mt-2.5 w-full items-center rounded-lg border border-border py-1.5"
                            >
                              <Text className="text-[10px] font-semibold text-text/60">
                                {v.activa ? 'Cerrar votación' : 'Reabrir votación'}
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                {/* CHAT */}
                {panel === 'chat' ? (
                  <View
                    className="gap-2.5"
                    accessibilityLabel="Mensajes de la asamblea"
                    // Web marks the list `role="log" aria-live="polite"`; the RN
                    // equivalent of the live region is this prop (Android).
                    accessibilityLiveRegion="polite"
                  >
                    {opiniones.length === 0 ? (
                      <Text className="py-8 text-center text-xs text-text/60">
                        Nadie ha escrito todavía.
                      </Text>
                    ) : null}
                    {opiniones.map((o) => {
                      const mine = o.usuarioId === user?.id;
                      return (
                        <View
                          key={o.id}
                          className={`flex-row gap-2 ${mine ? 'flex-row-reverse' : ''}`}
                        >
                          <View className="h-7 w-7 items-center justify-center rounded-full border border-border bg-text/10">
                            <Text className="text-[10px] font-bold text-text/70">
                              {(o.nombre ?? '?')[0]}
                            </Text>
                          </View>
                          <View className="max-w-[80%]">
                            <View
                              className={`mb-0.5 flex-row items-baseline gap-1.5 ${
                                mine ? 'justify-end' : ''
                              }`}
                            >
                              <Text
                                numberOfLines={1}
                                className="text-[10px] font-semibold text-text/70"
                              >
                                {mine ? 'Tú' : o.nombre}
                              </Text>
                              {o.apto ? (
                                <Text className="text-[9px] text-text/55">{o.apto}</Text>
                              ) : null}
                              <Text className="text-[9px] text-text/55" style={TABULAR}>
                                {fmtTime(o.createdAt)}
                              </Text>
                            </View>
                            <View
                              className={`rounded-2xl px-3 py-2 ${
                                mine
                                  ? 'rounded-tr-sm bg-text'
                                  : 'rounded-tl-sm border border-border bg-text/[0.07]'
                              }`}
                            >
                              <Text
                                className={`text-xs leading-relaxed ${
                                  mine ? 'text-primary' : 'text-text/90'
                                }`}
                              >
                                {o.contenido}
                              </Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                {/* MODERAR */}
                {panel === 'moderar' && isAdmin ? (
                  <ModeratorPanel
                    enSesion={estaEnSesion(asamblea)}
                    ordenDia={ordenDia}
                    itemActivoIndex={asamblea.itemActivoIndex}
                    votaciones={votaciones}
                    turnos={turnos}
                    poderes={poderes}
                    onStartSession={startSession}
                    onFinishSession={finishSession}
                    onGoToItem={goToItem}
                    onCreateVotacion={createVotacion}
                    onToggleVotacion={toggleVotacion}
                    onUpdateTurno={updateTurno}
                    onVerifyPoder={verifyPoder}
                  />
                ) : null}

                {/* PERSONAS */}
                {panel === 'personas' ? (
                  <View className="gap-4">
                    <View className="rounded-2xl border border-border bg-text/[0.03] p-4">
                      <View className="flex-row items-center gap-4">
                        <View style={{ width: 64, height: 64 }}>
                          <Svg width={64} height={64} viewBox="0 0 36 36">
                            <SvgCircle
                              cx={18}
                              cy={18}
                              r={15.915}
                              fill="none"
                              stroke={withAlpha(t.text, 0.08)}
                              strokeWidth={3}
                            />
                            <SvgCircle
                              cx={18}
                              cy={18}
                              r={15.915}
                              fill="none"
                              stroke={t.accent}
                              strokeWidth={3}
                              strokeLinecap="round"
                              strokeDasharray={`${Math.min(quorumPct, 100)} 100`}
                              rotation={-90}
                              originX={18}
                              originY={18}
                            />
                          </Svg>
                          <View className="absolute inset-0 items-center justify-center">
                            <Text className="text-[11px] font-bold text-text" style={TABULAR}>
                              {`${quorumPct.toFixed(0)}%`}
                            </Text>
                          </View>
                        </View>
                        <View className="gap-0.5">
                          <Text className="mb-1 text-[9px] font-bold uppercase tracking-widest text-text/60">
                            Quórum
                          </Text>
                          <Text className="text-[11px] text-text/60">
                            Presente:{' '}
                            <Text className="font-semibold text-text" style={TABULAR}>
                              {Number(quorum?.presenteCoeficiente ?? 0).toFixed(2)}
                            </Text>
                          </Text>
                          <Text className="text-[11px] text-text/60">
                            Total:{' '}
                            <Text className="font-semibold text-text" style={TABULAR}>
                              {Number(quorum?.totalCoeficiente ?? 0).toFixed(2)}
                            </Text>
                          </Text>
                          <Text className="text-[11px] text-text/60">
                            Asistentes:{' '}
                            <Text className="font-semibold text-text" style={TABULAR}>
                              {asistencias.length}
                            </Text>
                          </Text>
                        </View>
                      </View>

                      {!yaRegistrado ? (
                        <Pressable
                          onPress={registerAttendance}
                          accessibilityRole="button"
                          className="mt-3 w-full items-center rounded-xl bg-text py-2.5"
                        >
                          <Text className="text-[10px] font-bold uppercase tracking-widest text-primary">
                            Registrar mi asistencia
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>

                    <View>
                      <View className="mb-2 flex-row items-center gap-1.5">
                        <Hand size={11} color={withAlpha(t.text, 0.6)} />
                        <Text className="text-[9px] font-bold uppercase tracking-widest text-text/60">
                          {`Cola de palabra (${colaTurnos.length})`}
                        </Text>
                      </View>
                      {colaTurnos.length === 0 ? (
                        <Text className="py-2 text-[11px] text-text/55">
                          Nadie ha pedido la palabra.
                        </Text>
                      ) : (
                        <View className="gap-1.5">
                          {colaTurnos.map((turno, i) => (
                            <View
                              key={turno.id}
                              className={`flex-row items-center gap-2 rounded-xl border px-3 py-2 ${
                                turno.estado === 'HABLANDO'
                                  ? 'border-text/40 bg-text/[0.08]'
                                  : 'border-text/[0.08] bg-text/[0.02]'
                              }`}
                            >
                              <View className="h-5 w-5 items-center justify-center rounded-full bg-text/[0.08]">
                                {turno.estado === 'HABLANDO' ? (
                                  <Radio size={10} color={withAlpha(t.text, 0.5)} />
                                ) : (
                                  <Text className="text-[9px] font-bold text-text/50">
                                    {i + 1}
                                  </Text>
                                )}
                              </View>
                              <View className="min-w-0 flex-1">
                                <Text
                                  numberOfLines={1}
                                  className="text-[11px] font-semibold text-text"
                                >
                                  {turno.nombre}
                                </Text>
                                {turno.apto ? (
                                  <Text className="text-[9px] text-text/60">{turno.apto}</Text>
                                ) : null}
                              </View>
                              {isAdmin ? (
                                <Pressable
                                  onPress={() =>
                                    updateTurno(
                                      turno.id,
                                      turno.estado === 'HABLANDO' ? 'COMPLETADO' : 'HABLANDO',
                                    )
                                  }
                                  accessibilityRole="button"
                                  className="rounded-lg border border-text/[0.12] bg-text/10 px-2.5 py-1"
                                >
                                  <Text className="text-[9px] font-bold uppercase text-text">
                                    {turno.estado === 'HABLANDO' ? 'Terminar' : 'Dar palabra'}
                                  </Text>
                                </Pressable>
                              ) : null}
                            </View>
                          ))}
                        </View>
                      )}
                    </View>

                    <View>
                      <View className="mb-2 flex-row items-center gap-1.5">
                        <Shield size={11} color={withAlpha(t.text, 0.6)} />
                        <Text className="text-[9px] font-bold uppercase tracking-widest text-text/60">
                          {`Asistencia registrada (${asistencias.length})`}
                        </Text>
                      </View>
                      <View className="gap-1">
                        {asistencias.map((a) => (
                          <View
                            key={a.id}
                            className="flex-row items-center justify-between rounded-lg border border-border bg-text/[0.02] px-3 py-1.5"
                          >
                            <Text numberOfLines={1} className="text-[11px] text-text/70">
                              {a.usuarioId === user?.id ? 'Tú' : `${a.usuarioId.slice(0, 8)}…`}
                            </Text>
                            <Text className="text-[9px] font-bold uppercase text-text/60">
                              {a.tipo}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>
                ) : null}
              </ScrollView>

              {/* Chat composer */}
              {panel === 'chat' ? (
                <View
                  className="flex-row gap-2 border-t border-border p-2.5"
                  style={{ paddingBottom: Math.max(insets.bottom, 10) }}
                >
                  <TextInput
                    value={newOpinion}
                    onChangeText={setNewOpinion}
                    onSubmitEditing={postOpinion}
                    returnKeyType="send"
                    placeholder="Escribe un mensaje…"
                    placeholderTextColor={withAlpha(t.text, 0.55)}
                    className="flex-1 rounded-full border border-border bg-text/[0.06] px-4 py-2.5 text-xs text-text"
                  />
                  <Pressable
                    onPress={postOpinion}
                    disabled={!newOpinion.trim()}
                    accessibilityRole="button"
                    accessibilityLabel="Enviar mensaje"
                    className="h-10 w-10 items-center justify-center rounded-full bg-accent"
                    style={({ pressed }) => ({
                      opacity: !newOpinion.trim() ? 0.25 : 1,
                      transform: [{ scale: pressed ? 0.9 : 1 }],
                    })}
                  >
                    <Send size={15} color={t.onAccent} />
                  </Pressable>
                </View>
              ) : null}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <BackButton />
    </View>
  );
}
