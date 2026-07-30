/**
 * COMITÉ DE CONVIVENCIA — CONJUNTOSAPP (mobile port)
 * Mediación y resolución de conflictos entre vecinos.
 *
 * Ported 1:1 from web src/app/(app)/comite-convivencia/page.tsx:
 *  - Role gate: ADMINISTRADOR | SUPER_ADMIN | CONCEJO (else toast + /inicio)
 *  - GET /convivencia/casos[?estado=] · GET /convivencia/casos/stats ·
 *    GET /convivencia/unidades
 *  - POST /convivencia/casos · PUT /convivencia/casos/{id}
 *  - useWsSubscription('convivencia') → refetch casos + stats
 *  - ImponerMulta (admin-only, self-gating) above the hero card
 *
 * Web → RN: `<select>` becomes an in-modal option list; the centered
 * `fixed inset-0` modals become RN `Modal`s with the same centered glass panel;
 * `animate-pulse` skeletons become a reanimated opacity loop.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  FadeInDown,
  ZoomIn,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  AlertTriangle,
  ArrowUpDown,
  Building,
  Car,
  CheckCircle2,
  Dog,
  FileText,
  HardHat,
  Heart,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Scale,
  Siren,
  Trash2,
  User,
  Users,
  Volume2,
  Wind,
  X,
} from 'lucide-react-native';

import ProfileHeader from '@/components/shell/ProfileHeader';
import ImponerMulta from '@/components/multas/ImponerMulta';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { Screen } from '@/components/ui/Screen';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api, ApiError } from '@/lib/api/client';
import type {
  ActualizarCasoConvivenciaRequest,
  CasoConvivenciaDto,
  CrearCasoConvivenciaRequest,
  EstadoCasoConvivencia,
  TipoCasoConvivencia,
  UnidadEmbedDto,
} from '@/lib/api/types';
import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor, type ColorTokens } from '@/theme/tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TipoCaso = TipoCasoConvivencia;
type EstadoCaso = EstadoCasoConvivencia;

/**
 * Stats payload of `GET /convivencia/casos/stats` as the web page consumes it.
 * Declared locally because the shared `StatsConvivenciaDto` in api/types.ts is
 * missing `asignados` / `acuerdos` / `sin_acuerdo` (see hoist notes).
 */
interface StatsConvivencia {
  total: number;
  reportados: number;
  asignados: number;
  en_mediacion: number;
  acuerdos: number;
  sin_acuerdo: number;
  escalados: number;
}

/** `GET /convivencia/unidades` row + the derived display label. */
interface UnidadOption {
  id: string;
  torre: string | null;
  numero: string;
  nombre_residente: string | null;
  label: string;
}

type TabKey = 'TODOS' | 'REPORTADO' | 'EN_MEDIACION' | 'RESUELTO';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type IconFn = (size: number, color: string) => ReactElement;

const TIPO_CASO: { key: TipoCaso; label: string; icon: IconFn }[] = [
  { key: 'RUIDO', label: 'Ruido', icon: (s, c) => <Volume2 size={s} color={c} /> },
  { key: 'MASCOTAS', label: 'Mascotas', icon: (s, c) => <Dog size={s} color={c} /> },
  { key: 'OLORES', label: 'Olores', icon: (s, c) => <Wind size={s} color={c} /> },
  { key: 'PARQUEADERO', label: 'Parqueadero', icon: (s, c) => <Car size={s} color={c} /> },
  { key: 'BASURAS', label: 'Basuras', icon: (s, c) => <Trash2 size={s} color={c} /> },
  { key: 'OBRAS', label: 'Obras', icon: (s, c) => <HardHat size={s} color={c} /> },
  { key: 'AMENAZAS', label: 'Amenazas', icon: (s, c) => <Siren size={s} color={c} /> },
  { key: 'OTRO', label: 'Otro', icon: (s, c) => <MoreHorizontal size={s} color={c} /> },
];

const TIPO_ICON_MAP: Record<TipoCaso, IconFn> = {
  RUIDO: (s, c) => <Volume2 size={s} color={c} />,
  MASCOTAS: (s, c) => <Dog size={s} color={c} />,
  OLORES: (s, c) => <Wind size={s} color={c} />,
  PARQUEADERO: (s, c) => <Car size={s} color={c} />,
  BASURAS: (s, c) => <Trash2 size={s} color={c} />,
  OBRAS: (s, c) => <HardHat size={s} color={c} />,
  AMENAZAS: (s, c) => <Siren size={s} color={c} />,
  OTRO: (s, c) => <MoreHorizontal size={s} color={c} />,
};

interface EstadoBadge {
  label: string;
  /** Background + border classes (web put them on the same chip element). */
  chipClass: string;
  /** Text color class. */
  textClass: string;
  /** Resolved token for the chip's leading icon. */
  iconColor: string;
  icon: IconFn;
}

function getEstadoBadge(estado: EstadoCaso, t: ColorTokens): EstadoBadge {
  switch (estado) {
    case 'REPORTADO':
      return {
        label: 'Reportado',
        chipClass: 'bg-warning/15 border border-warning/30',
        textClass: 'text-warning',
        iconColor: t.warning,
        icon: (s, c) => <AlertTriangle size={s} color={c} />,
      };
    case 'EN_MEDIACION':
      return {
        label: 'En Mediación',
        chipClass: 'bg-info/15 border border-info/30',
        textClass: 'text-info',
        iconColor: t.info,
        icon: (s, c) => <Users size={s} color={c} />,
      };
    case 'RESUELTO':
      return {
        label: 'Resuelto',
        chipClass: 'bg-success/15 border border-success/30',
        textClass: 'text-success',
        iconColor: t.success,
        icon: (s, c) => <CheckCircle2 size={s} color={c} />,
      };
    case 'ESCALADO':
      return {
        label: 'Escalado',
        chipClass: 'bg-danger/15 border border-danger/30',
        textClass: 'text-danger',
        iconColor: t.danger,
        icon: (s, c) => <Siren size={s} color={c} />,
      };
    case 'ARCHIVADO':
      return {
        label: 'Archivado',
        chipClass: 'bg-text/10 border border-border',
        textClass: 'text-text',
        iconColor: t.text,
        icon: (s, c) => <FileText size={s} color={c} />,
      };
    default:
      return {
        label: estado,
        chipClass: 'bg-text/10 border border-border',
        textClass: 'text-text',
        iconColor: t.text,
        icon: (s, c) => <AlertTriangle size={s} color={c} />,
      };
  }
}

const ESTADO_OPTIONS: EstadoCaso[] = [
  'REPORTADO',
  'EN_MEDIACION',
  'RESUELTO',
  'ESCALADO',
  'ARCHIVADO',
];

const TABS: [TabKey, string][] = [
  ['TODOS', 'Todos'],
  ['REPORTADO', 'Reportados'],
  ['EN_MEDIACION', 'En Mediación'],
  ['RESUELTO', 'Resueltos'],
];

const ALLOWED_ROLES = ['ADMINISTRADOR', 'SUPER_ADMIN', 'CONCEJO'];

/** Web one-off literal: the "Total" stat icon is `text-indigo-500`. */
const INDIGO_500 = '#6366f1';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dateStr(d: string): string {
  try {
    return new Date(d).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return d;
  }
}

/**
 * Multiply a token's alpha — reproduces web's `/40` / `/30` opacity modifier
 * applied to a token in a place NativeWind cannot reach: an already-translucent
 * CSS-var token (`border-border/40`, no `<alpha-value>` slot) or a plain RN
 * color prop (`placeholderTextColor`, web's `placeholder:text-text/30`).
 * Accepts both `rgba(...)` and `#rrggbb`.
 */
function fadeToken(color: string, factor: number): string {
  const m = /rgba?\(([^)]+)\)/.exec(color);
  if (m) {
    const parts = m[1].split(',').map((p) => p.trim());
    if (parts.length < 3) return color;
    const alpha = parts.length > 3 ? Number(parts[3]) : 1;
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha * factor})`;
  }
  const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(color);
  if (!hex) return color;
  const h = hex[1];
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${factor})`;
}

function unidadLabel(u: UnidadEmbedDto | null | undefined): string {
  if (!u) return '—';
  const parts: string[] = [];
  if (u.torre) parts.push(`T${u.torre}`);
  if (u.numero) parts.push(`A${u.numero}`);
  if (u.nombre_residente) parts.push(u.nombre_residente);
  return parts.join(' · ') || 'Unidad';
}

/** `animate-pulse rounded-lg bg-text/10` (web Skeleton). */
function Skeleton({ className, style }: { className?: string; style?: StyleProp<ViewStyle> }) {
  const op = useSharedValue(0.4);
  useEffect(() => {
    op.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
    // The infinite repeat keeps running on the UI thread after unmount unless
    // it is explicitly cancelled (skeletons mount/unmount on every tab change).
    return () => cancelAnimation(op);
  }, [op]);
  const anim = useAnimatedStyle(() => ({ opacity: op.value }));
  return (
    <Animated.View className={`rounded-lg bg-text/10 ${className ?? ''}`} style={[style, anim]} />
  );
}

/** Web SkeletonRows — placeholder rows for the list view. */
function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <View className="w-full flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <LiquidGlass
          key={i}
          radius={24}
          className="rounded-3xl border border-border"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20 }}
        >
          <Skeleton className="h-10 w-10 rounded-xl" />
          <View className="min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-2.5 w-1/3" />
          </View>
          <Skeleton className="h-4 w-16" />
        </LiquidGlass>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

interface FormState {
  tipo: TipoCaso;
  descripcion: string;
  unidad_reporta_id: string;
  unidad_reportada_id: string;
}

const EMPTY_FORM: FormState = {
  tipo: 'RUIDO',
  descripcion: '',
  unidad_reporta_id: '',
  unidad_reportada_id: '',
};

export default function ComiteConvivenciaScreen() {
  const user = useAuth((s) => s.user);
  const authLoading = useAuth((s) => s.loading);
  const router = useRouter();
  const role = user?.rol;
  const { theme } = useTheme();
  const t = tokensFor(theme);

  // Data
  const [casos, setCasos] = useState<CasoConvivenciaDto[]>([]);
  const [stats, setStats] = useState<StatsConvivencia | null>(null);
  const [loading, setLoading] = useState(true);
  const [unidades, setUnidades] = useState<UnidadOption[]>([]);

  // Tabs
  const [tab, setTab] = useState<TabKey>('TODOS');

  // Filters
  const [filtroTipo, setFiltroTipo] = useState<TipoCaso | null>(null);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);
  const [isCreating, setIsCreating] = useState(false);

  // Detail modal
  const [selected, setSelected] = useState<CasoConvivenciaDto | null>(null);
  const [nuevoEstado, setNuevoEstado] = useState<EstadoCaso>('EN_MEDIACION');
  const [nuevaResolucion, setNuevaResolucion] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const fetchCasos = useCallback(async () => {
    setLoading(true);
    try {
      const qs = tab !== 'TODOS' ? `?estado=${tab}` : '';
      const items = await api.get<CasoConvivenciaDto[]>(`/convivencia/casos${qs}`);
      setCasos(items);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.detail : 'Error de conexión';
      toast.error(`Error al cargar casos: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  const fetchStats = useCallback(async () => {
    try {
      const s = await api.get<StatsConvivencia>('/convivencia/casos/stats');
      setStats(s);
    } catch {
      // Stats are non-critical
    }
  }, []);

  const fetchUnidades = useCallback(async () => {
    try {
      const raw = await api.get<Omit<UnidadOption, 'label'>[]>('/convivencia/unidades');
      setUnidades(
        raw.map((u) => ({
          ...u,
          label: `T${u.torre || '?'} ${u.numero}${
            u.nombre_residente ? ` — ${u.nombre_residente}` : ''
          }`,
        })),
      );
    } catch {
      // Unidades are non-critical
    }
  }, []);

  // Real-time WebSocket
  useWsSubscription('convivencia', () => {
    void fetchCasos();
    void fetchStats();
  });

  // -----------------------------------------------------------------------
  // Auth guard + initial load
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login' as never);
      return;
    }
    if (!role || !ALLOWED_ROLES.includes(role)) {
      toast.error('No tienes permisos para acceder al Comité de Convivencia.');
      router.replace('/(app)/inicio' as never);
      return;
    }
    void fetchCasos();
    void fetchStats();
    void fetchUnidades();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user, authLoading, role, router]);

  // -----------------------------------------------------------------------
  // Mutations
  // -----------------------------------------------------------------------

  const handleCreate = async () => {
    if (!formData.descripcion.trim()) {
      toast.error('La descripción es obligatoria');
      return;
    }
    if (!formData.unidad_reporta_id.trim()) {
      toast.error('Debes especificar la unidad que reporta');
      return;
    }
    setIsCreating(true);
    try {
      const body: CrearCasoConvivenciaRequest = {
        tipo: formData.tipo,
        descripcion: formData.descripcion,
        unidad_reporta_id: formData.unidad_reporta_id,
        unidad_reportada_id: formData.unidad_reportada_id.trim() || undefined,
      };
      await api.post('/convivencia/casos', body);
      toast.success('Caso creado exitosamente');
      setShowCreate(false);
      setFormData(EMPTY_FORM);
      void fetchCasos();
      void fetchStats();
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.detail : 'Error al crear';
      toast.error(msg);
    } finally {
      setIsCreating(false);
    }
  };

  const handleActualizar = async () => {
    if (!selected) return;
    setIsProcessing(true);
    try {
      const body: ActualizarCasoConvivenciaRequest = {
        estado: nuevoEstado,
        resolucion: nuevaResolucion.trim() || undefined,
      };
      await api.put(`/convivencia/casos/${selected.id}`, body);
      toast.success(`Caso actualizado a "${nuevoEstado}"`);
      setSelected(null);
      setNuevaResolucion('');
      void fetchCasos();
      void fetchStats();
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.detail : 'Error al actualizar';
      toast.error(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const filteredCasos = filtroTipo ? casos.filter((c) => c.tipo === filtroTipo) : casos;

  const statCards: {
    label: string;
    value: number;
    desc: string;
    color: string;
    bg: string;
    icon: ReactElement;
  }[] = stats
    ? [
        {
          label: 'Total',
          value: stats.total,
          desc: 'Casos registrados',
          color: 'text-text',
          bg: 'bg-surface-2',
          icon: <Scale size={20} color={INDIGO_500} />,
        },
        {
          label: 'Reportados',
          value: stats.reportados,
          desc: 'Casos reportados',
          color: 'text-warning',
          bg: 'bg-warning/10',
          icon: <AlertTriangle size={20} color={t.warning} />,
        },
        {
          label: 'En Mediación',
          value: stats.en_mediacion,
          desc: 'En proceso de mediación',
          color: 'text-info',
          bg: 'bg-info/10',
          icon: <Users size={20} color={t.info} />,
        },
        {
          label: 'Acuerdos',
          value: stats.acuerdos,
          desc: 'Acuerdos alcanzados',
          color: 'text-success',
          bg: 'bg-success/10',
          icon: <CheckCircle2 size={20} color={t.success} />,
        },
        {
          label: 'Escalados',
          value: stats.escalados,
          desc: 'Casos escalados',
          color: 'text-danger',
          bg: 'bg-danger/10',
          icon: <Siren size={20} color={t.danger} />,
        },
      ]
    : [];

  return (
    <Screen className="bg-primary">
      <View className="flex-col gap-6 px-6 pt-4">
        <ProfileHeader />

        <ImponerMulta />

        {/* HERO CARD: header + stats + tabs + filters */}
        <Animated.View entering={FadeInDown.duration(500)}>
          <View className="flex-col gap-5 rounded-[28px] border border-border bg-primary-light p-5">
            {/* Header */}
            <View className="flex-row items-start gap-3">
              <View className="h-12 w-12 items-center justify-center rounded-2xl bg-info/10">
                <Scale size={22} color={t.info} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-xl font-bold leading-tight text-text">
                  Comité de Convivencia
                </Text>
                <Text className="mt-1 text-xs leading-snug text-text/55">
                  Mediación y resolución de conflictos entre vecinos
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Recargar casos"
                  onPress={() => void fetchCasos()}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                  className="h-10 w-10 items-center justify-center rounded-2xl border border-border bg-primary-light"
                >
                  <RefreshCw size={16} color={t.text} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowCreate(true)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                  className="flex-row items-center gap-1.5 rounded-full bg-accent px-4 py-2.5"
                >
                  <Plus size={14} color={t.primary} />
                  <Text className="text-xs font-bold text-primary">Nuevo caso</Text>
                </Pressable>
              </View>
            </View>

            {/* Stats Cards */}
            {stats ? (
              // web `grid grid-cols-2 gap-3`: the -6/+6 gutter trick reproduces a
              // 12px gap with the outer cards flush to the card's padding box.
              <View className="flex-row flex-wrap" style={{ margin: -6 }}>
                {statCards.map((s) => (
                  <View key={s.label} style={{ width: '50%', padding: 6 }}>
                    <View
                      className={`${s.bg} min-w-0 flex-col gap-2.5 rounded-2xl p-3.5`}
                      // web: `border border-border/40`
                      style={{ borderWidth: 1, borderColor: fadeToken(t.border, 0.4) }}
                    >
                      <View className="min-w-0 flex-row items-center gap-2.5">
                        <View className="h-11 w-11 items-center justify-center rounded-2xl bg-primary-light/70">
                          {s.icon}
                        </View>
                        <View className="min-w-0">
                          <Text
                            className={`text-[10px] font-bold uppercase leading-tight tracking-wider ${s.color}`}
                          >
                            {s.label}
                          </Text>
                          <Text className={`text-2xl font-bold leading-tight ${s.color}`}>
                            {s.value}
                          </Text>
                        </View>
                      </View>
                      <Text className="text-[10px] leading-snug text-text/55">{s.desc}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Tabs */}
            <View className="flex-row rounded-full border border-border bg-surface-2 p-1">
              {TABS.map(([key, label]) => {
                const active = tab === key;
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    onPress={() => setTab(key)}
                    className={`flex-1 items-center rounded-full px-2 py-3 ${
                      active ? 'bg-info' : ''
                    }`}
                  >
                    <Text
                      // web: `whitespace-nowrap` — "En Mediación" must not wrap.
                      numberOfLines={1}
                      className={`text-[10px] font-bold uppercase tracking-widest ${
                        active ? 'text-on-accent' : 'text-text'
                      }`}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Filters */}
            <View className="flex-row flex-wrap items-center gap-2">
              <View className="mr-1 flex-row items-center gap-1">
                <ArrowUpDown size={12} color={t.info} />
                <Text className="text-[10px] font-black uppercase tracking-widest text-text">
                  Tipo:
                </Text>
              </View>
              {TIPO_CASO.map((cat) => {
                const active = filtroTipo === cat.key;
                return (
                  <Pressable
                    key={cat.key}
                    accessibilityRole="button"
                    onPress={() =>
                      setFiltroTipo((prev) => (prev === cat.key ? null : cat.key))
                    }
                    className={`flex-row items-center gap-1.5 rounded-full border px-3 py-2 ${
                      active ? 'border-info/30 bg-info/15' : 'border-border bg-primary-light'
                    }`}
                  >
                    {cat.icon(14, t.info)}
                    <Text
                      className={`text-[10px] font-bold uppercase tracking-wider ${
                        active ? 'text-info' : 'text-text'
                      }`}
                    >
                      {cat.label}
                    </Text>
                  </Pressable>
                );
              })}
              {filtroTipo ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setFiltroTipo(null)}
                  className="flex-row items-center gap-1 rounded-full border border-border bg-text/5 px-2.5 py-2"
                >
                  <X size={12} color={t.text} />
                  <Text className="text-[10px] font-bold uppercase tracking-wider text-text">
                    Limpiar
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </Animated.View>

        {/* List */}
        <View className="flex-col gap-4">
          {loading ? (
            <View className="w-full items-center py-12">
              <SkeletonRows />
            </View>
          ) : filteredCasos.length === 0 ? (
            <LiquidGlass
              radius={24}
              className="rounded-3xl border border-border"
              style={{ padding: 32, alignItems: 'center' }}
            >
              <View className="mb-3" style={{ opacity: 0.5 }}>
                <Heart size={40} color={t.text} />
              </View>
              {/* web `<p className="text-text font-medium">` inherits the 16px body size. */}
              <Text className="text-base font-medium text-text">Sin casos registrados</Text>
              <Text className="mt-1 text-xs text-text">
                No hay casos de convivencia en esta sección.
              </Text>
            </LiquidGlass>
          ) : (
            filteredCasos.map((c, i) => {
              const badge = getEstadoBadge(c.estado, t);
              const tipoIcon = TIPO_ICON_MAP[c.tipo];
              return (
                <Animated.View key={c.id} entering={FadeInDown.delay(i * 60).duration(450)}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setSelected(c);
                      setNuevoEstado(c.estado);
                      setNuevaResolucion(c.resolucion || '');
                    }}
                    style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                  >
                    <LiquidGlass
                      radius={24}
                      className="rounded-3xl border border-border"
                      style={{ padding: 24, flexDirection: 'column', gap: 12 }}
                    >
                      {/* Top row: type + status */}
                      <View className="flex-row items-start justify-between">
                        <View className="flex-row items-center gap-3">
                          <View className="rounded-2xl border border-border bg-surface-2 p-2.5">
                            {tipoIcon
                              ? tipoIcon(18, t.text)
                              : <MoreHorizontal size={18} color={t.text} />}
                          </View>
                          <View className="flex-col">
                            <Text className="text-xs font-bold uppercase tracking-wider text-text">
                              {TIPO_CASO.find((x) => x.key === c.tipo)?.label || c.tipo}
                            </Text>
                            <Text className="text-[10px] text-text">{dateStr(c.created_at)}</Text>
                          </View>
                        </View>
                        <View
                          className={`flex-row items-center gap-1 rounded-full px-2 py-0.5 ${badge.chipClass}`}
                        >
                          {badge.icon(10, badge.iconColor)}
                          <Text
                            className={`text-[10px] font-bold uppercase ${badge.textClass}`}
                          >
                            {badge.label}
                          </Text>
                        </View>
                      </View>

                      {/* Description */}
                      <Text
                        numberOfLines={2}
                        className="text-xs italic leading-relaxed text-text"
                      >
                        “{c.descripcion}”
                      </Text>

                      {/* Units info */}
                      <View className="flex-row items-center justify-between border-t border-border pt-2">
                        <View className="flex-row items-center gap-2">
                          <View className="h-7 w-7 items-center justify-center rounded-full border border-border bg-surface-2">
                            <Building size={14} color={t.text} />
                          </View>
                          <View className="flex-col">
                            <Text className="text-xs font-medium text-text">
                              Reporta: {unidadLabel(c.unidad_reporta)}
                            </Text>
                            {c.unidad_reportada ? (
                              <Text className="text-[10px] text-text">
                                Reportado: {unidadLabel(c.unidad_reportada)}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                        <View className="flex-row items-center gap-1">
                          <View style={{ opacity: 0.5 }}>
                            <User size={12} color={t.text} />
                          </View>
                          <Text className="text-[10px] text-text">{c.creado_por.nombre}</Text>
                        </View>
                      </View>
                    </LiquidGlass>
                  </Pressable>
                </Animated.View>
              );
            })
          )}
        </View>
      </View>

      {/* CREATE MODAL */}
      <CreateModal
        open={showCreate}
        isCreating={isCreating}
        formData={formData}
        unidades={unidades}
        onChange={setFormData}
        onClose={() => setShowCreate(false)}
        onSubmit={() => void handleCreate()}
      />

      {/* DETAIL MODAL */}
      <DetailModal
        caso={selected}
        nuevoEstado={nuevoEstado}
        nuevaResolucion={nuevaResolucion}
        isProcessing={isProcessing}
        onEstado={setNuevoEstado}
        onResolucion={setNuevaResolucion}
        onClose={() => {
          setSelected(null);
          setNuevaResolucion('');
        }}
        onSubmit={() => void handleActualizar()}
      />
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Shared modal shell — reproduces the web centered glass dialog
// (fixed inset-0 · bg-black/80 backdrop · liquid-glass rounded-[32px]
//  max-w-[440px] max-h-[90vh] overflow-y-auto · zoom-in-95 duration-200).
// ---------------------------------------------------------------------------

interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

function ModalShell({ open, onClose, children }: ModalShellProps) {
  const { theme } = useTheme();
  const t = tokensFor(theme);

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 items-center justify-center p-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
          onPress={onClose}
          className="absolute inset-0 bg-black/80"
        />
        {open ? (
          <Animated.View
            entering={ZoomIn.duration(200)}
            style={{ width: '100%', maxWidth: 440, maxHeight: '90%' }}
          >
            <LiquidGlass radius={32} className="rounded-[32px] border border-border">
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: 24, gap: 20 }}
              >
                {children}
              </ScrollView>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
                onPress={onClose}
                className="absolute right-4 top-4 h-8 w-8 items-center justify-center rounded-full border border-border bg-text/5"
              >
                <X size={16} color={t.text} />
              </Pressable>
            </LiquidGlass>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// CREATE MODAL
// ---------------------------------------------------------------------------

interface CreateModalProps {
  open: boolean;
  isCreating: boolean;
  formData: FormState;
  unidades: UnidadOption[];
  onChange: (next: FormState) => void;
  onClose: () => void;
  onSubmit: () => void;
}

function CreateModal({
  open,
  isCreating,
  formData,
  unidades,
  onChange,
  onClose,
  onSubmit,
}: CreateModalProps) {
  const { theme } = useTheme();
  const t = tokensFor(theme);
  // Which `<select>` is being resolved. While set, the modal body shows the
  // option list instead of the form (avoids a nested RN Modal).
  const [pickerFor, setPickerFor] = useState<'reporta' | 'reportada' | null>(null);

  const reportaLabel =
    unidades.find((u) => u.id === formData.unidad_reporta_id)?.label ?? 'Seleccionar unidad...';
  const reportadaLabel =
    unidades.find((u) => u.id === formData.unidad_reportada_id)?.label ?? 'Ninguna';

  const close = () => {
    setPickerFor(null);
    onClose();
  };

  if (pickerFor) {
    const isReporta = pickerFor === 'reporta';
    const options = isReporta
      ? unidades
      : unidades.filter((u) => u.id !== formData.unidad_reporta_id);
    const emptyLabel = isReporta ? 'Seleccionar unidad...' : 'Ninguna';
    const currentId = isReporta ? formData.unidad_reporta_id : formData.unidad_reportada_id;

    const pick = (id: string) => {
      if (isReporta) {
        onChange({
          ...formData,
          unidad_reporta_id: id,
          // Web side-effect: clear the reported unit when it equals the reporter.
          unidad_reportada_id:
            id === formData.unidad_reportada_id ? '' : formData.unidad_reportada_id,
        });
      } else {
        onChange({ ...formData, unidad_reportada_id: id });
      }
      setPickerFor(null);
    };

    return (
      <ModalShell open={open} onClose={() => setPickerFor(null)}>
        <Text className="pr-10 text-lg font-bold text-text">
          {isReporta ? 'Unidad que Reporta' : 'Unidad Reportada (opcional)'}
        </Text>
        <View className="flex-col">
          {[{ id: '', label: emptyLabel }, ...options].map((u) => (
            <Pressable
              key={u.id || '__empty__'}
              accessibilityRole="button"
              onPress={() => pick(u.id)}
              className="flex-row items-center justify-between border-b border-border py-3.5"
            >
              <Text className="flex-1 pr-2 text-sm text-text" numberOfLines={1}>
                {u.label}
              </Text>
              {u.id === currentId ? <CheckCircle2 size={18} color={t.accent} /> : null}
            </Pressable>
          ))}
        </View>
      </ModalShell>
    );
  }

  return (
    <ModalShell open={open} onClose={close}>
      <Text className="pr-10 text-lg font-bold text-text">Nuevo Caso de Convivencia</Text>

      {/* Tipo selector */}
      <View className="flex-col gap-2">
        <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
          Tipo de Caso
        </Text>
        {/* web `grid grid-cols-4 gap-2` */}
        <View className="flex-row flex-wrap" style={{ margin: -4 }}>
          {TIPO_CASO.map((tipo) => {
            const active = formData.tipo === tipo.key;
            return (
              <View key={tipo.key} style={{ width: '25%', padding: 4 }}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onChange({ ...formData, tipo: tipo.key })}
                  className={`items-center gap-1 rounded-xl border p-2.5 ${
                    active ? 'border-info/30 bg-info/15' : 'border-border bg-surface-2'
                  }`}
                >
                  {tipo.icon(14, active ? t.info : t.text)}
                  <Text
                    className={`text-[9px] font-bold uppercase ${
                      active ? 'text-info' : 'text-text'
                    }`}
                  >
                    {tipo.label}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>

      {/* Unidad que reporta */}
      <View className="flex-col gap-1.5">
        <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
          Unidad que Reporta <Text className="text-danger">*</Text>
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setPickerFor('reporta')}
          className="rounded-xl border border-border bg-surface-2 px-4 py-3"
        >
          <Text
            className="text-sm text-text"
            numberOfLines={1}
            style={{ opacity: formData.unidad_reporta_id ? 1 : 0.6 }}
          >
            {reportaLabel}
          </Text>
        </Pressable>
      </View>

      {/* Unidad reportada */}
      <View className="flex-col gap-1.5">
        <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
          Unidad Reportada (opcional)
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setPickerFor('reportada')}
          className="rounded-xl border border-border bg-surface-2 px-4 py-3"
        >
          <Text
            className="text-sm text-text"
            numberOfLines={1}
            style={{ opacity: formData.unidad_reportada_id ? 1 : 0.6 }}
          >
            {reportadaLabel}
          </Text>
        </Pressable>
      </View>

      {/* Description */}
      <View className="flex-col gap-1.5">
        <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
          Descripción <Text className="text-danger">*</Text>
        </Text>
        <TextInput
          multiline
          textAlignVertical="top"
          placeholder="Describe el caso de convivencia..."
          // web `placeholder:text-text/30`
          placeholderTextColor={fadeToken(t.text, 0.3)}
          value={formData.descripcion}
          onChangeText={(descripcion) => onChange({ ...formData, descripcion })}
          editable={!isCreating}
          className="min-h-[104px] rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text"
        />
      </View>

      {/* Submit */}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isCreating, busy: isCreating }}
        disabled={isCreating}
        onPress={onSubmit}
        style={({ pressed }) => ({ opacity: isCreating ? 0.5 : pressed ? 0.9 : 1 })}
        className="w-full flex-row items-center justify-center gap-2 rounded-full bg-accent py-3.5"
      >
        {isCreating ? (
          <Skeleton className="h-4 w-4 rounded-full" />
        ) : (
          <Plus size={16} color={t.primary} />
        )}
        <Text className="text-sm font-bold text-primary">
          {isCreating ? 'Creando...' : 'Crear Caso'}
        </Text>
      </Pressable>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// DETAIL MODAL
// ---------------------------------------------------------------------------

interface DetailModalProps {
  caso: CasoConvivenciaDto | null;
  nuevoEstado: EstadoCaso;
  nuevaResolucion: string;
  isProcessing: boolean;
  onEstado: (e: EstadoCaso) => void;
  onResolucion: (v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

function DetailModal({
  caso,
  nuevoEstado,
  nuevaResolucion,
  isProcessing,
  onEstado,
  onResolucion,
  onClose,
  onSubmit,
}: DetailModalProps) {
  const { theme } = useTheme();
  const t = tokensFor(theme);

  // Web renders the dialog only while a case is selected (`{selected && …}`).
  if (!caso) return null;

  const tipoIcon = TIPO_ICON_MAP[caso.tipo];

  return (
    <ModalShell open onClose={onClose}>
      {/* Header */}
      <View className="flex-row items-center gap-3 pr-10">
        <View className="rounded-2xl border border-border bg-surface-2 p-2.5">
          {tipoIcon ? tipoIcon(18, t.text) : <MoreHorizontal size={18} color={t.text} />}
        </View>
        <View>
          <Text className="text-lg font-bold text-text">
            {TIPO_CASO.find((x) => x.key === caso.tipo)?.label || caso.tipo}
          </Text>
          <Text className="text-[10px] uppercase tracking-widest text-text">
            {dateStr(caso.created_at)} · {getEstadoBadge(caso.estado, t).label}
          </Text>
        </View>
      </View>

      {/* Description */}
      <Text className="rounded-2xl border border-border bg-surface-2 p-4 text-sm italic leading-relaxed text-text">
        “{caso.descripcion}”
      </Text>

      {/* Units */}
      <View className="flex-col gap-2">
        <View className="flex-row items-center gap-2">
          <Building size={14} color={t.text} />
          <Text className="text-xs text-text">
            <Text className="font-medium">Reporta:</Text> {unidadLabel(caso.unidad_reporta)}
          </Text>
        </View>
        {caso.unidad_reportada ? (
          <View className="flex-row items-center gap-2">
            <Building size={14} color={t.text} />
            <Text className="text-xs text-text">
              <Text className="font-medium">Reportado:</Text>{' '}
              {unidadLabel(caso.unidad_reportada)}
            </Text>
          </View>
        ) : null}
        <View className="flex-row items-center gap-2">
          <User size={14} color={t.text} />
          <Text className="text-xs text-text">
            <Text className="font-medium">Creado por:</Text> {caso.creado_por.nombre}
          </Text>
        </View>
      </View>

      {/* Resolución (if exists) */}
      {caso.resolucion ? (
        <View className="rounded-2xl border border-success/30 bg-success/10 p-4">
          <Text className="mb-1 text-[10px] font-bold uppercase tracking-widest text-success">
            Resolución
          </Text>
          <Text className="text-sm text-text">{caso.resolucion}</Text>
        </View>
      ) : null}

      {/* Update form */}
      <View className="flex-col gap-3 border-t border-border pt-4">
        <Text className="text-xs font-bold uppercase tracking-widest text-text">
          Actualizar Caso
        </Text>

        {/* Estado selector */}
        <View className="flex-col gap-1.5">
          <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
            Nuevo Estado
          </Text>
          {/* web `grid grid-cols-3 gap-2` */}
          <View className="flex-row flex-wrap" style={{ margin: -4 }}>
            {ESTADO_OPTIONS.map((e) => {
              const b = getEstadoBadge(e, t);
              const active = nuevoEstado === e;
              return (
                <View key={e} style={{ width: '33.3333%', padding: 4 }}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onEstado(e)}
                    className={`flex-row items-center justify-center gap-1 rounded-xl px-2 py-2 ${
                      active ? b.chipClass : 'border border-border bg-surface-2'
                    }`}
                  >
                    {b.icon(10, active ? b.iconColor : t.text)}
                    <Text
                      className={`text-[10px] font-bold uppercase ${
                        active ? b.textClass : 'text-text'
                      }`}
                      numberOfLines={1}
                    >
                      {b.label}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>

        {/* Resolution text */}
        <View className="flex-col gap-1.5">
          <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
            Resolución (opcional)
          </Text>
          <TextInput
            multiline
            textAlignVertical="top"
            placeholder="Describe la resolución del caso..."
            // web `placeholder:text-text/30`
            placeholderTextColor={fadeToken(t.text, 0.3)}
            value={nuevaResolucion}
            onChangeText={onResolucion}
            editable={!isProcessing}
            className="min-h-[80px] rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text"
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: isProcessing, busy: isProcessing }}
          disabled={isProcessing}
          onPress={onSubmit}
          style={({ pressed }) => ({ opacity: isProcessing ? 0.5 : pressed ? 0.9 : 1 })}
          className="w-full flex-row items-center justify-center gap-2 rounded-full bg-accent py-3"
        >
          {isProcessing ? (
            <Skeleton className="h-4 w-4 rounded-full" />
          ) : (
            <CheckCircle2 size={16} color={t.primary} />
          )}
          <Text className="text-sm font-bold text-primary">
            {isProcessing ? 'Actualizando...' : 'Guardar Cambios'}
          </Text>
        </Pressable>
      </View>
    </ModalShell>
  );
}
