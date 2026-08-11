/**
 * MAPA PARQUEADERO — CONJUNTOSAPP (mobile port)
 * Ported 1:1 from web `src/app/(app)/mapa-parqueadero/page.tsx`.
 *
 * Vista de portería / encargado de parqueadero:
 *  - Rondas de verificación (GET/POST /parqueadero/rondas)
 *  - Reservas de visitante próximas (GET /parqueadero/reservas/proximas,
 *    POST /parqueadero/reservas/{id}/llegada)
 *  - Mapa tipo plano aéreo (GET /parqueadero/mapa) con selector de sótano,
 *    bahías proporcionales (1 carro = 4 motos = 5 bicis) y carril central
 *  - Asignación de celda de VISITANTE (aprueba el residente) y de RESIDENTE
 *    (a un apartamento, placa obligatoria + vigencia opcional)
 *  - Liberación de celda con liquidación EN VIVO de la sesión de cobro
 *    (GET /parqueadero/sesiones/celda/{id}, POST /parqueadero/sesiones/{id}/cerrar)
 *  - Mi Actividad (GET /parqueadero/registros)
 *  - useWsSubscription('parqueadero') + ('ronda')
 *
 * Notas de port:
 *  - El CSS `repeating-linear-gradient` del asfalto y de la línea amarilla del
 *    carril se reproducen con expo-linear-gradient (bandas generadas) y con una
 *    columna de guiones, respectivamente.
 *  - NativeWind NO interpola clases dinámicas, así que los colores de estado de
 *    cada bahía se resuelven a objetos de estilo con los tokens en runtime.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useColorScheme } from 'nativewind';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeInDown,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  AlertCircle,
  ArrowRight,
  Bike,
  CalendarClock,
  Car,
  CheckCircle,
  ClipboardCheck,
  Clock,
  History,
  Map,
  X,
} from 'lucide-react-native';

import ProfileHeader from '@/components/shell/ProfileHeader';
import { Screen } from '@/components/ui/Screen';
import { toast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { tokensFor, type ColorTokens } from '@/theme/tokens';
import type {
  CeldaMapaDto,
  DirectorioEntradaDto,
  EstadoParqueadero,
  RegistroDto,
  ReservaParqueaderoDto,
  SesionCobroDto,
} from '@/lib/api/types';

// ---------------------------------------------------------------------------
// Tipos locales (el backend entrega campos extra para esta vista que aún no
// están en @/lib/api/types — ver hoistNeeded del reporte).
// ---------------------------------------------------------------------------

/**
 * Celda del mapa. `CeldaMapaDto` ya trae `categoria`, `asignadoEn` y
 * `asignadoHasta`: el backend hace `#[serde(flatten)]` de `CeldaDto` dentro de
 * `CeldaMapaDto` (parqueadero/dto.rs:122-126), así que esos campos SIEMPRE
 * llegan y no son opcionales.
 */
type CeldaMapa = CeldaMapaDto;

/** Última ronda de verificación con el resumen del usuario que la realizó. */
interface UltimaRonda {
  fecha: string;
  usuario: { nombre: string };
}

/**
 * Respuesta común de las mutaciones de celda: pueden quedar pendientes de
 * aprobación, o devolver el monto liquidado al cerrar una sesión.
 */
interface MutacionCeldaResponse {
  pendiente?: boolean;
  estado?: string;
  montoFinal?: number;
  montoActual?: number;
}

const ALLOWED_ROLES = [
  'ENCARGADO_PARQUEADERO',
  'VIGILANTE',
  'SUPERVISOR_VIGILANCIA',
  'ADMINISTRADOR',
  'SUPER_ADMIN',
];

// ---------------------------------------------------------------------------
// Literales one-off del plano aéreo (la página web usa exactamente estos hex
// para el asfalto, la línea del carril y los bordes del plano).
// ---------------------------------------------------------------------------

const ASPHALT_DARK = '#0d0d0d';
const ASPHALT_LIGHT = '#121212';
const LANE_YELLOW = '#FACC15';
const PLAN_BORDER = 'rgba(255, 255, 255, 0.1)';
const LANE_DIVIDER = 'rgba(255, 255, 255, 0.4)';
const BAY_TOP_EDGE = 'rgba(255, 255, 255, 0.2)';
const BAY_TILE_EDGE = 'rgba(0, 0, 0, 0.1)';
const WATERMARK = 'rgba(255, 255, 255, 0.04)';
const ARROW_WHITE = 'rgba(255, 255, 255, 0.7)';
const ACTIVE_BADGE = 'rgba(255, 255, 255, 0.25)';
/** `border-t-2 border-dashed border-white/30` de la franja SALIDA. */
const SALIDA_BORDER = 'rgba(255, 255, 255, 0.3)';

/**
 * `repeating-linear-gradient(45deg, #0d0d0d 0 6px, #121212 6px 12px)` → bandas
 * duras generadas para expo-linear-gradient (RN no tiene gradientes repetidos).
 */
const ASPHALT_BANDS = 18;
const ASPHALT = (() => {
  const colors: string[] = [];
  const locations: number[] = [];
  for (let i = 0; i < ASPHALT_BANDS; i += 1) {
    const c = i % 2 === 0 ? ASPHALT_DARK : ASPHALT_LIGHT;
    colors.push(c, c);
    locations.push(i / ASPHALT_BANDS, (i + 1) / ASPHALT_BANDS);
  }
  return {
    colors: colors as unknown as readonly [string, string, ...string[]],
    locations: locations as unknown as readonly [number, number, ...number[]],
  };
})();

/** `repeating-linear-gradient(to bottom, #FACC15 0 8px, transparent 8px 18px)`. */
const LANE_DASHES = Array.from({ length: 40 }, (_, i) => i);

const WATERMARK_SIZE = Dimensions.get('window').width * 0.38;

/**
 * Segmentos necesarios para cubrir el ancho de la pantalla con la línea
 * discontinua (4px de trazo + 4px de espacio, como el `border-dashed` de 2px
 * que dibuja el navegador). RN sólo pinta `borderStyle: 'dashed'` cuando los
 * CUATRO anchos de borde son iguales, así que las franjas de ENTRADA/SALIDA
 * (que llevan borde en un solo lado) se dibujan con segmentos explícitos.
 */
const DASH_LEN = 4;
const DASH_GAP = 4;
const DASH_COUNT = Math.ceil(Dimensions.get('window').width / (DASH_LEN + DASH_GAP)) + 2;
const DASH_SEGMENTS = Array.from({ length: DASH_COUNT }, (_, i) => i);

// ---------------------------------------------------------------------------
// Helpers de formato (mismas opciones que la web)
// ---------------------------------------------------------------------------

/** `hour:'2-digit', minute:'2-digit'` con el locale del dispositivo (web: `[]`). */
function horaCorta(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** `toLocaleString('es-CO', {day,month:'short',hour,minute})`. */
function fechaReserva(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** `toLocaleDateString('es-CO')`. */
function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO');
}

/**
 * Agrupación de miles estilo es-CO (`3.000`) sin depender de ICU en Hermes.
 * Salida idéntica a `Number(n).toLocaleString('es-CO')` para enteros.
 */
function formatCOP(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  return sign + Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Nivel/sótano de una celda. El backend no tiene campo de nivel, así que se
 * deriva del prefijo del número de celda (ej. "S1-01" -> Sótano 1). Las celdas
 * sin prefijo reconocible caen en "Sótano 1" por defecto.
 */
function nivelDeCelda(p: CeldaMapa): number {
  const m = /^\s*S(?:[ÓO]TANO)?\s*-?\s*(\d+)/i.exec(String(p?.numero || ''));
  return m ? parseInt(m[1], 10) : 1;
}

/** Icono de categoría física (mismos emojis que la web). */
function catEmoji(cat: string): string {
  return cat === 'MOTO' ? '🏍️' : cat === 'BICI' ? '🚲' : '🚗';
}

/** `torre`/`apto` del ocupante → "T3 · Apto 402". */
function ubicacionOcupante(ocup: CeldaMapa['ocupante']): string {
  if (!ocup) return '';
  return [ocup.torre ? `T${ocup.torre}` : null, ocup.apto ? `Apto ${ocup.apto}` : null]
    .filter(Boolean)
    .join(' · ');
}

/** Etiqueta "Torre X · 402" de la fila del directorio. */
function residenteUbicacion(r: DirectorioEntradaDto): string {
  return `${r.torre ? `Torre ${r.torre}` : ''}${r.apto ? ` · ${r.apto}` : ''}`;
}

function filtrarResidentes(
  residentes: DirectorioEntradaDto[],
  busqueda: string,
): DirectorioEntradaDto[] {
  const q = busqueda.toLowerCase();
  if (!q) return residentes;
  return residentes.filter(
    (r) =>
      r.nombre?.toLowerCase().includes(q) ||
      String(r.torre || '').toLowerCase().includes(q) ||
      String(r.apto || '').toLowerCase().includes(q),
  );
}

// ---------------------------------------------------------------------------
// Primitivas locales
// ---------------------------------------------------------------------------

/**
 * Línea discontinua de 2px (equivalente a `border-dashed` en un solo lado, que
 * RN no puede pintar). Se posiciona en absoluto sobre el borde correspondiente.
 */
function DashedLine({ color, edge }: { color: string; edge: 'top' | 'bottom' }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: edge === 'top' ? 0 : undefined,
        bottom: edge === 'bottom' ? 0 : undefined,
        height: 2,
        flexDirection: 'row',
        overflow: 'hidden',
      }}
    >
      {DASH_SEGMENTS.map((i) => (
        <View
          key={i}
          style={{ width: DASH_LEN, height: 2, marginRight: DASH_GAP, backgroundColor: color }}
        />
      ))}
    </View>
  );
}

/** Equivalente de `animate-pulse` (opacidad 1 → 0.5 → 1 en 2s). */
function PulseView({
  active = true,
  className,
  style,
  children,
}: {
  active?: boolean;
  className?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = active ? withRepeat(withTiming(0.5, { duration: 1000 }), -1, true) : 1;
  }, [active, pulse]);
  const animStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View className={className} style={[style, animStyle]}>
      {children}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------

export default function MapaParqueaderoScreen() {
  const { colorScheme } = useColorScheme();
  const t = tokensFor(colorScheme === 'light' ? 'light' : 'dark');
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const authLoading = useAuth((s) => s.loading);
  const role = user?.rol;

  const [parqueaderos, setParqueaderos] = useState<CeldaMapa[]>([]);
  const [registros, setRegistros] = useState<RegistroDto[]>([]);
  const [lastRound, setLastRound] = useState<UltimaRonda | null>(null);
  const [reservasProximas, setReservasProximas] = useState<ReservaParqueaderoDto[]>([]);
  const [busyReservaLlegada, setBusyReservaLlegada] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [cellToRelease, setCellToRelease] = useState<CeldaMapa | null>(null);
  // Sesión de cobro de visitante asociada a la celda que se va a liberar.
  const [sesionCobro, setSesionCobro] = useState<SesionCobroDto | null>(null);
  // Reloj que tiquea cada segundo mientras el modal de cobro está abierto, para
  // mostrar el tiempo transcurrido y el monto acumulado EN VIVO (no congelado).
  const [ahora, setAhora] = useState<number>(Date.now());
  useEffect(() => {
    if (!sesionCobro) return;
    const timer = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [sesionCobro]);

  const [liquidando, setLiquidando] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Asignación de celda de VISITANTE: requiere elegir el residente que recibe la
  // visita; la asignación la aprueba ese inquilino (no el admin).
  const [cellVisitante, setCellVisitante] = useState<CeldaMapa | null>(null);
  const [residentes, setResidentes] = useState<DirectorioEntradaDto[]>([]);
  const [residenteId, setResidenteId] = useState('');
  const [busquedaRes, setBusquedaRes] = useState('');
  // Tiempo estimado de la visita: minutos, o 'libre' (sin estimado).
  const [tiempoEstimado, setTiempoEstimado] = useState<string>('libre');

  // Asignación de celda de RESIDENTE (permanente): a un apartamento, con placa
  // obligatoria y vigencia opcional.
  const [cellResidente, setCellResidente] = useState<CeldaMapa | null>(null);
  const [placaResidente, setPlacaResidente] = useState('');
  const [mesesResidente, setMesesResidente] = useState<string>('sin');

  // Nivel/sótano seleccionado.
  const [nivel, setNivel] = useState<number>(1);

  const nivelesDisponibles = useMemo(
    () => Array.from(new Set(parqueaderos.map(nivelDeCelda))).sort((a, b) => a - b),
    [parqueaderos],
  );
  const celdasDelNivel = useMemo(
    () => parqueaderos.filter((p) => nivelDeCelda(p) === nivel),
    [parqueaderos, nivel],
  );

  const loadData = useCallback(async () => {
    try {
      const data = await api.get<CeldaMapa[]>('/parqueadero/mapa');
      setParqueaderos(data);
    } catch {
      toast.error('Error al cargar mapa');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadExtra = useCallback(async () => {
    try {
      const [regData, rondData] = await Promise.all([
        api.get<RegistroDto[]>('/parqueadero/registros'),
        api.get<UltimaRonda | null>('/parqueadero/rondas'),
      ]);
      setRegistros(regData);
      setLastRound(rondData);
    } catch {
      // Non-critical: historic data unavailable
    }
    // Directorio de residentes para asignar celdas de visitante (no crítico).
    try {
      const dir = await api.get<DirectorioEntradaDto[]>('/directorio');
      setResidentes(dir);
    } catch {
      /* sin permiso para directorio */
    }
    // Reservas de cupo de visitante próximas (no crítico).
    try {
      const res = await api.get<ReservaParqueaderoDto[]>('/parqueadero/reservas/proximas');
      setReservasProximas(res ?? []);
    } catch {
      /* sin permiso */
    }
  }, []);

  // Real-time WebSocket subscriptions
  useWsSubscription('parqueadero', () => {
    void loadData();
    void loadExtra();
  });
  useWsSubscription('ronda', () => {
    void loadData();
    void loadExtra();
  });

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

    void loadData();
    void loadExtra();
  }, [user, authLoading, role, router, loadData, loadExtra]);

  const marcarLlegadaReserva = async (id: string) => {
    setBusyReservaLlegada(id);
    try {
      await api.post(`/parqueadero/reservas/${id}/llegada`, {});
      toast.success('Llegada registrada. Asigna la celda de visitante al residente.');
      void loadExtra();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo registrar la llegada');
    } finally {
      setBusyReservaLlegada(null);
    }
  };

  const handleCellClick = (cell: CeldaMapa) => {
    if (cell.estado === 'DISPONIBLE') {
      // Celda de VISITANTE: se asigna a un residente que la debe aprobar.
      if (cell.tipo === 'VISITANTE') {
        setCellVisitante(cell);
        setResidenteId('');
        setBusquedaRes('');
        return;
      }
      // Celda de RESIDENTE: se ASIGNA a un apartamento con placa obligatoria.
      setCellResidente(cell);
      setResidenteId('');
      setBusquedaRes('');
      setPlacaResidente('');
      setMesesResidente('sin');
    } else if (cell.usuarioId || cell.asignadoHasta) {
      // Celda con asignación PERMANENTE: abrir modal de confirmación.
      setSesionCobro(null);
      setCellToRelease(cell);
      // Si es una celda de visitante, traer la sesión de cobro (monto en vivo).
      if (cell.tipo === 'VISITANTE') {
        api
          .get<SesionCobroDto | null>(`/parqueadero/sesiones/celda/${cell.id}`)
          .then((s) => setSesionCobro(s))
          .catch(() => setSesionCobro(null));
      }
    } else {
      void processToggle(cell.id, 'DISPONIBLE');
    }
  };

  // Cierra la sesión de cobro con la liquidación elegida (vehículo en portería).
  const cerrarSesionLiquidando = async (liquidacion: 'VISITANTE_PAGO' | 'CARGADO_APTO') => {
    if (!sesionCobro?.id) {
      if (cellToRelease) void liberarCelda(cellToRelease.id);
      return;
    }
    setLiquidando(true);
    try {
      const r = await api.post<MutacionCeldaResponse>(
        `/parqueadero/sesiones/${sesionCobro.id}/cerrar`,
        { liquidacion },
      );
      const monto = Number(r?.montoFinal || r?.montoActual || 0);
      if (liquidacion === 'CARGADO_APTO' && r?.estado === 'RETENIDA') {
        toast.success(
          `Cobro de $${formatCOP(monto)} enviado al residente. El vehículo queda RETENIDO hasta que apruebe.`,
        );
      } else if (liquidacion === 'CARGADO_APTO' && monto > 0) {
        toast.success(
          `Cargo de $${formatCOP(monto)} enviado al residente para su aprobación.`,
        );
      } else if (monto > 0) {
        toast.success(`Visitante pagó $${formatCOP(monto)}. Celda liberada.`);
      } else {
        toast.success('Celda liberada dentro de las 2h gratis (sin cobro).');
      }
      void loadData();
      void loadExtra();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cerrar la sesión');
    } finally {
      setLiquidando(false);
      setCellToRelease(null);
      setSesionCobro(null);
    }
  };

  const asignarVisitante = async () => {
    if (!residenteId) {
      toast.error('Selecciona el residente que recibe la visita');
      return;
    }
    if (!cellVisitante) return;
    setIsSubmitting(true);
    try {
      const estimadoMinutos = tiempoEstimado === 'libre' ? null : parseInt(tiempoEstimado, 10);
      const r = await api.post<MutacionCeldaResponse>(
        `/parqueadero/celdas/${cellVisitante.id}/asignar`,
        { usuarioId: residenteId, estimadoMinutos },
      );
      if (r?.pendiente) {
        toast.success('Solicitud enviada. El residente debe aprobarla desde su app.');
      } else {
        toast.success('Celda asignada.');
      }
      void loadData();
      void loadExtra();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al asignar la celda');
    } finally {
      setIsSubmitting(false);
      setCellVisitante(null);
      setTiempoEstimado('libre');
    }
  };

  const asignarResidente = async () => {
    if (!residenteId) {
      toast.error('Selecciona el apartamento/residente');
      return;
    }
    if (!placaResidente.trim()) {
      toast.error('La placa del vehículo es obligatoria');
      return;
    }
    if (!cellResidente) return;
    setIsSubmitting(true);
    try {
      const meses = mesesResidente === 'sin' ? null : parseInt(mesesResidente, 10);
      const r = await api.post<MutacionCeldaResponse>(
        `/parqueadero/celdas/${cellResidente.id}/asignar`,
        {
          usuarioId: residenteId,
          placa: placaResidente.trim().toUpperCase(),
          meses,
        },
      );
      if (r?.pendiente) {
        toast.success('Solicitud enviada a aprobación del administrador.');
      } else {
        toast.success('Celda asignada al apartamento.');
      }
      void loadData();
      void loadExtra();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al asignar la celda');
    } finally {
      setIsSubmitting(false);
      setCellResidente(null);
      setPlacaResidente('');
      setMesesResidente('sin');
    }
  };

  const liberarCelda = async (id: string) => {
    setIsSubmitting(true);
    try {
      const r = await api.post<MutacionCeldaResponse>(`/parqueadero/celdas/${id}/liberar`, {});
      if (r?.pendiente) {
        toast.success('Solicitud enviada a aprobación del administrador.');
      } else {
        toast.success('Celda liberada. Ahora está disponible.');
      }
      void loadData();
      void loadExtra();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al liberar la celda');
      void loadData();
    } finally {
      setIsSubmitting(false);
      setCellToRelease(null);
    }
  };

  const processToggle = async (id: string, newEstado: EstadoParqueadero) => {
    setIsSubmitting(true);
    setParqueaderos((prev) => prev.map((p) => (p.id === id ? { ...p, estado: newEstado } : p)));

    try {
      const r = await api.put<MutacionCeldaResponse>(`/parqueadero/celdas/${id}`, {
        estado: newEstado,
      });
      if (r?.pendiente) {
        toast.success('Solicitud enviada a aprobación del administrador.');
        void loadData(); // revierte el cambio optimista: aún no se aplicó
      } else {
        toast.success('Celda liberada');
      }
      void loadExtra();
    } catch {
      toast.error('Error de red');
      void loadData();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePerformRound = async () => {
    toast.info('Registrando ronda de verificación...');
    try {
      await api.post('/parqueadero/rondas', { completada: true, hallazgos: [] });
      toast.success('Ronda registrada correctamente');
      void loadExtra();
    } catch {
      toast.error('Error al registrar ronda');
    }
  };

  if (loading) {
    return (
      <Screen scroll={false} className="bg-primary">
        <View className="flex-1 items-center justify-center">
          <PulseView
            style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: `${t.text}1a` }}
          />
        </View>
      </Screen>
    );
  }

  // ── Bahía de estacionamiento ─────────────────────────────────────────────
  // La proporción física se respeta: en el cajón de un carro caben 4 motos
  // (perpendiculares) o 5 bicis, por eso la moto ocupa 1/4 del ancho y la bici
  // 1/5 (flex-wrap las empaqueta solas: 4 motos por fila, 5 bicis por fila,
  // 1 carro por fila).
  const bay = (p: CeldaMapa, side: 'left' | 'right'): ReactNode => {
    const isLibre = p.estado === 'DISPONIBLE';
    const isReservado = p.estado === 'RESERVADO';
    const vencida = p.asignadoHasta ? new Date(p.asignadoHasta).getTime() < Date.now() : false;
    // Libre=verde, Ocupado=rojo, Reservado=amarillo.
    const stateColor = isLibre ? t.success : isReservado ? t.warning : t.danger;
    const cat = p.categoria || 'CARRO';
    const icon = catEmoji(cat);
    // Para celdas de VISITANTE ocupadas: a qué residente (torre/apto) está
    // asignada la visita. El backend lo entrega en `ocupante`.
    const esVisitante = p.tipo === 'VISITANTE';
    const ocup = p.ocupante;
    const ubicOcup = ubicacionOcupante(ocup);
    const tooltip =
      esVisitante && !isLibre && ocup
        ? `Celda ${p.numero} · Visitante de ${ocup.nombre}${ubicOcup ? ` (${ubicOcup})` : ''}`
        : `Celda ${p.numero} · ${p.estado}`;

    // MOTO / BICI: tiles compactos que ocupan una fracción del ancho del cajón
    // de carro (1/4 y 1/5), para que se vea cuántas caben.
    if (cat === 'MOTO' || cat === 'BICI') {
      return (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          accessibilityLabel={`Celda ${p.numero} · ${cat} · ${p.estado}`}
          onPress={() => handleCellClick(p)}
          style={({ pressed }) => ({
            width: cat === 'MOTO' ? '25%' : '20%',
            height: 44,
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            borderWidth: 1,
            borderColor: BAY_TILE_EDGE,
            backgroundColor: `${stateColor}26`,
            position: 'relative',
            transform: [{ scale: pressed ? 0.95 : 1 }],
          })}
        >
          <Text style={{ fontSize: 11, lineHeight: 12, opacity: isLibre ? 0.35 : 1 }}>{icon}</Text>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 8,
              lineHeight: 9,
              fontWeight: '700',
              color: t.text,
              paddingHorizontal: 2,
              maxWidth: '100%',
            }}
          >
            {p.numero}
          </Text>
          {vencida ? (
            <Text
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                textAlign: 'center',
                fontSize: 6,
                fontWeight: '900',
                textTransform: 'uppercase',
                color: t.danger,
              }}
            >
              venc
            </Text>
          ) : null}
        </Pressable>
      );
    }

    // CARRO: bahía completa, ocupa todo el ancho del cajón.
    const numEl = (
      <View key="n" style={{ paddingHorizontal: 4, gap: 2, alignItems: 'flex-start' }}>
        <Text style={{ fontSize: 12, lineHeight: 13, fontWeight: '700', color: t.text }}>
          {p.numero}
        </Text>
        {esVisitante && !isLibre && ubicOcup ? (
          <Text
            style={{
              fontSize: 7,
              lineHeight: 8,
              fontWeight: '700',
              color: t.info,
              textTransform: 'uppercase',
              letterSpacing: -0.2,
            }}
          >
            {ubicOcup}
          </Text>
        ) : null}
      </View>
    );
    const carEl = (
      <Text key="c" style={{ fontSize: 11, lineHeight: 12, opacity: isLibre ? 0.3 : 1 }}>
        {icon}
      </Text>
    );

    return (
      <Pressable
        key={p.id}
        accessibilityRole="button"
        accessibilityLabel={tooltip}
        onPress={() => handleCellClick(p)}
        style={({ pressed }) => ({
          width: '100%',
          height: 44,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 8,
          borderTopWidth: 1,
          borderTopColor: BAY_TOP_EDGE,
          backgroundColor: `${stateColor}26`,
          position: 'relative',
          transform: [{ scale: pressed ? 0.98 : 1 }],
        })}
      >
        {/* tope de rueda en el extremo exterior */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 6,
            bottom: 6,
            width: 4,
            borderRadius: 999,
            backgroundColor: stateColor,
            left: side === 'left' ? 2 : undefined,
            right: side === 'right' ? 2 : undefined,
          }}
        />
        {side === 'left' ? [numEl, carEl] : [carEl, numEl]}
        {vencida ? (
          <Text
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              textAlign: 'center',
              fontSize: 6,
              fontWeight: '900',
              textTransform: 'uppercase',
              letterSpacing: 0.3,
              color: t.danger,
            }}
          >
            vencida
          </Text>
        ) : null}
      </Pressable>
    );
  };

  const mid = Math.ceil(celdasDelNivel.length / 2);
  const leftCells = celdasDelNivel.slice(0, mid);
  const rightCells = celdasDelNivel.slice(mid);

  const nivelesRender = nivelesDisponibles.length > 0 ? nivelesDisponibles : [1, 2];

  return (
    <Screen className="bg-primary">
      <View className="flex flex-col gap-6 px-6 pt-4">
        <ProfileHeader />

        {/* RONDAS DE VERIFICACIÓN */}
        <Animated.View
          entering={FadeInDown.duration(500)}
          className="mb-2 flex-row items-center justify-between gap-3 rounded-[24px] border border-border bg-primary-light p-5"
        >
          <View className="min-w-0 flex-1 flex-row items-center gap-3">
            {/* Done vs pending used the same gray chip — colour tells them apart now. */}
            <PulseView
              active={!lastRound}
              className="h-12 w-12 items-center justify-center rounded-2xl"
              style={{ backgroundColor: lastRound ? `${t.success}1a` : `${t.warning}1a` }}
            >
              {lastRound ? (
                <CheckCircle size={22} color={t.success} />
              ) : (
                <AlertCircle size={22} color={t.warning} />
              )}
            </PulseView>
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-bold leading-tight text-text">
                Rondas de Verificación
              </Text>
              <Text
                numberOfLines={1}
                className="mt-0.5 text-[10px] uppercase tracking-wider"
                style={{ color: `${t.text}8c` }}
              >
                {lastRound
                  ? `Última: ${horaCorta(lastRound.fecha)} por ${lastRound.usuario.nombre}`
                  : 'Pendiente hoy'}
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => void handlePerformRound()}
            style={({ pressed }) => ({
              backgroundColor: t.info,
              transform: [{ scale: pressed ? 0.95 : 1 }],
            })}
            className="shrink-0 flex-row items-center gap-2 rounded-xl px-4 py-2.5"
          >
            <ClipboardCheck size={14} color="#ffffff" />
            <Text
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: '#ffffff' }}
            >
              Ronda
            </Text>
          </Pressable>
        </Animated.View>

        {/* RESERVAS DE CUPO DE VISITANTE PRÓXIMAS */}
        {reservasProximas.length > 0 ? (
          <Animated.View
            entering={FadeInDown.duration(500)}
            className="flex flex-col gap-3 rounded-[24px] bg-primary-light p-5"
            style={{ borderWidth: 1, borderColor: `${t.info}40` }}
          >
            <View className="flex-row items-center gap-2">
              <CalendarClock size={18} color={t.info} />
              <Text className="text-sm font-bold text-text">Reservas de visitante próximas</Text>
              <View
                className="ml-auto rounded-full px-2 py-1"
                style={{ backgroundColor: `${t.info}1a`, borderWidth: 1, borderColor: `${t.info}4d` }}
              >
                <Text className="text-[10px] font-black" style={{ color: t.info }}>
                  {reservasProximas.length}
                </Text>
              </View>
            </View>

            <View className="flex flex-col gap-2">
              {reservasProximas.map((r) => (
                <View
                  key={r.id}
                  className="flex-row items-center gap-3 rounded-2xl border border-border p-3.5"
                  style={{ backgroundColor: `${t.text}0d` }}
                >
                  <View
                    className="h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                    style={{
                      backgroundColor: `${t.info}1a`,
                      borderWidth: 1,
                      borderColor: `${t.info}33`,
                    }}
                  >
                    {r.categoria === 'MOTO' ? (
                      <Bike size={16} color={t.info} />
                    ) : (
                      <Car size={16} color={t.info} />
                    )}
                  </View>
                  <View className="min-w-0 flex-1 flex-col">
                    <View className="flex-row items-center gap-2">
                      <Text numberOfLines={1} className="flex-1 text-sm font-bold text-text">
                        {r.residenteNombre}
                      </Text>
                      {r.estado === 'LLEGO' ? (
                        <View
                          className="shrink-0 rounded-full px-1.5 py-0.5"
                          style={{ backgroundColor: `${t.success}26` }}
                        >
                          <Text
                            className="text-[9px] font-black uppercase tracking-wider"
                            style={{ color: t.success }}
                          >
                            Llegó
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text
                      numberOfLines={1}
                      className="text-[11px]"
                      style={{ color: `${t.text}99` }}
                    >
                      {fechaReserva(r.llegadaEstimada)}
                      {' · '}
                      {r.tiempoLibre ? 'tiempo libre' : `~${r.duracionMinutos} min`}
                      {r.placa ? ` · ${r.placa}` : ''}
                    </Text>
                  </View>
                  {r.estado === 'PENDIENTE' ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={busyReservaLlegada === r.id}
                      onPress={() => void marcarLlegadaReserva(r.id)}
                      style={({ pressed }) => ({
                        backgroundColor: t.info,
                        opacity: busyReservaLlegada === r.id ? 0.5 : 1,
                        transform: [{ scale: pressed ? 0.95 : 1 }],
                      })}
                      className="shrink-0 rounded-xl px-3 py-2"
                    >
                      <Text className="text-[10px] font-bold uppercase tracking-wider text-on-accent">
                        {busyReservaLlegada === r.id ? '...' : 'Llegó'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>

            <Text className="text-[10px] leading-relaxed" style={{ color: `${t.text}80` }}>
              Marca &quot;Llegó&quot; cuando el visitante entre, luego asígnale una celda de
              visitante en el mapa.
            </Text>
          </Animated.View>
        ) : null}

        {/* MAPA INTERACTIVO */}
        <Animated.View
          entering={FadeInDown.delay(80).duration(500)}
          className="overflow-hidden rounded-[24px] border border-border bg-primary-light p-6"
        >
          <View className="mb-6 flex-row items-start justify-between">
            <View className="min-w-0 flex-1 flex-row items-center gap-3">
              <View
                className="h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                style={{ backgroundColor: `${t.info}1a` }}
              >
                <Map size={22} color={t.info} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-lg font-bold leading-tight text-text">Mapa Interactivo</Text>
                <Text className="mt-0.5 text-[11px]" style={{ color: `${t.text}8c` }}>
                  Celdas de estacionamiento
                </Text>
              </View>
            </View>
          </View>

          {/* SELECTOR DE NIVEL / SÓTANO */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mb-5"
            contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
          >
            {nivelesRender.map((n) => {
              const activo = nivel === n;
              const count = parqueaderos.filter((p) => nivelDeCelda(p) === n).length;
              return (
                <Pressable
                  key={n}
                  accessibilityRole="button"
                  onPress={() => setNivel(n)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: activo ? 'transparent' : t.border,
                    backgroundColor: activo ? t.info : t.surface2,
                    transform: [{ scale: pressed ? 0.95 : 1 }],
                  })}
                >
                  <Text
                    className="text-xs font-bold uppercase tracking-widest"
                    style={{ color: activo ? t.onAccent : `${t.text}b3` }}
                  >
                    Sótano {n}
                  </Text>
                  <View
                    className="rounded-full px-1.5 py-0.5"
                    style={{ backgroundColor: activo ? ACTIVE_BADGE : `${t.text}1a` }}
                  >
                    <Text
                      className="text-[9px]"
                      style={{ color: activo ? t.onAccent : `${t.text}b3` }}
                    >
                      {count}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* LEYENDA */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mb-6"
            style={{ borderBottomWidth: 1, borderBottomColor: `${t.border}` }}
            contentContainerStyle={{
              flexDirection: 'row',
              gap: 16,
              paddingTop: 8,
              paddingBottom: 16,
            }}
          >
            {[
              { color: t.success, label: 'Libre' },
              { color: t.danger, label: 'Ocupado' },
              { color: t.warning, label: 'Reservado' },
            ].map((l) => (
              <View key={l.label} className="flex-row items-center gap-2">
                <View
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    backgroundColor: l.color,
                    borderWidth: 1,
                    borderColor: l.color,
                    shadowColor: l.color,
                    shadowOpacity: 0.6,
                    shadowRadius: 6,
                    shadowOffset: { width: 0, height: 0 },
                  }}
                />
                <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                  {l.label}
                </Text>
              </View>
            ))}
          </ScrollView>

          {/* Equivalencia física de espacios */}
          <View className="-mt-2 mb-5 flex-row flex-wrap items-center gap-x-4 gap-y-1">
            <Text
              className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color: `${t.text}99` }}
            >
              Equivalencia:
            </Text>
            <Text className="text-[10px]" style={{ color: `${t.text}cc` }}>
              🚗 1 carro
            </Text>
            <Text className="text-[10px]" style={{ color: `${t.text}66` }}>
              =
            </Text>
            <Text className="text-[10px]" style={{ color: `${t.text}cc` }}>
              🏍️ 4 motos
            </Text>
            <Text className="text-[10px]" style={{ color: `${t.text}66` }}>
              =
            </Text>
            <Text className="text-[10px]" style={{ color: `${t.text}cc` }}>
              🚲 5 bicis
            </Text>
          </View>

          {/* MAPA TIPO PLANO AÉREO: bahías a ambos lados de un carril central */}
          {celdasDelNivel.length === 0 ? (
            <View className="items-center justify-center gap-2 py-16">
              <Map size={40} color={`${t.text}66`} />
              <Text className="text-center text-xs font-bold" style={{ color: `${t.text}b3` }}>
                {parqueaderos.length === 0
                  ? 'No hay celdas registradas todavía'
                  : `Sin celdas en Sótano ${nivel}`}
              </Text>
            </View>
          ) : (
            <View
              style={{
                position: 'relative',
                borderRadius: 16,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: PLAN_BORDER,
                shadowColor: '#000000',
                shadowOpacity: 0.5,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 12 },
                elevation: 12,
              }}
            >
              {/* Asfalto: repeating-linear-gradient(45deg, …) aproximado */}
              <LinearGradient
                pointerEvents="none"
                colors={ASPHALT.colors}
                locations={ASPHALT.locations}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              />

              {/* Marca de agua "P" */}
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                <Text
                  style={{
                    fontSize: WATERMARK_SIZE,
                    lineHeight: WATERMARK_SIZE,
                    fontWeight: '900',
                    color: WATERMARK,
                  }}
                >
                  P
                </Text>
              </View>

              {/* ENTRADA */}
              <View
                style={{
                  position: 'relative',
                  height: 28,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: `${t.success}1a`,
                  }}
                />
                <Text
                  style={{
                    fontSize: 8,
                    fontWeight: '900',
                    letterSpacing: 2.4,
                    color: t.success,
                    textTransform: 'uppercase',
                  }}
                >
                  ▲ Entrada
                </Text>
                {/* `border-b-2 border-dashed border-success/60` */}
                <DashedLine color={`${t.success}99`} edge="bottom" />
              </View>

              {/* CUERPO: peatonal · bahías · carril · bahías · peatonal */}
              <View style={{ position: 'relative', flexDirection: 'row', alignItems: 'stretch' }}>
                <View style={{ width: 6, backgroundColor: `${t.success}4d` }} />
                <View
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    alignContent: 'flex-start',
                    borderRightWidth: 2,
                    borderRightColor: LANE_DIVIDER,
                  }}
                >
                  {leftCells.map((p) => bay(p, 'left'))}
                </View>

                {/* Carril central con línea amarilla y flechas */}
                <View
                  style={{
                    width: 40,
                    position: 'relative',
                    flexShrink: 0,
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 12,
                  }}
                >
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: 19,
                      width: 2,
                      overflow: 'hidden',
                    }}
                  >
                    {LANE_DASHES.map((i) => (
                      <View
                        key={i}
                        style={{ height: 8, marginBottom: 10, backgroundColor: LANE_YELLOW }}
                      />
                    ))}
                  </View>
                  <ArrowRight
                    size={16}
                    color={ARROW_WHITE}
                    style={{ transform: [{ rotate: '-90deg' }] }}
                  />
                  <ArrowRight
                    size={16}
                    color={ARROW_WHITE}
                    style={{ transform: [{ rotate: '90deg' }] }}
                  />
                </View>

                <View
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    alignContent: 'flex-start',
                    borderLeftWidth: 2,
                    borderLeftColor: LANE_DIVIDER,
                  }}
                >
                  {rightCells.map((p) => bay(p, 'right'))}
                </View>
                <View style={{ width: 6, backgroundColor: `${t.success}4d` }} />
              </View>

              {/* SALIDA */}
              <View
                style={{
                  position: 'relative',
                  height: 28,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: 8,
                    fontWeight: '900',
                    letterSpacing: 2.4,
                    color: `${t.text}b3`,
                    textTransform: 'uppercase',
                  }}
                >
                  Salida ▼
                </Text>
                {/* `border-t-2 border-dashed border-white/30` */}
                <DashedLine color={SALIDA_BORDER} edge="top" />
              </View>
            </View>
          )}
        </Animated.View>

        {/* MI ACTIVIDAD */}
        <Animated.View
          entering={FadeInDown.delay(160).duration(500)}
          className="mt-2 flex flex-col gap-4"
        >
          <View className="flex-row items-center justify-between px-2">
            <View className="flex-row items-center gap-2">
              <History size={18} color={t.text} />
              <Text className="text-lg font-medium tracking-wide text-text">Mi Actividad</Text>
            </View>
            <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
              Últimos 50
            </Text>
          </View>

          <View className="flex flex-col gap-3">
            {registros.length === 0 ? (
              <View
                className="items-center rounded-[24px] bg-primary-light p-8"
                style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: `${t.border}` }}
              >
                <Text className="text-center text-xs italic text-text">
                  No has registrado movimientos recientemente.
                </Text>
              </View>
            ) : null}

            {registros.map((reg) => (
              <View
                key={reg.id}
                className="flex-row items-center justify-between rounded-[24px] border border-border bg-primary-light p-4"
              >
                <View className="flex-1 flex-row items-center gap-4">
                  <View
                    className="h-10 w-10 items-center justify-center rounded-2xl"
                    style={{
                      backgroundColor: `${t.text}1a`,
                      borderWidth: 1,
                      borderColor: `${t.text}33`,
                    }}
                  >
                    <ArrowRight
                      size={18}
                      color={t.text}
                      style={{
                        transform: [{ rotate: reg.tipo === 'INGRESO' ? '45deg' : '-135deg' }],
                      }}
                    />
                  </View>
                  <View className="flex-1 flex-col">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-sm font-bold text-text">Celda {reg.celdaNumero}</Text>
                      <View
                        className="rounded-full px-1.5 py-0.5"
                        style={{ backgroundColor: `${t.text}0d` }}
                      >
                        <Text className="text-[10px] font-black uppercase text-text">
                          {reg.celdaTipo?.slice(0, 3)}
                        </Text>
                      </View>
                    </View>
                    <View className="mt-0.5 flex-row items-center gap-2">
                      <Clock size={10} color={t.text} />
                      <Text className="text-[10px] font-medium text-text">
                        {horaCorta(reg.fecha)} • {reg.placa || 'Sin placa'}
                      </Text>
                    </View>
                  </View>
                </View>
                {reg.observacion ? (
                  <Text
                    numberOfLines={1}
                    className="max-w-[150px] text-[10px] italic text-text"
                  >
                    &quot;{reg.observacion}&quot;
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        </Animated.View>
      </View>

      {/* MODAL: ASIGNAR CELDA DE VISITANTE A UN RESIDENTE (aprueba el inquilino) */}
      <VisitanteModal
        cell={cellVisitante}
        tokens={t}
        residentes={residentes}
        residenteId={residenteId}
        busqueda={busquedaRes}
        tiempoEstimado={tiempoEstimado}
        isSubmitting={isSubmitting}
        yaTieneVisitaActiva={
          !!residenteId &&
          parqueaderos.some(
            (c) =>
              c.tipo === 'VISITANTE' && c.estado === 'OCUPADO' && c.usuarioId === residenteId,
          )
        }
        onBusqueda={setBusquedaRes}
        onSelectResidente={setResidenteId}
        onTiempo={setTiempoEstimado}
        onClose={() => setCellVisitante(null)}
        onSubmit={() => void asignarVisitante()}
      />

      {/* MODAL: CONFIRMAR LIBERACIÓN DE CELDA (reemplaza el confirm() nativo) */}
      <LiberarModal
        cell={cellToRelease}
        tokens={t}
        sesionCobro={sesionCobro}
        ahora={ahora}
        liquidando={liquidando}
        isSubmitting={isSubmitting}
        onClose={() => setCellToRelease(null)}
        onLiberar={() => {
          if (cellToRelease) void liberarCelda(cellToRelease.id);
        }}
        onLiquidar={(l) => void cerrarSesionLiquidando(l)}
      />

      {/* MODAL: ASIGNAR CELDA DE RESIDENTE A UN APARTAMENTO (con placa) */}
      <ResidenteModal
        cell={cellResidente}
        tokens={t}
        residentes={residentes}
        residenteId={residenteId}
        busqueda={busquedaRes}
        placa={placaResidente}
        meses={mesesResidente}
        isSubmitting={isSubmitting}
        onBusqueda={setBusquedaRes}
        onSelectResidente={setResidenteId}
        onPlaca={setPlacaResidente}
        onMeses={setMesesResidente}
        onClose={() => setCellResidente(null)}
        onSubmit={() => void asignarResidente()}
      />
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Bottom-sheet shell compartida por los 3 modales (web: fixed inset-0 z-100
// flex items-end + backdrop black/80 + panel rounded-t-[32px] p-8 pb-12).
// ---------------------------------------------------------------------------

function SheetModal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
          className="absolute inset-0 bg-black/80"
        />
        {open ? (
          <Animated.View
            entering={SlideInDown.duration(300)}
            className="max-h-[94%] overflow-hidden rounded-t-[32px] border-t border-border bg-primary-light"
            style={{ paddingBottom: insets.bottom + 16 }}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 32, paddingTop: 32, paddingBottom: 48 }}
            >
              {children}
            </ScrollView>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

/** Lista de residentes del directorio (compartida por los 2 modales de asignación). */
function ListaResidentes({
  tokens: t,
  residentes,
  residenteId,
  busqueda,
  maxHeight,
  onSelect,
}: {
  tokens: ColorTokens;
  residentes: DirectorioEntradaDto[];
  residenteId: string;
  busqueda: string;
  maxHeight: number;
  onSelect: (id: string) => void;
}) {
  const filtrados = filtrarResidentes(residentes, busqueda);
  return (
    <ScrollView
      style={{ maxHeight }}
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ flexDirection: 'column', gap: 8 }}
    >
      {filtrados.map((r) => {
        const selected = residenteId === r.id;
        return (
          <Pressable
            key={r.id}
            accessibilityRole="button"
            onPress={() => onSelect(r.id)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 12,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: selected ? t.info : `${t.border}`,
              backgroundColor: selected ? `${t.info}26` : `${t.text}0d`,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text className="flex-1 pr-2 text-sm font-bold text-text">{r.nombre}</Text>
            <Text className="text-[11px]" style={{ color: `${t.text}b3` }}>
              {residenteUbicacion(r)}
            </Text>
          </Pressable>
        );
      })}
      {residentes.length === 0 ? (
        <Text className="py-4 text-center text-xs" style={{ color: `${t.text}99` }}>
          No se pudo cargar el directorio de residentes.
        </Text>
      ) : null}
    </ScrollView>
  );
}

/** Grid de 4 opciones (Tiempo estimado / Vigencia). */
function OptionGrid({
  tokens: t,
  options,
  value,
  onChange,
}: {
  tokens: ColorTokens;
  options: Array<{ v: string; l: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((opt) => {
        const selected = value === opt.v;
        return (
          <Pressable
            key={opt.v}
            accessibilityRole="button"
            onPress={() => onChange(opt.v)}
            style={({ pressed }) => ({
              flexGrow: 1,
              flexBasis: '22%',
              alignItems: 'center',
              paddingVertical: 10,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: selected ? 'transparent' : t.border,
              backgroundColor: selected ? t.info : `${t.text}0d`,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              className="text-[11px] font-bold"
              style={{ color: selected ? t.onAccent : t.text }}
            >
              {opt.l}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── MODAL: Asignar celda de VISITANTE ───────────────────────────────────────

const TIEMPO_OPTS = [
  { v: '30', l: '30 min' },
  { v: '60', l: '1 hora' },
  { v: '120', l: '2 horas' },
  { v: 'libre', l: 'Libre' },
];

function VisitanteModal({
  cell,
  tokens: t,
  residentes,
  residenteId,
  busqueda,
  tiempoEstimado,
  isSubmitting,
  yaTieneVisitaActiva,
  onBusqueda,
  onSelectResidente,
  onTiempo,
  onClose,
  onSubmit,
}: {
  cell: CeldaMapa | null;
  tokens: ColorTokens;
  residentes: DirectorioEntradaDto[];
  residenteId: string;
  busqueda: string;
  tiempoEstimado: string;
  isSubmitting: boolean;
  yaTieneVisitaActiva: boolean;
  onBusqueda: (v: string) => void;
  onSelectResidente: (id: string) => void;
  onTiempo: (v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const disabled = isSubmitting || !residenteId;
  return (
    <SheetModal open={!!cell} onClose={onClose}>
      {cell ? (
        <>
          <View className="mb-6 flex-row items-center justify-between">
            <View className="flex-1 flex-col">
              <Text
                className="mb-1 text-[10px] font-bold uppercase"
                style={{ color: t.info, letterSpacing: 2 }}
              >
                Parqueadero de Visitante
              </Text>
              <Text className="text-2xl font-bold text-text">Celda {cell.numero}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
              onPress={onClose}
              className="h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: `${t.text}0d` }}
            >
              <X size={20} color={t.text} />
            </Pressable>
          </View>

          <Text className="mb-4 text-sm leading-relaxed" style={{ color: `${t.text}cc` }}>
            Elige el <Text className="font-bold">residente</Text> que recibe la visita. La
            asignación queda{' '}
            <Text className="font-bold" style={{ color: t.warning }}>
              pendiente
            </Text>{' '}
            hasta que ese residente la{' '}
            <Text className="font-bold" style={{ color: t.success }}>
              apruebe
            </Text>{' '}
            desde su app.
          </Text>

          <TextInput
            value={busqueda}
            onChangeText={onBusqueda}
            placeholder="Buscar por nombre, torre o apto..."
            placeholderTextColor={`${t.text}80`}
            className="mb-3 w-full rounded-2xl px-4 py-3 text-sm text-text"
            style={{ borderWidth: 1, borderColor: t.border, backgroundColor: `${t.text}0d` }}
          />

          <View className="mb-5">
            <ListaResidentes
              tokens={t}
              residentes={residentes}
              residenteId={residenteId}
              busqueda={busqueda}
              maxHeight={280}
              onSelect={onSelectResidente}
            />
          </View>

          {/* Tiempo estimado de la visita (2h gratis, luego $3.000/h). */}
          <View className="mb-5">
            <View className="mb-2 flex-row items-center justify-between px-1">
              <Text
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: `${t.text}cc` }}
              >
                Tiempo estimado
              </Text>
              <Text className="text-[10px]" style={{ color: `${t.text}80` }}>
                2h gratis · luego $3.000/h
              </Text>
            </View>
            <OptionGrid tokens={t} options={TIEMPO_OPTS} value={tiempoEstimado} onChange={onTiempo} />
          </View>

          {/* Aviso: el apto del residente seleccionado ya tiene una visita
              activa → este visitante paga desde la llegada (sin gratis). */}
          {yaTieneVisitaActiva ? (
            <View
              className="mb-4 flex-row items-start gap-2.5 rounded-2xl p-3.5"
              style={{
                borderWidth: 1,
                borderColor: `${t.warning}66`,
                backgroundColor: `${t.warning}1a`,
              }}
            >
              <AlertCircle size={18} color={t.warning} style={{ marginTop: 2 }} />
              <Text className="flex-1 text-[12px] leading-snug" style={{ color: `${t.text}e6` }}>
                Este apartamento <Text className="font-bold">ya tiene una visita activa</Text>. El
                tiempo gratis es para un visitante a la vez, así que{' '}
                <Text className="font-bold" style={{ color: t.warning }}>
                  este pagará desde la llegada
                </Text>
                .
              </Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled, busy: isSubmitting }}
            disabled={disabled}
            onPress={onSubmit}
            style={({ pressed }) => ({
              backgroundColor: t.info,
              opacity: disabled ? 0.5 : 1,
              transform: [{ scale: pressed ? 0.95 : 1 }],
            })}
            className="w-full items-center rounded-2xl py-4"
          >
            <Text className="text-sm font-bold text-on-accent">
              {isSubmitting ? 'Enviando...' : 'Enviar para aprobación del residente'}
            </Text>
          </Pressable>
        </>
      ) : null}
    </SheetModal>
  );
}

// ── MODAL: Liberar celda + liquidación en vivo ───────────────────────────────

function LiberarModal({
  cell,
  tokens: t,
  sesionCobro,
  ahora,
  liquidando,
  isSubmitting,
  onClose,
  onLiberar,
  onLiquidar,
}: {
  cell: CeldaMapa | null;
  tokens: ColorTokens;
  sesionCobro: SesionCobroDto | null;
  ahora: number;
  liquidando: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onLiberar: () => void;
  onLiquidar: (l: 'VISITANTE_PAGO' | 'CARGADO_APTO') => void;
}) {
  if (!cell) return <SheetModal open={false} onClose={onClose}>{null}</SheetModal>;

  const vencida = cell.asignadoHasta
    ? new Date(cell.asignadoHasta).getTime() < Date.now()
    : false;

  // Cobro de visitante: tiempo transcurrido y monto EN VIVO.
  let cobro: {
    transcurridoTxt: string;
    enCobro: boolean;
    minCobrables: number;
    monto: number;
    gratisTxt: string;
  } | null = null;
  if (sesionCobro) {
    const ini = new Date(sesionCobro.inicio ?? sesionCobro.finGratis).getTime();
    const finGratis = new Date(sesionCobro.finGratis).getTime();
    const transcurridoMin = Math.max(0, Math.floor((ahora - ini) / 60000));
    const hh = Math.floor(transcurridoMin / 60);
    const mm = transcurridoMin % 60;
    const enCobro = ahora >= finGratis;
    const minCobrables = Math.max(0, Math.floor((ahora - finGratis) / 60000));
    const porMin = Number(sesionCobro.tarifaHora || 3000) / 60;
    const monto = enCobro ? Math.round(minCobrables * porMin) : 0;
    const segGratisRest = Math.max(0, Math.floor((finGratis - ahora) / 1000));
    const ghh = Math.floor(segGratisRest / 3600);
    const gmm = Math.floor((segGratisRest % 3600) / 60);
    const gss = segGratisRest % 60;
    cobro = {
      transcurridoTxt: hh > 0 ? `${hh}h ${mm}min` : `${mm}min`,
      enCobro,
      minCobrables,
      monto,
      gratisTxt: `${ghh > 0 ? `${ghh}:` : ''}${pad2(gmm)}:${pad2(gss)}`,
    };
  }

  const retenida = !!sesionCobro && sesionCobro.estado === 'RETENIDA';
  const enCobroSesion = !!sesionCobro && ahora >= new Date(sesionCobro.finGratis).getTime();

  return (
    <SheetModal open onClose={onClose}>
      <View className="flex-col items-center gap-4">
        <View
          className="h-16 w-16 items-center justify-center rounded-full"
          style={{
            backgroundColor: `${t.warning}26`,
            borderWidth: 1,
            borderColor: `${t.warning}66`,
          }}
        >
          <AlertCircle size={30} color={t.warning} />
        </View>

        <View className="flex-col items-center gap-1">
          <Text
            className="text-[10px] font-bold uppercase"
            style={{ color: t.info, letterSpacing: 2 }}
          >
            Liberar Celda
          </Text>
          <Text className="text-2xl font-bold text-text">Celda {cell.numero}</Text>
        </View>

        <Text className="text-center text-sm leading-relaxed" style={{ color: `${t.text}cc` }}>
          {cell.asignadoHasta ? (
            <>
              Esta celda tiene una asignación{' '}
              <Text className="font-bold" style={{ color: vencida ? t.danger : t.success }}>
                {vencida ? 'VENCIDA' : `vigente hasta el ${fechaCorta(cell.asignadoHasta)}`}
              </Text>
              .{' '}
            </>
          ) : null}
          Quedará{' '}
          <Text className="font-bold" style={{ color: t.success }}>
            disponible
          </Text>{' '}
          para una nueva asignación.
        </Text>

        {cobro ? (
          <View
            className="mt-1 w-full flex-col gap-2 rounded-2xl border border-border p-4"
            style={{ backgroundColor: `${t.text}0d` }}
          >
            <View className="flex-row items-center justify-between">
              <Text
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: `${t.text}b3` }}
              >
                Tiempo transcurrido
              </Text>
              <Text
                className="text-sm font-bold text-text"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {cobro.transcurridoTxt}
              </Text>
            </View>

            <View className="flex-row items-center justify-between">
              <Text
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: `${t.text}b3` }}
              >
                {cobro.enCobro ? 'Cobrable' : 'Gratis restante'}
              </Text>
              <Text
                className="text-sm font-bold"
                style={{
                  color: cobro.enCobro ? t.warning : t.success,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {cobro.enCobro ? `${cobro.minCobrables} min` : cobro.gratisTxt}
              </Text>
            </View>

            <View
              className="mt-0.5 flex-row items-center justify-between pt-2"
              style={{ borderTopWidth: 1, borderTopColor: t.border }}
            >
              <Text
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: `${t.text}b3` }}
              >
                A cobrar
              </Text>
              <Text
                className="text-xl font-bold"
                style={{ color: cobro.monto > 0 ? t.warning : t.success }}
              >
                ${formatCOP(cobro.monto)}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Si está RETENIDA: esperando aprobación del residente. El vehículo no
            sale salvo válvula de escape (paga en sitio). */}
        {retenida && sesionCobro ? (
          <View className="mt-2 w-full flex-col gap-3">
            <View
              className="w-full rounded-2xl p-4"
              style={{
                backgroundColor: `${t.danger}1a`,
                borderWidth: 1,
                borderColor: `${t.danger}66`,
              }}
            >
              <Text
                className="text-center text-xs leading-relaxed"
                style={{ color: `${t.text}e6` }}
              >
                🔒 <Text className="font-bold">Vehículo retenido.</Text> El cobro de{' '}
                <Text className="font-bold" style={{ color: t.warning }}>
                  ${formatCOP(Number(sesionCobro.montoFinal || sesionCobro.montoActual || 0))}
                </Text>{' '}
                está esperando que el residente lo apruebe. No autorices la salida hasta que
                apruebe, o cobra al visitante en sitio.
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={liquidando}
              onPress={() => onLiquidar('VISITANTE_PAGO')}
              style={({ pressed }) => ({
                backgroundColor: t.success,
                opacity: liquidando ? 0.6 : 1,
                transform: [{ scale: pressed ? 0.95 : 1 }],
              })}
              className="w-full items-center rounded-2xl py-4"
            >
              <Text className="text-sm font-bold text-on-accent">
                {liquidando ? 'Procesando...' : 'Visitante pagó en sitio → liberar'}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => ({
                backgroundColor: `${t.text}0d`,
                borderWidth: 1,
                borderColor: t.border,
                transform: [{ scale: pressed ? 0.95 : 1 }],
              })}
              className="w-full items-center rounded-2xl py-3"
            >
              <Text className="text-sm font-bold text-text">Cerrar (sigue retenido)</Text>
            </Pressable>
          </View>
        ) : enCobroSesion ? (
          <View className="mt-2 w-full flex-col gap-3">
            <Pressable
              accessibilityRole="button"
              disabled={liquidando}
              onPress={() => onLiquidar('VISITANTE_PAGO')}
              style={({ pressed }) => ({
                backgroundColor: t.success,
                opacity: liquidando ? 0.6 : 1,
                transform: [{ scale: pressed ? 0.95 : 1 }],
              })}
              className="w-full items-center rounded-2xl py-4"
            >
              <Text className="text-sm font-bold text-on-accent">
                {liquidando ? 'Procesando...' : 'Visitante pagó en sitio'}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={liquidando}
              onPress={() => onLiquidar('CARGADO_APTO')}
              style={({ pressed }) => ({
                backgroundColor: t.info,
                opacity: liquidando ? 0.6 : 1,
                transform: [{ scale: pressed ? 0.95 : 1 }],
              })}
              className="w-full items-center rounded-2xl py-4"
            >
              <Text className="text-sm font-bold text-on-accent">
                {liquidando ? 'Procesando...' : 'Cargar al apartamento (retiene el vehículo)'}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => ({
                backgroundColor: `${t.text}0d`,
                borderWidth: 1,
                borderColor: t.border,
                transform: [{ scale: pressed ? 0.95 : 1 }],
              })}
              className="w-full items-center rounded-2xl py-3"
            >
              <Text className="text-sm font-bold text-text">Cancelar</Text>
            </Pressable>
          </View>
        ) : (
          <View className="mt-2 w-full flex-row gap-3">
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => ({
                flex: 1,
                backgroundColor: `${t.text}0d`,
                borderWidth: 1,
                borderColor: t.border,
                transform: [{ scale: pressed ? 0.95 : 1 }],
              })}
              className="items-center rounded-2xl py-4"
            >
              <Text className="text-sm font-bold text-text">Cancelar</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting || liquidando}
              onPress={() => (sesionCobro ? onLiquidar('VISITANTE_PAGO') : onLiberar())}
              style={({ pressed }) => ({
                flex: 1,
                backgroundColor: t.info,
                opacity: isSubmitting || liquidando ? 0.6 : 1,
                transform: [{ scale: pressed ? 0.95 : 1 }],
              })}
              className="items-center rounded-2xl py-4"
            >
              <Text className="text-sm font-bold text-on-accent">
                {isSubmitting || liquidando ? 'Liberando...' : 'Liberar Celda'}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </SheetModal>
  );
}

// ── MODAL: Asignar celda de RESIDENTE a un apartamento ───────────────────────

const VIGENCIA_OPTS = [
  { v: 'sin', l: 'Sin venc.' },
  { v: '6', l: '6 meses' },
  { v: '12', l: '1 año' },
  { v: '24', l: '2 años' },
];

function ResidenteModal({
  cell,
  tokens: t,
  residentes,
  residenteId,
  busqueda,
  placa,
  meses,
  isSubmitting,
  onBusqueda,
  onSelectResidente,
  onPlaca,
  onMeses,
  onClose,
  onSubmit,
}: {
  cell: CeldaMapa | null;
  tokens: ColorTokens;
  residentes: DirectorioEntradaDto[];
  residenteId: string;
  busqueda: string;
  placa: string;
  meses: string;
  isSubmitting: boolean;
  onBusqueda: (v: string) => void;
  onSelectResidente: (id: string) => void;
  onPlaca: (v: string) => void;
  onMeses: (v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const disabled = isSubmitting || !residenteId || !placa.trim();
  return (
    <SheetModal open={!!cell} onClose={onClose}>
      {cell ? (
        <>
          <View className="mb-6 flex-row items-center justify-between">
            <View className="flex-1 flex-col">
              <Text
                className="mb-1 text-[10px] font-bold uppercase"
                style={{ color: t.info, letterSpacing: 2 }}
              >
                Asignar a Apartamento
              </Text>
              <Text className="text-2xl font-bold text-text">Celda {cell.numero}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
              onPress={onClose}
              className="h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: `${t.text}0d` }}
            >
              <X size={20} color={t.text} />
            </Pressable>
          </View>

          <Text className="mb-4 text-sm leading-relaxed" style={{ color: `${t.text}cc` }}>
            Esta celda se asigna a un <Text className="font-bold">apartamento</Text>. Elige el
            residente e indica la <Text className="font-bold">placa</Text> del vehículo. La placa
            es obligatoria.
          </Text>

          <TextInput
            value={busqueda}
            onChangeText={onBusqueda}
            placeholder="Buscar por nombre, torre o apto..."
            placeholderTextColor={`${t.text}80`}
            className="mb-3 w-full rounded-2xl px-4 py-3 text-sm text-text"
            style={{ borderWidth: 1, borderColor: t.border, backgroundColor: `${t.text}0d` }}
          />

          <View className="mb-4">
            <ListaResidentes
              tokens={t}
              residentes={residentes}
              residenteId={residenteId}
              busqueda={busqueda}
              maxHeight={220}
              onSelect={onSelectResidente}
            />
          </View>

          {/* Placa obligatoria */}
          <View className="mb-4 flex-col gap-2">
            <Text
              className="ml-1 text-[10px] font-bold uppercase tracking-widest"
              style={{ color: `${t.text}cc` }}
            >
              Placa del Vehículo *
            </Text>
            <TextInput
              value={placa}
              onChangeText={(v) => onPlaca(v.toUpperCase())}
              placeholder="ABC-123"
              placeholderTextColor={`${t.text}66`}
              autoCapitalize="characters"
              autoCorrect={false}
              className="w-full rounded-2xl px-6 py-4 text-lg text-text"
              style={{
                borderWidth: 1,
                borderColor: t.border,
                backgroundColor: `${t.text}0d`,
                letterSpacing: 2,
                fontVariant: ['tabular-nums'],
              }}
            />
          </View>

          {/* Vigencia opcional */}
          <View className="mb-5">
            <View className="mb-2 flex-row items-center justify-between px-1">
              <Text
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: `${t.text}cc` }}
              >
                Vigencia
              </Text>
              <Text className="text-[10px]" style={{ color: `${t.text}80` }}>
                opcional
              </Text>
            </View>
            <OptionGrid tokens={t} options={VIGENCIA_OPTS} value={meses} onChange={onMeses} />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled, busy: isSubmitting }}
            disabled={disabled}
            onPress={onSubmit}
            style={({ pressed }) => ({
              backgroundColor: t.info,
              opacity: disabled ? 0.5 : 1,
              transform: [{ scale: pressed ? 0.95 : 1 }],
            })}
            className="w-full flex-row items-center justify-center gap-2 rounded-2xl py-4"
          >
            <Car size={18} color={t.onAccent} />
            <Text className="text-sm font-bold text-on-accent">
              {isSubmitting ? 'Asignando...' : 'Asignar al apartamento'}
            </Text>
          </Pressable>
        </>
      ) : null}
    </SheetModal>
  );
}
