/**
 * ADMIN ASAMBLEA - CONJUNTOSAPP (mobile port)
 *
 * Ported 1:1 from web `src/app/(app)/admin-asamblea/page.tsx`.
 *
 * Lobby for the assembly. Creating, opening and entering happen here; running
 * the session — agenda, votes, the floor, powers — happens inside the room
 * (`/(app)/asamblea`), so moderators are not driving a live meeting from a
 * second tab.
 *
 * Endpoints:
 *  - GET  /asambleas/activa/session      → AsambleaDto (404/empty → no asamblea)
 *  - GET  /asambleas/{id}/asistencias    → QuorumResponse (asistentes + quórum)
 *  - POST /asambleas                     → crea la convocatoria + orden del día
 *  - PUT  /asambleas/activa/session      → { activa:false, sessionState:'FINALIZADA', version }
 * Realtime: WS domain `asamblea` → refetch de la sesión.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeInDown,
  SlideInDown,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  ArrowRight,
  Calendar,
  Clock,
  ListOrdered,
  Play,
  Plus,
  RefreshCw,
  Square,
  Users,
  Video,
  X,
} from 'lucide-react-native';

import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api, ApiError } from '@/lib/api/client';
import type { AsambleaDto, OrdenDiaItem, QuorumResponse } from '@/lib/api/types';
import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { toast } from '@/components/ui/toast';
import { DateTimeModal } from '@/components/asamblea/DateTimeModal';
import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor } from '@/theme/tokens';

const ALLOWED_ROLES = ['ADMINISTRADOR', 'SUPER_ADMIN'];

// ---------------------------------------------------------------------------
// Session-state helpers — local copy of web `src/lib/asamblea.ts` (mobile has
// no shared module for it yet; see the hoist report).
// ---------------------------------------------------------------------------

/**
 * `sessionState` is opaque jsonb: the admin panel writes plain strings, and
 * rows carried over by the data migration may hold an object instead. Read
 * whichever shape shows up.
 */
function sessionEstado(state: unknown): string | null {
  if (typeof state === 'string') return state;
  if (state && typeof state === 'object' && 'estado' in state) {
    const estado = (state as { estado?: unknown }).estado;
    return typeof estado === 'string' ? estado : null;
  }
  return null;
}

/**
 * True once the admin has started the assembly. Anything that is not
 * explicitly scheduled counts as in session, so migrated rows with an
 * unrecognised state keep behaving as they did before.
 */
function estaEnSesion(a: { activa: boolean; sessionState?: unknown }): boolean {
  return a.activa && sessionEstado(a.sessionState) !== 'PROGRAMADA';
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fmtFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-CO', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** The `datetime-local` value is a LOCAL-time string, not the ISO/UTC one. */
function nowForDatetimeLocal(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/** `YYYY-MM-DDTHH:mm` → the readable label a datetime-local input renders. */
function fmtDatetimeLocal(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}, ${match[4]}:${match[5]}`;
}

// ---------------------------------------------------------------------------
// Local skeleton (web <SkeletonRows />)
// ---------------------------------------------------------------------------

/**
 * Tailwind `animate-pulse` (opacity 1 → .5 → 1, 2s, ease-in-out) as a
 * reanimated loop. Cancelled on unmount so the driver does not keep ticking.
 */
function usePulse(to: number, duration: number) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(to, { duration }), -1, true);
    return () => cancelAnimation(opacity);
  }, [opacity, to, duration]);
  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

/** Web `<Skeleton />` = `animate-pulse rounded-lg bg-text/10`. */
function SkeletonBar({ className }: { className: string }) {
  const pulse = usePulse(0.5, 1000);
  return <Animated.View className={`rounded-lg bg-text/10 ${className}`} style={pulse} />;
}

function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <View className="w-full flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <LiquidGlass key={i} radius={24} className="rounded-3xl border border-border">
          <View className="flex-row items-center gap-3 p-5">
            <SkeletonBar className="h-10 w-10 shrink-0 rounded-xl" />
            <View className="min-w-0 flex-1 flex-col gap-2">
              <SkeletonBar className="h-3 w-1/2" />
              <SkeletonBar className="h-2.5 w-1/3" />
            </View>
            <SkeletonBar className="h-4 w-16 shrink-0" />
          </View>
        </LiquidGlass>
      ))}
    </View>
  );
}

/** `animate-pulse` dot of the "En vivo" badge. */
function PulseDot() {
  const style = usePulse(0.35, 900);
  return <Animated.View className="h-2 w-2 rounded-full bg-success" style={style} />;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function AdminAsamblea() {
  const user = useAuth((s) => s.user);
  const authLoading = useAuth((s) => s.loading);
  const router = useRouter();
  const role = user?.rol;
  const { theme } = useTheme();
  const t = tokensFor(theme);

  const [asamblea, setAsamblea] = useState<AsambleaDto | null>(null);
  const [quorum, setQuorum] = useState<QuorumResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showCrear, setShowCrear] = useState(false);
  const [form, setForm] = useState({ titulo: '', descripcion: '', fecha: '' });
  const [ordenDia, setOrdenDia] = useState<{ titulo: string }[]>([]);
  const [creando, setCreando] = useState(false);
  const [fechaPickerOpen, setFechaPickerOpen] = useState(false);

  const fetchSession = useCallback(async () => {
    try {
      const data = await api.get<AsambleaDto>('/asambleas/activa/session');
      setAsamblea(data);
      if (data?.id) {
        api
          .get<QuorumResponse>(`/asambleas/${data.id}/asistencias`)
          .then(setQuorum)
          .catch(() => setQuorum(null));
      }
    } catch {
      setAsamblea(null);
    } finally {
      setLoading(false);
    }
  }, []);

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
    void fetchSession();
  }, [user, authLoading, role, router, fetchSession]);

  useWsSubscription('asamblea', () => {
    void fetchSession();
  });

  const openCrear = useCallback(() => {
    setForm({ titulo: '', descripcion: '', fecha: nowForDatetimeLocal() });
    setOrdenDia([]);
    setFechaPickerOpen(false);
    setShowCrear(true);
  }, []);

  const closeCrear = useCallback(() => {
    if (creando) return;
    setShowCrear(false);
  }, [creando]);

  const handleCrear = useCallback(async () => {
    if (!form.titulo.trim()) return;
    setCreando(true);
    try {
      const creada = await api.post<AsambleaDto>('/asambleas', {
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim() || undefined,
        // The input is local time; send the absolute instant the backend stores.
        fecha: form.fecha ? new Date(form.fecha).toISOString() : undefined,
        ordenDia: ordenDia
          .filter((i) => i.titulo.trim())
          .map((i) => ({ titulo: i.titulo.trim() })),
      });
      setAsamblea(creada);
      setShowCrear(false);
      toast.success('Asamblea creada');
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.detail : 'Error al crear la asamblea');
    } finally {
      setCreando(false);
    }
  }, [form, ordenDia]);

  const setSession = useCallback(
    async (patch: Record<string, unknown>, ok: string, fail: string) => {
      if (!asamblea) return;
      setSaving(true);
      try {
        await api.put('/asambleas/activa/session', { ...patch, version: asamblea.version });
        toast.success(ok);
        void fetchSession();
      } catch (err: unknown) {
        toast.error(err instanceof ApiError ? err.detail : fail);
      } finally {
        setSaving(false);
      }
    },
    [asamblea, fetchSession],
  );

  if (authLoading || loading) {
    return (
      <Screen scroll={false} className="bg-primary">
        <View className="flex-1 items-center justify-center px-6">
          <SkeletonRows />
        </View>
      </Screen>
    );
  }

  const enSesion = asamblea ? estaEnSesion(asamblea) : false;
  const agenda: OrdenDiaItem[] = Array.isArray(asamblea?.ordenDia) ? asamblea!.ordenDia : [];

  const stats: { label: string; value: string; icon: ReactElement }[] = [
    {
      label: 'Puntos',
      value: String(agenda.length),
      icon: <ListOrdered size={13} color={t.text} style={{ opacity: 0.4 }} />,
    },
    {
      label: 'Asistentes',
      value: String(quorum?.asistencias?.length ?? 0),
      icon: <Users size={13} color={t.text} style={{ opacity: 0.4 }} />,
    },
    {
      label: 'Quórum',
      value: `${Number(quorum?.quorumPorcentaje ?? 0).toFixed(0)}%`,
      icon: <Users size={13} color={t.text} style={{ opacity: 0.4 }} />,
    },
  ];

  return (
    <View style={{ flex: 1 }} className="bg-primary">
      <Screen className="bg-primary">
        <View className="flex-col gap-6 px-6 pt-4">
          <Animated.View entering={FadeInDown.duration(500)}>
            <ProfileHeader />
          </Animated.View>

          {/* Title + refresh */}
          <View className="flex-row items-start justify-between gap-3">
            <View>
              <Text
                className="text-2xl font-medium tracking-wide text-text"
                style={{ fontFamily: 'PlusJakartaSans_500Medium' }}
              >
                Asamblea
              </Text>
              <Text className="text-sm text-text" style={{ opacity: 0.6 }}>
                Crea la asamblea y entra a la sala para dirigirla
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Actualizar"
              onPress={() => void fetchSession()}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              className="rounded-full p-2"
            >
              <RefreshCw size={18} color={t.text} />
            </Pressable>
          </View>

          {!asamblea ? (
            /* ── Empty state ──────────────────────────────────────────────── */
            <Animated.View entering={FadeInDown.delay(80).duration(500)}>
              <LiquidGlass radius={28} className="rounded-[28px] border border-border">
                <View className="items-center gap-5 p-8">
                  <View className="h-16 w-16 items-center justify-center rounded-3xl border border-border bg-surface2">
                    <Video size={26} color={t.text} style={{ opacity: 0.4 }} />
                  </View>
                  <View className="items-center">
                    <Text className="text-center text-lg font-medium text-text">
                      No hay asamblea activa
                    </Text>
                    <Text
                      className="mt-1.5 max-w-[320px] text-center text-xs text-text"
                      style={{ opacity: 0.55 }}
                    >
                      Crea la convocatoria con su orden del día. Después podrás entrar a la sala y
                      dirigir la sesión desde ahí.
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={openCrear}
                    style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.95 : 1 }] })}
                    className="flex-row items-center gap-2 rounded-full bg-accent px-6 py-3"
                  >
                    <Plus size={16} color={t.onAccent} />
                    <Text className="text-sm font-bold text-on-accent">Crear asamblea</Text>
                  </Pressable>
                </View>
              </LiquidGlass>
            </Animated.View>
          ) : (
            /* ── Session card ─────────────────────────────────────────────── */
            <Animated.View entering={FadeInDown.delay(80).duration(500)}>
              <LiquidGlass radius={28} className="overflow-hidden rounded-[28px] border border-border">
                <View className="flex-col gap-5 p-6">
                  <View className="flex-row items-start justify-between gap-4">
                    <View className="min-w-0 flex-1 flex-row items-start gap-3">
                      <View
                        className={`h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${
                          enSesion ? 'border-success/30 bg-success/10' : 'border-border bg-surface2'
                        }`}
                      >
                        {enSesion ? (
                          <Play size={22} color={t.success} />
                        ) : (
                          <Clock size={22} color={t.text} />
                        )}
                      </View>
                      <View className="min-w-0 flex-1">
                        <Text className="text-lg font-bold leading-tight text-text">
                          {asamblea.titulo}
                        </Text>
                        {asamblea.descripcion ? (
                          <Text className="mt-1 text-xs text-text" style={{ opacity: 0.6 }}>
                            {asamblea.descripcion}
                          </Text>
                        ) : null}
                        <View className="mt-2 flex-row items-center gap-1.5">
                          <Calendar size={11} color={t.text} style={{ opacity: 0.45 }} />
                          <Text className="text-[11px] text-text" style={{ opacity: 0.45 }}>
                            {fmtFecha(asamblea.fecha)}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View
                      className={`shrink-0 flex-row items-center gap-1.5 rounded-full border px-3 py-1 ${
                        enSesion
                          ? 'border-success/30 bg-success/15'
                          : 'border-border bg-text/10'
                      }`}
                    >
                      {enSesion ? (
                        <PulseDot />
                      ) : (
                        <View className="h-2 w-2 rounded-full bg-text/30" />
                      )}
                      <Text
                        className={`text-[10px] font-bold uppercase ${
                          enSesion ? 'text-success' : 'text-text'
                        }`}
                      >
                        {enSesion ? 'En vivo' : 'Programada'}
                      </Text>
                    </View>
                  </View>

                  {/* Stats */}
                  <View className="flex-row gap-2">
                    {stats.map((s) => (
                      <View
                        key={s.label}
                        className="flex-1 rounded-2xl border border-border bg-surface2 p-3"
                      >
                        <View className="flex-row items-center gap-1">
                          {s.icon}
                          <Text
                            className="text-[9px] font-black uppercase tracking-widest text-text"
                            style={{ opacity: 0.4 }}
                          >
                            {s.label}
                          </Text>
                        </View>
                        <Text
                          className="mt-1 text-xl font-bold text-text"
                          style={{ fontVariant: ['tabular-nums'] }}
                        >
                          {s.value}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Agenda preview */}
                  {agenda.length > 0 ? (
                    <View className="rounded-2xl border border-border bg-surface2 p-4">
                      <View className="mb-2 flex-row items-center gap-1.5">
                        <ListOrdered size={11} color={t.text} style={{ opacity: 0.4 }} />
                        <Text
                          className="text-[9px] font-black uppercase tracking-widest text-text"
                          style={{ opacity: 0.4 }}
                        >
                          Orden del día
                        </Text>
                      </View>
                      <View className="flex-col gap-1.5">
                        {agenda.map((item, i) => {
                          const active = i === asamblea.itemActivoIndex;
                          return (
                            <View
                              key={item.id ?? i}
                              className="flex-row items-center gap-2"
                            >
                              <View
                                className={`h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                                  active ? 'bg-accent' : 'bg-text/10'
                                }`}
                              >
                                <Text
                                  className={`text-[9px] font-bold ${
                                    active ? 'text-on-accent' : 'text-text'
                                  }`}
                                >
                                  {i + 1}
                                </Text>
                              </View>
                              <Text
                                numberOfLines={1}
                                className={`flex-1 text-xs text-text ${
                                  active ? 'font-bold' : ''
                                }`}
                                style={active ? undefined : { opacity: 0.55 }}
                              >
                                {item.titulo}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}

                  {/* Primary action — the point of this page */}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push('/(app)/asamblea' as never)}
                    style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}
                    className="w-full flex-row items-center justify-center gap-2 rounded-full bg-accent py-4"
                  >
                    <Video size={17} color={t.onAccent} />
                    <Text className="text-sm font-bold text-on-accent">Entrar a la asamblea</Text>
                    <ArrowRight size={15} color={t.onAccent} />
                  </Pressable>

                  <Text
                    className="-mt-2 text-center text-[11px] text-text"
                    style={{ opacity: 0.45 }}
                  >
                    {enSesion
                      ? 'Dentro de la sala controlas la agenda, las votaciones, los turnos de palabra y los poderes.'
                      : 'La sesión aún no ha empezado. Entra y pulsa «Iniciar la sesión» en el panel Moderar.'}
                  </Text>

                  {/* Secondary: closing the assembly for good */}
                  {enSesion ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: saving, busy: saving }}
                      disabled={saving}
                      onPress={() =>
                        void setSession(
                          { activa: false, sessionState: 'FINALIZADA' },
                          'Asamblea finalizada',
                          'Error al finalizar la asamblea',
                        )
                      }
                      style={({ pressed }) => ({
                        opacity: saving ? 0.5 : 1,
                        transform: [{ scale: pressed && !saving ? 0.95 : 1 }],
                      })}
                      className="w-full flex-row items-center justify-center gap-2 rounded-full border border-danger/30 bg-danger/10 py-3"
                    >
                      <Square size={14} color={t.danger} />
                      <Text className="text-xs font-bold uppercase tracking-widest text-danger">
                        Finalizar asamblea
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </LiquidGlass>
            </Animated.View>
          )}
        </View>
      </Screen>

      {/* ── Create modal ───────────────────────────────────────────────── */}
      <CrearModal
        open={showCrear}
        creando={creando}
        form={form}
        ordenDia={ordenDia}
        fechaPickerOpen={fechaPickerOpen}
        onChangeForm={setForm}
        onChangeOrdenDia={setOrdenDia}
        onOpenFechaPicker={() => setFechaPickerOpen(true)}
        onCloseFechaPicker={() => setFechaPickerOpen(false)}
        onClose={closeCrear}
        onSubmit={() => void handleCrear()}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Nueva asamblea — bottom-sheet modal (web: fixed inset-0 dialog).
// Backdrop / X dismiss are guarded by `!creando`, like the web modal.
// ---------------------------------------------------------------------------

interface CrearModalProps {
  open: boolean;
  creando: boolean;
  form: { titulo: string; descripcion: string; fecha: string };
  ordenDia: { titulo: string }[];
  fechaPickerOpen: boolean;
  onChangeForm: (next: { titulo: string; descripcion: string; fecha: string }) => void;
  onChangeOrdenDia: (next: { titulo: string }[]) => void;
  onOpenFechaPicker: () => void;
  onCloseFechaPicker: () => void;
  onClose: () => void;
  onSubmit: () => void;
}

function CrearModal({
  open,
  creando,
  form,
  ordenDia,
  fechaPickerOpen,
  onChangeForm,
  onChangeOrdenDia,
  onOpenFechaPicker,
  onCloseFechaPicker,
  onClose,
  onSubmit,
}: CrearModalProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const t = tokensFor(theme);
  const disabled = creando || !form.titulo.trim();

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        {/* Backdrop — only dismisses when not submitting. Kept out of the
            accessibility tree like web's inert backdrop <div>, so VoiceOver
            does not land on a screen-sized button covering the sheet. */}
        <Pressable
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          onPress={onClose}
          className="absolute inset-0 bg-black/70"
        />

        {/* Web sheet: `border-t border-border/40`. The `border` token is an
            inherently-translucent rgba() var, so Tailwind's `/40` modifier
            cannot apply to it in this config — the full token is used. */}
        {open ? (
          <Animated.View
            entering={SlideInDown.duration(300)}
            className="max-h-[90%] overflow-hidden rounded-t-[32px] border-t border-border bg-primaryLight"
            style={{ paddingBottom: insets.bottom + 16 }}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
            >
              <View className="mb-5 flex-row items-center justify-between border-b border-border pb-3">
                <Text className="text-lg font-bold text-text">Nueva asamblea</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar"
                  disabled={creando}
                  onPress={onClose}
                  className="h-10 w-10 items-center justify-center rounded-full border border-border bg-surface2"
                >
                  <X size={20} color={t.text} />
                </Pressable>
              </View>

              <View className="flex-col gap-4">
                {/* Título */}
                <View className="flex-col gap-1.5">
                  <Text className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-text">
                    Título *
                  </Text>
                  <TextInput
                    value={form.titulo}
                    onChangeText={(titulo) => onChangeForm({ ...form, titulo })}
                    placeholder="Ej: Asamblea General Ordinaria 2026"
                    placeholderTextColor={t.textMuted}
                    editable={!creando}
                    className="w-full rounded-xl border border-border bg-surface2 px-4 py-3 text-sm text-text"
                  />
                </View>

                {/* Descripción */}
                <View className="flex-col gap-1.5">
                  <Text className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-text">
                    Descripción
                  </Text>
                  <TextInput
                    value={form.descripcion}
                    onChangeText={(descripcion) => onChangeForm({ ...form, descripcion })}
                    placeholder="Convocatoria, lugar, modalidad…"
                    placeholderTextColor={t.textMuted}
                    editable={!creando}
                    multiline
                    numberOfLines={2}
                    textAlignVertical="top"
                    className="min-h-[72px] w-full rounded-xl border border-border bg-surface2 px-4 py-3 text-sm text-text"
                  />
                </View>

                {/* Fecha y hora */}
                <View className="flex-col gap-1.5">
                  <Text className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-text">
                    Fecha y hora
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={creando}
                    onPress={onOpenFechaPicker}
                    className="w-full flex-row items-center justify-between rounded-xl border border-border bg-surface2 px-4 py-3"
                  >
                    <Text
                      className="flex-1 text-sm text-text"
                      numberOfLines={1}
                      style={{ opacity: form.fecha ? 1 : 0.6 }}
                    >
                      {form.fecha ? fmtDatetimeLocal(form.fecha) : 'dd/mm/aaaa, --:--'}
                    </Text>
                    <Calendar size={16} color={t.accent} />
                  </Pressable>
                </View>

                {/* Orden del día */}
                <View className="flex-col gap-1.5">
                  <View className="ml-1 flex-row items-center gap-1.5">
                    <ListOrdered size={12} color={t.text} />
                    <Text className="text-[10px] font-black uppercase tracking-[0.2em] text-text">
                      Orden del día
                    </Text>
                  </View>
                  <View className="flex-col gap-2">
                    {ordenDia.map((item, i) => (
                      <View key={i} className="flex-row items-center gap-2">
                        <View className="h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface2">
                          <Text className="text-[10px] font-bold text-text">{i + 1}</Text>
                        </View>
                        <TextInput
                          value={item.titulo}
                          onChangeText={(titulo) =>
                            onChangeOrdenDia(
                              ordenDia.map((it, idx) => (idx === i ? { titulo } : it)),
                            )
                          }
                          placeholder={`Punto ${i + 1}`}
                          placeholderTextColor={t.textMuted}
                          editable={!creando}
                          className="min-w-0 flex-1 rounded-xl border border-border bg-surface2 px-3 py-2.5 text-sm text-text"
                        />
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Quitar punto ${i + 1}`}
                          onPress={() => onChangeOrdenDia(ordenDia.filter((_, idx) => idx !== i))}
                          className="h-8 w-8 shrink-0 items-center justify-center rounded-full border border-danger/30 bg-danger/10"
                        >
                          <X size={14} color={t.danger} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onChangeOrdenDia([...ordenDia, { titulo: '' }])}
                    className="mt-1 flex-row items-center gap-1.5 self-start rounded-full border border-border bg-surface2 px-4 py-2"
                  >
                    <Plus size={12} color={t.text} />
                    <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                      Agregar punto
                    </Text>
                  </Pressable>
                </View>

                {/* Submit */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled, busy: creando }}
                  disabled={disabled}
                  onPress={onSubmit}
                  style={({ pressed }) => ({
                    opacity: disabled ? 0.5 : 1,
                    transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
                  })}
                  className="mt-2 w-full items-center justify-center rounded-full bg-accent py-3.5"
                >
                  <Text className="text-sm font-bold text-on-accent">
                    {creando ? 'Creando…' : 'Crear asamblea'}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </Animated.View>
        ) : null}

        {/* Fecha picker lives inside the create modal's tree (two sibling RN
            Modals never both present on iOS). */}
        <DateTimeModal
          open={fechaPickerOpen}
          value={form.fecha}
          title="Fecha y hora"
          onClose={onCloseFechaPicker}
          onChange={(fecha) => onChangeForm({ ...form, fecha })}
        />
      </View>
    </Modal>
  );
}
