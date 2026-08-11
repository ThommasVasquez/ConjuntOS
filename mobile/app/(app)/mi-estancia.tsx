/**
 * MI ESTANCIA — ConjuntOS (native port)
 *
 * Guest (huésped) home screen. Ported from web `src/app/(app)/mi-estancia/page.tsx`:
 *  - GET /pases-temporales/mi-pase (MiPaseDto, snake_case) — host card, stay dates
 *    + days remaining, permission badges, vehicle list, large access code.
 *  - Fullscreen QR modal rendered LOCALLY via react-native-qrcode-svg (the web
 *    version leaks the code to api.qrserver.com — intentionally NOT replicated).
 *  - "No tienes una estancia activa" empty state on 4xx.
 *  - Permission-scoped ReservaSection (GET /areas-comunes + GET /reservas,
 *    POST /reservas) showing only the gym/pool areas the pass permits, mirroring
 *    the web exclusion-by-name filtering.
 *
 * Surfaces mirror web exactly: every section card is a FLAT
 * `bg-surface-2 rounded-xl border border-border p-4` (page.tsx:80) — no glass,
 * no gradient, no 28px radius — and both modals are flat `bg-primary` panels.
 * Colors come from the tokens only (`tokensFor(theme)` / unprefixed classes),
 * so a single class reads correctly in both schemes.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import type { ComponentType } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';
import QRCode from 'react-native-qrcode-svg';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import {
  Calendar,
  Car,
  Clock,
  DoorOpen,
  Dumbbell,
  MapPin,
  Maximize2,
  Plus,
  QrCode,
  User,
  Waves,
  X,
} from 'lucide-react-native';

import { Screen } from '@/components/ui/Screen';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { toast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor } from '@/theme/tokens';
import type {
  AreaComunDto,
  CreateReservaRequest,
  MiPaseDto,
  ReservaDto,
} from '@/lib/api/types';

/** Web section card: `bg-surface-2 rounded-xl p-4 border border-border` (page.tsx:80). */
const CARD = 'rounded-xl border border-border bg-surface2 p-4';

type IconType = ComponentType<{ size?: number; color?: string }>;

function PermisoBadge({ icon: Icon, label }: { icon: IconType; label: string }) {
  const { theme } = useTheme();
  const tokens = tokensFor(theme);
  return (
    // web page.tsx:210 — `bg-surface rounded-lg p-2.5`
    <View className="flex-row items-center gap-2 rounded-lg bg-surface p-2.5">
      <Icon size={16} color={tokens.accent} />
      <Text className="text-sm text-text">{label}</Text>
    </View>
  );
}

// ===========================================================================
// ReservaSection — ported from web src/components/reservas/ReservaSection.tsx.
// Same endpoints + filtering; the free-form date/time inputs become native
// day/time chips (there is no <input type="date"> in RN).
// ===========================================================================

const DAY_MAP: Record<string, number> = {
  DOM: 0,
  LUN: 1,
  MAR: 2,
  MIE: 3,
  JUE: 4,
  VIE: 5,
  SAB: 6,
};

/** Próximos ≤5 días dentro de una ventana de 15, filtrados por diasDisponibles. */
function computeAvailableDays(area: AreaComunDto | null): Date[] {
  if (!area) return [];
  const allowedDaysStr = area.diasDisponibles || 'LUN,MAR,MIE,JUE,VIE,SAB,DOM';
  const allowedDays = allowedDaysStr
    .split(',')
    .map((d) => {
      const token = d.trim().toUpperCase();
      if (token in DAY_MAP) return DAY_MAP[token];
      const n = parseInt(token, 10);
      return Number.isInteger(n) && n >= 0 && n <= 6 ? n : -1;
    })
    .filter((n) => n >= 0);

  const days: Date[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  for (let i = 0; i < 15 && days.length < 5; i++) {
    const cd = new Date(d);
    cd.setDate(d.getDate() + i);
    if (allowedDays.includes(cd.getDay())) days.push(cd);
  }
  return days;
}

/** "HH:MM" options from apertura to cierre stepping duracionSlot minutes. */
function computeTimeOptions(area: AreaComunDto | null): string[] {
  if (!area) return [];
  const [startH, startM] = area.horaApertura.split(':').map((n) => parseInt(n, 10));
  const [endH, endM] = area.horaCierre.split(':').map((n) => parseInt(n, 10));
  if ([startH, startM, endH, endM].some((n) => Number.isNaN(n))) return [];
  const dur = area.duracionSlot || 60;

  const options: string[] = [];
  let curr = startH * 60 + startM;
  const end = endH * 60 + endM;
  while (curr + dur <= end) {
    const h = Math.floor(curr / 60);
    const m = curr % 60;
    options.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    curr += dur;
  }
  return options;
}

function ReservaSection({ excludedAreas }: { excludedAreas: string[] }) {
  const { theme } = useTheme();
  const tokens = tokensFor(theme);
  const [areas, setAreas] = useState<AreaComunDto[]>([]);
  const [reservas, setReservas] = useState<ReservaDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedAreaId, setSelectedAreaId] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [areasData, reservasData] = await Promise.all([
        api.get<AreaComunDto[]>('/areas-comunes'),
        api.get<ReservaDto[]>('/reservas'),
      ]);
      const activas = (areasData ?? []).filter((a) => a.activa);
      // Filtrar áreas excluidas por permisos (piscina, gimnasio) — mirrors web.
      const filtradas = activas.filter(
        (a) => !excludedAreas.some((e) => a.nombre.toLowerCase().includes(e.toLowerCase())),
      );
      setAreas(filtradas);
      setReservas(reservasData ?? []);
    } catch {
      /* silently ignore (matches web) */
    } finally {
      setLoading(false);
    }
  }, [excludedAreas]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Realtime: refetch own reservations when a reserva event arrives.
  useWsSubscription('reserva', () => {
    void fetchData();
  });

  const selectedArea = areas.find((a) => a.id === selectedAreaId) ?? null;
  const availableDays = useMemo(() => computeAvailableDays(selectedArea), [selectedArea]);
  const timeOptions = useMemo(() => computeTimeOptions(selectedArea), [selectedArea]);

  const handleSelectArea = (area: AreaComunDto) => {
    setSelectedAreaId(area.id);
    const days = computeAvailableDays(area);
    setSelectedDay(days.length > 0 ? days[0] : null);
    setSelectedTime(null);
  };

  const handleReservar = async () => {
    if (!selectedArea || !selectedDay || !selectedTime) return;
    setSubmitting(true);
    try {
      const [h, m] = selectedTime.split(':').map((n) => parseInt(n, 10));
      const fechaInicio = new Date(selectedDay);
      fechaInicio.setHours(h, m, 0, 0);
      const duracionMin = selectedArea.duracionSlot || 60;
      const fechaFin = new Date(fechaInicio.getTime() + duracionMin * 60000);

      const body: CreateReservaRequest = {
        areaId: selectedArea.id,
        fechaInicio: fechaInicio.toISOString(),
        fechaFin: fechaFin.toISOString(),
        // web ReservaSection.tsx:86 sends `notas: null`; `CreateReservaRequest`
        // types it `notas?: string`, so it is omitted here — the backend
        // deserializes an absent key and an explicit null identically.
      };
      await api.post('/reservas', body);
      toast.success(`Reserva creada: ${selectedArea.nombre}`);
      setShowModal(false);
      void fetchData();
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : 'Error al reservar';
      toast.error(msg.includes('overlaps') ? 'Horario ya ocupado' : msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View className="items-center justify-center py-8">
        {/* web ReservaSection.tsx:102 — a `bg-text/10` Skeleton dot. */}
        <ActivityIndicator color={tokens.text} />
      </View>
    );
  }

  const reservasActivas = reservas.filter(
    (r) => r.estado !== 'CANCELADA' && new Date(r.fechaFin) > new Date(),
  );

  return (
    <>
      {/* Mis Reservas */}
      {reservasActivas.length > 0 ? (
        <View className="mb-4 flex flex-col gap-2">
          <Text className="px-1 text-[10px] font-bold uppercase tracking-wider text-textMuted">
            Mis reservas activas
          </Text>
          {reservasActivas.map((r) => {
            // Web compares against "APROBADA" (untyped string); the synced
            // EstadoReserva union uses CONFIRMADA — accept both off the wire.
            const aprobada = (r.estado as string) === 'APROBADA' || r.estado === 'CONFIRMADA';
            return (
            <View key={r.id} className="flex-row items-center gap-3 rounded-lg bg-surface p-3">
              {r.areaImagenUrl ? (
                <Image
                  source={{ uri: r.areaImagenUrl }}
                  alt={r.areaNombre}
                  contentFit="cover"
                  className="h-10 w-10 shrink-0 rounded-lg"
                />
              ) : (
                <Calendar size={16} color={tokens.accent} />
              )}
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-sm font-medium text-text">
                  {r.areaNombre}
                </Text>
                <Text className="text-[10px] text-textMuted">
                  {new Date(r.fechaInicio).toLocaleDateString('es-CO', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                  {' · '}
                  {new Date(r.fechaInicio).toLocaleTimeString('es-CO', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {' → '}
                  {new Date(r.fechaFin).toLocaleTimeString('es-CO', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
              {/* web ReservaSection.tsx:138-144 — bg-success/20 text-success,
                  bg-warning/20 text-warning, else bg-text/10 text-text/60. */}
              <View
                className={`shrink-0 rounded-full px-2 py-0.5 ${
                  aprobada
                    ? 'bg-success/20'
                    : r.estado === 'PENDIENTE'
                      ? 'bg-warning/20'
                      : 'bg-text/10'
                }`}
              >
                <Text
                  className={`text-[9px] font-bold uppercase ${
                    aprobada
                      ? 'text-success'
                      : r.estado === 'PENDIENTE'
                        ? 'text-warning'
                        : 'text-text/60'
                  }`}
                >
                  {aprobada ? 'Aprobada' : r.estado === 'PENDIENTE' ? 'Pendiente' : r.estado}
                </Text>
              </View>
            </View>
            );
          })}
        </View>
      ) : null}

      {/* Botón Reservar — solo si hay áreas disponibles */}
      {areas.length > 0 ? (
        <Pressable
          onPress={() => setShowModal(true)}
          style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
          className="w-full flex-row items-center justify-center gap-2 rounded-2xl bg-accent py-3"
        >
          <Plus size={18} color={tokens.onAccent} />
          <Text className="text-sm font-bold text-on-accent">Reservar área común</Text>
        </Pressable>
      ) : (
        <Text className="py-2 text-center text-xs text-textMuted">
          No tienes áreas disponibles para reservar
        </Text>
      )}

      {/* Modal de Reserva (bottom sheet) */}
      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
        statusBarTranslucent
      >
        <View className="flex-1 justify-end">
          <Pressable className="absolute inset-0 bg-black/60" onPress={() => setShowModal(false)} />
          {/* web ReservaSection.tsx:168 — flat `bg-primary border border-border
              rounded-[28px]`; native keeps the bottom-sheet position. */}
          <View
            className="rounded-t-[28px] border-t border-border bg-primary"
            style={{ maxHeight: '85%' }}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
            >
              <View className="mb-4 flex-row items-center justify-between">
                <Text className="text-lg font-bold text-text">Reservar área</Text>
                <Pressable onPress={() => setShowModal(false)} hitSlop={12}>
                  <X size={18} color={tokens.textMuted} />
                </Pressable>
              </View>

              {/* Área */}
              <Text className="mb-1 text-[10px] font-bold uppercase tracking-widest text-textMuted">
                Área
              </Text>
              <View className="mb-4 flex flex-col gap-2">
                {areas.map((a) => {
                  const selected = selectedAreaId === a.id;
                  return (
                    <Pressable
                      key={a.id}
                      onPress={() => handleSelectArea(a)}
                      className={`rounded-xl border px-4 py-2.5 ${
                        selected ? 'border-accent bg-accent' : 'border-border bg-surface2'
                      }`}
                    >
                      <Text
                        className={`text-sm font-medium ${
                          selected ? 'text-on-accent' : 'text-text'
                        }`}
                      >
                        {a.nombre}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {selectedArea ? (
                <View className="mb-4 flex flex-col gap-2 rounded-xl bg-surface2 p-3">
                  {/* web ReservaSection.tsx:191-195 — `w-full h-32 rounded-lg` cover. */}
                  {selectedArea.imagenUrl ? (
                    <Image
                      source={{ uri: selectedArea.imagenUrl }}
                      alt={selectedArea.nombre}
                      contentFit="cover"
                      className="mb-2 h-32 w-full rounded-lg"
                    />
                  ) : null}
                  {selectedArea.descripcion ? (
                    <Text className="text-xs text-textMuted">{selectedArea.descripcion}</Text>
                  ) : null}
                  <View className="flex-row items-center gap-1.5">
                    <Clock size={12} color={tokens.textMuted} />
                    <Text className="text-xs text-textMuted">
                      {selectedArea.horaApertura} → {selectedArea.horaCierre}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <MapPin size={12} color={tokens.textMuted} />
                    <Text className="text-xs text-textMuted">
                      Capacidad: {selectedArea.capacidadMax} personas
                    </Text>
                  </View>
                  {/* web ReservaSection.tsx:200 — `text-warning`. */}
                  {selectedArea.requiereDeposito ? (
                    <Text className="text-xs text-warning">
                      Depósito: ${selectedArea.depositoMonto || '—'}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {/* Fecha */}
              {selectedArea ? (
                <>
                  <Text className="mb-1 text-[10px] font-bold uppercase tracking-widest text-textMuted">
                    Fecha
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, paddingBottom: 8 }}
                    className="mb-4"
                  >
                    {availableDays.map((date, idx) => {
                      const isSelected =
                        selectedDay?.getDate() === date.getDate() &&
                        selectedDay?.getMonth() === date.getMonth();
                      return (
                        <Pressable
                          key={idx}
                          onPress={() => setSelectedDay(date)}
                          className={`min-w-[70px] items-center gap-1 rounded-2xl border py-3 ${
                            isSelected ? 'border-accent bg-accent' : 'border-border bg-surface2'
                          }`}
                        >
                          <Text
                            className={`text-[10px] font-medium uppercase ${
                              isSelected ? 'text-on-accent' : 'text-text'
                            }`}
                          >
                            {date.toLocaleString('es-ES', { weekday: 'short' })}
                          </Text>
                          <Text
                            className={`text-lg font-bold ${
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
                            {date.toLocaleString('es-ES', { month: 'short' })}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>

                  {/* Hora */}
                  <Text className="mb-1 text-[10px] font-bold uppercase tracking-widest text-textMuted">
                    Hora
                  </Text>
                  <View className="mb-4 flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
                    {timeOptions.length === 0 ? (
                      <Text className="w-full py-2 text-center text-xs text-textMuted">
                        No hay horarios disponibles.
                      </Text>
                    ) : null}
                    {timeOptions.map((t) => {
                      const isSel = selectedTime === t;
                      return (
                        <View key={t} style={{ width: '33.33%', padding: 4 }}>
                          <Pressable
                            onPress={() => setSelectedTime(t)}
                            className={`items-center rounded-xl border px-2 py-2.5 ${
                              isSel ? 'border-accent bg-accent' : 'border-border bg-surface2'
                            }`}
                          >
                            <Text
                              className={`text-xs font-bold ${
                                isSel ? 'text-on-accent' : 'text-text'
                              }`}
                            >
                              {t}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                </>
              ) : null}

              <View className="mt-2 flex-row gap-3">
                <Pressable
                  onPress={() => setShowModal(false)}
                  className="flex-1 items-center rounded-2xl border border-border bg-surface2 py-2.5"
                >
                  <Text className="text-sm font-bold text-text">Cancelar</Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleReservar()}
                  disabled={!selectedArea || !selectedDay || !selectedTime || submitting}
                  style={({ pressed }) => ({
                    opacity:
                      !selectedArea || !selectedDay || !selectedTime || submitting
                        ? 0.5
                        : pressed
                          ? 0.9
                          : 1,
                  })}
                  className="flex-1 items-center rounded-2xl bg-accent py-2.5"
                >
                  <Text className="text-sm font-bold text-on-accent">
                    {submitting ? 'Reservando...' : 'Reservar'}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ===========================================================================
// Screen
// ===========================================================================

export default function MiEstanciaScreen() {
  const user = useAuth((s) => s.user);
  const authLoading = useAuth((s) => s.loading);
  const router = useRouter();
  const { theme } = useTheme();
  const tokens = tokensFor(theme);

  const [pase, setPase] = useState<MiPaseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [showQR, setShowQR] = useState(false);

  // web page.tsx:36-44 — wait for auth, bounce to /login, then fetch.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }

    let cancelled = false;
    api
      .get<MiPaseDto>('/pases-temporales/mi-pase')
      .then((data) => {
        if (!cancelled) setPase(data);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // 4xx = no active stay -> silent empty state (the empty state already
        // says it); 5xx/network -> connection-error toast, NOT the misleading
        // "no active stay" copy.
        if (!(e instanceof ApiError && e.status >= 400 && e.status < 500)) {
          toast.error('No se pudo cargar tu estancia. Revisa tu conexión.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, router]);

  // Web excludes areas the pass does NOT permit (by name), mirrored verbatim.
  const excludedAreas = useMemo(() => {
    const excluded: string[] = [];
    if (pase && !pase.permiso_gimnasio) excluded.push('Gimnasio');
    if (pase && !pase.permiso_piscina) excluded.push('Piscina');
    return excluded;
  }, [pase]);

  if (authLoading || loading) {
    return (
      <Screen scroll={false} className="bg-primary">
        <View className="flex-1 items-center justify-center">
          {/* web page.tsx:49 — a `bg-text/10` pulsing dot. */}
          <ActivityIndicator size="large" color={tokens.text} />
        </View>
      </Screen>
    );
  }

  if (!pase) {
    return (
      <Screen className="bg-primary">
        <View className="flex flex-col gap-8 px-6 pt-4">
          <ProfileHeader />
          <View className="items-center p-6">
            {/* web page.tsx:59 — `text-text-secondary`. */}
            <User size={48} color={tokens.textMuted} />
            <Text className="mb-2 mt-4 text-lg text-text">No tienes una estancia activa</Text>
            <Text className="text-center text-sm text-textMuted">
              Contacta al administrador de tu conjunto para obtener acceso.
            </Text>
          </View>
        </View>
      </Screen>
    );
  }

  const inicio = new Date(pase.fecha_inicio + 'T00:00:00');
  const fin = new Date(pase.fecha_fin + 'T00:00:00');
  const hoy = new Date();
  const diasRestantes = Math.ceil((fin.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));

  const sinPermisos =
    !pase.permiso_entrada_salida &&
    !pase.permiso_gimnasio &&
    !pase.permiso_piscina &&
    !pase.permiso_vehiculo &&
    !pase.permiso_asamblea;

  return (
    <Screen className="bg-primary">
      <View className="flex flex-col gap-4 px-6 pt-4">
        <ProfileHeader />

        {/* Info del anfitrión */}
        <Animated.View entering={FadeInDown.duration(400)}>
          <View className={CARD}>
            <Text className="mb-3 text-xs font-medium uppercase tracking-wider text-textMuted">
              Anfitrión
            </Text>
            <View className="flex-row items-center gap-3">
              {/* web page.tsx:83-84 — `bg-accent/10` + `text-accent`. */}
              <View className="h-10 w-10 items-center justify-center rounded-full bg-accent/10">
                <User size={20} color={tokens.accent} />
              </View>
              <Text className="text-lg font-medium text-text">{pase.nombre_anfitrion}</Text>
            </View>
          </View>
        </Animated.View>

        {/* Fechas */}
        <Animated.View entering={FadeInDown.delay(80).duration(400)}>
          <View className={CARD}>
            <Text className="mb-3 text-xs font-medium uppercase tracking-wider text-textMuted">
              Estancia
            </Text>
            <View className="flex-row items-start justify-between">
              <View>
                <Text className="mb-1 text-xs text-textMuted">Check-in</Text>
                <Text className="font-medium text-text">
                  {inicio.toLocaleDateString('es-CO', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
              </View>
              <View className="items-end">
                <Text className="mb-1 text-xs text-textMuted">Check-out</Text>
                <Text className="font-medium text-text">
                  {fin.toLocaleDateString('es-CO', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
              </View>
            </View>
            <View className="mt-3 flex-row items-center gap-2 border-t border-border pt-3">
              {/* web page.tsx:106 — `text-red-400` when urgent, else `text-accent`. */}
              <Clock size={16} color={diasRestantes <= 1 ? tokens.danger : tokens.accent} />
              <Text className="text-sm text-text">
                {diasRestantes <= 0
                  ? 'Último día'
                  : `${diasRestantes} día${diasRestantes !== 1 ? 's' : ''} restante${diasRestantes !== 1 ? 's' : ''}`}
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* Permisos */}
        <Animated.View entering={FadeInDown.delay(160).duration(400)}>
          <View className={CARD}>
            <Text className="mb-3 text-xs font-medium uppercase tracking-wider text-textMuted">
              Permisos
            </Text>
            <View className="flex-row flex-wrap" style={{ margin: -4 }}>
              {pase.permiso_entrada_salida ? (
                <View style={{ width: '50%', padding: 4 }}>
                  <PermisoBadge icon={DoorOpen} label="Entrada/Salida" />
                </View>
              ) : null}
              {pase.permiso_gimnasio ? (
                <View style={{ width: '50%', padding: 4 }}>
                  <PermisoBadge icon={Dumbbell} label="Gimnasio" />
                </View>
              ) : null}
              {pase.permiso_piscina ? (
                <View style={{ width: '50%', padding: 4 }}>
                  <PermisoBadge icon={Waves} label="Piscina" />
                </View>
              ) : null}
              {pase.permiso_vehiculo ? (
                <View style={{ width: '50%', padding: 4 }}>
                  <PermisoBadge icon={Car} label="Vehículo" />
                </View>
              ) : null}
              {pase.permiso_asamblea ? (
                <View style={{ width: '50%', padding: 4 }}>
                  <PermisoBadge icon={Calendar} label="Asamblea" />
                </View>
              ) : null}
            </View>
            {sinPermisos ? (
              <Text className="text-sm text-textMuted">Sin permisos especiales</Text>
            ) : null}
          </View>
        </Animated.View>

        {/* Reservar áreas comunes — solo si tiene al menos un permiso de área */}
        {pase.permiso_gimnasio || pase.permiso_piscina ? (
          <Animated.View entering={FadeInDown.delay(240).duration(400)}>
            <View className={CARD}>
              <Text className="mb-3 text-xs font-medium uppercase tracking-wider text-textMuted">
                Reservar áreas
              </Text>
              <ReservaSection excludedAreas={excludedAreas} />
            </View>
          </Animated.View>
        ) : null}

        {/* Vehículos */}
        {pase.vehiculos && pase.vehiculos.length > 0 ? (
          <Animated.View entering={FadeInDown.delay(320).duration(400)}>
            <View className={CARD}>
              <Text className="mb-3 text-xs font-medium uppercase tracking-wider text-textMuted">
                Vehículos
              </Text>
              <View className="flex flex-col gap-2">
                {pase.vehiculos.map((v, i) => (
                  // web page.tsx:150-151 — `bg-surface` row, `text-accent` icon.
                  <View key={i} className="flex-row items-center gap-3 rounded-lg bg-surface p-3">
                    <Car size={18} color={tokens.accent} />
                    <View className="flex-row flex-wrap items-baseline gap-2">
                      <Text className="font-mono font-bold text-text">{v.placa}</Text>
                      {v.marca || v.color ? (
                        <Text className="text-sm text-textMuted">
                          {[v.marca, v.color].filter(Boolean).join(' · ')}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </Animated.View>
        ) : null}

        {/* Código de acceso */}
        <Animated.View entering={FadeInDown.delay(400).duration(400)}>
          <View className={`items-center ${CARD}`}>
            <QrCode size={24} color={tokens.accent} />
            <Text className="mb-1 mt-2 text-xs text-textMuted">Tu código de acceso</Text>
            {/* web page.tsx:170 — `text-3xl font-mono font-bold text-accent
                tracking-[0.3em]` → 0.3em of 30px = 9px. */}
            <Text
              selectable
              className="font-mono text-3xl font-bold text-accent"
              style={{ letterSpacing: 9 }}
            >
              {pase.codigo_acceso}
            </Text>
            {/* web page.tsx:173 — `bg-surface border border-border`. */}
            <Pressable
              onPress={() => setShowQR(true)}
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
              className="mt-3 w-full flex-row items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-2.5"
            >
              <Maximize2 size={16} color={tokens.text} />
              <Text className="text-sm font-medium text-text">Mostrar código QR</Text>
            </Pressable>
            <Text className="mt-2 text-xs text-textMuted">Muéstralo en portería al ingresar</Text>
          </View>
        </Animated.View>
      </View>

      {/* Modal QR — rendered locally (no external QR service). */}
      <Modal
        visible={showQR}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQR(false)}
        statusBarTranslucent
      >
        <Pressable
          onPress={() => setShowQR(false)}
          className="flex-1 items-center justify-center bg-black/70 p-4"
        >
          {/* Inner pressable stops backdrop taps from closing the modal. */}
          <Pressable onPress={() => {}} className="w-full max-w-sm">
            {/* web page.tsx:185 — flat `bg-primary border border-border rounded-[28px] p-6`. */}
            <View className="rounded-[28px] border border-border bg-primary">
              <View className="flex flex-col items-center gap-4 p-6">
                <View className="w-full flex-row items-center justify-between">
                  <Text className="text-lg font-bold text-text">Código QR de acceso</Text>
                  {/* web page.tsx:190-192 — bare X in `text-text/60`, no chip. */}
                  <Pressable onPress={() => setShowQR(false)} hitSlop={12}>
                    <X size={22} color={tokens.textMuted} />
                  </Pressable>
                </View>
                {/* The QR frame is hardcoded white on web too (`bg-white`,
                    page.tsx:194) — a QR must stay black-on-white to scan. */}
                <View className="rounded-2xl p-4" style={{ backgroundColor: '#ffffff' }}>
                  <QRCode
                    value={pase.codigo_acceso}
                    size={250}
                    color="#000000"
                    backgroundColor="#ffffff"
                  />
                </View>
                {/* web page.tsx:197 — `text-accent tracking-[0.3em]` (9px @ 30px). */}
                <Text
                  selectable
                  className="font-mono text-3xl font-bold text-accent"
                  style={{ letterSpacing: 9 }}
                >
                  {pase.codigo_acceso}
                </Text>
                <Text className="text-center text-xs text-textMuted">
                  Muestra este QR en portería para validar tu ingreso
                </Text>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}
