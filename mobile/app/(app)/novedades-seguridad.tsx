/**
 * NOVEDADES DE SEGURIDAD — CONJUNTOSAPP (mobile port)
 * Feed de incidentes de seguridad: reporte + bandeja activa + histórico resuelto.
 *
 * Ported 1:1 from web `src/app/(app)/novedades-seguridad/page.tsx`:
 *  - Roles VIGILANTE / SUPERVISOR_VIGILANCIA / ADMINISTRADOR / SUPER_ADMIN
 *    (toast + redirect a /inicio si no; a /login sin sesión).
 *  - GET /vigilancia/novedades (carga inicial + refetch por WS `novedad`).
 *  - POST /vigilancia/novedades {tipo, ubicacion, descripcion, severidad}.
 *  - PUT /vigilancia/novedades/{id}/resolver {resolucion}.
 *  - Los `<select>` del web → sheet picker (patrón de paqueteria.tsx).
 *  - Skeleton de carga: `<SkeletonRows />` centrado, igual que el web.
 */

import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  MapPin,
  ShieldAlert,
  X,
} from 'lucide-react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';

import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { Sheet } from '@/components/ui/Sheet';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { SkeletonRows } from '@/components/finanzas/Skeletons';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api } from '@/lib/api/client';
import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor } from '@/theme/tokens';

// ---------------------------------------------------------------------------
// Types + config (mirror the web page's local declarations verbatim)
// ---------------------------------------------------------------------------

interface NovedadItem {
  id: string;
  descripcion: string;
  tipo: string;
  ubicacion: string;
  severidad: string;
  estado: string;
  createdAt: string;
  resolucion?: string;
  reportadoPor?: {
    nombre: string;
    torre: string;
    apto: string;
  };
}

const SEVERITY_BADGE: Record<string, string> = {
  BAJA: '🟢 BAJA',
  MEDIA: '🟡 MEDIA',
  ALTA: '🟠 ALTA',
  CRITICA: '🔴 CRÍTICA',
};

/**
 * Chip colors per severity — a FOUR-hue escalation, exactly like the web page
 * (`green-500/10 text-green-400` → `yellow` → `orange` → `red`).
 *
 * BAJA/MEDIA/CRÍTICA map cleanly onto the semantic tokens (dark `danger`
 * #f87171 IS Tailwind `red-400`, `warning` #fbbf24 is `amber-400`, `success`
 * #34d399 is `emerald-400`), so the hues stay faithful while following the
 * scheme. ALTA is the one gap: there is no `orange` design token, and folding it
 * into `danger` made ALTA and CRÍTICA render the same hue — a real parity loss
 * the web page does not have. So ALTA keeps the web's one-off palette classes
 * verbatim, the same way `pqrs.tsx` keeps `bg-green-500/10 text-green-400` and
 * `admin-documentos.tsx` keeps `bg-orange-100 text-orange-700`. These are
 * Tailwind preset classes, not raw hex, and they are what web renders today.
 */
const SEVERITY_CHIP: Record<string, { bg: string; text: string; border: string }> = {
  BAJA: { bg: 'bg-success/10', text: 'text-success', border: 'border-success/30' },
  MEDIA: { bg: 'bg-warning/10', text: 'text-warning', border: 'border-warning/30' },
  ALTA: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
  CRITICA: { bg: 'bg-danger/10', text: 'text-danger', border: 'border-danger/30' },
};

/** Web fallback when the severity is unknown: `bg-surface-2 text-text border-border`. */
const SEVERITY_CHIP_FALLBACK = {
  bg: 'bg-surface-2',
  text: 'text-text',
  border: 'border-border',
};

const TIPO_LABEL: Record<string, string> = {
  PERSONA_SOSPECHOSA: 'Persona Sospechosa',
  RUIDO: 'Ruido',
  DAÑO: 'Daño',
  INCENDIO: 'Incendio',
  OTRO: 'Otro',
};

const TIPO_ICON: Record<string, string> = {
  PERSONA_SOSPECHOSA: '👤',
  RUIDO: '🔊',
  DAÑO: '💥',
  INCENDIO: '🔥',
  OTRO: '📋',
};

/** Option order of the web `<select>` elements. */
const TIPO_ORDER = ['PERSONA_SOSPECHOSA', 'RUIDO', 'DAÑO', 'INCENDIO', 'OTRO'];
const SEVERIDAD_ORDER = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'];

const ALLOWED_ROLES = [
  'VIGILANTE',
  'SUPERVISOR_VIGILANCIA',
  'ADMINISTRADOR',
  'SUPER_ADMIN',
];

interface FormState {
  tipo: string;
  ubicacion: string;
  descripcion: string;
  severidad: string;
}

const INITIAL_FORM: FormState = {
  tipo: 'PERSONA_SOSPECHOSA',
  ubicacion: '',
  descripcion: '',
  severidad: 'MEDIA',
};

type PickerField = 'tipo' | 'severidad';

interface PickerOption {
  value: string;
  label: string;
}

const TIPO_OPTIONS: PickerOption[] = TIPO_ORDER.map((value) => ({
  value,
  label: `${TIPO_ICON[value]} ${TIPO_LABEL[value]}`,
}));

const SEVERIDAD_OPTIONS: PickerOption[] = SEVERIDAD_ORDER.map((value) => ({
  value,
  label: SEVERITY_BADGE[value],
}));

/** `Hace N min` / `Hace Nh` / `Hace Nd` — same thresholds as the web helper. */
function formatTimeAgo(dateStr: string): string {
  const diff = Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / 60000);
  if (diff < 60) return `Hace ${diff} min`;
  const hours = Math.floor(diff / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days}d`;
}

/** "Reportado por: X • Torre Y • Apto Z" (torre/apto only when truthy). */
function reportadoPorLabel(r: NonNullable<NovedadItem['reportadoPor']>): string {
  let out = `Reportado por: ${r.nombre}`;
  if (r.torre) out += ` • Torre ${r.torre}`;
  if (r.apto) out += ` • Apto ${r.apto}`;
  return out;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function NovedadesSeguridad() {
  const user = useAuth((s) => s.user);
  const authLoading = useAuth((s) => s.loading);
  const router = useRouter();
  const role = user?.rol;

  const { theme } = useTheme();
  const tokens = tokensFor(theme);

  const [novedades, setNovedades] = useState<NovedadItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState<FormState>(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Resolve prompt state
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolucionText, setResolucionText] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  // Which field the sheet edits, kept NON-null across the close animation: a
  // nullable field made the sheet's title + option list flip to "Severidad"
  // while the Tipo sheet was still sliding out.
  const [pickerField, setPickerField] = useState<PickerField>('tipo');
  const [pickerOpen, setPickerOpen] = useState(false);

  const openPicker = useCallback((field: PickerField) => {
    setPickerField(field);
    setPickerOpen(true);
  }, []);

  const refetchNovedades = useCallback(async () => {
    try {
      const data = await api.get<NovedadItem[]>('/vigilancia/novedades');
      setNovedades(data);
    } catch {
      /* non-critical: keep the current list on a transient error */
    }
  }, []);

  // Real-time WebSocket subscription.
  useWsSubscription('novedad', () => {
    void refetchNovedades();
  });

  // Auth + role gate, then initial data load.
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

    let cancelled = false;
    async function loadData() {
      try {
        const data = await api.get<NovedadItem[]>('/vigilancia/novedades');
        if (!cancelled) setNovedades(data);
      } catch {
        if (!cancelled) toast.error('Error al cargar novedades');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadData();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, role, router]);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    // Mirrors the web HTML `required` on ubicación/descripción (no native form
    // validation on RN, so the guard is manual).
    if (!formData.ubicacion.trim() || !formData.descripcion.trim()) {
      toast.error('Completa la ubicación y la descripción');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('/vigilancia/novedades', formData);
      toast.success('Novedad reportada exitosamente');
      const fresh = await api.get<NovedadItem[]>('/vigilancia/novedades');
      setNovedades(fresh);
      setFormData(INITIAL_FORM);
    } catch {
      toast.error('Error al reportar novedad');
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, isSubmitting]);

  const handleResolve = useCallback(
    async (id: string) => {
      if (!resolucionText.trim()) {
        toast.error('Describe la resolución de la novedad');
        return;
      }

      setIsResolving(true);
      try {
        await api.put(`/vigilancia/novedades/${id}/resolver`, {
          resolucion: resolucionText,
        });
        toast.success('Novedad resuelta');
        const fresh = await api.get<NovedadItem[]>('/vigilancia/novedades');
        setNovedades(fresh);
        setResolvingId(null);
        setResolucionText('');
      } catch {
        toast.error('Error al resolver novedad');
      } finally {
        setIsResolving(false);
      }
    },
    [resolucionText],
  );

  if (loading) {
    return (
      <Screen scroll={false} className="bg-primary">
        <View className="flex-1 items-center justify-center px-6">
          <SkeletonRows />
        </View>
      </Screen>
    );
  }

  const activas = novedades.filter((n) => n.estado !== 'CERRADO');
  const resueltas = novedades.filter((n) => n.estado === 'CERRADO');

  const pickerOptions = pickerField === 'tipo' ? TIPO_OPTIONS : SEVERIDAD_OPTIONS;
  const pickerTitle = pickerField === 'tipo' ? 'Tipo de Novedad' : 'Severidad';
  const pickerSelected = pickerField === 'tipo' ? formData.tipo : formData.severidad;

  const renderCard = (n: NovedadItem, resolved: boolean) => {
    const chip = SEVERITY_CHIP[n.severidad] ?? SEVERITY_CHIP_FALLBACK;
    // Web puts `opacity-70` on the whole resolved card, so the wrapper View (not
    // the inner content) carries it — border and glass fill fade too.
    return (
      <View key={n.id} style={resolved ? { opacity: 0.7 } : undefined}>
        <LiquidGlass variant="card" className="rounded-3xl" radius={24}>
          <View className="flex flex-col gap-4 p-5">
            {/* Decorative corner glow (web: w-24 h-24 blur-2xl, translated 50%). */}
            <View
              pointerEvents="none"
              className={`absolute h-24 w-24 rounded-full ${
                resolved ? 'bg-success/10' : 'bg-danger/10'
              }`}
              style={{ top: -48, right: -48 }}
            />

            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <View className="mb-1 flex-row flex-wrap items-center gap-2">
                  <View className={`rounded-full border px-2.5 py-0.5 ${chip.bg} ${chip.border}`}>
                    <Text
                      className={`text-[10px] font-black uppercase tracking-widest ${chip.text}`}
                    >
                      {SEVERITY_BADGE[n.severidad] || n.severidad}
                    </Text>
                  </View>
                  <View className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5">
                    <Text className="text-[10px] font-black uppercase tracking-widest text-text">
                      {TIPO_ICON[n.tipo]} {TIPO_LABEL[n.tipo] || n.tipo}
                    </Text>
                  </View>
                  {resolved ? (
                    <View className="rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5">
                      <Text className="text-[10px] font-black uppercase tracking-widest text-success">
                        Resuelto
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text className="mt-1 text-lg font-bold leading-tight text-text">
                  {n.descripcion}
                </Text>
                {resolved && n.resolucion ? (
                  <Text className="mt-1 text-xs italic text-text">
                    Resolución: {n.resolucion}
                  </Text>
                ) : null}
              </View>
              <View className="rounded-full border border-border bg-surface-2 px-3 py-1">
                <Text className="text-[10px] font-bold text-text">
                  {formatTimeAgo(n.createdAt)}
                </Text>
              </View>
            </View>

            <View className="flex-row items-center gap-2">
              <MapPin size={14} color={tokens.text} />
              <Text className="text-xs font-semibold text-text">{n.ubicacion}</Text>
            </View>

            {n.reportadoPor ? (
              <View className="flex-row items-center gap-2">
                <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                  {reportadoPorLabel(n.reportadoPor)}
                </Text>
              </View>
            ) : null}

            {/* Resolve section — active cards only (web renders it only for activas). */}
            {resolved ? null : resolvingId === n.id ? (
              <View className="flex flex-col gap-2">
                <TextInput
                  autoFocus
                  multiline
                  textAlignVertical="top"
                  placeholder="Describe cómo se resolvió la novedad..."
                  placeholderTextColor={tokens.textMuted}
                  value={resolucionText}
                  onChangeText={setResolucionText}
                  editable={!isResolving}
                  className="min-h-[64px] w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-xs text-text"
                />
                <View className="flex-row gap-2">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: isResolving, busy: isResolving }}
                    disabled={isResolving}
                    onPress={() => void handleResolve(n.id)}
                    style={({ pressed }) => ({
                      opacity: isResolving ? 0.6 : pressed ? 0.85 : 1,
                    })}
                    className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-success/20 py-2.5"
                  >
                    {isResolving ? (
                      <Text className="text-xs font-bold uppercase tracking-widest text-success">
                        Resolviendo...
                      </Text>
                    ) : (
                      <>
                        <CheckCircle2 size={14} color={tokens.success} />
                        <Text className="text-xs font-bold uppercase tracking-widest text-success">
                          Confirmar Resolución
                        </Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isResolving}
                    onPress={() => {
                      setResolvingId(null);
                      setResolucionText('');
                    }}
                    style={({ pressed }) => ({
                      opacity: isResolving ? 0.6 : pressed ? 0.85 : 1,
                    })}
                    className="rounded-xl border border-border bg-surface-2 px-4 py-2.5"
                  >
                    <Text className="text-xs font-bold uppercase tracking-widest text-text">
                      Cancelar
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setResolvingId(n.id);
                  setResolucionText('');
                }}
                style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                className="mt-2 w-full flex-row items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-3"
              >
                <CheckCircle2 size={16} color={tokens.text} />
                <Text className="text-xs font-bold uppercase tracking-widest text-text">
                  Marcar como Resuelto
                </Text>
              </Pressable>
            )}
          </View>
        </LiquidGlass>
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }} className="bg-primary">
      <Screen className="bg-primary">
        <View className="flex flex-col gap-6 px-6 pt-4">
          <ProfileHeader />

          {/* Reportar Novedad Form */}
          <Animated.View entering={FadeInDown.duration(500)}>
            <LiquidGlass className="rounded-3xl" radius={24}>
              <View className="p-6">
                <View className="mb-6 flex-row items-center gap-3">
                  <View className="h-12 w-12 items-center justify-center rounded-2xl border border-danger/30 bg-danger/10">
                    <ShieldAlert size={24} color={tokens.danger} />
                  </View>
                  <View>
                    <Text className="text-xl font-bold text-text">Reportar Novedad</Text>
                    <Text className="text-xs text-text">Registrar incidente de seguridad</Text>
                  </View>
                </View>

                <View className="flex flex-col gap-4">
                  {/* Tipo de Novedad + Severidad (web: two side-by-side selects) */}
                  <View className="flex-row gap-4">
                    <View className="flex-1 flex-col gap-1.5">
                      <Text className="pl-1 text-[10px] font-bold uppercase tracking-widest text-text">
                        Tipo de Novedad
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => openPicker('tipo')}
                        className="w-full flex-row items-center justify-between rounded-2xl border border-border bg-surface-2 px-4 py-3"
                      >
                        <Text className="flex-1 text-sm text-text" numberOfLines={1}>
                          {TIPO_ICON[formData.tipo]} {TIPO_LABEL[formData.tipo]}
                        </Text>
                        <ChevronDown size={18} color={tokens.text} />
                      </Pressable>
                    </View>
                    <View className="flex-1 flex-col gap-1.5">
                      <Text className="pl-1 text-[10px] font-bold uppercase tracking-widest text-text">
                        Severidad
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => openPicker('severidad')}
                        className="w-full flex-row items-center justify-between rounded-2xl border border-border bg-surface-2 px-4 py-3"
                      >
                        <Text className="flex-1 text-sm text-text" numberOfLines={1}>
                          {SEVERITY_BADGE[formData.severidad]}
                        </Text>
                        <ChevronDown size={18} color={tokens.text} />
                      </Pressable>
                    </View>
                  </View>

                  {/* Ubicación */}
                  <View className="flex flex-col gap-1.5">
                    <Text className="pl-1 text-[10px] font-bold uppercase tracking-widest text-text">
                      Ubicación
                    </Text>
                    <TextInput
                      placeholder="Ej: Torre A, Piso 3, Parqueadero..."
                      placeholderTextColor={tokens.textMuted}
                      value={formData.ubicacion}
                      onChangeText={(t) => setFormData((f) => ({ ...f, ubicacion: t }))}
                      editable={!isSubmitting}
                      className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-text"
                    />
                  </View>

                  {/* Descripción */}
                  <View className="flex flex-col gap-1.5">
                    <Text className="pl-1 text-[10px] font-bold uppercase tracking-widest text-text">
                      Descripción
                    </Text>
                    <TextInput
                      multiline
                      textAlignVertical="top"
                      placeholder="Describe la novedad o incidente..."
                      placeholderTextColor={tokens.textMuted}
                      value={formData.descripcion}
                      onChangeText={(t) => setFormData((f) => ({ ...f, descripcion: t }))}
                      editable={!isSubmitting}
                      className="min-h-[88px] w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-text"
                    />
                  </View>

                  {/* Submit */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
                    disabled={isSubmitting}
                    onPress={() => void handleSubmit()}
                    style={({ pressed }) => ({
                      opacity: isSubmitting ? 0.6 : pressed ? 0.85 : 1,
                      // web: shadow-[0_0_20px_rgba(239,68,68,0.2)]
                      shadowColor: tokens.danger,
                      shadowOpacity: 0.2,
                      shadowRadius: 20,
                      shadowOffset: { width: 0, height: 0 },
                      elevation: 4,
                    })}
                    className="mt-2 w-full flex-row items-center justify-center gap-2 rounded-2xl bg-danger/20 py-4"
                  >
                    {isSubmitting ? (
                      <Text className="font-bold text-danger">Reportando...</Text>
                    ) : (
                      <>
                        <AlertTriangle size={18} color={tokens.danger} />
                        <Text className="font-bold text-danger">Reportar Novedad</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            </LiquidGlass>
          </Animated.View>

          {/* Novedades Activas */}
          <Animated.View
            entering={FadeInDown.duration(500).delay(100)}
            className="flex flex-col gap-4"
          >
            <View className="ml-2 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Clock size={16} color={tokens.text} />
                <Text className="text-sm font-bold uppercase tracking-widest text-text">
                  Novedades Activas
                </Text>
              </View>
              <View className="rounded-full bg-surface-2 px-2 py-0.5">
                <Text className="text-[10px] font-bold text-text">
                  {activas.length} ACTIVAS
                </Text>
              </View>
            </View>

            {activas.length === 0 ? (
              <Text className="py-6 text-center text-sm text-text">Sin novedades activas.</Text>
            ) : null}

            {activas.map((n) => renderCard(n, false))}
          </Animated.View>

          {/* Novedades Resueltas */}
          {resueltas.length > 0 ? (
            <Animated.View
              entering={FadeInDown.duration(500).delay(200)}
              className="flex flex-col gap-4"
            >
              <View className="ml-2 flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <FileText size={16} color={tokens.text} />
                  <Text className="text-sm font-bold uppercase tracking-widest text-text">
                    Novedades Resueltas
                  </Text>
                </View>
                <View className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5">
                  <Text className="text-[10px] font-bold text-success">
                    {resueltas.length} RESUELTAS
                  </Text>
                </View>
              </View>

              {resueltas.map((n) => renderCard(n, true))}
            </Animated.View>
          ) : null}
        </View>
      </Screen>

      {/* Tipo / Severidad picker sheet (web `<select>`) */}
      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} snapPoints={['50%']}>
        <View className="flex-1 px-5 pb-6">
          <View className="flex-row items-center justify-between py-3">
            <Text className="text-base font-bold text-text">{pickerTitle}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
              onPress={() => setPickerOpen(false)}
              hitSlop={8}
            >
              <X size={20} color={tokens.text} />
            </Pressable>
          </View>

          <BottomSheetScrollView
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            {pickerOptions.map((opt) => {
              const selected = opt.value === pickerSelected;
              return (
                <Pressable
                  key={opt.value}
                  accessibilityRole="button"
                  onPress={() => {
                    if (pickerField === 'tipo') {
                      setFormData((f) => ({ ...f, tipo: opt.value }));
                    } else {
                      setFormData((f) => ({ ...f, severidad: opt.value }));
                    }
                    setPickerOpen(false);
                  }}
                  className="flex-row items-center justify-between border-b border-border py-3.5"
                >
                  <Text className="flex-1 pr-2 text-sm text-text" numberOfLines={1}>
                    {opt.label}
                  </Text>
                  {selected ? <CheckCircle2 size={18} color={tokens.accent} /> : null}
                </Pressable>
              );
            })}
          </BottomSheetScrollView>
        </View>
      </Sheet>
    </View>
  );
}
