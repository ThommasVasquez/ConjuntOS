/**
 * ADMIN PQRS — CONJUNTOSAPP (mobile port)
 * Consola de gestión de PQRS / solicitudes de servicio (mantenimiento).
 *
 * Ported 1:1 from web `src/app/(app)/admin-pqrs/page.tsx`:
 *  - Roles ADMINISTRADOR / SUPER_ADMIN (toast + redirect a /inicio si no).
 *  - Tabs PENDIENTES | EN_PROGRESO | FINALIZADAS | TODAS → `?estado=…`.
 *  - Filtros de categoría (6) + urgente + limpiar → `?categoria=…&urgente=true`.
 *  - GET /admin/solicitudes{query}, GET /admin/solicitudes/stats.
 *  - GET/POST /admin/solicitudes/{id}/comentarios.
 *  - PUT /admin/solicitudes/{id} {estado, prioridad, proveedorId?}.
 *  - WS: useWsSubscription('solicitud') → refetch.
 *  - Modal de detalle: galería de imágenes (flechas + dots + thumbs), cambio de
 *    estado/prioridad/proveedor, acciones rápidas (Cerrar Ticket / Reabrir) y
 *    comentarios.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Image as ImageIcon,
  KeyRound,
  MessageSquare,
  MoreHorizontal,
  Paintbrush,
  RefreshCw,
  Send,
  User,
  Wrench,
  X,
  Zap,
} from 'lucide-react-native';

import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { toast } from '@/components/ui/toast';
import { Skeleton, SkeletonRows } from '@/components/finanzas/Skeletons';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api, ApiError } from '@/lib/api/client';
import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor, type ColorTokens } from '@/theme/tokens';
import type {
  CatServicio,
  EstadoSolicitud,
  PrioridadTicket,
  SolicitudDto,
  TicketComentarioDto,
  TicketStatsDto,
} from '@/lib/api/types';

// ---------------------------------------------------------------------------
// Extended interface — the admin listing endpoint likely embeds resident info
// ---------------------------------------------------------------------------

interface ResidenteEmbed {
  nombre?: string;
  torre?: string | null;
  apto?: string | null;
}

/**
 * The admin listing may omit `prioridad` / `imagenes` / `createdAt` (web reads
 * them through `(s as any).prioridad` and `s.imagenes ?? []`), so they are
 * relaxed to optional here instead of using `any`.
 */
interface AdminSolicitud
  extends Omit<SolicitudDto, 'prioridad' | 'imagenes' | 'createdAt'> {
  prioridad?: PrioridadTicket;
  imagenes?: string[];
  createdAt?: string;
  residente?: ResidenteEmbed;
  usuario?: ResidenteEmbed;
  solicitante?: ResidenteEmbed;
  creadoEn?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type TabKey = 'PENDIENTES' | 'EN_PROGRESO' | 'FINALIZADAS' | 'TODAS';

type IconRenderer = (size: number, color: string) => React.ReactElement;

const CATEGORIAS: { key: CatServicio; label: string; icon: IconRenderer }[] = [
  { key: 'PLOMERIA', label: 'Plomería', icon: (s, c) => <Wrench size={s} color={c} /> },
  { key: 'ELECTRICIDAD', label: 'Electricidad', icon: (s, c) => <Zap size={s} color={c} /> },
  { key: 'CARPINTERIA', label: 'Carpintería', icon: (s, c) => <Paintbrush size={s} color={c} /> },
  { key: 'PINTURA', label: 'Pintura', icon: (s, c) => <Paintbrush size={s} color={c} /> },
  { key: 'CERRAJERIA', label: 'Cerrajería', icon: (s, c) => <KeyRound size={s} color={c} /> },
  { key: 'OTRO', label: 'Otro', icon: (s, c) => <MoreHorizontal size={s} color={c} /> },
];

const CATEGORIA_ICON_MAP: Record<CatServicio, IconRenderer> = {
  PLOMERIA: (s, c) => <Wrench size={s} color={c} />,
  ELECTRICIDAD: (s, c) => <Zap size={s} color={c} />,
  CARPINTERIA: (s, c) => <Paintbrush size={s} color={c} />,
  PINTURA: (s, c) => <Paintbrush size={s} color={c} />,
  CERRAJERIA: (s, c) => <KeyRound size={s} color={c} />,
  OTRO: (s, c) => <MoreHorizontal size={s} color={c} />,
};

interface EstadoBadge {
  label: string;
  /** Background + border classes (go on the wrapping View in RN). */
  chipClass: string;
  /** Text color class (goes on the Text in RN). */
  textClass: string;
  /** Token key used to color the lucide glyph. */
  tone: keyof ColorTokens;
  icon: IconRenderer;
}

function getEstadoBadge(estado: EstadoSolicitud): EstadoBadge {
  switch (estado) {
    case 'ABIERTA':
      return {
        label: 'Abierta',
        chipClass: 'bg-warning/15 border border-warning/30',
        textClass: 'text-warning',
        tone: 'warning',
        icon: (s, c) => <AlertCircle size={s} color={c} />,
      };
    case 'ASIGNADA':
      return {
        label: 'Asignada',
        chipClass: 'bg-info/15 border border-info/30',
        textClass: 'text-info',
        tone: 'info',
        icon: (s, c) => <User size={s} color={c} />,
      };
    case 'EN_PROGRESO':
      return {
        label: 'En Progreso',
        chipClass: 'bg-warning/15 border border-warning/30',
        textClass: 'text-warning',
        tone: 'warning',
        icon: (s, c) => <Clock size={s} color={c} />,
      };
    case 'RESUELTA':
      return {
        label: 'Resuelta',
        chipClass: 'bg-success/15 border border-success/30',
        textClass: 'text-success',
        tone: 'success',
        icon: (s, c) => <CheckCircle2 size={s} color={c} />,
      };
    case 'CERRADA':
      return {
        label: 'Cerrada',
        chipClass: 'bg-text-muted/15 border border-text-muted/30',
        textClass: 'text-text-muted',
        tone: 'textMuted',
        icon: (s, c) => <CheckCircle2 size={s} color={c} />,
      };
    default:
      return {
        label: estado,
        chipClass: 'bg-text/10 border border-border',
        textClass: 'text-text',
        tone: 'text',
        icon: (s, c) => <AlertCircle size={s} color={c} />,
      };
  }
}

interface PrioridadBadge {
  label: string;
  chipClass: string;
  textClass: string;
}

function getPrioridadBadge(prioridad: PrioridadTicket): PrioridadBadge {
  switch (prioridad) {
    case 'URGENTE':
      return {
        label: 'Urgente',
        chipClass: 'bg-danger/15 border border-danger/30',
        textClass: 'text-danger',
      };
    case 'ALTA':
      return {
        label: 'Alta',
        chipClass: 'bg-warning/15 border border-warning/30',
        textClass: 'text-warning',
      };
    case 'MEDIA':
      return {
        label: 'Media',
        chipClass: 'bg-warning/15 border border-warning/30',
        textClass: 'text-warning',
      };
    default:
      return {
        label: 'Baja',
        chipClass: 'bg-text-muted/15 border border-text-muted/30',
        textClass: 'text-text-muted',
      };
  }
}

const PRIORIDAD_OPTIONS: PrioridadTicket[] = ['BAJA', 'MEDIA', 'ALTA', 'URGENTE'];
const ESTADO_OPTIONS: EstadoSolicitud[] = [
  'ABIERTA',
  'ASIGNADA',
  'EN_PROGRESO',
  'RESUELTA',
  'CERRADA',
];

const ALLOWED_ROLES = ['ADMINISTRADOR', 'SUPER_ADMIN'];

const TABS: [TabKey, string][] = [
  ['PENDIENTES', 'Pendientes'],
  ['EN_PROGRESO', 'En Progreso'],
  ['FINALIZADAS', 'Finalizadas'],
  ['TODAS', 'Todas'],
];

// ---------------------------------------------------------------------------
// Inline dropdown — RN stand-in for the web `<select>` elements. Keeps every
// option and its exact label; expands in place inside the scrollable modal.
// ---------------------------------------------------------------------------

interface SelectFieldProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
  accessibilityLabel: string;
}

function SelectField<T extends string>({
  value,
  options,
  onChange,
  accessibilityLabel,
}: SelectFieldProps<T>) {
  const [open, setOpen] = useState(false);
  const { theme } = useTheme();
  const t = tokensFor(theme);
  const current = options.find((o) => o.value === value);

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={() => setOpen((o) => !o)}
        className="w-full flex-row items-center justify-between rounded-xl border border-border bg-surface-2 px-4 py-3"
      >
        <Text className="flex-1 text-xs text-text" numberOfLines={1}>
          {current?.label ?? ''}
        </Text>
        <ChevronDown size={14} color={t.text} />
      </Pressable>

      {open ? (
        <View className="mt-1 overflow-hidden rounded-xl border border-border bg-primary">
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <Pressable
                key={o.value}
                accessibilityRole="button"
                onPress={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className="flex-row items-center justify-between border-b border-border px-4 py-3"
              >
                <Text className={`text-xs ${selected ? 'text-accent' : 'text-text'}`}>
                  {o.label}
                </Text>
                {selected ? <Check size={14} color={t.accent} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function AdminPQRSScreen() {
  const user = useAuth((s) => s.user);
  const authLoading = useAuth((s) => s.loading);
  const router = useRouter();
  const role = user?.rol;

  const { theme } = useTheme();
  const t = tokensFor(theme);

  // Data
  const [solicitudes, setSolicitudes] = useState<AdminSolicitud[]>([]);
  const [loading, setLoading] = useState(true);

  // Tabs
  const [tab, setTab] = useState<TabKey>('PENDIENTES');

  // Filters
  const [filtroCategoria, setFiltroCategoria] = useState<CatServicio | null>(null);
  const [filtroUrgente, setFiltroUrgente] = useState(false);

  // Modal detail
  const [selected, setSelected] = useState<AdminSolicitud | null>(null);
  const [nuevoEstado, setNuevoEstado] = useState<EstadoSolicitud>('ASIGNADA');
  const [nuevaPrioridad, setNuevaPrioridad] = useState<PrioridadTicket>('MEDIA');
  const [proveedorId, setProveedorId] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Stats + Comentarios
  const [stats, setStats] = useState<TicketStatsDto | null>(null);
  const [comentarios, setComentarios] = useState<TicketComentarioDto[]>([]);
  const [nuevoComentario, setNuevoComentario] = useState('');
  const [cargandoComentarios, setCargandoComentarios] = useState(false);
  const [enviandoComentario, setEnviandoComentario] = useState(false);

  // Image gallery in modal
  const [imgIdx, setImgIdx] = useState(0);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const buildQuery = useCallback((): string => {
    const params: string[] = [];
    if (tab === 'PENDIENTES') params.push('estado=ABIERTA');
    else if (tab === 'EN_PROGRESO') params.push(`estado=${encodeURIComponent('ASIGNADA,EN_PROGRESO')}`);
    else if (tab === 'FINALIZADAS') params.push(`estado=${encodeURIComponent('RESUELTA,CERRADA')}`);
    // TODAS: no estado filter

    if (filtroCategoria) params.push(`categoria=${filtroCategoria}`);
    if (filtroUrgente) params.push('urgente=true');

    const qs = params.join('&');
    return qs ? `?${qs}` : '';
  }, [tab, filtroCategoria, filtroUrgente]);

  const fetchSolicitudes = useCallback(async () => {
    setLoading(true);
    try {
      const items = await api.get<AdminSolicitud[]>(`/admin/solicitudes${buildQuery()}`);
      setSolicitudes(items);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.detail : 'Error de conexión';
      toast.error(`Error al cargar solicitudes: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  // Real-time WebSocket
  useWsSubscription('solicitud', () => {
    void fetchSolicitudes();
  });

  const fetchStats = useCallback(async () => {
    try {
      const data = await api.get<TicketStatsDto>('/admin/solicitudes/stats');
      setStats(data);
    } catch {
      /* silencioso */
    }
  }, []);

  const fetchComentarios = useCallback(async (ticketId: string) => {
    setCargandoComentarios(true);
    try {
      const data = await api.get<TicketComentarioDto[]>(
        `/admin/solicitudes/${ticketId}/comentarios`,
      );
      setComentarios(data);
    } catch {
      setComentarios([]);
    } finally {
      setCargandoComentarios(false);
    }
  }, []);

  const postComentario = useCallback(async () => {
    if (!selected || !nuevoComentario.trim()) return;
    setEnviandoComentario(true);
    try {
      await api.post(`/admin/solicitudes/${selected.id}/comentarios`, {
        contenido: nuevoComentario.trim(),
      });
      toast.success('Comentario agregado');
      setNuevoComentario('');
      void fetchComentarios(selected.id);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.detail : 'Error al enviar';
      toast.error(msg);
    } finally {
      setEnviandoComentario(false);
    }
  }, [selected, nuevoComentario, fetchComentarios]);

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
      toast.error('No tienes permisos para acceder a esta sección.');
      router.replace('/(app)/inicio' as never);
      return;
    }
    void fetchSolicitudes();
    void fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user, authLoading, role, router, filtroCategoria, filtroUrgente]);

  // -----------------------------------------------------------------------
  // Mutation: change status
  // -----------------------------------------------------------------------

  const handleCambiarEstado = useCallback(
    async (estadoOverride?: EstadoSolicitud) => {
      if (!selected) return;
      // Quick-action buttons call setNuevoEstado() then this handler
      // synchronously; setState is async, so reading nuevoEstado here would use
      // the stale value. Accept an explicit override so the intended estado is
      // always sent.
      const estado = estadoOverride ?? nuevoEstado;
      setIsProcessing(true);
      try {
        await api.put(`/admin/solicitudes/${selected.id}`, {
          estado,
          prioridad: nuevaPrioridad,
          proveedorId: proveedorId.trim() || undefined,
        });
        toast.success(`Solicitud actualizada a "${estado}"`);
        setSelected(null);
        setProveedorId('');
        setImgIdx(0);
        void fetchSolicitudes();
      } catch (e: unknown) {
        const msg = e instanceof ApiError ? e.detail : 'Error al actualizar';
        toast.error(msg);
      } finally {
        setIsProcessing(false);
      }
    },
    [selected, nuevoEstado, nuevaPrioridad, proveedorId, fetchSolicitudes],
  );

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  const getResidente = (s: AdminSolicitud): ResidenteEmbed =>
    s.residente || s.usuario || s.solicitante || {};

  const pendingCount = solicitudes.filter((s) => s.estado === 'ABIERTA').length;

  const dateStr = (s: AdminSolicitud): string => {
    const d = s.createdAt || s.creadoEn || '';
    try {
      return new Date(d).toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return d;
    }
  };

  const closeModal = useCallback(() => {
    setSelected(null);
    setImgIdx(0);
  }, []);

  const openSolicitud = useCallback(
    (s: AdminSolicitud) => {
      setSelected(s);
      setNuevoEstado(s.estado);
      setNuevaPrioridad(s.prioridad || 'MEDIA');
      setProveedorId('');
      setImgIdx(0);
      setComentarios([]);
      void fetchComentarios(s.id);
    },
    [fetchComentarios],
  );

  const selectedImgs = selected?.imagenes ?? [];

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <View style={{ flex: 1 }} className="bg-primary">
      <Screen className="bg-primary">
        <View className="flex flex-col gap-6 px-6 pt-4">
          <ProfileHeader />

          {/* Header */}
          <Animated.View
            entering={FadeInDown.duration(500)}
            className="flex-row items-center justify-between"
          >
            <View className="flex-1 pr-3">
              <Text
                className="text-2xl font-medium tracking-wide text-text"
                style={{ fontFamily: 'PlusJakartaSans_500Medium' }}
              >
                Solicitudes de Servicio
              </Text>
              <Text className="text-sm text-text">Gestión de PQRS y mantenimiento</Text>
            </View>
            <View className="flex-row items-center gap-3">
              {pendingCount > 0 ? (
                <View className="flex-row items-center gap-1.5 rounded-full border border-warning/30 bg-warning/15 px-3 py-1.5">
                  <AlertCircle size={12} color={t.warning} />
                  <Text className="text-xs font-bold text-warning">
                    {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
                  </Text>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Recargar"
                onPress={() => void fetchSolicitudes()}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                className="rounded-full p-2"
              >
                <RefreshCw size={18} color={t.text} />
              </Pressable>
            </View>
          </Animated.View>

          {/* Stats Dashboard */}
          {stats ? (
            <Animated.View
              entering={FadeInDown.delay(60).duration(500)}
              className="flex-row gap-2"
            >
              {[
                {
                  label: 'Abiertos',
                  value: stats.abiertos,
                  box: 'bg-warning/10 border-warning/20',
                  text: 'text-warning',
                },
                {
                  label: 'En Progreso',
                  value: stats.enProgreso,
                  box: 'bg-warning/10 border-warning/20',
                  text: 'text-warning',
                },
                {
                  label: 'Resueltos',
                  value: stats.resueltos,
                  box: 'bg-success/10 border-success/20',
                  text: 'text-success',
                },
                {
                  label: 'SLA Vencido',
                  value: stats.slaVencidos,
                  box: 'bg-danger/10 border-danger/20',
                  text: 'text-danger',
                },
              ].map((item) => (
                <View
                  key={item.label}
                  className={`flex-1 items-center gap-1 rounded-2xl border p-3 ${item.box}`}
                >
                  <Text
                    className={`text-2xl font-bold ${item.text}`}
                    style={{ fontFamily: 'PlusJakartaSans_700Bold' }}
                  >
                    {item.value}
                  </Text>
                  <Text
                    className={`text-center text-[9px] font-bold uppercase tracking-wide ${item.text}`}
                  >
                    {item.label}
                  </Text>
                </View>
              ))}
            </Animated.View>
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
                  className={`flex-1 items-center justify-center rounded-full py-3 ${
                    active ? 'bg-accent' : ''
                  }`}
                >
                  <Text
                    className={`text-[10px] font-bold uppercase tracking-wide ${
                      active ? 'text-primary' : 'text-text'
                    }`}
                    numberOfLines={1}
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
              <ArrowUpDown size={12} color={t.text} />
              <Text className="text-[10px] font-black uppercase tracking-widest text-text">
                Categoría:
              </Text>
            </View>

            {CATEGORIAS.map((cat) => {
              const active = filtroCategoria === cat.key;
              return (
                <Pressable
                  key={cat.key}
                  accessibilityRole="button"
                  onPress={() =>
                    setFiltroCategoria((prev) => (prev === cat.key ? null : cat.key))
                  }
                  className={`flex-row items-center gap-1.5 rounded-full border px-2.5 py-1.5 ${
                    active ? 'border-info/30 bg-info/15' : 'border-border bg-surface-2'
                  }`}
                >
                  {cat.icon(14, active ? t.info : t.text)}
                  <Text
                    className={`text-[10px] font-bold uppercase tracking-wide ${
                      active ? 'text-info' : 'text-text'
                    }`}
                  >
                    {cat.label}
                  </Text>
                </Pressable>
              );
            })}

            <View className="mx-1 h-5 w-px bg-border" />

            <Pressable
              accessibilityRole="button"
              onPress={() => setFiltroUrgente((prev) => !prev)}
              className={`flex-row items-center gap-1.5 rounded-full border px-2.5 py-1.5 ${
                filtroUrgente ? 'border-danger/30 bg-danger/15' : 'border-border bg-surface-2'
              }`}
            >
              <AlertTriangle size={12} color={filtroUrgente ? t.danger : t.text} />
              <Text
                className={`text-[10px] font-bold uppercase tracking-wide ${
                  filtroUrgente ? 'text-danger' : 'text-text'
                }`}
              >
                Urgente
              </Text>
            </Pressable>

            {filtroCategoria || filtroUrgente ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setFiltroCategoria(null);
                  setFiltroUrgente(false);
                }}
                className="flex-row items-center gap-1 rounded-full border border-border bg-text/5 px-2.5 py-1.5"
              >
                <X size={12} color={t.text} />
                <Text className="text-[10px] font-bold uppercase tracking-wider text-text">
                  Limpiar
                </Text>
              </Pressable>
            ) : null}
          </View>

          {/* List */}
          <View className="flex flex-col gap-4">
            {loading ? (
              <View className="w-full items-center py-12">
                <SkeletonRows />
              </View>
            ) : solicitudes.length === 0 ? (
              <LiquidGlass className="rounded-3xl border border-border" radius={24}>
                <View className="items-center p-8">
                  <CheckCircle2 size={40} color={t.text} style={{ opacity: 0.5 }} />
                  {/* Web `<p className="text-text font-medium">` inherits the 16px
                      body size; RN's Text default is 14, so pin it to text-base. */}
                  <Text className="mt-3 text-base font-medium text-text">Bandeja al día</Text>
                  <Text className="mt-1 text-center text-xs text-text">
                    No hay solicitudes en esta sección.
                  </Text>
                </View>
              </LiquidGlass>
            ) : (
              solicitudes.map((s, i) => {
                const residente = getResidente(s);
                const badge = getEstadoBadge(s.estado);
                const imgs = s.imagenes ?? [];
                const prio = s.prioridad ? getPrioridadBadge(s.prioridad) : null;

                return (
                  <Animated.View key={s.id} entering={FadeInDown.delay(i * 60).duration(450)}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => openSolicitud(s)}
                      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                    >
                      <LiquidGlass className="rounded-3xl border border-border" radius={24}>
                        <View className="flex flex-col gap-3 p-6">
                          {/* Top row: category + type + status badge */}
                          <View className="flex-row items-start justify-between">
                            <View className="flex-1 flex-row items-center gap-3">
                              <View className="rounded-2xl border border-border bg-surface-2 p-2.5">
                                {(CATEGORIA_ICON_MAP[s.categoria] ??
                                  ((size: number, color: string) => (
                                    <MoreHorizontal size={size} color={color} />
                                  )))(18, t.text)}
                              </View>
                              <View className="flex-1 flex-col">
                                <Text className="text-xs font-bold uppercase tracking-wide text-text">
                                  {s.categoria}
                                </Text>
                                <Text className="text-[10px] text-text">
                                  {s.tipo} • {dateStr(s)}
                                </Text>
                              </View>
                            </View>

                            <View className="flex-row flex-wrap items-center justify-end gap-2">
                              {prio ? (
                                <View
                                  className={`flex-row items-center gap-1 rounded-full px-2 py-0.5 ${prio.chipClass}`}
                                >
                                  <Text
                                    className={`text-[10px] font-bold uppercase ${prio.textClass}`}
                                  >
                                    {prio.label}
                                  </Text>
                                </View>
                              ) : null}
                              {s.urgente ? (
                                <View className="flex-row items-center gap-1 rounded-full border border-danger/30 bg-danger/20 px-2 py-0.5">
                                  <AlertTriangle size={10} color={t.danger} />
                                  <Text className="text-[10px] font-bold uppercase text-danger">
                                    Urgente
                                  </Text>
                                </View>
                              ) : null}
                              <View
                                className={`flex-row items-center gap-1 rounded-full px-2 py-0.5 ${badge.chipClass}`}
                              >
                                {badge.icon(10, t[badge.tone])}
                                <Text
                                  className={`text-[10px] font-bold uppercase ${badge.textClass}`}
                                >
                                  {badge.label}
                                </Text>
                              </View>
                            </View>
                          </View>

                          {/* Description (truncated) */}
                          <Text
                            numberOfLines={2}
                            className="text-xs italic leading-relaxed text-text"
                          >
                            “{s.descripcion}”
                          </Text>

                          {/* Resident info + images */}
                          <View className="flex-row items-center justify-between border-t border-border pt-2">
                            <View className="flex-row items-center gap-2">
                              <View className="h-7 w-7 items-center justify-center rounded-full border border-border bg-surface-2">
                                <User size={14} color={t.text} />
                              </View>
                              <View className="flex-col">
                                <Text className="text-xs font-medium text-text">
                                  {residente.nombre || 'Residente'}
                                </Text>
                                {residente.torre || residente.apto ? (
                                  <Text className="text-[10px] text-text">
                                    T{residente.torre || '?'} - A{residente.apto || '?'}
                                  </Text>
                                ) : null}
                              </View>
                            </View>

                            {imgs.length > 0 ? (
                              <View className="flex-row items-center gap-1">
                                <ImageIcon size={14} color={t.text} />
                                <Text className="text-[10px] font-bold text-text">
                                  {imgs.length} foto{imgs.length !== 1 ? 's' : ''}
                                </Text>
                              </View>
                            ) : null}
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
      </Screen>

      {/* ================================================================== */}
      {/* MODAL: Solicitud Detail */}
      {/* ================================================================== */}
      <Modal
        visible={!!selected}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeModal}
      >
        {/* `behavior='padding'` shrinks the wrapper by the keyboard height so the
            proveedor / comentario inputs at the bottom of the card stay visible
            (web has no keyboard to dodge). Android relies on adjustResize. */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1 items-center justify-center p-4"
        >
          {/* Backdrop */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
            onPress={closeModal}
            className="absolute inset-0 bg-black/80"
          />

          {selected ? (
            <View
              className="w-full overflow-hidden rounded-[32px] border border-border bg-primaryLight"
              style={{ maxWidth: 440, maxHeight: '90%' }}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: 24, gap: 20 }}
              >
                {/* Header */}
                <View className="flex-row items-center gap-3 pr-10">
                  <View className="rounded-2xl border border-border bg-surface-2 p-2.5">
                    {(CATEGORIA_ICON_MAP[selected.categoria] ??
                      ((size: number, color: string) => (
                        <MoreHorizontal size={size} color={color} />
                      )))(18, t.text)}
                  </View>
                  <View className="flex-1">
                    <Text className="text-lg font-bold text-text">{selected.categoria}</Text>
                    <Text className="text-[10px] uppercase tracking-widest text-text">
                      {selected.tipo} • {dateStr(selected)}
                    </Text>
                  </View>
                </View>

                {/* Badges */}
                <View className="flex-row flex-wrap items-center gap-2">
                  {(() => {
                    const badge = getEstadoBadge(selected.estado);
                    return (
                      <View
                        className={`flex-row items-center gap-1 rounded-full px-2.5 py-1 ${badge.chipClass}`}
                      >
                        {badge.icon(10, t[badge.tone])}
                        <Text className={`text-[10px] font-bold uppercase ${badge.textClass}`}>
                          Estado: {badge.label}
                        </Text>
                      </View>
                    );
                  })()}
                  {selected.urgente ? (
                    <View className="flex-row items-center gap-1 rounded-full border border-danger/30 bg-danger/20 px-2.5 py-1">
                      <AlertTriangle size={10} color={t.danger} />
                      <Text className="text-[10px] font-bold uppercase text-danger">Urgente</Text>
                    </View>
                  ) : null}
                </View>

                {/* Resident info */}
                {(() => {
                  const r = getResidente(selected);
                  return (
                    <View className="flex-row items-center gap-3 rounded-xl border border-border bg-surface-2 p-3">
                      <View className="h-9 w-9 items-center justify-center rounded-full border border-border bg-text/5">
                        <User size={18} color={t.text} />
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-medium text-text">
                          {r.nombre || 'Residente'}
                        </Text>
                        {r.torre || r.apto ? (
                          <Text className="text-[10px] font-bold text-text">
                            Torre {r.torre || '?'} — Apto {r.apto || '?'}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })()}

                {/* Full description */}
                <View className="flex flex-col gap-1.5">
                  <Text className="text-[10px] font-black uppercase tracking-[2px] text-text">
                    Descripción
                  </Text>
                  {/* Padding/border live on a View: RN honours them inconsistently
                      when set directly on <Text> (iOS text-container inset). */}
                  <View className="rounded-xl border border-border bg-surface-2 p-4">
                    <Text className="text-xs leading-relaxed text-text">
                      {selected.descripcion}
                    </Text>
                  </View>
                </View>

                {/* Image gallery */}
                {selectedImgs.length > 0 ? (
                  <View className="flex flex-col gap-2">
                    <Text className="text-[10px] font-black uppercase tracking-[2px] text-text">
                      Imágenes ({selectedImgs.length})
                    </Text>

                    {/* Current image */}
                    <View
                      className="overflow-hidden rounded-2xl border border-border bg-surface-2"
                      style={{ aspectRatio: 16 / 9, position: 'relative' }}
                    >
                      <Image
                        alt={`Imagen ${imgIdx + 1}`}
                        source={{ uri: selectedImgs[imgIdx] }}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                      />

                      {/* Navigation arrows */}
                      {selectedImgs.length > 1 ? (
                        <>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Imagen anterior"
                            onPress={() =>
                              setImgIdx((prev) =>
                                prev === 0 ? selectedImgs.length - 1 : prev - 1,
                              )
                            }
                            className="absolute h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/50"
                            style={{ left: 8, top: '50%', marginTop: -16 }}
                          >
                            <ChevronLeft size={16} color="#ffffff" />
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Imagen siguiente"
                            onPress={() =>
                              setImgIdx((prev) =>
                                prev === selectedImgs.length - 1 ? 0 : prev + 1,
                              )
                            }
                            className="absolute h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/50"
                            style={{ right: 8, top: '50%', marginTop: -16 }}
                          >
                            <ChevronRight size={16} color="#ffffff" />
                          </Pressable>
                        </>
                      ) : null}

                      {/* Dot indicators */}
                      {selectedImgs.length > 1 ? (
                        <View
                          className="absolute flex-row items-center gap-1.5"
                          style={{ bottom: 8, left: 0, right: 0, justifyContent: 'center' }}
                        >
                          {selectedImgs.map((_, i) => (
                            <Pressable
                              key={i}
                              accessibilityRole="button"
                              accessibilityLabel={`Ver imagen ${i + 1}`}
                              onPress={() => setImgIdx(i)}
                              hitSlop={6}
                              className={`h-2 w-2 rounded-full ${
                                i === imgIdx ? 'bg-white' : 'bg-white/40'
                              }`}
                              style={{ transform: [{ scale: i === imgIdx ? 1.1 : 1 }] }}
                            />
                          ))}
                        </View>
                      ) : null}
                    </View>

                    {/* Thumbnails */}
                    {selectedImgs.length > 1 ? (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
                      >
                        {selectedImgs.map((img, i) => (
                          <Pressable
                            key={i}
                            accessibilityRole="button"
                            accessibilityLabel={`Miniatura ${i + 1}`}
                            onPress={() => setImgIdx(i)}
                            className={`h-16 w-16 overflow-hidden rounded-xl border-2 ${
                              i === imgIdx ? 'border-accent' : 'border-border'
                            }`}
                            style={{ opacity: i === imgIdx ? 1 : 0.6 }}
                          >
                            <Image
                              alt={`Thumb ${i + 1}`}
                              source={{ uri: img }}
                              style={{ width: '100%', height: '100%' }}
                              contentFit="cover"
                            />
                          </Pressable>
                        ))}
                      </ScrollView>
                    ) : null}
                  </View>
                ) : null}

                {/* Estado change section */}
                <View className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-2 p-4">
                  <Text className="text-[10px] font-black uppercase tracking-[2px] text-text">
                    Cambiar Estado
                  </Text>

                  <SelectField<EstadoSolicitud>
                    accessibilityLabel="Estado"
                    value={nuevoEstado}
                    onChange={setNuevoEstado}
                    options={ESTADO_OPTIONS.map((opt) => ({
                      value: opt,
                      label: getEstadoBadge(opt).label,
                    }))}
                  />

                  <SelectField<PrioridadTicket>
                    accessibilityLabel="Prioridad"
                    value={nuevaPrioridad}
                    onChange={setNuevaPrioridad}
                    options={PRIORIDAD_OPTIONS.map((opt) => ({
                      value: opt,
                      label: `Prioridad: ${getPrioridadBadge(opt).label}`,
                    }))}
                  />

                  <TextInput
                    value={proveedorId}
                    onChangeText={setProveedorId}
                    placeholder="ID del proveedor (opcional)"
                    placeholderTextColor={t.textMuted}
                    className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-xs text-text"
                  />

                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: isProcessing, busy: isProcessing }}
                    disabled={isProcessing}
                    onPress={() => void handleCambiarEstado()}
                    style={({ pressed }) => ({
                      opacity: isProcessing ? 0.5 : 1,
                      transform: [{ scale: pressed ? 0.95 : 1 }],
                      shadowColor: t.success,
                      shadowOpacity: 0.3,
                      shadowRadius: 12,
                      shadowOffset: { width: 0, height: 6 },
                      elevation: 6,
                    })}
                    className="w-full flex-row items-center justify-center gap-2 rounded-full bg-success py-3"
                  >
                    {isProcessing ? (
                      <>
                        <Skeleton className="h-4 w-4 rounded-full" />
                        <Text className="text-sm font-bold tracking-wide text-on-accent">
                          Actualizando...
                        </Text>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} color={t.onAccent} />
                        <Text className="text-sm font-bold tracking-wide text-on-accent">
                          Guardar Cambios
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>

                {/* Quick actions */}
                <View className="flex-row gap-3">
                  <Pressable
                    accessibilityRole="button"
                    disabled={isProcessing || selected.estado === 'CERRADA'}
                    onPress={() => {
                      setNuevoEstado('CERRADA');
                      void handleCambiarEstado('CERRADA');
                    }}
                    style={{ opacity: isProcessing || selected.estado === 'CERRADA' ? 0.4 : 1 }}
                    className="flex-1 items-center rounded-full border border-text-muted/30 py-3"
                  >
                    <Text className="text-xs font-bold tracking-wide text-text-muted">
                      Cerrar Ticket
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isProcessing || selected.estado === 'ABIERTA'}
                    onPress={() => {
                      setNuevoEstado('ABIERTA');
                      void handleCambiarEstado('ABIERTA');
                    }}
                    style={{ opacity: isProcessing || selected.estado === 'ABIERTA' ? 0.4 : 1 }}
                    className="flex-1 items-center rounded-full border border-warning/30 py-3"
                  >
                    <Text className="text-xs font-bold tracking-wide text-warning">Reabrir</Text>
                  </Pressable>
                </View>

                {/* Comentarios */}
                <View className="flex flex-col gap-3 border-t border-border pt-2">
                  <View className="flex-row items-center gap-1.5">
                    <MessageSquare size={12} color={t.text} />
                    <Text className="text-[10px] font-black uppercase tracking-[2px] text-text">
                      Comentarios ({comentarios.length})
                    </Text>
                  </View>

                  {cargandoComentarios ? (
                    <Skeleton className="h-5 w-5 self-center rounded-full" />
                  ) : comentarios.length === 0 ? (
                    <Text className="py-2 text-center text-[10px] italic text-text">
                      Sin comentarios aún
                    </Text>
                  ) : (
                    <ScrollView
                      style={{ maxHeight: 160 }}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={{ gap: 8 }}
                    >
                      {comentarios.map((c) => (
                        <View
                          key={c.id}
                          className="rounded-xl border border-border bg-surface-2 p-3"
                        >
                          <Text className="text-xs leading-relaxed text-text">{c.contenido}</Text>
                          <Text className="mt-1 text-[9px] text-text">
                            {new Date(c.createdAt).toLocaleString('es-ES', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </Text>
                        </View>
                      ))}
                    </ScrollView>
                  )}

                  {/* Add comment */}
                  <View className="flex-row gap-2">
                    <TextInput
                      value={nuevoComentario}
                      onChangeText={setNuevoComentario}
                      onSubmitEditing={() => void postComentario()}
                      placeholder="Escribir comentario..."
                      placeholderTextColor={t.textMuted}
                      returnKeyType="send"
                      className="flex-1 rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-xs text-text"
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Enviar comentario"
                      disabled={enviandoComentario || !nuevoComentario.trim()}
                      onPress={() => void postComentario()}
                      style={({ pressed }) => ({
                        opacity: enviandoComentario || !nuevoComentario.trim() ? 0.4 : 1,
                        transform: [{ scale: pressed ? 0.95 : 1 }],
                      })}
                      className="items-center justify-center rounded-xl bg-accent px-3 py-2.5"
                    >
                      {enviandoComentario ? (
                        <Skeleton className="h-4 w-4 rounded-full" />
                      ) : (
                        <Send size={14} color={t.primary} />
                      )}
                    </Pressable>
                  </View>
                </View>
              </ScrollView>

              {/* Close button */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
                onPress={closeModal}
                style={{ position: 'absolute', top: 16, right: 16 }}
                className="h-8 w-8 items-center justify-center rounded-full border border-border bg-text/5"
              >
                <X size={16} color={t.text} />
              </Pressable>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
