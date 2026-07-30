/**
 * RESERVAS — ConjuntOS (native port)
 *
 * Reserva de zonas comunes. Browse bookable common areas, pick an available
 * day + time slot, optionally pay a deposit, confirm. Ported from the web
 * `src/app/(app)/reservas/page.tsx`, preserving the 4-step state machine
 * (GRID -> BOOKING -> PAYMENT -> SUCCESS), the client-side slot computation,
 * the "Mis Reservas" list with its QR / Editar / Anular actions, realtime
 * refetch on WS `reserva`, payments gated OFF, and the Spanish copy.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInDown,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useColorScheme } from 'nativewind';
import QRCode from 'react-native-qrcode-svg';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Edit2,
  MapPin,
  QrCode,
  Search,
  SlidersHorizontal,
  Trash2,
  Users,
  X,
} from 'lucide-react-native';

import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api, ApiError } from '@/lib/api/client';
import { PAYMENTS_ENABLED, PAYMENTS_DISABLED_MSG } from '@/lib/flags';
import { textGlow, tokensFor } from '@/theme/tokens';
import type {
  AreaComunDto,
  CreateReservaRequest,
  ReservaDto,
  SlotDto,
} from '@/lib/api/types';

/* eslint-disable @typescript-eslint/no-require-imports --
   Metro asset modules have no TS declarations, so `require()` is the only way to
   reference a bundled image (same pattern as app/(app)/perfil.tsx:209). */

/** Mirrors web's bundled `/placeholder.svg` fallback (page.tsx:508,548). */
const PLACEHOLDER_IMG = require('../../assets/images/placeholder.png') as number;

/** Web `font-display font-medium` — the Plus Jakarta Sans 500 face. The
 *  `font-display` alias resolves to the 700 face, so the medium weight needs
 *  the family named explicitly. */
const DISPLAY_MEDIUM = 'PlusJakartaSans_500Medium';

/** Web slot-chip day labels are a hardcoded ASCII array (page.tsx:603) — NOT
 *  `toLocaleString`, which yields "MIÉ." / "SÁB." under Hermes' ICU. */
const DOW_SHORT = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'] as const;

type Step = 'GRID' | 'BOOKING' | 'PAYMENT' | 'SUCCESS';

interface TimeSlot {
  start: Date;
  end: Date;
  available: boolean;
}

/** Ported verbatim from web page.tsx:119-123 — three alias families. */
const DAY_MAP: Record<string, number> = {
  DOM: 0, LUN: 1, MAR: 2, MIE: 3, JUE: 4, VIE: 5, SAB: 6,
  DOMINGO: 0, LUNES: 1, MARTES: 2, MIERCOLES: 3, JUEVES: 4, VIERNES: 5, SABADO: 6,
  SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6,
};

/** Ported verbatim from web page.tsx:125-141. Falls back to all 7 days both
 *  when `raw` is empty and when nothing parses, so a free-text value like
 *  "Lunes a Domingo" can never produce a permanently empty sheet. */
function parseDiasDisponibles(raw: string): number[] {
  if (!raw) return [0, 1, 2, 3, 4, 5, 6];
  const parts = raw.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
  const days = new Set<number>();
  for (const p of parts) {
    // Try direct code match (DOM, LUN, etc.)
    if (DAY_MAP[p] !== undefined) {
      days.add(DAY_MAP[p]);
      continue;
    }
    // Try numeric (0-6)
    const n = parseInt(p, 10);
    if (!isNaN(n) && n >= 0 && n <= 6) {
      days.add(n);
      continue;
    }
    // Try substring match (e.g. "Lunes" inside "Lunes a Domingo")
    for (const [key, val] of Object.entries(DAY_MAP)) {
      if (p.includes(key)) {
        days.add(val);
        break;
      }
    }
  }
  return days.size > 0 ? Array.from(days) : [0, 1, 2, 3, 4, 5, 6];
}

/** ≤5 bookable days inside a 15-day window (web page.tsx:149-159). */
function buildAvailableDays(diasDisponibles: string): Date[] {
  const allowedDays = parseDiasDisponibles(diasDisponibles || '');
  const days: Date[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  for (let i = 0; i < 15 && days.length < 5; i++) {
    const cd = new Date(d);
    cd.setDate(d.getDate() + i);
    if (allowedDays.includes(cd.getDay())) {
      days.push(cd);
    }
  }
  return days;
}

/** Deposit as a number (money is a string off the wire). */
function depositOf(area: AreaComunDto | null): number {
  if (!area) return 0;
  return parseFloat(area.depositoMonto ?? '0') || 0;
}

/** "Gratis" vs "$amount" badge text. */
function priceLabel(area: AreaComunDto): string {
  const dep = depositOf(area);
  if (!area.requiereDeposito || dep === 0) return 'Gratis';
  return `$${dep.toLocaleString()}`;
}

/** Web renders its loading / gateway spinners as an `animate-pulse bg-text/10`
 *  circle (page.tsx:405,626), not a platform ActivityIndicator. */
function PulseCircle({ size }: { size: number }) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.35, { duration: 1000 }), -1, true);
    return () => cancelAnimation(opacity);
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      className="bg-text/10"
      style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
    />
  );
}

export default function ReservasScreen() {
  const userId = useAuth((s) => s.user?.id);
  const { height: windowHeight } = useWindowDimensions();
  // Web caps the sheets with `max-h-[95vh]` / `max-h-[90vh]` (page.tsx:540,703).
  // A PERCENT maxHeight cannot be used here: LiquidGlass forwards `style` to its
  // inner content View, whose parent has an auto height, so Yoga discards the
  // percentage and the sheet grows past the screen (submit button unreachable).
  const bookingSheetMaxHeight = Math.round(windowHeight * 0.95);
  const editSheetMaxHeight = Math.round(windowHeight * 0.9);
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  const t = tokensFor(scheme);
  const glow = textGlow[scheme];

  const [areas, setAreas] = useState<AreaComunDto[]>([]);
  const [reservas, setReservas] = useState<ReservaDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedArea, setSelectedArea] = useState<AreaComunDto | null>(null);
  const [step, setStep] = useState<Step>('GRID');
  const [searchFocused, setSearchFocused] = useState(false);

  // Booking configurator state.
  const [availableDays, setAvailableDays] = useState<Date[]>([]);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [reservaId, setReservaId] = useState('');

  // QR modal for an existing reservation.
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrReservaId, setQrReservaId] = useState('');
  const [qrReservaNombre, setQrReservaNombre] = useState('');
  const [qrReservaInicio, setQrReservaInicio] = useState('');
  const [qrReservaFin, setQrReservaFin] = useState('');
  const [qrReservaEstado, setQrReservaEstado] = useState('');

  // Edit-reservation sheet.
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingReserva, setEditingReserva] = useState<ReservaDto | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editAvailableDays, setEditAvailableDays] = useState<Date[]>([]);
  const [editSelectedDay, setEditSelectedDay] = useState<Date | null>(null);
  const [editTimeSlots, setEditTimeSlots] = useState<TimeSlot[]>([]);
  const [editSelectedSlotIndex, setEditSelectedSlotIndex] = useState<number | null>(null);

  const refetchAll = useCallback(() => {
    return Promise.all([
      api
        .get<AreaComunDto[]>('/areas-comunes')
        .then((data) => setAreas(data ?? []))
        .catch(() => {}),
      api
        .get<ReservaDto[]>('/reservas')
        .then((data) => setReservas(data ?? []))
        .catch(() => {}),
    ]);
  }, []);

  // Realtime: another resident's booking changes both slot availability AND
  // this user's list — web refetches both legs (page.tsx:85-90).
  useWsSubscription('reserva', () => {
    void refetchAll();
  });

  // Initial load (keyed on userId, mirroring web).
  useEffect(() => {
    let cancelled = false;
    async function loadAreas() {
      try {
        const [areasData, reservasData] = await Promise.all([
          api.get<AreaComunDto[]>('/areas-comunes'),
          api.get<ReservaDto[]>('/reservas').catch(() => [] as ReservaDto[]),
        ]);
        if (!cancelled) {
          setAreas(areasData ?? []);
          setReservas(reservasData ?? []);
        }
      } catch (e) {
        console.error('Error loading areas', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadAreas();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleSelectArea = (area: AreaComunDto) => {
    setSelectedArea(area);
    const days = buildAvailableDays(area.diasDisponibles);
    setAvailableDays(days);
    setSelectedDay(days.length > 0 ? days[0] : null);
    setSelectedSlotIndex(null);
    setStep('BOOKING');
  };

  const loadSlotsForDay = useCallback(async (area: AreaComunDto, day: Date) => {
    try {
      const yyyy = day.getFullYear();
      const mm = String(day.getMonth() + 1).padStart(2, '0');
      const dd = String(day.getDate()).padStart(2, '0');
      const ds = `${yyyy}-${mm}-${dd}`;

      const blocked = await api.get<SlotDto[]>(
        `/areas-comunes/${area.id}/slots?fecha=${ds}`,
      );

      const startH = parseInt(area.horaApertura.split(':')[0]);
      const startM = parseInt(area.horaApertura.split(':')[1]);
      const endH = parseInt(area.horaCierre.split(':')[0]);
      const endM = parseInt(area.horaCierre.split(':')[1]);
      const dur = parseInt(String(area.duracionSlot)) || 60; // mins

      const dayStart = new Date(day);
      dayStart.setHours(startH, startM, 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setHours(endH, endM, 0, 0);

      const slots: TimeSlot[] = [];
      let curr = new Date(dayStart);
      while (curr < dayEnd) {
        const slotEnd = new Date(curr.getTime() + dur * 60000);
        if (slotEnd > dayEnd) break;

        let isBlocked = false;
        for (const b of blocked ?? []) {
          const bStart = new Date(b.fechaInicio);
          const bEnd = new Date(b.fechaFin);
          if (curr < bEnd && slotEnd > bStart) {
            isBlocked = true;
            break;
          }
        }
        // Past slots (relevant when day === today) are unavailable.
        if (curr < new Date()) isBlocked = true;

        slots.push({ start: new Date(curr), end: new Date(slotEnd), available: !isBlocked });
        curr = slotEnd;
      }

      setTimeSlots(slots);
      setSelectedSlotIndex(null);
    } catch {
      console.error('Error loading slots for day');
    }
  }, []);

  useEffect(() => {
    if (selectedArea && selectedDay) {
      void loadSlotsForDay(selectedArea, selectedDay);
    }
  }, [selectedDay, selectedArea, loadSlotsForDay]);

  const resetState = useCallback(() => {
    setStep('GRID');
    setSelectedArea(null);
    setSelectedDay(null);
    setAvailableDays([]);
    setTimeSlots([]);
    setSelectedSlotIndex(null);
    setIsProcessing(false);
    setReservaId('');
    void refetchAll();
  }, [refetchAll]);

  const proceedToBook = async () => {
    if (selectedSlotIndex === null) return;

    if (selectedArea?.requiereDeposito && depositOf(selectedArea) > 0) {
      // Payments gated OFF — keep the disabled toast.
      if (!PAYMENTS_ENABLED) {
        toast.error(PAYMENTS_DISABLED_MSG);
        return;
      }
      setStep('PAYMENT');
    } else {
      await executeBooking();
    }
  };

  const executeBooking = async () => {
    if (selectedSlotIndex === null) return;
    const slot = timeSlots[selectedSlotIndex];
    setIsProcessing(true);
    try {
      const body: CreateReservaRequest = {
        areaId: selectedArea?.id ?? '',
        fechaInicio: slot.start.toISOString(),
        fechaFin: slot.end.toISOString(),
      };
      const res = await api.post<{ id: string }>('/reservas', body);
      setReservaId(res?.id ?? '');
      setStep('SUCCESS');
    } catch {
      toast.error('Error de conexion');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelarReserva = (id: string) => {
    // Native stand-in for web's `window.confirm` (page.tsx:262).
    Alert.alert('¿Seguro que quieres cancelar esta reserva?', undefined, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Anular',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.put(`/reservas/${id}/cancelar`, {});
            setReservas((prev) => prev.filter((r) => r.id !== id));
            toast.success('Reserva cancelada');
          } catch {
            toast.error('No se pudo cancelar la reserva');
          }
        },
      },
    ]);
  };

  const openEditModal = (r: ReservaDto) => {
    setEditingReserva(r);

    // Find the area from our list to get its config.
    const area = areas.find((a) => a.id === r.areaId);
    if (!area) {
      toast.error('Área no encontrada');
      return;
    }

    const days = buildAvailableDays(area.diasDisponibles);
    setEditAvailableDays(days);

    // Pre-select the day of the current reservation.
    const reservaDate = new Date(r.fechaInicio);
    reservaDate.setHours(0, 0, 0, 0);
    const matchingDay = days.find(
      (day) =>
        day.getDate() === reservaDate.getDate() &&
        day.getMonth() === reservaDate.getMonth() &&
        day.getFullYear() === reservaDate.getFullYear(),
    );
    setEditSelectedDay(matchingDay ?? days[0] ?? null);
    setEditTimeSlots([]);
    setEditSelectedSlotIndex(null);
    setShowEditModal(true);
  };

  const editDayKey = editSelectedDay ? editSelectedDay.toISOString().slice(0, 10) : '';
  const editingReservaId = editingReserva?.id;
  const editingInicio = editingReserva?.fechaInicio;
  const editingFin = editingReserva?.fechaFin;
  const editingAreaId = editingReserva?.areaId;

  // Load slots when the edit day changes.
  useEffect(() => {
    if (!showEditModal || !editingReservaId || !editSelectedDay || !editingInicio || !editingFin) {
      return;
    }

    const area = areas.find((a) => a.id === editingAreaId);
    if (!area) return;

    let cancelled = false;
    (async () => {
      try {
        const yyyy = editSelectedDay.getFullYear();
        const mm = String(editSelectedDay.getMonth() + 1).padStart(2, '0');
        const dd = String(editSelectedDay.getDate()).padStart(2, '0');
        const ds = `${yyyy}-${mm}-${dd}`;

        const blocked = await api.get<SlotDto[]>(
          `/areas-comunes/${area.id}/slots?fecha=${ds}`,
        );

        const startH = parseInt(area.horaApertura.split(':')[0]);
        const startM = parseInt(area.horaApertura.split(':')[1]);
        const endH = parseInt(area.horaCierre.split(':')[0]);
        const endM = parseInt(area.horaCierre.split(':')[1]);
        const dur = parseInt(String(area.duracionSlot)) || 60;

        const dayStart = new Date(editSelectedDay);
        dayStart.setHours(startH, startM, 0, 0);
        const dayEnd = new Date(editSelectedDay);
        dayEnd.setHours(endH, endM, 0, 0);

        const reservaInicioMs = new Date(editingInicio).getTime();
        const reservaFinMs = new Date(editingFin).getTime();

        const slots: TimeSlot[] = [];
        let curr = new Date(dayStart);
        while (curr < dayEnd) {
          const slotEnd = new Date(curr.getTime() + dur * 60000);
          if (slotEnd > dayEnd) break;

          let isBlocked = false;
          for (const b of blocked ?? []) {
            const bStart = new Date(b.fechaInicio);
            const bEnd = new Date(b.fechaFin);
            // Exclude the current reservation being edited from blocked list.
            if (reservaInicioMs === bStart.getTime() && reservaFinMs === bEnd.getTime()) continue;
            if (curr < bEnd && slotEnd > bStart) {
              isBlocked = true;
              break;
            }
          }

          if (curr < new Date()) isBlocked = true;

          slots.push({ start: new Date(curr), end: new Date(slotEnd), available: !isBlocked });
          curr = slotEnd;
        }

        if (cancelled) return;
        setEditTimeSlots(slots);

        // Pre-select the slot matching the current reservation.
        const matchIdx = slots.findIndex(
          (s) => s.start.getTime() === reservaInicioMs && s.end.getTime() === reservaFinMs,
        );
        setEditSelectedSlotIndex(matchIdx >= 0 ? matchIdx : null);
      } catch {
        console.error('Error loading edit slots');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEditModal, editingReservaId, editDayKey]);

  const handleEditarReserva = async () => {
    if (!editingReserva || editSelectedSlotIndex === null) return;
    const slot = editTimeSlots[editSelectedSlotIndex];
    setEditSaving(true);
    try {
      const updated = await api.put<ReservaDto>(`/reservas/${editingReserva.id}/editar`, {
        fechaInicio: slot.start.toISOString(),
        fechaFin: slot.end.toISOString(),
      });
      setReservas((prev) =>
        prev.map((r) =>
          r.id === editingReserva.id
            ? { ...r, fechaInicio: updated.fechaInicio, fechaFin: updated.fechaFin }
            : r,
        ),
      );
      setShowEditModal(false);
      toast.success('Reserva actualizada');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast.error('Ese horario ya está reservado. Elige otro.');
      } else {
        toast.error('No se pudo actualizar la reserva');
      }
    } finally {
      setEditSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen scroll={false} className="bg-primary">
        <View className="flex-1 items-center justify-center">
          <PulseCircle size={32} />
        </View>
      </Screen>
    );
  }

  return (
    <View className="flex-1 bg-primary">
      <Screen className="bg-primary">
        <View className="gap-10 px-6 pt-4">
          <ProfileHeader />

          {/* Search + filter — visual only (not wired), matching web. */}
          <View className="flex-row gap-3">
            <View className="relative flex-1">
              <View className="absolute left-5 top-0 bottom-0 z-10 justify-center">
                <Search size={18} color={searchFocused ? t.accent : t.text} />
              </View>
              <TextInput
                placeholder="Buscar servicios..."
                placeholderTextColor={t.textMuted}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                className="rounded-[24px] border bg-text/5 py-4 pl-14 pr-6 text-sm text-text"
                style={{ borderColor: searchFocused ? `${t.accent}66` : t.border }}
              />
            </View>
            <Pressable
              className="h-14 w-14 items-center justify-center rounded-[22px] border border-border bg-primary-light"
              style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.95 : 1 }] })}
            >
              <SlidersHorizontal size={20} color={t.text} />
            </Pressable>
          </View>

          <View className="-mt-4 mb-2 flex-col gap-2">
            <Text className="font-display text-3xl font-bold tracking-tight text-text">
              Reservas
            </Text>
            <Text className="text-[10px] font-bold uppercase tracking-[3px] text-text">
              Zonas Comunes del Conjunto
            </Text>
          </View>

          {/* Mis Reservas */}
          {reservas.length > 0 ? (
            <View className="gap-3">
              <Text className="px-1 text-xs font-bold uppercase tracking-[3px] text-accent">
                Mis Reservas
              </Text>
              {reservas.map((r) => {
                const ahora = new Date();
                const inicio = new Date(r.fechaInicio);
                const fin = new Date(r.fechaFin);
                const isActive = r.estado !== 'CANCELADA' && fin > ahora;
                const canEdit =
                  (r.estado === 'CONFIRMADA' || r.estado === 'PENDIENTE') && fin > ahora;
                return (
                  <LiquidGlass
                    key={r.id}
                    radius={16}
                    className={isActive ? '' : 'opacity-60'}
                    style={{ padding: 16 }}
                  >
                    <View className="flex-row items-center gap-3">
                      <View className="h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-accent/20">
                        {r.areaImagenUrl ? (
                          <Image
                            source={{ uri: r.areaImagenUrl }}
                            style={{ width: '100%', height: '100%', borderRadius: 12 }}
                            contentFit="cover"
                          />
                        ) : (
                          <Calendar size={18} color={t.accent} />
                        )}
                      </View>
                      <View className="min-w-0 flex-1">
                        <Text numberOfLines={1} className="text-sm font-bold text-text">
                          {r.areaNombre}
                        </Text>
                        <Text className="text-[10px] text-text/60">
                          {inicio.toLocaleDateString('es-CO', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                          })}
                          {' · '}
                          {inicio.toLocaleTimeString('es-CO', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {' → '}
                          {fin.toLocaleTimeString('es-CO', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                      </View>
                      <View
                        className={`shrink-0 rounded-full px-2 py-0.5 ${
                          r.estado === 'CONFIRMADA'
                            ? 'bg-success/20'
                            : r.estado === 'PENDIENTE'
                              ? 'bg-warning/20'
                              : r.estado === 'CANCELADA'
                                ? 'bg-danger/20'
                                : 'bg-text/10'
                        }`}
                      >
                        <Text
                          className={`text-[9px] font-bold uppercase ${
                            r.estado === 'CONFIRMADA'
                              ? 'text-success'
                              : r.estado === 'PENDIENTE'
                                ? 'text-warning'
                                : r.estado === 'CANCELADA'
                                  ? 'text-danger'
                                  : 'text-text/60'
                          }`}
                        >
                          {r.estado === 'CONFIRMADA'
                            ? 'Activa'
                            : r.estado === 'PENDIENTE'
                              ? 'Pendiente'
                              : r.estado}
                        </Text>
                      </View>
                    </View>

                    <View className="mt-3 flex-row items-center justify-end gap-2">
                      <Pressable
                        onPress={() => {
                          setQrReservaId(r.id);
                          setQrReservaNombre(r.areaNombre);
                          setQrReservaInicio(r.fechaInicio);
                          setQrReservaFin(r.fechaFin);
                          setQrReservaEstado(r.estado);
                          setShowQrModal(true);
                        }}
                        className="flex-row items-center gap-1.5 rounded-xl bg-accent/10 px-3 py-1.5"
                      >
                        <QrCode size={12} color={t.accent} />
                        <Text className="text-[10px] font-bold uppercase tracking-wider text-accent">
                          QR
                        </Text>
                      </Pressable>
                      {canEdit ? (
                        <Pressable
                          onPress={() => openEditModal(r)}
                          className="flex-row items-center gap-1.5 rounded-xl bg-text/5 px-3 py-1.5"
                        >
                          {/* web `text-text/70` covers the glyph too (page.tsx:482). */}
                          <Edit2 size={12} color={`${t.text}B3`} />
                          <Text className="text-[10px] font-bold uppercase tracking-wider text-text/70">
                            Editar
                          </Text>
                        </Pressable>
                      ) : null}
                      {canEdit ? (
                        <Pressable
                          onPress={() => handleCancelarReserva(r.id)}
                          className="flex-row items-center gap-1.5 rounded-xl bg-danger/10 px-3 py-1.5"
                        >
                          <Trash2 size={12} color={t.danger} />
                          <Text className="text-[10px] font-bold uppercase tracking-wider text-danger">
                            Anular
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </LiquidGlass>
                );
              })}
            </View>
          ) : null}

          {/* GRID */}
          <View className="flex-col gap-6">
            {areas.length === 0 ? (
              <Text className="py-10 text-center text-text">
                No hay áreas activas registradas.
              </Text>
            ) : null}

            {areas.map((area, idx) => (
              <Animated.View key={area.id} entering={FadeInDown.delay(idx * 80).duration(500)}>
                <Pressable
                  onPress={() => handleSelectArea(area)}
                  style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}
                >
                  <LiquidGlass variant="card" radius={32} className="overflow-hidden border border-border">
                    {/* Cover */}
                    <View className="relative h-60 w-full overflow-hidden">
                      <Image
                        source={area.imagenUrl ? { uri: area.imagenUrl } : PLACEHOLDER_IMG}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                        transition={400}
                      />
                      {/* web `bg-gradient-to-t from-primary/80 via-primary/25
                          to-transparent opacity-80` (page.tsx:509) — bottom-anchored. */}
                      <LinearGradient
                        colors={[`${t.primary}00`, `${t.primary}40`, `${t.primary}CC`]}
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          top: 0,
                          bottom: 0,
                          opacity: 0.8,
                        }}
                      />
                      <View className="absolute right-4 top-4">
                        <LiquidGlass radius={999} className="rounded-full px-4 py-2">
                          <Text className="text-sm font-bold text-text">{priceLabel(area)}</Text>
                        </LiquidGlass>
                      </View>
                    </View>

                    {/* Body */}
                    <View className="p-6">
                      <View className="mb-3 flex-row items-start justify-between">
                        <View className="flex-1 pr-3">
                          <Text
                            className="mb-1 text-xl font-bold leading-tight text-text"
                            style={{ textShadowColor: glow.color, textShadowRadius: glow.radius }}
                          >
                            {area.nombre}
                          </Text>
                          <Text className="text-[10px] font-bold uppercase tracking-wider text-text">
                            {area.horaApertura}-{area.horaCierre}
                          </Text>
                        </View>
                        <View className="h-10 w-10 items-center justify-center rounded-full border border-accent/30 bg-accent/20">
                          <MapPin size={18} color={t.accent} />
                        </View>
                      </View>

                      {area.descripcion ? (
                        <Text numberOfLines={2} className="mb-6 text-xs leading-relaxed text-text">
                          {area.descripcion}
                        </Text>
                      ) : (
                        <View className="mb-6" />
                      )}

                      <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center gap-1.5">
                          <Users size={12} color={t.text} />
                          <Text className="text-[10px] font-bold uppercase text-text">
                            {area.capacidadMax} Max
                          </Text>
                        </View>
                        <View className="flex-row items-center gap-2">
                          <Text className="text-[11px] font-bold uppercase tracking-[2px] text-accent">
                            Reservar
                          </Text>
                          <ArrowRight size={14} color={t.accent} />
                        </View>
                      </View>
                    </View>
                  </LiquidGlass>
                </Pressable>
              </Animated.View>
            ))}
          </View>
        </View>
      </Screen>

      {/* BOOKING bottom-sheet (Modal slide-up) */}
      <Modal
        visible={step === 'BOOKING' && !!selectedArea}
        transparent
        animationType="slide"
        onRequestClose={() => setStep('GRID')}
      >
        {selectedArea ? (
          <View className="flex-1 justify-end">
            {/* web backdrop is a raw `bg-black/80` (page.tsx:539). */}
            <Pressable className="absolute inset-0 bg-black/80" onPress={() => setStep('GRID')} />
            <LiquidGlass radius={40} className="rounded-t-[40px] border-t border-border">
              <ScrollView
                showsVerticalScrollIndicator={false}
                style={{ maxHeight: bookingSheetMaxHeight }}
                contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
              >
                <View className="mb-6 flex-row items-center justify-between">
                  <Text
                    className="text-2xl font-medium tracking-tight text-text"
                    style={{ fontFamily: DISPLAY_MEDIUM }}
                  >
                    Tu Reserva
                  </Text>
                  <Pressable
                    onPress={() => setStep('GRID')}
                    className="h-10 w-10 items-center justify-center rounded-full bg-text/5"
                  >
                    <X size={20} color={t.text} />
                  </Pressable>
                </View>

                {/* Area summary */}
                <View className="mb-6 flex-row items-center gap-4 rounded-[24px] border border-border bg-text/5 p-3">
                  <View className="h-16 w-16 overflow-hidden rounded-2xl">
                    <Image
                      source={selectedArea.imagenUrl ? { uri: selectedArea.imagenUrl } : PLACEHOLDER_IMG}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="mb-1 text-base font-bold text-text">{selectedArea.nombre}</Text>
                    <Text className="text-xs font-bold uppercase tracking-[2px] text-accent">
                      {!selectedArea.requiereDeposito
                        ? 'Gratis'
                        : `Depósito: $${depositOf(selectedArea).toLocaleString()}`}
                    </Text>
                  </View>
                </View>

                {/* Day selector */}
                <View className="mb-6 flex-col gap-3">
                  <Text className="ml-1 text-[10px] font-bold uppercase tracking-[3px] text-text">
                    Selecciona el Día
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, paddingHorizontal: 4, paddingBottom: 8 }}
                  >
                    {availableDays.map((date, dIdx) => {
                      const isSelected =
                        selectedDay?.getDate() === date.getDate() &&
                        selectedDay?.getMonth() === date.getMonth();
                      const mos = date.toLocaleString('es-ES', { month: 'short' });
                      const dow = date.toLocaleString('es-ES', { weekday: 'short' });
                      return (
                        <Pressable
                          key={dIdx}
                          onPress={() => setSelectedDay(date)}
                          className={`min-w-[70px] items-center gap-1 rounded-2xl border py-3 ${
                            isSelected
                              ? 'border-accent bg-accent'
                              : 'border-border bg-text/5'
                          }`}
                          style={
                            isSelected
                              ? {
                                  shadowColor: t.accent,
                                  shadowOpacity: 0.2,
                                  shadowRadius: 8,
                                  shadowOffset: { width: 0, height: 4 },
                                  elevation: 6,
                                }
                              : undefined
                          }
                        >
                          <Text
                            className={`text-[10px] font-medium uppercase tracking-[2px] ${
                              isSelected ? 'text-on-accent' : 'text-text'
                            }`}
                          >
                            {dow}
                          </Text>
                          <Text
                            className={`font-display text-xl font-bold ${
                              isSelected ? 'text-on-accent' : 'text-text'
                            }`}
                          >
                            {date.getDate()}
                          </Text>
                          <Text
                            className={`text-[9px] font-bold uppercase ${
                              isSelected ? 'text-on-accent' : 'text-text'
                            }`}
                          >
                            {mos}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Time-slot selector */}
                <View className="mb-8 flex-col gap-3">
                  <Text className="ml-1 text-[10px] font-bold uppercase tracking-[3px] text-text">
                    Horario ({selectedArea.duracionSlot} min)
                  </Text>
                  <View className="flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
                    {timeSlots.length === 0 ? (
                      <Text className="w-full py-4 text-center text-xs text-text">
                        No hay horarios disponibles.
                      </Text>
                    ) : null}
                    {timeSlots.map((slot, index) => {
                      const st = slot.start.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      const ed = slot.end.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      const isSel = selectedSlotIndex === index;
                      return (
                        <View key={index} style={{ width: '50%', padding: 4 }}>
                          <Pressable
                            disabled={!slot.available}
                            onPress={() => setSelectedSlotIndex(index)}
                            className={`items-center justify-center gap-0.5 rounded-xl border px-2 py-3 ${
                              !slot.available
                                ? 'border-transparent bg-text/5 opacity-30'
                                : isSel
                                  ? 'border-accent bg-accent'
                                  : 'border-border bg-text/5'
                            }`}
                            style={
                              isSel && slot.available
                                ? {
                                    shadowColor: t.accent,
                                    shadowOpacity: 0.2,
                                    shadowRadius: 8,
                                    shadowOffset: { width: 0, height: 4 },
                                    elevation: 6,
                                  }
                                : undefined
                            }
                          >
                            <Text
                              className={`text-[10px] ${
                                isSel ? 'text-on-accent opacity-50' : 'text-accent/70'
                              }`}
                            >
                              {selectedDay ? DOW_SHORT[selectedDay.getDay()] : ''}{' '}
                              {selectedDay?.getDate()}
                            </Text>
                            <Text
                              className={`text-xs font-bold ${
                                isSel ? 'text-on-accent' : 'text-text'
                              }`}
                            >
                              {st} - {ed}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                </View>

                {/* Confirm */}
                <Pressable
                  disabled={selectedSlotIndex === null || isProcessing}
                  onPress={proceedToBook}
                  className="w-full flex-row items-center justify-center gap-3 rounded-[24px] bg-accent py-5"
                  style={({ pressed }) => ({
                    opacity: selectedSlotIndex === null || isProcessing ? 0.5 : pressed ? 0.9 : 1,
                  })}
                >
                  <Text className="font-bold text-on-accent">
                    {isProcessing
                      ? 'Procesando...'
                      : selectedArea.requiereDeposito
                        ? 'Pagar Depósito'
                        : 'Confirmar Reserva'}
                  </Text>
                  <ArrowRight size={18} color={t.onAccent} />
                </Pressable>
              </ScrollView>
            </LiquidGlass>
          </View>
        ) : (
          <View />
        )}
      </Modal>

      {/* PAYMENT — fake gateway overlay (only reachable when PAYMENTS_ENABLED) */}
      <Modal visible={step === 'PAYMENT'} transparent animationType="fade">
        <View className="flex-1 items-center justify-center bg-primary/95 p-8">
          <PulseCircle size={64} />
          <Text
            className="mt-6 text-2xl font-medium tracking-tight text-text"
            style={{ fontFamily: DISPLAY_MEDIUM }}
          >
            Procesando Pago Seguro...
          </Text>
          <Text className="mt-4 text-xs text-text">Confirmando con pasarela de pago...</Text>
          <Pressable
            onPress={executeBooking}
            disabled={isProcessing}
            className="mt-8 rounded-full border border-accent/20 px-4 py-2"
            style={{ opacity: isProcessing ? 0.5 : 1 }}
          >
            <Text className="text-xs font-bold text-accent">Confirmar Pago</Text>
          </Pressable>
        </View>
      </Modal>

      {/* SUCCESS */}
      <Modal
        visible={step === 'SUCCESS' && !!selectedArea && selectedSlotIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={resetState}
      >
        {selectedArea && selectedSlotIndex !== null ? (
          <View className="flex-1 bg-primary">
            {/* web `bg-gradient-to-br from-primary to-primary-light` (page.tsx:634). */}
            <LinearGradient
              colors={[t.primary, t.primaryLight]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
            />
            <ScrollView
              contentContainerStyle={{
                flexGrow: 1,
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
              }}
            >
              <View
                className="mb-8 h-20 w-20 items-center justify-center rounded-full bg-text/10"
                style={{
                  shadowColor: t.accent,
                  shadowOpacity: 0.28,
                  shadowRadius: 25,
                  shadowOffset: { width: 0, height: 0 },
                  elevation: 12,
                }}
              >
                {/* web hardcodes `className="text-white"` here (page.tsx:635). */}
                <CheckCircle2 size={40} color="#FFFFFF" />
              </View>
              <Text
                className="mb-2 font-display text-3xl font-bold tracking-tight text-text"
                style={{ textShadowColor: glow.color, textShadowRadius: glow.radius }}
              >
                ¡Reserva Confirmada!
              </Text>
              <Text className="mb-10 text-center text-sm text-text">
                Tu espacio ha sido separado exitosamente.
              </Text>

              <LiquidGlass radius={40} className="w-full max-w-[340px] overflow-hidden border border-border" style={{ padding: 32 }}>
                <View className="mb-8 flex-col gap-6">
                  <View className="flex-row items-center gap-4">
                    <View className="h-12 w-12 items-center justify-center rounded-2xl border border-border bg-text/5">
                      <MapPin size={20} color={t.accent} />
                    </View>
                    <View>
                      <Text className="text-[10px] font-bold uppercase tracking-[3px] text-text">
                        Espacio
                      </Text>
                      <Text className="font-bold text-text">{selectedArea.nombre}</Text>
                    </View>
                  </View>
                  <View className="flex-row items-center gap-4">
                    <View className="h-12 w-12 items-center justify-center rounded-2xl border border-border bg-text/5">
                      <Clock size={20} color={t.accent} />
                    </View>
                    <View>
                      <Text className="text-[10px] font-bold uppercase tracking-[3px] text-text">
                        Horario
                      </Text>
                      <Text className="text-sm font-bold text-text">
                        {selectedDay?.toLocaleDateString('es-ES', {
                          month: 'short',
                          day: 'numeric',
                        })}{' '}
                        •{' '}
                        {timeSlots[selectedSlotIndex].start.toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Real reservation QR (web page.tsx:656-660). */}
                <View className="aspect-square w-full items-center justify-center rounded-[32px] border border-border bg-text/5 p-4">
                  {/* web hardcodes `bg-white` — a QR needs a white quiet zone to
                      scan (page.tsx:657). */}
                  <View className="h-full w-full items-center justify-center rounded-[20px] bg-white p-4">
                    {reservaId ? <QRCode value={reservaId} size={180} /> : null}
                  </View>
                </View>
              </LiquidGlass>

              <Pressable onPress={resetState} className="mt-12">
                <Text className="text-[10px] font-bold uppercase tracking-[3px] text-text">
                  Volver a Reservas
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        ) : (
          <View />
        )}
      </Modal>

      {/* QR Modal — existing reservation */}
      <Modal
        visible={showQrModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQrModal(false)}
      >
        <View className="flex-1 items-center justify-center">
          {/* web backdrop is a raw `bg-black/60` (page.tsx:669). */}
          <Pressable className="absolute inset-0 bg-black/60" onPress={() => setShowQrModal(false)} />
          <LiquidGlass
            radius={32}
            className="w-80 border border-border"
            style={{ padding: 24, alignItems: 'center', gap: 12 }}
          >
            <Pressable onPress={() => setShowQrModal(false)} className="self-end">
              <X size={18} color={`${t.text}80`} />
            </Pressable>
            <Text className="text-lg font-bold text-text">{qrReservaNombre}</Text>
            <View
              className={`rounded-full px-3 py-0.5 ${
                qrReservaEstado === 'CONFIRMADA'
                  ? 'bg-success/20'
                  : qrReservaEstado === 'PENDIENTE'
                    ? 'bg-warning/20'
                    : 'bg-danger/20'
              }`}
            >
              <Text
                className={`text-[10px] font-bold uppercase ${
                  qrReservaEstado === 'CONFIRMADA'
                    ? 'text-success'
                    : qrReservaEstado === 'PENDIENTE'
                      ? 'text-warning'
                      : 'text-danger'
                }`}
              >
                {qrReservaEstado === 'CONFIRMADA'
                  ? 'Activa'
                  : qrReservaEstado === 'PENDIENTE'
                    ? 'Pendiente'
                    : qrReservaEstado}
              </Text>
            </View>
            <View className="w-full gap-1.5 px-1">
              <View className="flex-row items-center gap-2">
                <Calendar size={13} color={t.accent} />
                <Text className="text-xs font-bold text-text">
                  {qrReservaInicio
                    ? new Date(qrReservaInicio).toLocaleDateString('es-CO', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })
                    : ''}
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                <Clock size={13} color={t.accent} />
                <Text className="font-mono text-xs text-text">
                  {qrReservaInicio
                    ? new Date(qrReservaInicio).toLocaleTimeString('es-CO', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : ''}{' '}
                  {'→'}{' '}
                  {qrReservaFin
                    ? new Date(qrReservaFin).toLocaleTimeString('es-CO', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : ''}
                </Text>
              </View>
            </View>
            {/* web hardcodes `bg-white` — QR quiet zone (page.tsx:690). */}
            <View className="rounded-2xl bg-white p-3">
              {qrReservaId ? <QRCode value={qrReservaId} size={200} /> : null}
            </View>
            <Text className="text-center text-[10px] text-text/50">
              Presenta este código al ingreso del área
            </Text>
            <Pressable
              onPress={() => setShowQrModal(false)}
              className="mt-1 w-full items-center rounded-xl bg-accent py-3"
            >
              <Text className="text-sm font-bold text-primary">Cerrar</Text>
            </Pressable>
          </LiquidGlass>
        </View>
      </Modal>

      {/* Edit Modal — Slot Picker */}
      <Modal
        visible={showEditModal && !!editingReserva}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEditModal(false)}
      >
        {editingReserva ? (
          <View className="flex-1 justify-end">
            <Pressable
              className="absolute inset-0 bg-black/80"
              onPress={() => setShowEditModal(false)}
            />
            <LiquidGlass radius={40} className="rounded-t-[40px] border-t border-border">
              <ScrollView
                showsVerticalScrollIndicator={false}
                style={{ maxHeight: editSheetMaxHeight }}
                contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
              >
                <View className="mb-4 flex-row items-center justify-between">
                  <Text
                    className="text-2xl font-medium tracking-tight text-text"
                    style={{ fontFamily: DISPLAY_MEDIUM }}
                  >
                    Editar Reserva
                  </Text>
                  <Pressable
                    onPress={() => setShowEditModal(false)}
                    className="h-10 w-10 items-center justify-center rounded-full bg-text/5"
                  >
                    <X size={20} color={t.text} />
                  </Pressable>
                </View>
                <Text className="mb-6 text-xs text-text/60">{editingReserva.areaNombre}</Text>

                {/* Day Selector */}
                <View className="mb-6 flex-col gap-3">
                  <Text className="ml-1 text-[10px] font-bold uppercase tracking-[3px] text-text">
                    Selecciona el Día
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, paddingHorizontal: 4, paddingBottom: 8 }}
                  >
                    {editAvailableDays.map((date, dIdx) => {
                      const isSelected =
                        editSelectedDay?.getDate() === date.getDate() &&
                        editSelectedDay?.getMonth() === date.getMonth();
                      const mos = date.toLocaleString('es-ES', { month: 'short' });
                      const dow = date.toLocaleString('es-ES', { weekday: 'short' });
                      return (
                        <Pressable
                          key={dIdx}
                          onPress={() => setEditSelectedDay(date)}
                          className={`min-w-[70px] items-center gap-1 rounded-2xl border py-3 ${
                            isSelected
                              ? 'border-accent bg-accent'
                              : 'border-border bg-text/5'
                          }`}
                          style={
                            isSelected
                              ? {
                                  shadowColor: t.accent,
                                  shadowOpacity: 0.2,
                                  shadowRadius: 8,
                                  shadowOffset: { width: 0, height: 4 },
                                  elevation: 6,
                                }
                              : undefined
                          }
                        >
                          <Text
                            className={`text-[10px] font-medium uppercase tracking-[2px] ${
                              isSelected ? 'text-on-accent' : 'text-text'
                            }`}
                          >
                            {dow}
                          </Text>
                          <Text
                            className={`font-display text-xl font-bold ${
                              isSelected ? 'text-on-accent' : 'text-text'
                            }`}
                          >
                            {date.getDate()}
                          </Text>
                          <Text
                            className={`text-[9px] font-bold uppercase ${
                              isSelected ? 'text-on-accent' : 'text-text'
                            }`}
                          >
                            {mos}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Time Slot Selector */}
                <View className="mb-6 flex-col gap-3">
                  <Text className="ml-1 text-[10px] font-bold uppercase tracking-[3px] text-text">
                    Horario ({editingReserva.areaNombre})
                  </Text>
                  <View className="flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
                    {editTimeSlots.length === 0 ? (
                      <Text className="w-full py-4 text-center text-xs text-text">
                        No hay horarios disponibles.
                      </Text>
                    ) : null}
                    {editTimeSlots.map((slot, index) => {
                      const st = slot.start.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      const ed = slot.end.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      const isSel = editSelectedSlotIndex === index;
                      const isCurrentSlot =
                        new Date(editingReserva.fechaInicio).getTime() === slot.start.getTime() &&
                        new Date(editingReserva.fechaFin).getTime() === slot.end.getTime();
                      return (
                        <View key={index} style={{ width: '50%', padding: 4 }}>
                          <Pressable
                            disabled={!slot.available}
                            onPress={() => setEditSelectedSlotIndex(index)}
                            className={`items-center justify-center gap-0.5 rounded-xl border px-2 py-3 ${
                              !slot.available
                                ? 'border-transparent bg-text/5 opacity-30'
                                : isSel
                                  ? 'border-accent bg-accent'
                                  : 'border-border bg-text/5'
                            }`}
                            style={
                              isSel && slot.available
                                ? {
                                    shadowColor: t.accent,
                                    shadowOpacity: 0.2,
                                    shadowRadius: 8,
                                    shadowOffset: { width: 0, height: 4 },
                                    elevation: 6,
                                  }
                                : undefined
                            }
                          >
                            <Text
                              className={`text-[10px] ${
                                isSel ? 'text-on-accent opacity-50' : 'text-accent/70'
                              }`}
                            >
                              {editSelectedDay ? DOW_SHORT[editSelectedDay.getDay()] : ''}{' '}
                              {editSelectedDay?.getDate()}
                              {isCurrentSlot ? ' (actual)' : ''}
                            </Text>
                            <Text
                              className={`text-xs font-bold ${
                                isSel ? 'text-on-accent' : 'text-text'
                              }`}
                            >
                              {st} - {ed}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                </View>

                <Pressable
                  onPress={handleEditarReserva}
                  disabled={editSaving || editSelectedSlotIndex === null}
                  className="w-full flex-row items-center justify-center gap-3 rounded-[24px] bg-accent py-5"
                  style={({ pressed }) => ({
                    opacity:
                      editSaving || editSelectedSlotIndex === null ? 0.5 : pressed ? 0.9 : 1,
                  })}
                >
                  <Text className="font-bold text-on-accent">
                    {editSaving ? 'Guardando...' : 'Guardar Cambios'}
                  </Text>
                </Pressable>
              </ScrollView>
            </LiquidGlass>
          </View>
        ) : (
          <View />
        )}
      </Modal>
    </View>
  );
}
