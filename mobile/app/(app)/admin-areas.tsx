/**
 * ADMIN ÁREAS COMUNES — CONJUNTOSAPP (mobile port)
 *
 * Ported 1:1 from web `src/app/(app)/admin-areas/page.tsx`.
 * Gestión de zonas comunes (CRUD) + listado administrativo de reservas.
 *
 * Endpoints (all admin-only, ADMINISTRADOR / SUPER_ADMIN):
 *  - GET    /admin/areas-comunes
 *  - POST   /admin/areas-comunes
 *  - PUT    /admin/areas-comunes/{id}   (partial update)
 *  - DELETE /admin/areas-comunes/{id}
 *  - GET    /admin/reservas?estado=&area_id=
 *  - useWsSubscription('reserva') → refetch reservas + áreas
 *
 * The web `<input type="time">` becomes a dependency-free sheet-style overlay
 * with an hour column (00–23) and a minute column (00–59), so any HH:MM the
 * browser control could produce is still reachable.
 */

import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, SlideInDown } from 'react-native-reanimated';
import {
  Building2,
  Calendar,
  ChevronDown,
  Clock,
  DollarSign,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react-native';

import ProfileHeader from '@/components/shell/ProfileHeader';
import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { Sheet } from '@/components/ui/Sheet';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api, ApiError } from '@/lib/api/client';
import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor } from '@/theme/tokens';
import type { AreaComunDto } from '@/lib/api/types';

import { BottomSheetScrollView } from '@gorhom/bottom-sheet';

// ---------------------------------------------------------------------------
// Local DTOs matching the Rust backend admin_areas.rs
// ---------------------------------------------------------------------------

/** Reservation as returned by GET /admin/reservas */
interface ReservaAdminDto {
  id: string;
  usuarioId: string;
  residenteNombre: string;
  residenteTorre: string | null;
  residenteApto: string | null;
  areaId: string;
  areaNombre: string;
  fechaInicio: string;
  fechaFin: string;
  estado: 'PENDIENTE' | 'CONFIRMADA' | 'CANCELADA' | 'COMPLETADA';
  notas: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Form shapes
// ---------------------------------------------------------------------------

interface AreaFormData {
  nombre: string;
  descripcion: string;
  capacidadMax: number;
  requiereDeposito: boolean;
  depositoMonto: string;
  horaApertura: string;
  horaCierre: string;
  diasDisponibles: string;
  duracionSlot: number;
  activa: boolean;
}

const EMPTY_AREA_FORM: AreaFormData = {
  nombre: '',
  descripcion: '',
  capacidadMax: 10,
  requiereDeposito: false,
  depositoMonto: '',
  horaApertura: '06:00',
  horaCierre: '22:00',
  diasDisponibles: 'Lunes a Domingo',
  duracionSlot: 60,
  activa: true,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALLOWED_ROLES = ['ADMINISTRADOR', 'SUPER_ADMIN'];

/**
 * Chip colors per estado. Web: `bg-success/10 text-success border-success/30`
 * (etc). PENDIENTE used raw `yellow-500` on web — mapped to the `warning`
 * token, which is the palette slot for "pendiente / por vencer".
 */
const ESTADO_COLORS: Record<string, { chip: string; text: string }> = {
  CONFIRMADA: { chip: 'bg-success/10 border-success/30', text: 'text-success' },
  PENDIENTE: { chip: 'bg-warning/10 border-warning/30', text: 'text-warning' },
  CANCELADA: { chip: 'bg-danger/10 border-danger/30', text: 'text-danger' },
  COMPLETADA: { chip: 'bg-info/10 border-info/30', text: 'text-info' },
};

const ESTADO_LABEL: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  CONFIRMADA: 'Confirmada',
  CANCELADA: 'Cancelada',
  COMPLETADA: 'Completada',
};

const ESTADO_FILTERS: { label: string; value: string }[] = [
  { label: 'Todas', value: '' },
  { label: 'Pendiente', value: 'PENDIENTE' },
  { label: 'Confirmada', value: 'CONFIRMADA' },
  { label: 'Cancelada', value: 'CANCELADA' },
  { label: 'Completada', value: 'COMPLETADA' },
];

function formatCOP(value: string | null | undefined): string {
  if (!value) return '$0';
  const n = Number(value);
  if (isNaN(n)) return '$0';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Multiply an `rgba(r,g,b,a)` token's alpha — reproduces web's `/50` · `/40`
 * opacity modifier applied to an already-translucent token (`border-border/50`,
 * `border-border/40`). Tailwind v3 cannot express that as a class here: the
 * `border` token is emitted as the complete `var(--color-border)` rgba(), so
 * `parseColor()` fails and the utility is dropped entirely — leaving the
 * `border-t` width with RN's default (black) border color.
 */
function fadeToken(rgba: string, factor: number): string {
  const m = /rgba?\(([^)]+)\)/.exec(rgba);
  if (!m) return rgba;
  const parts = m[1].split(',').map((p) => p.trim());
  if (parts.length < 3) return rgba;
  const alpha = parts.length > 3 ? Number(parts[3]) : 1;
  return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha * factor})`;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminAreas() {
  const user = useAuth((s) => s.user);
  const authLoading = useAuth((s) => s.loading);
  const router = useRouter();
  const role = user?.rol;
  const { theme } = useTheme();
  const tokens = tokensFor(theme);

  const [tab, setTab] = useState<'areas' | 'reservas'>('areas');
  const [loading, setLoading] = useState(true);

  // ── Areas state ──────────────────────────────────────────────────────────
  const [areas, setAreas] = useState<AreaComunDto[]>([]);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<AreaFormData>({ ...EMPTY_AREA_FORM });
  const [savingCreate, setSavingCreate] = useState(false);

  // Edit modal
  const [editingArea, setEditingArea] = useState<AreaComunDto | null>(null);
  const [editForm, setEditForm] = useState<AreaFormData>({ ...EMPTY_AREA_FORM });
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete confirmation modal
  const [areaToDelete, setAreaToDelete] = useState<AreaComunDto | null>(null);
  const [deletingArea, setDeletingArea] = useState(false);

  // ── Reservas state ───────────────────────────────────────────────────────
  const [reservas, setReservas] = useState<ReservaAdminDto[]>([]);
  const [loadingReservas, setLoadingReservas] = useState(false);
  const [filterEstado, setFilterEstado] = useState<string>('');
  const [filterAreaId, setFilterAreaId] = useState<string>('');
  const [areaPickerOpen, setAreaPickerOpen] = useState(false);

  // ── Data fetching ────────────────────────────────────────────────────────

  const fetchAreas = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<AreaComunDto[]>('/admin/areas-comunes');
      setAreas(data);
    } catch {
      toast.error('Error al cargar áreas comunes');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchReservas = useCallback(async () => {
    setLoadingReservas(true);
    try {
      const params: string[] = [];
      if (filterEstado) params.push(`estado=${encodeURIComponent(filterEstado)}`);
      if (filterAreaId) params.push(`area_id=${encodeURIComponent(filterAreaId)}`);

      const qs = params.join('&');
      const data = await api.get<ReservaAdminDto[]>(
        `/admin/reservas${qs ? `?${qs}` : ''}`,
      );
      // Sort reverse chronological (newest first)
      data.sort(
        (a, b) => new Date(b.fechaInicio).getTime() - new Date(a.fechaInicio).getTime(),
      );
      setReservas(data);
    } catch {
      toast.error('Error al cargar reservas');
    } finally {
      setLoadingReservas(false);
    }
  }, [filterEstado, filterAreaId]);

  // Real-time WebSocket subscriptions
  useWsSubscription('reserva', () => {
    void fetchReservas();
    void fetchAreas();
  });

  // ── Auth guard + initial load ────────────────────────────────────────────

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

    void fetchAreas();
    void fetchReservas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, role, router]);

  // Re-fetch reservas when filters change
  useEffect(() => {
    if (tab === 'reservas' && user) {
      void fetchReservas();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterEstado, filterAreaId, tab]);

  // ── Area CRUD handlers ───────────────────────────────────────────────────

  const openCreateModal = () => {
    setCreateForm({ ...EMPTY_AREA_FORM });
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!createForm.nombre.trim()) {
      toast.error('El nombre es requerido');
      return;
    }
    setSavingCreate(true);
    try {
      const body: Record<string, unknown> = {
        nombre: createForm.nombre.trim(),
        descripcion: createForm.descripcion.trim() || null,
        capacidadMax: createForm.capacidadMax,
        requiereDeposito: createForm.requiereDeposito,
        depositoMonto: createForm.requiereDeposito
          ? createForm.depositoMonto || null
          : null,
        horaApertura: createForm.horaApertura,
        horaCierre: createForm.horaCierre,
        diasDisponibles: createForm.diasDisponibles.trim(),
        duracionSlot: createForm.duracionSlot,
        activa: createForm.activa,
      };
      await api.post<AreaComunDto>('/admin/areas-comunes', body);
      toast.success('Área creada exitosamente');
      setShowCreate(false);
      void fetchAreas();
    } catch (e: unknown) {
      toast.error(e instanceof ApiError ? e.detail : 'Error al crear el área');
    } finally {
      setSavingCreate(false);
    }
  };

  const openEditModal = (area: AreaComunDto) => {
    setEditingArea(area);
    setEditForm({
      nombre: area.nombre,
      descripcion: area.descripcion || '',
      capacidadMax: area.capacidadMax,
      requiereDeposito: area.requiereDeposito,
      depositoMonto: area.depositoMonto || '',
      horaApertura: area.horaApertura,
      horaCierre: area.horaCierre,
      diasDisponibles: area.diasDisponibles,
      duracionSlot: area.duracionSlot,
      activa: area.activa,
    });
  };

  const handleEdit = async () => {
    if (!editingArea) return;
    if (!editForm.nombre.trim()) {
      toast.error('El nombre es requerido');
      return;
    }
    setSavingEdit(true);
    try {
      const body: Record<string, unknown> = {
        nombre: editForm.nombre.trim() || undefined,
        descripcion: editForm.descripcion.trim() || undefined,
        capacidadMax: editForm.capacidadMax,
        requiereDeposito: editForm.requiereDeposito,
        depositoMonto: editForm.requiereDeposito ? editForm.depositoMonto || null : null,
        horaApertura: editForm.horaApertura,
        horaCierre: editForm.horaCierre,
        diasDisponibles: editForm.diasDisponibles.trim(),
        duracionSlot: editForm.duracionSlot,
        activa: editForm.activa,
      };
      await api.put(`/admin/areas-comunes/${editingArea.id}`, body);
      toast.success('Área actualizada exitosamente');
      setEditingArea(null);
      void fetchAreas();
    } catch (e: unknown) {
      toast.error(e instanceof ApiError ? e.detail : 'Error al actualizar el área');
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmDeleteArea = async () => {
    if (!areaToDelete) return;
    setDeletingArea(true);
    try {
      await api.delete(`/admin/areas-comunes/${areaToDelete.id}`);
      toast.success('Área eliminada correctamente');
      setAreaToDelete(null);
      void fetchAreas();
    } catch (e: unknown) {
      toast.error(e instanceof ApiError ? e.detail : 'Error al eliminar el área');
    } finally {
      setDeletingArea(false);
    }
  };

  // ── Loading state ────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <Screen scroll={false} className="bg-primary">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={tokens.accent} />
        </View>
      </Screen>
    );
  }

  const selectedArea = areas.find((a) => a.id === filterAreaId) ?? null;

  // ── Render ───────────────────────────────────────────────────────────────

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
            <View>
              <Text className="font-display text-2xl font-medium tracking-wide text-text">
                Áreas Comunes
              </Text>
              <Text className="text-sm text-text" style={{ opacity: 0.6 }}>
                Gestión de espacios y reservas
              </Text>
            </View>
            {tab === 'areas' ? (
              <Pressable
                accessibilityRole="button"
                onPress={openCreateModal}
                style={({ pressed }) => ({
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                  backgroundColor: tokens.success,
                  shadowColor: tokens.success,
                  shadowOpacity: 0.3,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 6 },
                  elevation: 6,
                })}
                className="flex-row items-center gap-2 rounded-full px-5 py-2.5"
              >
                <Plus size={18} color={tokens.onAccent} />
                <Text className="text-sm font-bold" style={{ color: tokens.onAccent }}>
                  Nueva Área
                </Text>
              </Pressable>
            ) : null}
            {tab === 'reservas' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Actualizar"
                onPress={() => void fetchReservas()}
                hitSlop={8}
                className="rounded-full p-2"
              >
                <RefreshCw size={18} color={tokens.text} />
              </Pressable>
            ) : null}
          </Animated.View>

          {/* Tabs */}
          <View className="flex-row rounded-full border border-border bg-surface2 p-1">
            {(['areas', 'reservas'] as const).map((key) => {
              const active = tab === key;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  onPress={() => setTab(key)}
                  // web: active pill is `bg-accent text-primary shadow-md`.
                  style={
                    active
                      ? {
                          shadowColor: '#000000',
                          shadowOpacity: 0.15,
                          shadowRadius: 6,
                          shadowOffset: { width: 0, height: 4 },
                          elevation: 3,
                        }
                      : undefined
                  }
                  className={`flex-1 items-center rounded-full py-3 ${
                    active ? 'bg-accent' : ''
                  }`}
                >
                  <Text
                    className={`text-[10px] font-bold uppercase tracking-widest ${
                      active ? 'text-primary' : 'text-text'
                    }`}
                  >
                    {key === 'areas' ? 'Áreas' : 'Reservas'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* ── TAB: Áreas ────────────────────────────────────────────────── */}
          {tab === 'areas' ? (
            <View className="flex flex-col gap-4">
              {loading ? (
                <View className="w-full items-center py-12">
                  <ActivityIndicator color={tokens.accent} />
                </View>
              ) : areas.length === 0 ? (
                <LiquidGlass
                  radius={24}
                  className="rounded-[24px]"
                  style={{ padding: 32, alignItems: 'center' }}
                >
                  <View style={{ opacity: 0.4, marginBottom: 12 }}>
                    <Building2 size={40} color={tokens.text} />
                  </View>
                  <Text className="font-medium text-text">Sin áreas comunes</Text>
                  <Text
                    className="mt-1 text-center text-xs text-text"
                    style={{ opacity: 0.5 }}
                  >
                    Crea la primera área usando el botón superior.
                  </Text>
                </LiquidGlass>
              ) : (
                areas.map((area, i) => (
                  <Animated.View
                    key={area.id}
                    entering={FadeInDown.delay(i * 60).duration(450)}
                  >
                    <LiquidGlass
                      radius={24}
                      className="rounded-[24px]"
                      style={{ padding: 24, flexDirection: 'column', gap: 16 }}
                    >
                      {/* Top row: Name + Status + Actions */}
                      <View className="flex-row items-start justify-between">
                        <View className="flex-1 flex-row items-center gap-3 pr-2">
                          <View className="h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface2">
                            <Building2 size={22} color={tokens.text} />
                          </View>
                          <View className="flex-1 flex-col">
                            <Text className="text-sm font-bold text-text">
                              {area.nombre}
                            </Text>
                            <View className="mt-0.5 flex-row items-center gap-2">
                              <View
                                className={`h-2 w-2 rounded-full ${
                                  area.activa ? 'bg-success' : 'bg-text/30'
                                }`}
                              />
                              <Text
                                className="text-[10px] text-text"
                                style={{ opacity: 0.5 }}
                              >
                                {area.activa ? 'Activa' : 'Inactiva'}
                              </Text>
                            </View>
                          </View>
                        </View>

                        <View className="flex-row items-center gap-2">
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Editar área"
                            onPress={() => openEditModal(area)}
                            style={({ pressed }) => ({
                              transform: [{ scale: pressed ? 0.95 : 1 }],
                            })}
                            className="h-10 w-10 items-center justify-center rounded-xl border border-accent/25 bg-accent/10"
                          >
                            <Pencil size={16} color={tokens.accent} />
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Eliminar área"
                            onPress={() => setAreaToDelete(area)}
                            style={({ pressed }) => ({
                              transform: [{ scale: pressed ? 0.95 : 1 }],
                            })}
                            className="h-10 w-10 items-center justify-center rounded-xl border border-text/25 bg-text/10"
                          >
                            <Trash2 size={16} color={tokens.text} />
                          </Pressable>
                        </View>
                      </View>

                      {/* Description */}
                      {area.descripcion ? (
                        <Text
                          className="text-xs leading-relaxed text-text"
                          style={{ opacity: 0.7 }}
                        >
                          {area.descripcion}
                        </Text>
                      ) : null}

                      {/* Info grid */}
                      <View
                        className="flex-row flex-wrap border-t pt-2"
                        style={{ borderTopColor: fadeToken(tokens.border, 0.5) }}
                      >
                        <View
                          className="flex-row items-center gap-2 pb-1.5"
                          style={{ width: '50%' }}
                        >
                          <View style={{ opacity: 0.5 }}>
                            <Users size={14} color={tokens.text} />
                          </View>
                          <Text className="text-xs text-text">
                            Cap. máxima: <Text className="font-bold">{area.capacidadMax}</Text>
                          </Text>
                        </View>
                        <View
                          className="flex-row items-center gap-2 pb-1.5"
                          style={{ width: '50%' }}
                        >
                          <View style={{ opacity: 0.5 }}>
                            <Clock size={14} color={tokens.text} />
                          </View>
                          <Text className="text-xs text-text">
                            {area.horaApertura} – {area.horaCierre}
                          </Text>
                        </View>
                        <View
                          className="flex-row items-center gap-2"
                          style={{ width: '50%' }}
                        >
                          <View style={{ opacity: 0.5 }}>
                            <Calendar size={14} color={tokens.text} />
                          </View>
                          <Text className="flex-1 text-xs text-text">
                            {area.diasDisponibles}
                          </Text>
                        </View>
                        <View
                          className="flex-row items-center gap-2"
                          style={{ width: '50%' }}
                        >
                          <View style={{ opacity: 0.5 }}>
                            <Clock size={14} color={tokens.text} />
                          </View>
                          <Text className="text-xs text-text">
                            Slot: {area.duracionSlot} min
                          </Text>
                        </View>
                      </View>

                      {/* Deposit info */}
                      {area.requiereDeposito ? (
                        <View className="flex-row items-center gap-2 rounded-xl border border-warning/20 bg-warning/10 px-3 py-2">
                          <DollarSign size={14} color={tokens.warning} />
                          <Text className="flex-1 text-xs font-medium text-text">
                            Depósito requerido:{' '}
                            <Text className="font-bold">{formatCOP(area.depositoMonto)}</Text>
                          </Text>
                        </View>
                      ) : null}
                    </LiquidGlass>
                  </Animated.View>
                ))
              )}
            </View>
          ) : null}

          {/* ── TAB: Reservas ─────────────────────────────────────────────── */}
          {tab === 'reservas' ? (
            <View className="flex flex-col gap-4">
              {/* Filters */}
              <View className="flex flex-col gap-3">
                {/* Estado filter */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
                >
                  {ESTADO_FILTERS.map((opt) => {
                    const active = filterEstado === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        accessibilityRole="button"
                        onPress={() => setFilterEstado(opt.value)}
                        style={({ pressed }) => ({
                          transform: [{ scale: pressed ? 0.95 : 1 }],
                          backgroundColor: active ? tokens.info : undefined,
                          shadowColor: active ? tokens.info : undefined,
                          shadowOpacity: active ? 0.3 : 0,
                          shadowRadius: active ? 12 : 0,
                          shadowOffset: { width: 0, height: 6 },
                          elevation: active ? 6 : 0,
                        })}
                        className={`rounded-full px-4 py-2 ${
                          active ? '' : 'border border-border bg-text/5'
                        }`}
                      >
                        <Text
                          className="text-xs font-bold uppercase tracking-wider"
                          style={{ color: active ? tokens.onAccent : tokens.text }}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {/* Área filter */}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setAreaPickerOpen(true)}
                  className="w-full flex-row items-center gap-2 rounded-xl border border-border bg-surface2 px-4 py-3"
                >
                  <View style={{ opacity: 0.5 }}>
                    <MapPin size={14} color={tokens.text} />
                  </View>
                  <Text className="flex-1 text-xs text-text" numberOfLines={1}>
                    {selectedArea ? selectedArea.nombre : 'Todas las áreas'}
                  </Text>
                  <ChevronDown size={16} color={tokens.text} />
                </Pressable>
              </View>

              {/* Reservations list */}
              {loadingReservas ? (
                <View className="w-full items-center py-12">
                  <ActivityIndicator color={tokens.accent} />
                </View>
              ) : reservas.length === 0 ? (
                <LiquidGlass
                  radius={24}
                  className="rounded-[24px]"
                  style={{ padding: 32, alignItems: 'center' }}
                >
                  <View style={{ opacity: 0.4, marginBottom: 12 }}>
                    <Calendar size={40} color={tokens.text} />
                  </View>
                  <Text className="font-medium text-text">Sin reservas</Text>
                  <Text
                    className="mt-1 text-center text-xs text-text"
                    style={{ opacity: 0.5 }}
                  >
                    No hay reservas que coincidan con los filtros seleccionados.
                  </Text>
                </LiquidGlass>
              ) : (
                reservas.map((r, i) => {
                  const chip = ESTADO_COLORS[r.estado];
                  return (
                    <Animated.View
                      key={r.id}
                      entering={FadeInDown.delay(i * 60).duration(450)}
                    >
                      <LiquidGlass
                        radius={24}
                        className="rounded-[24px]"
                        style={{ padding: 20, flexDirection: 'column', gap: 12 }}
                      >
                        {/* Top: Resident + Area */}
                        <View className="flex-row items-start justify-between gap-3">
                          <View className="flex-1 flex-row items-center gap-3">
                            <View className="h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface2">
                              <User size={20} color={tokens.text} />
                            </View>
                            <View className="flex-1 flex-col">
                              <Text
                                className="text-sm font-bold text-text"
                                numberOfLines={1}
                              >
                                {r.residenteNombre}
                              </Text>
                              <View className="mt-0.5 self-start rounded-md bg-accent/20 px-2 py-0.5">
                                <Text className="text-[10px] font-black uppercase text-accent">
                                  {r.residenteTorre && r.residenteApto
                                    ? `T${r.residenteTorre} - A${r.residenteApto}`
                                    : 'Sin unidad'}
                                </Text>
                              </View>
                            </View>
                          </View>
                          <View
                            className={`rounded-full border px-2 py-0.5 ${
                              chip ? chip.chip : 'border-border'
                            }`}
                          >
                            <Text
                              className={`text-[10px] font-bold uppercase ${
                                chip ? chip.text : 'text-text'
                              }`}
                            >
                              {ESTADO_LABEL[r.estado] || r.estado}
                            </Text>
                          </View>
                        </View>

                        {/* Middle: Area + Date/Time */}
                        <View className="flex-col gap-1.5 rounded-xl border border-border bg-surface2 p-3">
                          <View className="flex-row items-center gap-2">
                            <View style={{ opacity: 0.5 }}>
                              <Building2 size={14} color={tokens.text} />
                            </View>
                            <Text className="flex-1 text-xs font-medium text-text">
                              {r.areaNombre}
                            </Text>
                          </View>
                          <View className="flex-row items-center gap-4">
                            <View className="flex-row items-center gap-1.5">
                              <View style={{ opacity: 0.5 }}>
                                <Calendar size={13} color={tokens.text} />
                              </View>
                              <Text className="text-xs text-text">
                                {new Date(r.fechaInicio).toLocaleDateString('es-CO', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </Text>
                            </View>
                            <View className="flex-row items-center gap-1.5">
                              <View style={{ opacity: 0.5 }}>
                                <Clock size={13} color={tokens.text} />
                              </View>
                              <Text className="text-xs text-text">
                                {new Date(r.fechaInicio).toLocaleTimeString('es-CO', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}{' '}
                                –{' '}
                                {new Date(r.fechaFin).toLocaleTimeString('es-CO', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </Text>
                            </View>
                          </View>
                        </View>

                        {/* Bottom: Notes */}
                        {r.notas ? (
                          <View
                            className="border-t px-1 pt-2"
                            style={{ borderTopColor: fadeToken(tokens.border, 0.4) }}
                          >
                            <Text className="text-[11px] italic leading-relaxed text-text">
                              &quot;{r.notas}&quot;
                            </Text>
                          </View>
                        ) : null}

                        {/* Created */}
                        <Text className="text-[9px] text-text" style={{ opacity: 0.4 }}>
                          Creada:{' '}
                          {new Date(r.createdAt).toLocaleString('es-CO', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                      </LiquidGlass>
                    </Animated.View>
                  );
                })
              )}
            </View>
          ) : null}

          {/* Footer */}
          <View className="items-center py-10" style={{ opacity: 0.1 }}>
            <Text className="text-[10px] font-bold uppercase tracking-[2px] text-text">
              ConjuntOS · Áreas Comunes
            </Text>
          </View>
        </View>
      </Screen>

      {/* Área filter picker */}
      <Sheet open={areaPickerOpen} onClose={() => setAreaPickerOpen(false)} snapPoints={['60%']}>
        <View className="flex-1 px-5 pb-6">
          <View className="flex-row items-center justify-end py-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
              onPress={() => setAreaPickerOpen(false)}
              hitSlop={8}
            >
              <X size={20} color={tokens.text} />
            </Pressable>
          </View>
          <BottomSheetScrollView
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            {[{ id: '', nombre: 'Todas las áreas' }, ...areas].map((a) => (
              <Pressable
                key={a.id || 'all'}
                accessibilityRole="button"
                onPress={() => {
                  setFilterAreaId(a.id);
                  setAreaPickerOpen(false);
                }}
                className="flex-row items-center justify-between border-b border-border py-3.5"
              >
                <Text className="flex-1 pr-2 text-sm text-text" numberOfLines={1}>
                  {a.nombre}
                </Text>
                {a.id === filterAreaId ? (
                  <View className="h-2 w-2 rounded-full bg-accent" />
                ) : null}
              </Pressable>
            ))}
          </BottomSheetScrollView>
        </View>
      </Sheet>

      {/* CREATE AREA MODAL */}
      <AreaFormModal
        open={showCreate}
        title="Nueva Área Común"
        submitLabel="Crear Área"
        form={createForm}
        setForm={setCreateForm}
        saving={savingCreate}
        onClose={() => {
          if (!savingCreate) setShowCreate(false);
        }}
        onSubmit={handleCreate}
      />

      {/* EDIT AREA MODAL */}
      <AreaFormModal
        open={editingArea !== null}
        title="Editar Área Común"
        submitLabel="Guardar Cambios"
        form={editForm}
        setForm={setEditForm}
        saving={savingEdit}
        onClose={() => {
          if (!savingEdit) setEditingArea(null);
        }}
        onSubmit={handleEdit}
      />

      {/* DELETE CONFIRMATION MODAL */}
      <DeleteAreaModal
        area={areaToDelete}
        deleting={deletingArea}
        onCancel={() => setAreaToDelete(null)}
        onConfirm={confirmDeleteArea}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Toggle — reproduces the web pill switch (w-12 h-7, knob 24px, +20px travel).
// The knob is white in both schemes, exactly like the web `bg-white` literal.
// ---------------------------------------------------------------------------

const KNOB_WHITE = '#ffffff';

function Toggle({
  value,
  onToggle,
  label,
}: {
  value: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <View className="flex-row items-center justify-between rounded-xl border border-border bg-surface2 p-3">
      <Text className="text-sm font-medium text-text">{label}</Text>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: value }}
        accessibilityLabel={label}
        onPress={onToggle}
        className={`h-7 w-12 rounded-full ${value ? 'bg-success' : 'bg-text/20'}`}
      >
        <View
          className="h-6 w-6 rounded-full"
          style={{
            position: 'absolute',
            top: 2,
            left: 2,
            backgroundColor: KNOB_WHITE,
            transform: [{ translateX: value ? 20 : 0 }],
            shadowColor: '#000000',
            shadowOpacity: 0.2,
            shadowRadius: 2,
            shadowOffset: { width: 0, height: 1 },
            elevation: 2,
          }}
        />
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Field label + text input (web: bg-surface-2 border border-border rounded-xl)
// ---------------------------------------------------------------------------

function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="ml-1 text-[10px] font-black uppercase tracking-[2px] text-text">
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Create / Edit modal
// ---------------------------------------------------------------------------

interface AreaFormModalProps {
  open: boolean;
  title: string;
  submitLabel: string;
  form: AreaFormData;
  setForm: Dispatch<SetStateAction<AreaFormData>>;
  saving: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

function AreaFormModal({
  open,
  title,
  submitLabel,
  form,
  setForm,
  saving,
  onClose,
  onSubmit,
}: AreaFormModalProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const tokens = tokensFor(theme);

  /** Which time field the inline HH:MM picker is editing, if any. */
  const [timePicker, setTimePicker] = useState<null | 'horaApertura' | 'horaCierre'>(null);

  // Both form modals stay mounted (visible={open}), so the picker state has to
  // be cleared when the modal closes — otherwise dismissing via the Android
  // hardware back button leaves it open for the next time the modal is shown.
  useEffect(() => {
    if (!open) setTimePicker(null);
  }, [open]);

  /** Writes one half of an HH:MM value back into the edited time field. */
  const applyTimePart = (
    which: 'horaApertura' | 'horaCierre',
    part: 'hour' | 'minute',
    value: string,
  ) => {
    setForm((prev) => {
      const [h, m] = prev[which].split(':');
      const next = part === 'hour' ? `${value}:${m ?? '00'}` : `${h ?? '00'}:${value}`;
      return which === 'horaApertura'
        ? { ...prev, horaApertura: next }
        : { ...prev, horaCierre: next };
    });
  };

  // Mirrors the browser's `required` attributes: an empty required field blocks
  // submission (no invented copy — the button is simply inert).
  const canSubmit =
    form.nombre.trim().length > 0 &&
    form.diasDisponibles.trim().length > 0 &&
    form.horaApertura.length > 0 &&
    form.horaCierre.length > 0;

  const timeValue = timePicker ? form[timePicker] : '00:00';
  const [pickHour, pickMinute] = timeValue.split(':');

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
          className="absolute inset-0 bg-black/70"
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
        />

        {open ? (
          <Animated.View
            entering={SlideInDown.duration(300)}
            className="overflow-hidden rounded-t-[32px] border-t bg-primary"
            style={{
              maxHeight: '90%',
              paddingBottom: insets.bottom + 16,
              borderTopColor: fadeToken(tokens.border, 0.4),
            }}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 24, gap: 16 }}
            >
              {/* Header */}
              <View className="flex-row items-center justify-between">
                <Text className="text-lg font-bold text-text">{title}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar"
                  onPress={onClose}
                  disabled={saving}
                  className="h-10 w-10 items-center justify-center rounded-full border border-border bg-surface2"
                >
                  <X size={20} color={tokens.text} />
                </Pressable>
              </View>

              {/* Nombre */}
              <View className="flex-col gap-1.5">
                <FieldLabel>Nombre *</FieldLabel>
                <TextInput
                  value={form.nombre}
                  onChangeText={(nombre) => setForm((prev) => ({ ...prev, nombre }))}
                  placeholder="Ej: Salón Social, Piscina, BBQ"
                  placeholderTextColor={tokens.textMuted}
                  editable={!saving}
                  className="w-full rounded-xl border border-border bg-surface2 px-4 py-3 text-sm text-text"
                />
              </View>

              {/* Descripción */}
              <View className="flex-col gap-1.5">
                <FieldLabel>Descripción</FieldLabel>
                <TextInput
                  value={form.descripcion}
                  onChangeText={(descripcion) =>
                    setForm((prev) => ({ ...prev, descripcion }))
                  }
                  placeholder="Breve descripción del espacio..."
                  placeholderTextColor={tokens.textMuted}
                  editable={!saving}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                  className="min-h-[72px] w-full rounded-xl border border-border bg-surface2 px-4 py-3 text-sm text-text"
                />
              </View>

              {/* Capacidad máxima + Duración slot */}
              <View className="flex-row gap-3">
                <View className="flex-1 flex-col gap-1.5">
                  <FieldLabel>Capacidad Máx.</FieldLabel>
                  <TextInput
                    value={String(form.capacidadMax)}
                    onChangeText={(t) =>
                      setForm((prev) => ({
                        ...prev,
                        capacidadMax: parseInt(t, 10) || 1,
                      }))
                    }
                    keyboardType="number-pad"
                    editable={!saving}
                    className="w-full rounded-xl border border-border bg-surface2 px-4 py-3 text-sm text-text"
                  />
                </View>
                <View className="flex-1 flex-col gap-1.5">
                  <FieldLabel>Slot (min)</FieldLabel>
                  <TextInput
                    value={String(form.duracionSlot)}
                    onChangeText={(t) =>
                      setForm((prev) => ({
                        ...prev,
                        duracionSlot: parseInt(t, 10) || 1,
                      }))
                    }
                    keyboardType="number-pad"
                    editable={!saving}
                    className="w-full rounded-xl border border-border bg-surface2 px-4 py-3 text-sm text-text"
                  />
                </View>
              </View>

              {/* Horarios */}
              <View className="flex-row gap-3">
                <View className="flex-1 flex-col gap-1.5">
                  <FieldLabel>Hora Apertura *</FieldLabel>
                  <Pressable
                    accessibilityRole="button"
                    disabled={saving}
                    onPress={() => setTimePicker('horaApertura')}
                    className="w-full flex-row items-center justify-between rounded-xl border border-border bg-surface2 px-4 py-3"
                  >
                    <Text className="text-sm text-text">{form.horaApertura}</Text>
                    <Clock size={16} color={tokens.accent} />
                  </Pressable>
                </View>
                <View className="flex-1 flex-col gap-1.5">
                  <FieldLabel>Hora Cierre *</FieldLabel>
                  <Pressable
                    accessibilityRole="button"
                    disabled={saving}
                    onPress={() => setTimePicker('horaCierre')}
                    className="w-full flex-row items-center justify-between rounded-xl border border-border bg-surface2 px-4 py-3"
                  >
                    <Text className="text-sm text-text">{form.horaCierre}</Text>
                    <Clock size={16} color={tokens.accent} />
                  </Pressable>
                </View>
              </View>

              {/* Días disponibles */}
              <View className="flex-col gap-1.5">
                <FieldLabel>Días Disponibles *</FieldLabel>
                <TextInput
                  value={form.diasDisponibles}
                  onChangeText={(diasDisponibles) =>
                    setForm((prev) => ({ ...prev, diasDisponibles }))
                  }
                  placeholder="Ej: Lunes a Viernes, Sábados y Domingos"
                  placeholderTextColor={tokens.textMuted}
                  editable={!saving}
                  className="w-full rounded-xl border border-border bg-surface2 px-4 py-3 text-sm text-text"
                />
              </View>

              {/* Requiere depósito toggle */}
              <Toggle
                label="Requiere depósito"
                value={form.requiereDeposito}
                onToggle={() =>
                  setForm((prev) => ({
                    ...prev,
                    requiereDeposito: !prev.requiereDeposito,
                  }))
                }
              />

              {/* Depósito monto (only if toggle on) */}
              {form.requiereDeposito ? (
                <View className="flex-col gap-1.5">
                  <FieldLabel>Monto del Depósito (COP)</FieldLabel>
                  <TextInput
                    value={form.depositoMonto}
                    onChangeText={(depositoMonto) =>
                      setForm((prev) => ({ ...prev, depositoMonto }))
                    }
                    placeholder="Ej: 50000"
                    placeholderTextColor={tokens.textMuted}
                    keyboardType="number-pad"
                    editable={!saving}
                    className="w-full rounded-xl border border-border bg-surface2 px-4 py-3 text-sm text-text"
                  />
                  {form.depositoMonto ? (
                    <Text className="text-[10px] text-text" style={{ opacity: 0.5 }}>
                      ≈ {formatCOP(form.depositoMonto)}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {/* Activa toggle */}
              <Toggle
                label="Área activa"
                value={form.activa}
                onToggle={() => setForm((prev) => ({ ...prev, activa: !prev.activa }))}
              />

              {/* Submit */}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: saving || !canSubmit, busy: saving }}
                disabled={saving || !canSubmit}
                onPress={onSubmit}
                style={({ pressed }) => ({
                  opacity: saving || !canSubmit ? 0.5 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                  backgroundColor: tokens.success,
                  shadowColor: tokens.success,
                  shadowOpacity: 0.3,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 6 },
                  elevation: 6,
                  marginTop: 8,
                })}
                className="w-full flex-row items-center justify-center gap-2 rounded-full py-3.5"
              >
                {saving ? (
                  <>
                    <ActivityIndicator size="small" color={tokens.onAccent} />
                    <Text className="text-sm font-bold" style={{ color: tokens.onAccent }}>
                      Guardando...
                    </Text>
                  </>
                ) : (
                  <Text className="text-sm font-bold" style={{ color: tokens.onAccent }}>
                    {submitLabel}
                  </Text>
                )}
              </Pressable>
            </ScrollView>
          </Animated.View>
        ) : null}

        {/* Inline HH:MM picker (replacement for the web `<input type="time">`).
            Rendered inside this modal's root so no nested RN Modal is needed. */}
        {timePicker ? (
          <View className="absolute inset-0 justify-end">
            <Pressable
              onPress={() => setTimePicker(null)}
              className="absolute inset-0 bg-black/70"
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
            />
            <Animated.View
              entering={SlideInDown.duration(250)}
              className="overflow-hidden rounded-t-[32px] border-t bg-primary"
              style={{
                paddingBottom: insets.bottom + 16,
                borderTopColor: fadeToken(tokens.border, 0.4),
              }}
            >
              <View className="flex-row items-center justify-between px-6 pb-2 pt-5">
                <Text className="text-lg font-bold text-text">
                  {timePicker === 'horaApertura' ? 'Hora Apertura' : 'Hora Cierre'}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar"
                  onPress={() => setTimePicker(null)}
                  className="h-10 w-10 items-center justify-center rounded-full border border-border bg-surface2"
                >
                  <X size={20} color={tokens.text} />
                </Pressable>
              </View>

              <View className="flex-row gap-3 px-6 pb-4" style={{ height: 260 }}>
                <ScrollView
                  className="flex-1 rounded-xl border border-border bg-surface2"
                  showsVerticalScrollIndicator={false}
                >
                  {HOURS.map((h) => {
                    const active = h === pickHour;
                    return (
                      <Pressable
                        key={h}
                        accessibilityRole="button"
                        onPress={() => applyTimePart(timePicker, 'hour', h)}
                        className={`items-center py-3 ${active ? 'bg-accent/20' : ''}`}
                      >
                        <Text
                          className={`text-sm ${
                            active ? 'font-bold text-accent' : 'text-text'
                          }`}
                        >
                          {h}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <ScrollView
                  className="flex-1 rounded-xl border border-border bg-surface2"
                  showsVerticalScrollIndicator={false}
                >
                  {MINUTES.map((m) => {
                    const active = m === pickMinute;
                    return (
                      <Pressable
                        key={m}
                        accessibilityRole="button"
                        onPress={() => applyTimePart(timePicker, 'minute', m)}
                        className={`items-center py-3 ${active ? 'bg-accent/20' : ''}`}
                      >
                        <Text
                          className={`text-sm ${
                            active ? 'font-bold text-accent' : 'text-text'
                          }`}
                        >
                          {m}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </Animated.View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Delete confirmation modal
// ---------------------------------------------------------------------------

function DeleteAreaModal({
  area,
  deleting,
  onCancel,
  onConfirm,
}: {
  area: AreaComunDto | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const tokens = tokensFor(theme);

  return (
    <Modal
      visible={area !== null}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View className="flex-1 justify-end">
        <Pressable
          onPress={onCancel}
          className="absolute inset-0 bg-black/80"
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
        />

        {area ? (
          <Animated.View
            entering={SlideInDown.duration(300)}
            className="overflow-hidden rounded-t-[32px] border-t bg-primary"
            style={{
              paddingBottom: insets.bottom + 24,
              borderTopColor: fadeToken(tokens.border, 0.4),
            }}
          >
            <View className="flex-col items-center gap-4 px-8 pt-8">
              <View className="h-16 w-16 items-center justify-center rounded-full border border-danger/40 bg-danger/15">
                <Trash2 size={28} color={tokens.danger} />
              </View>
              <View className="flex-col items-center gap-1">
                <Text className="text-[10px] font-bold uppercase tracking-[2px] text-accent">
                  Eliminar Área
                </Text>
                <Text className="font-display text-2xl font-bold text-text">
                  ¿Estás seguro?
                </Text>
              </View>
              <Text className="text-center text-sm leading-relaxed text-text/80">
                Esta acción no se puede deshacer. Se eliminará el área{' '}
                <Text className="font-bold text-text">{area.nombre}</Text> y no podrá ser
                recuperada.
              </Text>
              <View className="mt-2 w-full flex-row gap-3">
                <Pressable
                  accessibilityRole="button"
                  onPress={onCancel}
                  style={({ pressed }) => ({
                    transform: [{ scale: pressed ? 0.95 : 1 }],
                    borderColor: fadeToken(tokens.border, 0.5),
                  })}
                  className="flex-1 items-center rounded-2xl border bg-text/5 py-4"
                >
                  <Text className="text-sm font-bold text-text">Cancelar</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: deleting, busy: deleting }}
                  disabled={deleting}
                  onPress={onConfirm}
                  style={({ pressed }) => ({
                    opacity: deleting ? 0.6 : 1,
                    transform: [{ scale: pressed ? 0.95 : 1 }],
                    backgroundColor: tokens.danger,
                    shadowColor: tokens.danger,
                    shadowOpacity: 0.2,
                    shadowRadius: 16,
                    shadowOffset: { width: 0, height: 8 },
                    elevation: 6,
                  })}
                  className="flex-1 items-center rounded-2xl py-4"
                >
                  <Text className="text-sm font-bold" style={{ color: tokens.onAccent }}>
                    {deleting ? 'Eliminando...' : 'Eliminar'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}
