/**
 * Libro de Novedades — CONJUNTOSAPP (mobile port)
 * Bitácora digital de incidentes y entregas de turno.
 *
 * Ported 1:1 from web `src/app/(app)/novedades/page.tsx`.
 *
 * NOTE ON THE ENDPOINT: the web page talks to `/solicitudes-servicio`, which
 * does NOT exist on the Rust backend (the router only exposes `/solicitudes`
 * and `/admin/solicitudes`). Both calls therefore 404: the GET is swallowed by
 * the page's own `catch` (empty list) and the POST surfaces
 * "Error al registrar novedad". The path is kept verbatim so mobile behaves
 * exactly like web — see the report for the backend gap.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  cancelAnimation,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronLeft,
  Clock,
  FileText,
  HelpCircle,
  PlusCircle,
  RefreshCw,
  User,
  Wrench,
  X,
} from 'lucide-react-native';

import { BottomSheetScrollView } from '@gorhom/bottom-sheet';

import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { Sheet } from '@/components/ui/Sheet';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api/client';
import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor } from '@/theme/tokens';

// ---------------------------------------------------------------------------
// Types — mirrors the web `Novedad` interface verbatim.
// ---------------------------------------------------------------------------

type NovedadTipo = 'INCIDENTE' | 'DAÑO' | 'CAMBIO_TURNO' | 'SOSPECHOSO' | 'OTRO';

interface Novedad {
  id: string;
  titulo: string;
  descripcion: string;
  tipo: NovedadTipo;
  creadoEn: string;
  usuario?: {
    nombre: string;
    rol: string;
  } | null;
}

/** Roles allowed by the web page (everything else is bounced to /inicio). */
const ALLOWED_ROLES = [
  'VIGILANTE',
  'SUPERVISOR_VIGILANCIA',
  'ADMINISTRADOR',
  'SUPER_ADMIN',
];

/** The five `tipo` values the web filter keeps from the raw response. */
const NOVEDAD_TIPOS: NovedadTipo[] = [
  'INCIDENTE',
  'CAMBIO_TURNO',
  'SOSPECHOSO',
  'DAÑO',
  'OTRO',
];

/** `<select>` options, in the exact order and with the exact labels from web. */
const TIPO_OPTIONS: { value: NovedadTipo; label: string }[] = [
  { value: 'INCIDENTE', label: 'Incidente' },
  { value: 'DAÑO', label: 'Daño' },
  { value: 'CAMBIO_TURNO', label: 'Cambio de Turno' },
  { value: 'SOSPECHOSO', label: 'Sospechoso' },
  { value: 'OTRO', label: 'Otro' },
];

/** Mirrors web `getTipoLabel`. */
function getTipoLabel(tipo: NovedadTipo): string {
  switch (tipo) {
    case 'INCIDENTE':
      return 'Incidente Crítico';
    case 'DAÑO':
      return 'Daño / Falla Técnica';
    case 'CAMBIO_TURNO':
      return 'Cambio de Turno';
    case 'SOSPECHOSO':
      return 'Actividad Sospechosa';
    default:
      return 'Otro Reporte';
  }
}

/** Mirrors web `getTipoIcon` (size 16, inked with the `text` token). */
function getTipoIcon(tipo: NovedadTipo, color: string): ReactElement {
  switch (tipo) {
    case 'INCIDENTE':
      return <AlertCircle color={color} size={16} />;
    case 'DAÑO':
      return <Wrench color={color} size={16} />;
    case 'CAMBIO_TURNO':
      return <RefreshCw color={color} size={16} />;
    case 'SOSPECHOSO':
      return <AlertCircle color={color} size={16} />;
    default:
      return <HelpCircle color={color} size={16} />;
  }
}

/** Same options as web: `toLocaleTimeString([], { hour, minute })`. */
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Skeleton — RN reproduction of web `<SkeletonRows />` (shared Skeleton.tsx).
// Kept local because mobile has no shared Skeleton primitive yet.
// ---------------------------------------------------------------------------

function SkeletonBlock({ className }: { className: string }) {
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
    // The loop is infinite (-1); stop it on unmount instead of leaving it
    // running against a freed shared value.
    return () => {
      cancelAnimation(opacity);
    };
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View className={`rounded-lg bg-text/10 ${className}`} style={style} />;
}

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
          <SkeletonBlock className="h-10 w-10 rounded-xl" />
          <View className="min-w-0 flex-1 flex-col gap-2">
            <SkeletonBlock className="h-3 w-1/2" />
            <SkeletonBlock className="h-2.5 w-1/3" />
          </View>
          <SkeletonBlock className="h-4 w-16" />
        </LiquidGlass>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function Novedades() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const authLoading = useAuth((s) => s.loading);
  const role = user?.rol;

  const { theme } = useTheme();
  const tokens = tokensFor(theme);

  const [novedades, setNovedades] = useState<Novedad[]>([]);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState<{
    titulo: string;
    descripcion: string;
    tipo: NovedadTipo;
  }>({
    titulo: '',
    descripcion: '',
    tipo: 'INCIDENTE',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tipoPickerOpen, setTipoPickerOpen] = useState(false);

  const loadNovedades = useCallback(async () => {
    try {
      // Las novedades de vigilancia se manejan desde los trámites del backend
      const data = await api.get<Novedad[]>('/solicitudes-servicio');
      setNovedades(data.filter((n) => NOVEDAD_TIPOS.includes(n.tipo)));
    } catch {
      setNovedades([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auth + role gate, then the initial load (same order as web).
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
    void loadNovedades();
  }, [user, authLoading, role, router, loadNovedades]);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    // The web inputs are HTML-`required`, so the browser blocks an empty
    // submit. RN has no equivalent, so the button is disabled while either
    // field is blank and this guard backs it up.
    if (!formData.titulo.trim() || !formData.descripcion.trim()) return;

    setIsSubmitting(true);
    try {
      await api.post('/solicitudes-servicio', {
        categoria: 'OTRO',
        tipo: formData.tipo,
        descripcion: `${formData.titulo}: ${formData.descripcion}`,
        urgente: formData.tipo === 'INCIDENTE',
      });
      toast.success('Novedad registrada exitosamente');
      setFormData({ titulo: '', descripcion: '', tipo: 'INCIDENTE' });
      void loadNovedades();
    } catch {
      toast.error('Error al registrar novedad');
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, isSubmitting, loadNovedades]);

  const canSubmit =
    !isSubmitting && formData.titulo.trim().length > 0 && formData.descripcion.trim().length > 0;

  const selectedTipoLabel =
    TIPO_OPTIONS.find((o) => o.value === formData.tipo)?.label ?? 'Incidente';

  if (loading) {
    return (
      <Screen scroll={false} className="bg-primary">
        <View className="flex-1 items-center justify-center px-6">
          <SkeletonRows />
        </View>
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1 }} className="bg-primary">
      <Screen className="bg-primary">
        <View className="flex-col gap-6 px-6 pt-4">
          <ProfileHeader />

          {/* HEADER — back button + title + subtitle */}
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
                <ChevronLeft size={20} color={tokens.text} />
              </Pressable>
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <FileText size={22} color={tokens.info} />
                  <Text className="text-xl font-bold text-text">Libro de Novedades</Text>
                </View>
                <Text className="text-xs text-text">
                  Bitácora digital de incidentes y entregas de turno
                </Text>
              </View>
            </View>
          </Animated.View>

          {/* REGISTRO */}
          <Animated.View entering={FadeInDown.delay(80).duration(500)}>
            <LiquidGlass radius={24} className="rounded-3xl border border-border">
              <View className="p-6">
                <Text className="mb-4 text-sm font-bold uppercase tracking-widest text-text">
                  Registrar Novedad
                </Text>

                <View className="flex-col gap-4">
                  {/* Título de Novedad */}
                  <View className="flex-col gap-1.5">
                    <Text className="pl-1 text-[10px] font-bold uppercase tracking-widest text-text">
                      Título de Novedad
                    </Text>
                    <TextInput
                      placeholder="Ej: Fuga de agua en sótano 1"
                      placeholderTextColor={tokens.textMuted}
                      value={formData.titulo}
                      onChangeText={(titulo) => setFormData((f) => ({ ...f, titulo }))}
                      editable={!isSubmitting}
                      className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text"
                    />
                  </View>

                  {/* Tipo de Reporte (web <select>) */}
                  <View className="flex-col gap-1.5">
                    <Text className="pl-1 text-[10px] font-bold uppercase tracking-widest text-text">
                      Tipo de Reporte
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setTipoPickerOpen(true)}
                      disabled={isSubmitting}
                      className="w-full flex-row items-center justify-between rounded-xl border border-border bg-surface-2 px-4 py-3"
                    >
                      <Text className="flex-1 text-sm text-text" numberOfLines={1}>
                        {selectedTipoLabel}
                      </Text>
                      <ChevronDown size={18} color={tokens.text} />
                    </Pressable>
                  </View>

                  {/* Descripción Detallada */}
                  <View className="flex-col gap-1.5">
                    <Text className="pl-1 text-[10px] font-bold uppercase tracking-widest text-text">
                      Descripción Detallada
                    </Text>
                    <TextInput
                      placeholder="Describe los acontecimientos, personas involucradas, medidas preventivas."
                      placeholderTextColor={tokens.textMuted}
                      value={formData.descripcion}
                      onChangeText={(descripcion) => setFormData((f) => ({ ...f, descripcion }))}
                      editable={!isSubmitting}
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                      className="min-h-[88px] w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text"
                    />
                  </View>

                  {/* Guardar Reporte */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canSubmit, busy: isSubmitting }}
                    disabled={!canSubmit}
                    onPress={handleSubmit}
                    style={({ pressed }) => ({
                      opacity: !canSubmit ? 0.5 : pressed ? 0.8 : 1,
                      // shadow-lg shadow-success/30
                      shadowColor: tokens.success,
                      shadowOpacity: 0.3,
                      shadowRadius: 12,
                      shadowOffset: { width: 0, height: 6 },
                      elevation: 6,
                    })}
                    className="mt-2 w-full flex-row items-center justify-center gap-2 rounded-full bg-success py-4"
                  >
                    {isSubmitting ? (
                      <Text className="font-bold text-on-accent">Registrando...</Text>
                    ) : (
                      <>
                        <PlusCircle size={18} color={tokens.onAccent} />
                        <Text className="font-bold text-on-accent">Guardar Reporte</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            </LiquidGlass>
          </Animated.View>

          {/* HISTORIAL */}
          <Animated.View entering={FadeInDown.delay(160).duration(500)} className="flex-col gap-4">
            <View className="ml-2 flex-row items-center gap-2">
              <Clock size={16} color={tokens.info} />
              <Text className="text-sm font-bold uppercase tracking-widest text-text">
                Historial de Novedades
              </Text>
            </View>

            {novedades.length === 0 ? (
              <LiquidGlass
                radius={24}
                className="rounded-3xl border border-dashed border-border"
                style={{ padding: 32, alignItems: 'center' }}
              >
                <Text className="text-center text-xs text-text">
                  No hay novedades reportadas.
                </Text>
              </LiquidGlass>
            ) : (
              <View className="ml-4 flex-col gap-6 border-l-2 border-border pl-6">
                {novedades.map((nov, i) => (
                  <Animated.View
                    key={nov.id}
                    entering={FadeInDown.delay(i * 60).duration(450)}
                    style={{ position: 'relative' }}
                  >
                    {/* Timeline dot (absolute -left-[33px] top-6 on web) */}
                    <View
                      className="items-center justify-center rounded-full border-2 border-info bg-text"
                      style={{
                        position: 'absolute',
                        left: -33,
                        top: 24,
                        width: 16,
                        height: 16,
                        zIndex: 10,
                        // web `shadow-lg` (Tailwind's default black drop shadow;
                        // RN's default shadowColor is already black).
                        shadowOpacity: 0.1,
                        shadowRadius: 15,
                        shadowOffset: { width: 0, height: 10 },
                        elevation: 4,
                      }}
                    >
                      <View
                        className="rounded-full bg-info"
                        style={{ width: 6, height: 6 }}
                      />
                    </View>

                    <LiquidGlass radius={24} className="rounded-[24px] border border-border">
                      <View className="p-5">
                        {/* Card header — web is `flex-col … sm:flex-row` +
                            `items-start sm:items-center`, so at phone width the
                            time chip sits BELOW the title block, left-aligned. */}
                        <View className="mb-3 flex-col items-start gap-2 border-b border-border pb-3">
                          <View className="w-full">
                            <View className="flex-row flex-wrap items-center gap-2">
                              <View className="flex-row items-center gap-1.5 rounded border border-border bg-text/5 px-2 py-0.5">
                                {getTipoIcon(nov.tipo, tokens.text)}
                                <Text className="text-[8px] font-black uppercase tracking-wider text-text">
                                  {getTipoLabel(nov.tipo)}
                                </Text>
                              </View>
                              <Text className="text-[10px] text-text">
                                Reporte: #{nov.id.substring(0, 8)}
                              </Text>
                            </View>
                            <Text className="mt-1 text-base font-bold text-text">
                              {nov.titulo}
                            </Text>
                          </View>

                          <View className="flex-row items-center gap-1 rounded-full border border-border bg-text/5 px-2.5 py-1">
                            <Clock size={10} color={tokens.text} />
                            <Text className="text-[10px] text-text">
                              {formatTime(nov.creadoEn)}
                            </Text>
                          </View>
                        </View>

                        {/* Descripción */}
                        <Text className="text-xs leading-relaxed text-text">
                          {nov.descripcion}
                        </Text>

                        {/* Footer */}
                        <View className="mt-4 flex-row items-center justify-between border-t border-border pt-3">
                          <View className="flex-row items-center gap-1">
                            <User size={12} color={tokens.text} />
                            <Text className="text-[10px] text-text">Vigilante: </Text>
                            <Text className="text-[10px] font-bold text-text">
                              {nov.usuario?.nombre || 'N/A'}
                            </Text>
                          </View>
                          <View className="rounded border border-border bg-text/5 px-1.5 py-0.5">
                            <Text className="text-[8px] uppercase text-text">
                              {nov.usuario?.rol || 'PORTERÍA'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </LiquidGlass>
                  </Animated.View>
                ))}
              </View>
            )}
          </Animated.View>
        </View>
      </Screen>

      {/* Tipo de Reporte picker (web <select>) */}
      <Sheet open={tipoPickerOpen} onClose={() => setTipoPickerOpen(false)} snapPoints={['50%']}>
        <View className="flex-1 px-5 pb-6">
          <View className="flex-row items-center justify-between py-3">
            <Text className="text-base font-bold text-text">Tipo de Reporte</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
              onPress={() => setTipoPickerOpen(false)}
              hitSlop={8}
            >
              <X size={20} color={tokens.text} />
            </Pressable>
          </View>

          <BottomSheetScrollView
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            {TIPO_OPTIONS.map((opt) => {
              const selected = opt.value === formData.tipo;
              return (
                <Pressable
                  key={opt.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setFormData((f) => ({ ...f, tipo: opt.value }));
                    setTipoPickerOpen(false);
                  }}
                  className="flex-row items-center justify-between border-b border-border py-3.5"
                >
                  <View className="flex-1 flex-row items-center gap-2.5">
                    {getTipoIcon(opt.value, tokens.text)}
                    <Text className="flex-1 text-sm text-text" numberOfLines={1}>
                      {opt.label}
                    </Text>
                  </View>
                  {selected ? <Check size={18} color={tokens.accent} /> : null}
                </Pressable>
              );
            })}
          </BottomSheetScrollView>
        </View>
      </Sheet>
    </View>
  );
}
