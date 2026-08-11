/**
 * Control de Visitas — mobile port of web `src/app/(app)/control-visitas/page.tsx`.
 *
 * Gate/portería screen: scan a pre-registered visitor pass (QR), register a
 * walk-in visitor (peatonal / vehicular) against a resident from the directory,
 * and review today's bitácora with live WebSocket refreshes.
 *
 * Role-gated to VIGILANTE / SUPERVISOR_VIGILANCIA / ADMINISTRADOR / SUPER_ADMIN
 * (everyone else is bounced to /inicio with the same toast the web shows).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  FadeIn,
  FadeInDown,
  ZoomIn,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import {
  Car,
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
  PlusCircle,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react-native';

import { QrScanner } from '@/components/visitas/QrScanner';
import { withAlpha } from '@/components/visitas/colorAlpha';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api } from '@/lib/api/client';
import { useTheme } from '@/providers/ThemeProvider';
import { onSemantic, tokensFor, type ColorTokens } from '@/theme/tokens';

/**
 * Runtime shape returned by `GET /directorio` (backend `DirectorioEntradaDto`):
 * a flat `{id, nombre, torre, apto}` — no `unidad` nesting, `apto` not `numero`.
 */
interface ResidenteDirectorio {
  id: string;
  nombre: string;
  torre: string | null;
  apto: string | null;
}

/**
 * Runtime shape returned by `GET /vigilancia/visitas` (backend
 * `VisitaVigilanciaDto`) — today's visits with the recipient joined on. The
 * `POST /vigilancia/visitas` response is a plain `VisitaDto` with no
 * `residente`, hence the optional field.
 */
interface VisitaItem {
  id?: string;
  nombre: string;
  tipo: string;
  placa: string | null;
  createdAt: string;
  fecha: string;
  documento: string | null;
  estado: string;
  residente?: {
    nombre?: string;
    torre: string | null;
    apto: string | null;
  } | null;
}

const ALLOWED_ROLES = [
  'VIGILANTE',
  'SUPERVISOR_VIGILANCIA',
  'ADMINISTRADOR',
  'SUPER_ADMIN',
];

type TipoIngreso = 'PEATONAL' | 'VEHICULAR';

const TIPO_OPTIONS: { value: TipoIngreso; label: string }[] = [
  { value: 'PEATONAL', label: 'Peatonal' },
  { value: 'VEHICULAR', label: 'Vehicular' },
];

interface FormState {
  usuarioId: string;
  nombre: string;
  documento: string;
  tipo: TipoIngreso;
  vehiculoTipo: string;
  placa: string;
  observacion: string;
}

const INITIAL_FORM: FormState = {
  usuarioId: '',
  nombre: '',
  documento: '',
  tipo: 'PEATONAL',
  vehiculoTipo: 'NINGUNO',
  placa: '',
  observacion: '',
};

interface PendingModalData {
  nombre: string;
  residente: string;
  unidad: string;
}

/** Directory option label — matches the web `<option>` text exactly. */
function residenteLabel(r: ResidenteDirectorio): string {
  const unidad = r.torre && r.apto ? `Torre ${r.torre} - Apto ${r.apto}` : 'Sin unidad';
  return `${unidad} (${r.nombre})`;
}

/** `HH:MM` of the visit, or `--:--` when neither timestamp parses (web parity). */
function visitTime(v: VisitaItem): string {
  const d = new Date(v.createdAt || v.fecha);
  return isNaN(d.getTime())
    ? '--:--'
    : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** Estado chip color — mirrors the web PENDIENTE / APROBADA / RECHAZADA rules. */
function estadoChipColor(estado: string, tokens: ColorTokens): string | null {
  switch (estado) {
    case 'PENDIENTE':
      return tokens.warning;
    case 'APROBADA':
      return tokens.success;
    case 'RECHAZADA':
      return tokens.danger;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Loading placeholder — RN equivalent of the web `<SkeletonRows />`
// (`animate-pulse rounded-lg bg-text/10` bars inside glass rows).
// ---------------------------------------------------------------------------

function PulseBar({
  width,
  height,
  radius = 8,
  color,
}: {
  width: number | `${number}%`;
  height: number;
  radius?: number;
  color: string;
}) {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
    // The infinite repeat has to be torn down explicitly, otherwise it keeps
    // ticking on the UI thread after the skeleton unmounts (data arrived).
    return () => {
      cancelAnimation(opacity);
    };
  }, [opacity]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: color }, animated]}
    />
  );
}

function SkeletonRows({ count = 4 }: { count?: number }) {
  const { theme } = useTheme();
  const tokens = tokensFor(theme);
  const bar = withAlpha(tokens.text, 0.1);

  return (
    <View className="w-full flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <LiquidGlass
          key={i}
          radius={24}
          className="rounded-3xl border border-border dark:border-border"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 20,
          }}
        >
          <PulseBar width={40} height={40} radius={12} color={bar} />
          <View className="min-w-0 flex-1 flex-col gap-2">
            <PulseBar width="50%" height={12} color={bar} />
            <PulseBar width="33%" height={10} color={bar} />
          </View>
          <PulseBar width={64} height={16} color={bar} />
        </LiquidGlass>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ControlVisitas() {
  const user = useAuth((s) => s.user);
  const authLoading = useAuth((s) => s.loading);
  const router = useRouter();
  const role = user?.rol;

  const { theme } = useTheme();
  const tokens = tokensFor(theme);
  const infoInk = onSemantic(theme);

  const [visitas, setVisitas] = useState<VisitaItem[]>([]);
  const [residentes, setResidentes] = useState<ResidenteDirectorio[]>([]);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState<FormState>(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingModal, setPendingModal] = useState<PendingModalData | null>(null);

  const [residentePickerOpen, setResidentePickerOpen] = useState(false);
  const [tipoPickerOpen, setTipoPickerOpen] = useState(false);

  const refetchVisitas = useCallback(async () => {
    try {
      const data = await api.get<VisitaItem[]>('/vigilancia/visitas');
      setVisitas(data);
    } catch {
      /* non-critical: keep the current list on a transient error */
    }
  }, []);

  // Real-time WebSocket subscriptions — keeps every gate terminal in sync.
  useWsSubscription('visita', () => {
    void refetchVisitas();
  });
  useWsSubscription('paquete', () => {
    void refetchVisitas();
  });

  // Auth + role gate, then the parallel initial load (visitas + directorio).
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
        const [visData, dirData] = await Promise.all([
          api.get<VisitaItem[]>('/vigilancia/visitas'),
          api.get<ResidenteDirectorio[]>('/directorio'),
        ]);
        if (cancelled) return;
        setVisitas(visData);
        setResidentes(dirData);
      } catch {
        if (!cancelled) toast.error('Error al cargar datos');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadData();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, role, router]);

  const selectedResidente = useMemo(
    () => residentes.find((r) => r.id === formData.usuarioId) ?? null,
    [residentes, formData.usuarioId],
  );

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    if (!formData.usuarioId) {
      toast.error('Selecciona un residente');
      return;
    }
    // Mirrors the browser-native `required` validation the web form relied on.
    if (!formData.nombre.trim()) {
      toast.error('Ingresa el nombre del visitante');
      return;
    }
    if (formData.tipo === 'VEHICULAR' && !formData.placa.trim()) {
      toast.error('Ingresa la placa del vehículo');
      return;
    }

    setIsSubmitting(true);
    try {
      const newVisita = await api.post<VisitaItem>('/vigilancia/visitas', formData);
      // POST returns VisitaDto (no residente), enrich from local state.
      const residenteInfo = residentes.find((r) => r.id === formData.usuarioId);
      const enriched: VisitaItem = {
        ...newVisita,
        residente: residenteInfo
          ? {
              nombre: residenteInfo.nombre,
              torre: residenteInfo.torre,
              apto: residenteInfo.apto,
            }
          : null,
      };
      setVisitas((prev) => [enriched, ...prev]);
      const nombreRegistrado = formData.nombre;
      setFormData((f) => ({ ...f, nombre: '', documento: '', placa: '', observacion: '' }));
      // Show pending approval modal.
      setPendingModal({
        nombre: nombreRegistrado,
        residente: residenteInfo?.nombre || 'Residente',
        unidad:
          residenteInfo?.torre && residenteInfo?.apto
            ? `Torre ${residenteInfo.torre} - Apto ${residenteInfo.apto}`
            : '',
      });
    } catch {
      toast.error('Error de conexión');
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, isSubmitting, residentes]);

  if (loading) {
    return (
      <Screen scroll={false} className="bg-primary dark:bg-primary">
        <View className="flex-1 items-center justify-center px-6">
          <SkeletonRows />
        </View>
      </Screen>
    );
  }

  const labelColor = withAlpha(tokens.text, 0.55);
  const tipoLabel =
    TIPO_OPTIONS.find((o) => o.value === formData.tipo)?.label ?? 'Peatonal';

  return (
    <View style={{ flex: 1 }} className="bg-primary dark:bg-primary">
      <Screen className="bg-primary dark:bg-primary">
        <View className="flex flex-col gap-6 px-6 pt-4">
          <ProfileHeader />

          {/* QR pass scanner — validates a pre-registered visitor in one tap */}
          <Animated.View entering={FadeInDown.duration(500)}>
            <QrScanner />
          </Animated.View>

          {/* Ingreso Visitas */}
          <Animated.View
            entering={FadeInDown.duration(500).delay(80)}
            className="rounded-3xl border border-border bg-primary-light p-6 dark:border-border dark:bg-primary-light"
          >
            <View className="mb-6 flex-row items-center gap-3">
              <View
                className="h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                style={{ backgroundColor: withAlpha(tokens.info, 0.1) }}
              >
                <Users size={22} color={tokens.info} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-lg font-bold leading-tight text-text dark:text-text">
                  Ingreso Visitas
                </Text>
                <Text className="mt-0.5 text-[11px]" style={{ color: labelColor }}>
                  Control peatonal y vehicular
                </Text>
              </View>
            </View>

            <View className="flex flex-col gap-4">
              {/* Residente Destino */}
              <View className="flex flex-col gap-1.5">
                <Text
                  className="pl-1 text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: labelColor }}
                >
                  Residente Destino
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setResidentePickerOpen(true)}
                  className="w-full flex-row items-center justify-between rounded-2xl border border-border bg-surface2 px-4 py-3 dark:border-border dark:bg-surface2"
                >
                  <Text
                    className="flex-1 text-sm text-text dark:text-text"
                    numberOfLines={1}
                    style={{ opacity: selectedResidente ? 1 : 0.6 }}
                  >
                    {selectedResidente
                      ? residenteLabel(selectedResidente)
                      : 'Seleccione residente...'}
                  </Text>
                  <ChevronDown size={18} color={tokens.text} />
                </Pressable>
              </View>

              {/* Ocupante Principal */}
              <View className="flex flex-col gap-1.5">
                <Text
                  className="pl-1 text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: labelColor }}
                >
                  Ocupante Principal
                </Text>
                <TextInput
                  placeholder="Nombre del visitante"
                  placeholderTextColor={tokens.textMuted}
                  value={formData.nombre}
                  onChangeText={(t) => setFormData((f) => ({ ...f, nombre: t }))}
                  className="w-full rounded-2xl border border-border bg-surface2 px-4 py-3 text-sm text-text dark:border-border dark:bg-surface2 dark:text-text"
                />
              </View>

              {/* Documento de Identidad */}
              <View className="flex flex-col gap-1.5">
                <Text
                  className="pl-1 text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: labelColor }}
                >
                  Documento de Identidad
                </Text>
                <TextInput
                  placeholder="CC / Pasaporte del visitante"
                  placeholderTextColor={tokens.textMuted}
                  value={formData.documento}
                  onChangeText={(t) => setFormData((f) => ({ ...f, documento: t }))}
                  className="w-full rounded-2xl border border-border bg-surface2 px-4 py-3 text-sm text-text dark:border-border dark:bg-surface2 dark:text-text"
                />
              </View>

              {/* Tipo de Ingreso + Placa */}
              <View className="flex-row gap-4">
                <View className="flex-1 flex-col gap-1.5">
                  <Text
                    className="pl-1 text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: labelColor }}
                  >
                    Tipo de Ingreso
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setTipoPickerOpen(true)}
                    className="w-full flex-row items-center justify-between rounded-2xl border border-border bg-surface2 px-4 py-3 dark:border-border dark:bg-surface2"
                  >
                    <Text className="flex-1 text-sm text-text dark:text-text" numberOfLines={1}>
                      {tipoLabel}
                    </Text>
                    <ChevronDown size={18} color={tokens.text} />
                  </Pressable>
                </View>

                {formData.tipo === 'VEHICULAR' ? (
                  <View className="flex-1 flex-col gap-1.5">
                    <Text
                      className="pl-1 text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: labelColor }}
                    >
                      Placa
                    </Text>
                    <TextInput
                      placeholder="ABC-123"
                      placeholderTextColor={tokens.textMuted}
                      value={formData.placa}
                      onChangeText={(t) =>
                        setFormData((f) => ({ ...f, placa: t.toUpperCase() }))
                      }
                      autoCapitalize="characters"
                      className="w-full rounded-2xl border border-border bg-surface2 px-4 py-3 text-sm uppercase text-text dark:border-border dark:bg-surface2 dark:text-text"
                    />
                  </View>
                ) : null}
              </View>

              {/* Registrar Ingreso */}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
                disabled={isSubmitting}
                onPress={() => {
                  void handleSubmit();
                }}
                style={({ pressed }) => ({
                  backgroundColor: tokens.info,
                  opacity: isSubmitting ? 0.6 : pressed ? 0.9 : 1,
                  transform: [{ scale: pressed && !isSubmitting ? 0.98 : 1 }],
                })}
                className="mt-2 w-full flex-row items-center justify-center gap-2 rounded-2xl py-4"
              >
                {isSubmitting ? (
                  <Text className="font-bold" style={{ color: infoInk }}>
                    Registrando...
                  </Text>
                ) : (
                  <>
                    <PlusCircle size={18} color={infoInk} />
                    <Text className="font-bold" style={{ color: infoInk }}>
                      Registrar Ingreso
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </Animated.View>

          {/* Bitácora de Hoy */}
          <Animated.View
            entering={FadeInDown.duration(500).delay(160)}
            className="flex flex-col gap-4"
          >
            <View className="ml-2 flex-row items-center gap-2">
              <Eye size={16} color={tokens.info} />
              <Text className="text-sm font-bold uppercase tracking-widest text-text dark:text-text">
                Bitácora Reciente
              </Text>
            </View>

            {visitas.length === 0 ? (
              <View className="items-center rounded-3xl border border-border bg-primary-light p-8 dark:border-border dark:bg-primary-light">
                <Text className="text-sm font-medium text-text dark:text-text">
                  Sin visitas hoy
                </Text>
                <Text className="mt-1 text-xs" style={{ color: labelColor }}>
                  Los ingresos registrados aparecerán aquí.
                </Text>
              </View>
            ) : null}

            {visitas.map((v, i) => {
              const chipColor = estadoChipColor(v.estado, tokens);
              return (
                <View
                  key={v.id ?? `visita-${i}`}
                  className="flex flex-col gap-3 rounded-3xl border border-border bg-primary-light p-4 dark:border-border dark:bg-primary-light"
                >
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 pr-2">
                      <Text className="font-bold text-text dark:text-text">
                        {v.nombre}
                        {v.documento ? (
                          <Text
                            className="text-xs"
                            style={{
                              color: withAlpha(tokens.text, 0.5),
                              fontFamily: 'JetBrainsMono_400Regular',
                            }}
                          >
                            {'  '}
                            {v.documento}
                          </Text>
                        ) : null}
                      </Text>
                      <Text className="text-xs text-text dark:text-text">
                        Visita a: {v.residente?.torre} - {v.residente?.apto}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-2">
                      {chipColor ? (
                        <View
                          className="rounded-full px-2 py-0.5"
                          style={{ backgroundColor: withAlpha(chipColor, 0.15) }}
                        >
                          <Text
                            className="text-[9px] font-bold"
                            style={{ color: chipColor }}
                          >
                            {v.estado}
                          </Text>
                        </View>
                      ) : null}
                      <View
                        className="rounded-full border border-border px-3 py-1 dark:border-border"
                        style={{ backgroundColor: withAlpha(tokens.text, 0.05) }}
                      >
                        <Text className="text-[10px] font-bold text-text dark:text-text">
                          {visitTime(v)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View
                    className="flex-row items-center gap-4 rounded-xl border bg-surface2 p-2 dark:bg-surface2"
                    style={{ borderColor: withAlpha(tokens.border, 0.4) }}
                  >
                    <View className="flex-row items-center gap-1.5">
                      {v.tipo === 'VEHICULAR' ? (
                        <Car size={14} color={tokens.info} />
                      ) : (
                        <Users size={14} color={tokens.info} />
                      )}
                      <Text
                        className="text-[10px] font-bold uppercase tracking-widest"
                        style={{ color: tokens.info }}
                      >
                        {v.tipo}
                      </Text>
                    </View>
                    {v.placa ? (
                      <View
                        className="rounded border border-border px-2 py-0.5 dark:border-border"
                        style={{ backgroundColor: withAlpha(tokens.text, 0.05) }}
                      >
                        <Text
                          className="text-xs tracking-widest text-text dark:text-text"
                          style={{ fontFamily: 'JetBrainsMono_400Regular' }}
                        >
                          {v.placa}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </Animated.View>
        </View>
      </Screen>

      {/* Residente Destino picker */}
      <Sheet
        open={residentePickerOpen}
        onClose={() => setResidentePickerOpen(false)}
        snapPoints={['60%']}
      >
        <View className="flex-1 px-5 pb-6">
          <View className="flex-row items-center justify-between py-3">
            <Text className="text-base font-bold text-text dark:text-text">Seleccione residente...</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
              onPress={() => setResidentePickerOpen(false)}
              hitSlop={8}
            >
              <X size={20} color={tokens.text} />
            </Pressable>
          </View>

          {residentes.length === 0 ? (
            <Text className="py-6 text-center text-sm" style={{ color: tokens.textMuted }}>
              No hay residentes en el directorio.
            </Text>
          ) : (
            <BottomSheetScrollView
              contentContainerStyle={{ paddingBottom: 24 }}
              showsVerticalScrollIndicator={false}
            >
              {residentes.map((r) => {
                const selected = r.id === formData.usuarioId;
                return (
                  <Pressable
                    key={r.id}
                    accessibilityRole="button"
                    onPress={() => {
                      setFormData((f) => ({ ...f, usuarioId: r.id }));
                      setResidentePickerOpen(false);
                    }}
                    className="flex-row items-center justify-between border-b py-3.5"
                    style={{ borderBottomColor: tokens.border }}
                  >
                    <Text className="flex-1 pr-2 text-sm text-text dark:text-text" numberOfLines={1}>
                      {residenteLabel(r)}
                    </Text>
                    {selected ? <CheckCircle2 size={18} color={tokens.accent} /> : null}
                  </Pressable>
                );
              })}
            </BottomSheetScrollView>
          )}
        </View>
      </Sheet>

      {/* Tipo de Ingreso picker */}
      <Sheet
        open={tipoPickerOpen}
        onClose={() => setTipoPickerOpen(false)}
        snapPoints={['32%']}
      >
        <View className="flex-1 px-5 pb-6">
          <View className="flex-row items-center justify-between py-3">
            <Text className="text-base font-bold text-text dark:text-text">Tipo de Ingreso</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
              onPress={() => setTipoPickerOpen(false)}
              hitSlop={8}
            >
              <X size={20} color={tokens.text} />
            </Pressable>
          </View>

          {TIPO_OPTIONS.map((opt) => {
            const selected = formData.tipo === opt.value;
            return (
              <Pressable
                key={opt.value}
                accessibilityRole="button"
                onPress={() => {
                  setFormData((f) => ({
                    ...f,
                    tipo: opt.value,
                    // Web resets vehiculoTipo to NINGUNO when switching to
                    // PEATONAL and otherwise keeps the current value.
                    vehiculoTipo: opt.value === 'PEATONAL' ? 'NINGUNO' : f.vehiculoTipo,
                  }));
                  setTipoPickerOpen(false);
                }}
                className="flex-row items-center justify-between border-b py-3.5"
                style={{ borderBottomColor: tokens.border }}
              >
                <Text className="flex-1 pr-2 text-sm text-text dark:text-text">{opt.label}</Text>
                {selected ? <CheckCircle2 size={18} color={tokens.accent} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Sheet>

      {/* MODAL: Visita pendiente de aprobación */}
      <Modal
        visible={pendingModal !== null}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setPendingModal(null)}
      >
        <View className="flex-1 items-center justify-center p-6">
          <Animated.View
            entering={FadeIn.duration(200)}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
              onPress={() => setPendingModal(null)}
              style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.8)' }}
            />
          </Animated.View>

          {pendingModal ? (
            <Animated.View
              entering={ZoomIn.duration(300)}
              className="w-full overflow-hidden rounded-[32px] border bg-primary dark:bg-primary"
              style={{
                maxWidth: 384,
                borderColor: withAlpha(tokens.warning, 0.4),
                shadowColor: '#000000',
                shadowOpacity: 0.8,
                shadowRadius: 50,
                shadowOffset: { width: 0, height: 30 },
                elevation: 24,
              }}
            >
              <View className="items-center gap-5 p-8">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar"
                  onPress={() => setPendingModal(null)}
                  hitSlop={8}
                  style={{
                    position: 'absolute',
                    top: 16,
                    right: 16,
                    zIndex: 10,
                    backgroundColor: withAlpha(tokens.text, 0.05),
                  }}
                  className="h-8 w-8 items-center justify-center rounded-full"
                >
                  <X size={18} color={withAlpha(tokens.text, 0.5)} />
                </Pressable>

                <View
                  className="h-16 w-16 items-center justify-center rounded-full border"
                  style={{
                    backgroundColor: withAlpha(tokens.warning, 0.15),
                    borderColor: withAlpha(tokens.warning, 0.3),
                  }}
                >
                  <Clock size={32} color={tokens.warning} />
                </View>

                <View className="items-center gap-2">
                  <Text className="text-xl font-bold text-text dark:text-text">
                    Visita Registrada
                  </Text>
                  <Text
                    className="text-center text-sm"
                    style={{ color: withAlpha(tokens.text, 0.7) }}
                  >
                    El ingreso está{' '}
                    <Text className="font-bold" style={{ color: tokens.warning }}>
                      pendiente de aprobación
                    </Text>{' '}
                    por el residente.
                  </Text>
                </View>

                <View
                  className="w-full gap-3 rounded-2xl border p-4"
                  style={{
                    backgroundColor: withAlpha(tokens.warning, 0.05),
                    borderColor: withAlpha(tokens.warning, 0.15),
                  }}
                >
                  <View className="flex-row items-center gap-3">
                    <ShieldCheck size={18} color={tokens.warning} />
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-text dark:text-text">
                        {pendingModal.nombre}
                      </Text>
                      <Text
                        className="text-xs"
                        style={{ color: withAlpha(tokens.text, 0.5) }}
                      >
                        {pendingModal.residente}
                        {pendingModal.unidad ? ` · ${pendingModal.unidad}` : ''}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Clock size={14} color={withAlpha(tokens.warning, 0.8)} />
                    <Text
                      className="flex-1 text-[11px]"
                      style={{ color: withAlpha(tokens.warning, 0.8) }}
                    >
                      El visitante NO puede ingresar hasta que el residente acepte.
                    </Text>
                  </View>
                </View>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => setPendingModal(null)}
                  style={({ pressed }) => ({
                    backgroundColor: withAlpha(tokens.warning, pressed ? 0.25 : 0.15),
                    borderColor: withAlpha(tokens.warning, 0.3),
                  })}
                  className="w-full items-center rounded-2xl border py-4"
                >
                  <Text className="text-sm font-bold" style={{ color: tokens.warning }}>
                    Entendido
                  </Text>
                </Pressable>
              </View>
            </Animated.View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}
