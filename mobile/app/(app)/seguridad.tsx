/**
 * SEGURIDAD — CONJUNTOSAPP (mobile port)
 * Central de Seguridad: monitoreo CCTV (feeds simulados) y control de rondas
 * de vigilancia con verificación NFC.
 *
 * Ported from web src/app/(app)/seguridad/page.tsx.
 *
 * Notas de la portabilidad:
 *  - El web dibuja los 4 feeds CCTV en <canvas> con requestAnimationFrame. RN
 *    no tiene canvas, así que se reproduce el MISMO dibujo con react-native-svg
 *    y un único ticker compartido que avanza `frame` a ~60 unidades/segundo
 *    (igual que el rAF del web), de modo que todas las fórmulas de animación
 *    (scanY = frame*2, sin(frame*0.03), floor(frame/30)%2 …) son idénticas.
 *  - Los colores internos del feed usan los tokens del esquema OSCURO porque el
 *    lienzo es negro en ambos esquemas (`bg-black`, igual que el web).
 *  - Web NFC (`NDEFReader`) no existe en React Native y el proyecto no tiene
 *    dependencia NFC, así que `nfcSupported` es false: se reproduce exactamente
 *    el estado "no soportado" del web (botón deshabilitado + aviso ámbar).
 *    `readNfcTagSerial()` es el único punto a implementar cuando entre la dep.
 *  - Los DTO de rondas NFC del backend se serializan en camelCase
 *    (`puntoId`, `puntoNombre`, `puntosTotales`, `completadaNfc`, `nfcUid`,
 *    `rondaId`); el web los lee/escribe en snake_case, lo que rompe el flujo
 *    contra el backend real. Aquí se usan los nombres reales del serializador.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useColorScheme } from 'nativewind';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeInDown,
  ZoomIn,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  G,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import {
  Activity,
  AlertTriangle,
  Check,
  ChevronLeft,
  ClipboardList,
  Clock,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  Shield,
} from 'lucide-react-native';

import ProfileHeader from '@/components/shell/ProfileHeader';
import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { toast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { darkTokens, tokensFor } from '@/theme/tokens';
import type { RondaDto } from '@/lib/api/types';

// ---------------------------------------------------------------------------
// Tipos locales (los DTO de rondas NFC aún no están en @/lib/api/types)
// ---------------------------------------------------------------------------

interface Camera {
  id: number;
  name: string;
  location: string;
  status: 'ONLINE' | 'ALERTA';
  fps: number;
}

interface PuntoRondaDto {
  id: string;
  nfcUid: string;
  nombre: string;
  ubicacion: string | null;
  orden: number;
  activo: boolean;
}

interface CheckpointRondaDto {
  id: string;
  puntoId: string;
  nfcUid: string;
  puntoNombre: string;
  verificadoEn: string;
}

interface RondaConCheckpointsDto extends RondaDto {
  puntosTotales: number;
  checkpoints: CheckpointRondaDto[];
  completadaNfc: boolean;
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const ALLOWED_ROLES = [
  'VIGILANTE',
  'SUPERVISOR_VIGILANCIA',
  'ADMINISTRADOR',
  'SUPER_ADMIN',
];

const CAMERAS: Camera[] = [
  { id: 1, name: 'CAM-01', location: 'Lobby Principal', status: 'ONLINE', fps: 30 },
  { id: 2, name: 'CAM-02', location: 'Sótano Parqueadero', status: 'ONLINE', fps: 24 },
  { id: 3, name: 'CAM-03', location: 'Portería Principal', status: 'ONLINE', fps: 30 },
  { id: 4, name: 'CAM-04', location: 'Ascensores Torres', status: 'ONLINE', fps: 25 },
];

/** Lienzo del feed, igual que el `canvas.width/height` del web. */
const FEED_W = 320;
const FEED_H = 240;

/** El web anima con rAF (~60 fps). Aquí un solo ticker a ~15 Hz avanza 4
 *  unidades por tick → ~60 unidades/segundo, así las fórmulas no cambian. */
const TICK_MS = 66;
const TICK_STEP = 4;

/** Fuente monoespaciada cargada en app/_layout.tsx (web: `bold 9px monospace`). */
const MONO = 'JetBrainsMono_500Medium';

// Literales one-off que el propio web usa para estos elementos exactos del
// lienzo (no existen como tokens): fondo del feed, rejilla térmica, caja del
// carro, brazo de la barrera y el "glitch" blanco.
const FEED_BG = '#0a0f0d';
const FEED_BG_THERMAL = '#110022';
const GRID_THERMAL = '#b432f0';
const CAR_BOX = '#60a5fa';
const CAR_BOX_THERMAL = '#ec4899';
const GATE_ARM = '#f43f5e';
const GLITCH = '#ffffff';
/** Filtro térmico activo: el web usa bg-purple-600 / border-purple-500. */
const THERMAL_BG = '#9333ea';
const THERMAL_BORDER = '#a855f7';

/** Pseudoaleatorio determinista: sustituye `Math.random()` del bucle de dibujo
 *  para que el render siga siendo puro (mismo efecto visual de glitch). */
function noise(seed: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Soporte NFC. El web detecta `"NDEFReader" in window` (solo Chrome Android);
 * en React Native no existe Web NFC y el proyecto no tiene dependencia NFC
 * nativa, así que se reproduce exactamente el estado "no soportado" del web.
 */
const NFC_SUPPORTED: boolean = false;

/**
 * Lectura de un tag NFC. No hay Web NFC (`NDEFReader`) en React Native ni
 * dependencia NFC nativa en el proyecto, así que siempre falla con el mismo
 * mensaje que el web muestra en dispositivos/navegadores sin soporte.
 */
async function readNfcTagSerial(): Promise<string> {
  throw new Error('NFC no soportado en este dispositivo/navegador. Usa Chrome en Android.');
}

// ---------------------------------------------------------------------------
// Equivalentes RN de las animaciones CSS del web
// ---------------------------------------------------------------------------

/** `animate-pulse` de Tailwind: opacidad 1 → 0.35 en bucle (convención del repo). */
function Pulse({ className, children }: { className?: string; children?: ReactNode }) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.35, { duration: 900 }), -1, true);
    return () => cancelAnimation(opacity);
  }, [opacity]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View className={className} style={animated}>
      {children}
    </Animated.View>
  );
}

/** `animate-bounce` de Tailwind: sube y baja en bucle. */
function Bounce({ children }: { children: ReactNode }) {
  const y = useSharedValue(0);

  useEffect(() => {
    y.value = withRepeat(withTiming(-8, { duration: 500 }), -1, true);
    return () => cancelAnimation(y);
  }, [y]);

  const animated = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  return <Animated.View style={animated}>{children}</Animated.View>;
}

// ---------------------------------------------------------------------------
// Feed CCTV simulado (port del bucle de dibujo del <canvas> web)
// ---------------------------------------------------------------------------

interface FeedProps {
  cam: Camera;
  index: number;
  frame: number;
  thermal: boolean;
}

function CctvFeed({ cam, index, frame, thermal }: FeedProps) {
  // Rejilla: horizontales cada 20px, verticales cada 20px.
  const gridStroke = thermal ? GRID_THERMAL : darkTokens.success;
  const shapeStroke = thermal ? darkTokens.danger : darkTokens.success;
  const overlayFill = thermal ? darkTokens.danger : darkTokens.success;

  const scanY = (frame * 2) % FEED_H;
  const rec = Math.floor(frame / 30) % 2 === 0;

  const showGlitch = noise(frame + index * 97) > 0.98;
  const glitchX = noise(frame * 1.7 + index * 13) * FEED_W;
  const glitchY = noise(frame * 2.3 + index * 31) * FEED_H;

  const horizontals: number[] = [];
  for (let y = 0; y < FEED_H; y += 20) horizontals.push(y);
  const verticals: number[] = [];
  for (let x = 0; x < FEED_W; x += 20) verticals.push(x);

  // Elementos animados por cámara (mismas fórmulas que el web).
  const personX = 140 + Math.sin(frame * 0.03) * 30;
  const carX = 110 + Math.cos(frame * 0.01) * 5;
  const gateAngle = Math.abs(Math.sin(frame * 0.01)) * 40;
  const doorW = 40 - Math.abs(Math.sin(frame * 0.01)) * 30;

  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${FEED_W} ${FEED_H}`}>
      {/* Fondo */}
      <Rect
        x={0}
        y={0}
        width={FEED_W}
        height={FEED_H}
        fill={thermal ? FEED_BG_THERMAL : FEED_BG}
      />

      {/* Rejilla simulada */}
      {horizontals.map((y) => (
        <Line
          key={`h${y}`}
          x1={0}
          y1={y}
          x2={FEED_W}
          y2={y}
          stroke={gridStroke}
          strokeOpacity={0.1}
          strokeWidth={1}
        />
      ))}
      {verticals.map((x) => (
        <Line
          key={`v${x}`}
          x1={x}
          y1={0}
          x2={x}
          y2={FEED_H}
          stroke={gridStroke}
          strokeOpacity={0.1}
          strokeWidth={1}
        />
      ))}

      {/* Línea de barrido descendente */}
      <Rect
        x={0}
        y={scanY}
        width={FEED_W}
        height={4}
        fill={thermal ? darkTokens.danger : darkTokens.success}
        fillOpacity={thermal ? 0.08 : 0.06}
      />

      {/* Escenas simuladas por cámara */}
      {index === 0 ? (
        <>
          <Path
            d="M30 30 L100 70 L100 170 L30 210 M290 30 L220 70 L220 170 L290 210 M100 70 L220 70 M100 170 L220 170"
            fill="none"
            stroke={shapeStroke}
            strokeWidth={2}
          />
          <Circle
            cx={personX}
            cy={120}
            r={8}
            fill={thermal ? darkTokens.warning : darkTokens.success}
          />
          <Rect
            x={personX - 4}
            y={128}
            width={8}
            height={20}
            fill={thermal ? darkTokens.warning : darkTokens.success}
          />
        </>
      ) : index === 1 ? (
        <>
          <Rect x={50} y={40} width={30} height={160} fill="none" stroke={shapeStroke} strokeWidth={2} />
          <Rect x={240} y={40} width={30} height={160} fill="none" stroke={shapeStroke} strokeWidth={2} />
          <Rect
            x={carX}
            y={110}
            width={100}
            height={50}
            fill="none"
            stroke={thermal ? CAR_BOX_THERMAL : CAR_BOX}
            strokeWidth={2}
          />
        </>
      ) : index === 2 ? (
        <>
          <Path
            d="M10 180 L310 180 M80 80 L240 80"
            fill="none"
            stroke={shapeStroke}
            strokeWidth={2}
          />
          <G transform={`rotate(${-gateAngle} 60 150)`}>
            <Line x1={60} y1={150} x2={210} y2={150} stroke={GATE_ARM} strokeWidth={4} />
          </G>
        </>
      ) : (
        <>
          <Rect x={60} y={60} width={90} height={120} fill="none" stroke={shapeStroke} strokeWidth={2} />
          <Rect x={170} y={60} width={90} height={120} fill="none" stroke={shapeStroke} strokeWidth={2} />
          <Rect
            x={60}
            y={60}
            width={doorW}
            height={120}
            fill={darkTokens.success}
            fillOpacity={0.2}
          />
          <Rect
            x={150 - doorW}
            y={60}
            width={doorW}
            height={120}
            fill={darkTokens.success}
            fillOpacity={0.2}
          />
        </>
      )}

      {/* Glitch de ruido */}
      {showGlitch ? (
        <Rect x={glitchX} y={glitchY} width={100} height={2} fill={GLITCH} fillOpacity={0.45} />
      ) : null}

      {/* Overlays de texto */}
      <SvgText x={12} y={20} fill={overlayFill} fontSize={9} fontWeight="bold" fontFamily={MONO}>
        {`${cam.name} - ${cam.location.toUpperCase()}`}
      </SvgText>
      <SvgText x={12} y={32} fill={overlayFill} fontSize={9} fontWeight="bold" fontFamily={MONO}>
        {`FPS: ${cam.fps} [${cam.status}]`}
      </SvgText>

      {/* REC intermitente */}
      {rec ? (
        <>
          <Circle cx={295} cy={17} r={3} fill={darkTokens.danger} />
          <SvgText
            x={274}
            y={20}
            fill={darkTokens.danger}
            fontSize={8}
            fontWeight="bold"
            fontFamily={MONO}
          >
            REC
          </SvgText>
        </>
      ) : null}

      {/* Reloj en vivo */}
      <SvgText x={12} y={225} fill={overlayFill} fontSize={9} fontWeight="bold" fontFamily={MONO}>
        {new Date().toLocaleString()}
      </SvgText>
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------

export default function SeguridadScreen() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const authLoading = useAuth((s) => s.loading);
  const role = user?.rol;
  const { colorScheme } = useColorScheme();
  const t = tokensFor(colorScheme === 'light' ? 'light' : 'dark');

  const [activeTab, setActiveTab] = useState<'cctv' | 'rondas'>('cctv');
  const [selectedCam, setSelectedCam] = useState<Camera | null>(null);
  const [thermalFilter, setThermalFilter] = useState(false);
  const [camStatus, setCamStatus] = useState<'LIVE' | 'PAUSED'>('LIVE');
  const [frame, setFrame] = useState(0);

  // ── Auth + role gate ──────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login' as never);
      return;
    }
    if (!role || !ALLOWED_ROLES.includes(role)) {
      toast.error('No tienes permisos para acceder a esta sección.');
      router.replace('/(app)/inicio' as never);
      return;
    }
  }, [user, authLoading, role, router]);

  // ── Ticker de los feeds simulados (equivale al rAF del web) ────────────────
  useEffect(() => {
    if (activeTab !== 'cctv' || camStatus === 'PAUSED') return;
    const id = setInterval(() => setFrame((f) => f + TICK_STEP), TICK_MS);
    return () => clearInterval(id);
  }, [activeTab, camStatus]);

  // ── Rondas NFC (backend) ──────────────────────────────────────────────────
  const [rondaHoy, setRondaHoy] = useState<RondaDto | null>(null);
  const [checkpoints, setCheckpoints] = useState<CheckpointRondaDto[]>([]);
  const [puntosRonda, setPuntosRonda] = useState<PuntoRondaDto[]>([]);
  const [puntosTotales, setPuntosTotales] = useState(0);
  const [completadaNfc, setCompletadaNfc] = useState(false);
  const [hallazgos, setHallazgos] = useState('');
  /** Web: `focus:border-text/30` en el textarea de hallazgos. */
  const [hallazgosFocused, setHallazgosFocused] = useState(false);
  const [rondaLoading, setRondaLoading] = useState(false);
  const [nfcScanning, setNfcScanning] = useState(false);
  const [nfcError, setNfcError] = useState<string | null>(null);
  const [lastTapPoint, setLastTapPoint] = useState<string | null>(null);

  const fetchPuntosRonda = useCallback(async () => {
    try {
      const pts = await api.get<PuntoRondaDto[]>('/parqueadero/puntos-ronda');
      setPuntosRonda(pts || []);
      setPuntosTotales(pts?.length || 0);
    } catch {
      /* sin permiso / no aplica */
    }
  }, []);

  const fetchRonda = useCallback(async () => {
    try {
      const data = await api.get<RondaDto | null>('/parqueadero/rondas');
      setRondaHoy(data);
      if (data?.hallazgos) setHallazgos(data.hallazgos.map((h) => h.descripcion).join('\n'));
      if (data?.id) {
        try {
          const cp = await api.get<RondaConCheckpointsDto>(
            `/parqueadero/rondas/${data.id}/checkpoints`,
          );
          setCheckpoints(cp?.checkpoints || []);
          setCompletadaNfc(cp?.completadaNfc || false);
          setPuntosTotales(cp?.puntosTotales || 0);
        } catch {
          /* silencioso */
        }
      }
    } catch {
      /* silencioso */
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void fetchRonda();
    void fetchPuntosRonda();
  }, [user, fetchRonda, fetchPuntosRonda]);

  // Realtime: actualizaciones de checkpoints de ronda.
  useWsSubscription('ronda', () => {
    void fetchRonda();
    void fetchPuntosRonda();
  });

  const startRound = useCallback(async () => {
    setRondaLoading(true);
    try {
      const r = await api.post<RondaDto>('/parqueadero/rondas', {
        hallazgos: [],
        completada: false,
      });
      setRondaHoy(r);
      setCheckpoints([]);
      setCompletadaNfc(false);
      setHallazgos('');
      setNfcError(null);
      toast.success('Ronda de vigilancia iniciada');
    } catch {
      toast.error('Error al iniciar ronda');
    } finally {
      setRondaLoading(false);
    }
  }, []);

  const submitRound = useCallback(async () => {
    if (!hallazgos.trim()) {
      toast.error('Registra al menos una observación en los hallazgos');
      return;
    }
    setRondaLoading(true);
    try {
      const r = await api.post<RondaDto>('/parqueadero/rondas', {
        hallazgos: [{ descripcion: hallazgos.trim() }],
        completada: true,
      });
      setRondaHoy(r);
      toast.success('Ronda completada y registrada');
    } catch {
      toast.error('Error al registrar ronda');
    } finally {
      setRondaLoading(false);
    }
  }, [hallazgos]);

  // Escanear NFC y registrar checkpoint.
  const scanNfc = useCallback(async () => {
    if (!NFC_SUPPORTED) {
      setNfcError('NFC no soportado en este dispositivo/navegador. Usa Chrome en Android.');
      return;
    }
    if (!rondaHoy || rondaHoy.completada) {
      setNfcError('Inicia una ronda primero');
      return;
    }
    setNfcScanning(true);
    setNfcError(null);
    try {
      toast.success('Acerca el celular a un tag NFC...');
      const serialNumber = await readNfcTagSerial();
      setNfcScanning(false);
      setLastTapPoint('Tag detectado: ' + serialNumber);
      try {
        const cp = await api.post<CheckpointRondaDto>('/parqueadero/rondas/checkpoint', {
          nfcUid: serialNumber,
          rondaId: rondaHoy.id,
        });
        setCheckpoints((prev) => [...prev, cp]);
        setNfcError(null);
        const nuevoTotal = checkpoints.length + 1;
        setCompletadaNfc(nuevoTotal >= puntosTotales);
        toast.success('✓ ' + cp.puntoNombre + ' registrado');
        setLastTapPoint(null);
      } catch (err: unknown) {
        const msg = (err instanceof Error ? err.message : '') || 'Error al registrar';
        setNfcError(
          msg.includes('duplicate') || msg.includes('ya fue registrado')
            ? 'Este punto ya fue registrado en esta ronda'
            : msg,
        );
        toast.error('Error al registrar checkpoint');
      }
    } catch (err: unknown) {
      setNfcScanning(false);
      setNfcError((err instanceof Error ? err.message : '') || 'Error al activar el lector NFC');
    }
  }, [rondaHoy, checkpoints.length, puntosTotales]);

  // El gate de rol redirige en el efecto; no pintamos contenido protegido.
  if (authLoading) {
    return (
      <Screen scroll={false} className="bg-primary">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={t.accent} />
        </View>
      </Screen>
    );
  }
  if (!user || !role || !ALLOWED_ROLES.includes(role)) return null;

  const denom = puntosTotales || puntosRonda.length;
  const progressPct = puntosTotales > 0 ? (checkpoints.length / denom) * 100 : 0;
  const enCurso = !!rondaHoy && !rondaHoy.completada;

  return (
    <Screen className="bg-primary">
      <View className="flex flex-col gap-6 px-6 pt-4">
        <ProfileHeader />

        {/* HEADER SECTION */}
        <Animated.View
          entering={FadeInDown.duration(500)}
          className="flex-row items-center justify-between"
        >
          <View className="flex-1 flex-row items-center gap-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Volver"
              onPress={() => router.push('/(app)/inicio' as never)}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              className="h-10 w-10 items-center justify-center rounded-full bg-text/5"
            >
              <ChevronLeft size={20} color={t.text} />
            </Pressable>
            <View className="flex-1">
              <View className="flex-row items-center gap-2">
                <Shield size={22} color={t.info} />
                <Text className="text-xl font-bold text-text">Central de Seguridad</Text>
              </View>
              <Text className="text-xs text-text/70">Monitoreo CCTV y Rondas de Vigilancia</Text>
            </View>
          </View>
        </Animated.View>

        {/* NAVIGATION TABS */}
        <View className="flex-row gap-6 border-b border-border/50 pb-2">
          {([
            { key: 'cctv' as const, label: 'CCTV Monitor Grid' },
            { key: 'rondas' as const, label: 'Control de Rondas' },
          ]).map((tab) => {
            const active = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                accessibilityRole="button"
                onPress={() => setActiveTab(tab.key)}
                className={`border-b-2 pb-1 ${active ? 'border-info' : 'border-transparent'}`}
              >
                <Text
                  className={`text-xs font-black uppercase tracking-widest ${
                    active ? 'text-info' : 'text-text/50'
                  }`}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* TAB CONTENT: CCTV */}
        {activeTab === 'cctv' ? (
          <View className="flex flex-col gap-6">
            {/* CONTROLS */}
            {/* `bg-surface-2/30` en web: los tokens translúcidos no admiten el
                modificador de opacidad, así que se usa el token más sutil. */}
            <View className="flex-row flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/50 bg-surface p-3">
              <View className="flex-row items-center gap-3">
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setCamStatus((prev) => (prev === 'LIVE' ? 'PAUSED' : 'LIVE'))}
                  style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                  className="flex-row items-center gap-1.5 rounded-xl border border-border bg-primary px-3 py-1.5"
                >
                  {camStatus === 'LIVE' ? (
                    <Pause size={12} color={t.text} />
                  ) : (
                    <Play size={12} color={t.text} />
                  )}
                  <Text className="text-[10px] font-bold text-text/80">
                    {camStatus === 'LIVE' ? 'Congelar Feeds' : 'Reanudar'}
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => setThermalFilter((prev) => !prev)}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.8 : 1,
                    backgroundColor: thermalFilter ? THERMAL_BG : undefined,
                    borderColor: thermalFilter ? THERMAL_BORDER : undefined,
                  })}
                  className={`flex-row items-center gap-1.5 rounded-xl border px-3 py-1.5 ${
                    thermalFilter ? '' : 'border-border bg-primary'
                  }`}
                >
                  <Activity size={12} color={thermalFilter ? '#ffffff' : t.text} />
                  <Text
                    className={`text-[10px] font-bold ${thermalFilter ? '' : 'text-text/80'}`}
                    style={thermalFilter ? { color: '#ffffff' } : undefined}
                  >
                    {thermalFilter ? 'Filtro Térmico: Activo' : 'Filtro Térmico'}
                  </Text>
                </Pressable>
              </View>

              <View className="flex-row items-center gap-2">
                <Pulse className="h-2 w-2 rounded-full bg-success" />
                <Text className="text-[10px] font-black uppercase tracking-widest text-text/50">
                  Servidor CCTV Online
                </Text>
              </View>
            </View>

            {/* GRID */}
            <View className="flex flex-col gap-4">
              {CAMERAS.map((cam, i) => (
                <LiquidGlass
                  key={cam.id}
                  radius={28}
                  className="overflow-hidden rounded-[28px] border border-border/70"
                >
                  <View className="flex flex-col">
                    <View className="relative bg-black" style={{ aspectRatio: 4 / 3 }}>
                      <CctvFeed cam={cam} index={i} frame={frame} thermal={thermalFilter} />
                      <View className="absolute right-3 top-3 flex-row gap-2">
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Ampliar"
                          onPress={() => setSelectedCam(cam)}
                          style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                          className="h-7 w-7 items-center justify-center rounded-lg bg-black/60"
                        >
                          <Maximize2 size={12} color="#ffffff" />
                        </Pressable>
                      </View>
                    </View>

                    <View className="flex-row items-center justify-between border-t border-border/40 p-4">
                      <View className="flex-1 pr-2">
                        <Text className="mb-0.5 text-sm font-bold text-text">{cam.location}</Text>
                        <Text className="text-[10px] text-text/50">
                          Dispositivo: {cam.name} • Resolución: 720p
                        </Text>
                      </View>
                      <View
                        className={`rounded-full border px-2 py-0.5 ${
                          cam.status === 'ONLINE'
                            ? 'border-success/20 bg-success/10'
                            : 'border-danger/20 bg-danger/10'
                        }`}
                      >
                        <Text
                          className={`text-[9px] font-black uppercase ${
                            cam.status === 'ONLINE' ? 'text-success' : 'text-danger'
                          }`}
                        >
                          {cam.status}
                        </Text>
                      </View>
                    </View>
                  </View>
                </LiquidGlass>
              ))}
            </View>
          </View>
        ) : null}

        {/* TAB CONTENT: RONDAS */}
        {activeTab === 'rondas' ? (
          <View className="flex flex-col gap-6">
            <LiquidGlass radius={24} className="rounded-3xl border border-border">
              <View className="flex flex-col gap-5 p-6">
                <View className="flex flex-col gap-4 border-b border-border/40 pb-4">
                  <View>
                    <Text className="text-base font-bold text-text">
                      Bitácora de Rondas de Guardia
                    </Text>
                    <Text className="text-xs text-text/60">
                      Auditoría obligatoria de seguridad con verificación NFC
                    </Text>
                  </View>

                  {!rondaHoy || rondaHoy.completada ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: rondaLoading, busy: rondaLoading }}
                      disabled={rondaLoading}
                      onPress={() => void startRound()}
                      style={({ pressed }) => ({
                        opacity: rondaLoading ? 0.5 : pressed ? 0.9 : 1,
                      })}
                      className="self-start rounded-2xl bg-info px-4 py-3"
                    >
                      <Text className="text-xs font-black uppercase tracking-widest text-on-accent">
                        {rondaLoading ? 'Iniciando…' : 'Iniciar Ronda'}
                      </Text>
                    </Pressable>
                  ) : (
                    <View className="flex-row items-center gap-3">
                      <View className="flex-row items-center gap-1.5 rounded-2xl border border-info/20 bg-info/10 px-3 py-2">
                        <Clock size={14} color={t.info} />
                        <Text className="text-xs text-info">En curso</Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{
                          disabled: rondaLoading || !completadaNfc,
                          busy: rondaLoading,
                        }}
                        accessibilityHint={
                          !completadaNfc
                            ? 'Debes visitar todos los puntos NFC primero'
                            : 'Concluir ronda'
                        }
                        disabled={rondaLoading || !completadaNfc}
                        onPress={() => void submitRound()}
                        style={({ pressed }) => ({
                          opacity: rondaLoading || !completadaNfc ? 0.5 : pressed ? 0.9 : 1,
                        })}
                        className="rounded-2xl bg-success px-4 py-3"
                      >
                        <Text className="text-xs font-black uppercase tracking-widest text-on-accent">
                          {rondaLoading ? 'Registrando…' : 'Concluir Ronda'}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>

                {/* ── Progreso de checkpoints NFC ── */}
                {enCurso ? (
                  <View className="flex flex-col gap-3">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-[10px] font-black uppercase tracking-widest text-text/60">
                        Puntos de Ronda NFC
                      </Text>
                      <Text className="text-[10px] font-bold text-text/50">
                        {checkpoints.length}/{denom}
                      </Text>
                    </View>

                    {/* Barra de progreso */}
                    <View className="h-2 w-full overflow-hidden rounded-full bg-surface2">
                      <View
                        className="h-full rounded-full bg-info"
                        style={{ width: `${progressPct}%` }}
                      />
                    </View>

                    {/* Lista de puntos con estado */}
                    <View className="flex flex-col gap-1.5">
                      {puntosRonda.map((punto) => {
                        const verificado = checkpoints.some((cp) => cp.puntoId === punto.id);
                        return (
                          <View
                            key={punto.id}
                            className={`flex-row items-center gap-3 rounded-xl px-3 py-2 ${
                              verificado
                                ? 'border border-success/20 bg-success/10'
                                : 'border border-border/30 bg-surface2'
                            }`}
                          >
                            {verificado ? (
                              <Check size={14} color={t.success} />
                            ) : (
                              <View className="h-3.5 w-3.5 rounded-full border-2 border-text/20" />
                            )}
                            <Text
                              numberOfLines={1}
                              className={`min-w-0 flex-1 text-xs ${
                                verificado ? 'font-medium text-success' : 'text-text/60'
                              }`}
                            >
                              {punto.nombre}
                            </Text>
                            {punto.ubicacion ? (
                              <Text
                                numberOfLines={1}
                                className="ml-auto shrink text-[10px] text-text/30"
                              >
                                {punto.ubicacion}
                              </Text>
                            ) : null}
                          </View>
                        );
                      })}
                      {puntosRonda.length === 0 ? (
                        <Text className="py-2 text-center text-[10px] italic text-text/30">
                          No hay puntos NFC configurados. Contacta al administrador.
                        </Text>
                      ) : null}
                    </View>

                    {/* Botón NFC */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{
                        disabled: nfcScanning || !NFC_SUPPORTED || !!rondaHoy?.completada,
                        busy: nfcScanning,
                      }}
                      disabled={nfcScanning || !NFC_SUPPORTED || !!rondaHoy?.completada}
                      onPress={() => void scanNfc()}
                      style={({ pressed }) => ({
                        opacity:
                          nfcScanning || !NFC_SUPPORTED || !!rondaHoy?.completada
                            ? 0.5
                            : pressed
                              ? 0.9
                              : 1,
                      })}
                      className={`flex-row items-center justify-center gap-2 rounded-2xl py-3 ${
                        NFC_SUPPORTED ? 'bg-info' : 'border border-border bg-surface2'
                      }`}
                    >
                      {nfcScanning ? (
                        <>
                          <Pulse className="h-3.5 w-3.5 rounded-full bg-text/10" />
                          <Text className="text-xs font-black uppercase tracking-widest text-on-accent">
                            Escaneando…
                          </Text>
                        </>
                      ) : NFC_SUPPORTED ? (
                        <>
                          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                            <Path
                              d="M6 8a6 6 0 0 1 12 0c0 7-6 14-6 14S6 15 6 8"
                              stroke={t.onAccent}
                              strokeWidth={2.5}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <Circle
                              cx={12}
                              cy={8}
                              r={2}
                              stroke={t.onAccent}
                              strokeWidth={2.5}
                              fill="none"
                            />
                          </Svg>
                          <Text className="text-xs font-black uppercase tracking-widest text-on-accent">
                            Escanear Tag NFC
                          </Text>
                        </>
                      ) : (
                        <Text className="text-xs font-black uppercase tracking-widest text-text/40">
                          NFC no disponible
                        </Text>
                      )}
                    </Pressable>

                    {/* Mensajes NFC */}
                    {!NFC_SUPPORTED ? (
                      <Text className="text-center text-[10px] text-warning/80">
                        ⚠️ El escaneo NFC solo funciona en Chrome para Android. Usa un celular
                        Android compatible.
                      </Text>
                    ) : null}

                    {lastTapPoint ? (
                      <Pulse className="rounded-lg bg-info/5 py-1.5">
                        <Text
                          className="text-center text-[11px] text-info"
                          style={{ fontFamily: MONO }}
                        >
                          {lastTapPoint}
                        </Text>
                      </Pulse>
                    ) : null}

                    {nfcError ? (
                      <Text className="rounded-lg bg-danger/10 px-3 py-2 text-center text-[11px] text-danger">
                        {nfcError}
                      </Text>
                    ) : null}
                  </View>
                ) : null}

                {/* Hallazgos */}
                {enCurso ? (
                  <View className="flex flex-col gap-2">
                    <Text className="text-[10px] font-black uppercase tracking-widest text-text/60">
                      Hallazgos / Observaciones
                    </Text>
                    <TextInput
                      value={hallazgos}
                      onChangeText={setHallazgos}
                      onFocus={() => setHallazgosFocused(true)}
                      onBlur={() => setHallazgosFocused(false)}
                      placeholder="Registra aquí cualquier novedad: luces apagadas, puertas abiertas, personas sospechosas, vehículos mal estacionados…"
                      placeholderTextColor={t.textMuted}
                      multiline
                      numberOfLines={4}
                      textAlignVertical="top"
                      className={`min-h-[112px] w-full rounded-2xl border bg-surface2 p-4 text-sm text-text ${
                        hallazgosFocused ? 'border-text/30' : 'border-border'
                      }`}
                    />
                  </View>
                ) : null}

                {/* Ronda completada hoy */}
                {rondaHoy?.completada ? (
                  <View className="flex flex-col gap-3 rounded-2xl border border-success/30 bg-success/10 p-5">
                    <View className="flex-row items-center gap-2">
                      <Check size={18} color={t.success} />
                      <Text className="text-sm font-bold text-success">Ronda completada hoy</Text>
                    </View>
                    {checkpoints.length > 0 ? (
                      <View className="flex-row flex-wrap gap-1.5 pl-7">
                        {checkpoints.map((cp) => (
                          <View key={cp.id} className="rounded-full bg-success/20 px-2 py-0.5">
                            <Text className="text-[10px] text-success">✓ {cp.puntoNombre}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {rondaHoy.hallazgos && rondaHoy.hallazgos.length > 0 ? (
                      <View className="flex flex-col gap-1 pl-7">
                        {rondaHoy.hallazgos.map((h, i) => (
                          <Text key={i} className="text-xs italic text-text/70">
                            «{h.descripcion}»{h.celda ? ` [Celda ${h.celda}]` : ''}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: rondaLoading }}
                      disabled={rondaLoading}
                      onPress={() => void startRound()}
                      style={({ pressed }) => ({
                        opacity: rondaLoading ? 0.5 : pressed ? 0.85 : 1,
                      })}
                      className="mt-2 flex-row items-center gap-1.5 self-start rounded-xl border border-border bg-surface px-4 py-2"
                    >
                      <RotateCcw size={12} color={t.text} />
                      <Text className="text-xs font-bold text-text">Iniciar otra ronda</Text>
                    </Pressable>
                  </View>
                ) : null}

                {/* Sin ronda hoy */}
                {!rondaHoy ? (
                  <View className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/40 bg-surface p-8">
                    <ClipboardList size={32} color={t.textMuted} />
                    <Text className="text-center text-xs font-medium text-text/50">
                      No hay rondas registradas hoy
                    </Text>
                    <Text className="text-center text-[10px] text-text/40">
                      Inicia una ronda para recorrer los puntos NFC de inspección
                    </Text>
                  </View>
                ) : null}
              </View>
            </LiquidGlass>
          </View>
        ) : null}
      </View>

      {/* MODAL: CAM ZOOM VIEW */}
      <CamZoomModal cam={selectedCam} onClose={() => setSelectedCam(null)} />
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Modal: vista ampliada de cámara
// ---------------------------------------------------------------------------

function CamZoomModal({ cam, onClose }: { cam: Camera | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const t = tokensFor(colorScheme === 'light' ? 'light' : 'dark');

  return (
    <Modal
      visible={!!cam}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 items-center justify-center p-4">
        {/* Web: `bg-black/90 backdrop-blur-md`, con tap-to-dismiss. */}
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
          className="absolute inset-0"
        >
          {/* No Android blurMethod/blurTarget — see LiquidGlass.tsx: pointing
              at the app-wide target crashed RenderThread. The bg-black/90
              overlay below already carries this scrim. */}
          <BlurView
            intensity={20}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" className="absolute inset-0 bg-black/90" />
        </Pressable>
        {cam ? (
          <Animated.View
            entering={ZoomIn.duration(200)}
            className="w-full max-w-[640px]"
            style={{ marginBottom: insets.bottom }}
          >
            {/* Web: `liquid-glass-card rounded-[32px] border border-border`. */}
            <LiquidGlass
              variant="card"
              radius={32}
              className="overflow-hidden rounded-[32px] border border-border"
            >
              <View className="flex flex-col">
                <View className="flex-row items-center justify-between border-b border-border/50 bg-surface2 p-4">
                  <View className="flex-1 pr-3">
                    <Text className="text-base font-bold text-text">{cam.location}</Text>
                    <Text className="text-[10px] text-text/60">
                      Monitoreo Ampliado • Dispositivo: {cam.name}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Cerrar"
                    onPress={onClose}
                    style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                    className="h-8 w-8 items-center justify-center rounded-full bg-text/5"
                  >
                    <Check size={18} color={t.text} />
                  </Pressable>
                </View>

                <View className="bg-black" style={{ aspectRatio: 4 / 3 }}>
                  <View className="absolute inset-0 items-center justify-center p-6">
                    <Bounce>
                      <AlertTriangle size={32} color={t.info} />
                    </Bounce>
                    <Text className="mt-2 text-center text-sm font-bold text-text">
                      Feed Principal en Alta Definición
                    </Text>
                    <Text className="mt-1 text-center text-xs leading-relaxed text-text/50">
                      Para optimizar ancho de banda, la transmisión fluida HD se proyecta en la
                      consola central. Estado del enlace de red:{' '}
                      <Text className="font-bold text-success">EXCELENTE (99.8%)</Text>.
                    </Text>
                  </View>
                </View>
              </View>
            </LiquidGlass>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}
