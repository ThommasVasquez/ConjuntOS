/**
 * Correspondencia — recepción y entrega de cartas, documentos y revistas.
 *
 * Ported 1:1 from web `src/app/(app)/correspondencia/page.tsx`.
 *
 * The two web `<select>`s become a single Sheet-based picker (one sheet
 * instance, two modes) following the `paqueteria.tsx` destinatario pattern, and
 * the three `<img src="/recibo-*.jpg">` utility-bill logos become bundled
 * assets under `assets/images/` rendered through `expo-image`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { CheckCircle2, ChevronDown, Clock, Mail, MapPin, X } from 'lucide-react-native';

import { BottomSheetScrollView } from '@gorhom/bottom-sheet';

import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { Sheet } from '@/components/ui/Sheet';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { toast } from '@/components/ui/toast';
import { SkeletonRows } from '@/components/correspondencia/SkeletonRows';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api } from '@/lib/api/client';
import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor } from '@/theme/tokens';

/**
 * Runtime shape returned by `GET /directorio` for this screen. Matches the
 * backend `DirectorioEntradaDto` — a flat `{id, nombre, torre, apto, telefono}`.
 */
interface ResidenteDirectorio {
  id: string;
  nombre: string;
  torre: string | null;
  apto: string | null;
  telefono: string | null;
}

/**
 * Runtime shape returned by `GET /vigilancia/correspondencia`. Matches the
 * backend `CorrespondenciaVigilanciaDto`: a flattened `CorrespondenciaDto` plus
 * a joined `residente {nombre, torre, apto}` (verified against the serializer).
 */
interface CorrespondenciaItem {
  id: string;
  descripcion: string | null;
  remitente: string;
  tipo: string;
  fechaLlegada: string;
  residente?: {
    nombre: string | null;
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

/** `tipoLabel` in the web source — chip label per correspondence type. */
const TIPO_LABEL: Record<string, string> = {
  CARTA: 'Carta',
  DOCUMENTO: 'Documento',
  REVISTA: 'Revista',
  ENERGIA: 'Recibo Energía',
  AGUA: 'Recibo Agua',
  GAS: 'Recibo Gas',
  OTRO: 'Otro',
};

/**
 * `tipoLogo` in the web source. Web points at `/public/recibo-*.jpg`; the same
 * three files were copied into `assets/images/` so Metro bundles them.
 * A Metro asset `require()` resolves to a numeric asset id, which `expo-image`
 * accepts directly as a `source`.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Metro asset imports
   must be `require()`d: there is no ambient module declaration for *.jpg. */
const TIPO_LOGO: Record<string, number> = {
  ENERGIA: require('../../assets/images/recibo-servicios-logo.jpg') as number,
  AGUA: require('../../assets/images/recibo-agua-logo.jpg') as number,
  GAS: require('../../assets/images/recibo-gas-logo.jpg') as number,
};
/* eslint-enable @typescript-eslint/no-require-imports */

/** The `<option>` list of the web Tipo select, in order, emoji included. */
const TIPO_OPTIONS: { value: string; label: string }[] = [
  { value: 'CARTA', label: 'Carta' },
  { value: 'DOCUMENTO', label: 'Documento' },
  { value: 'REVISTA', label: 'Revista' },
  { value: 'ENERGIA', label: '⚡ Recibo de Energía' },
  { value: 'AGUA', label: '💧 Recibo de Agua' },
  { value: 'GAS', label: '🔥 Recibo de Gas' },
  { value: 'OTRO', label: 'Otro' },
];

/** `esRecibo` in the web source — utility-bill types get the accent treatment. */
function esRecibo(tipo: string): boolean {
  return ['ENERGIA', 'AGUA', 'GAS'].includes(tipo);
}

/** "Torre - Apto Numero (Nombre)" label used by the destinatario select. */
function residenteLabel(r: ResidenteDirectorio): string {
  return `${r.torre} - Apto ${r.apto} (${r.nombre})`;
}

/** Minutes elapsed since arrival, computed once on render (matches web). */
function minutesAgo(fechaLlegada: string): number {
  return Math.floor((new Date().getTime() - new Date(fechaLlegada).getTime()) / 60000);
}

type PickerMode = 'residente' | 'tipo' | null;

interface FormState {
  usuarioId: string;
  tipo: string;
  remitente: string;
  descripcion: string;
}

const INITIAL_FORM: FormState = {
  usuarioId: '',
  tipo: 'CARTA',
  remitente: '',
  descripcion: '',
};

export default function Correspondencia() {
  const user = useAuth((s) => s.user);
  const authLoading = useAuth((s) => s.loading);
  const router = useRouter();
  const role = user?.rol;
  const { theme } = useTheme();
  const tokens = tokensFor(theme);

  const [items, setItems] = useState<CorrespondenciaItem[]>([]);
  const [residentes, setResidentes] = useState<ResidenteDirectorio[]>([]);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState<FormState>(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [picker, setPicker] = useState<PickerMode>(null);

  const refetch = useCallback(async () => {
    try {
      const data = await api.get<CorrespondenciaItem[]>('/vigilancia/correspondencia');
      setItems(data);
    } catch {
      /* non-critical: keep the current list on a transient error */
    }
  }, []);

  // Real-time WebSocket subscription — keeps multiple guards in sync.
  useWsSubscription('correspondencia', () => {
    void refetch();
  });

  // Auth + role gate, then the initial parallel load (correspondencia + directorio).
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
        const [corrData, dirData] = await Promise.all([
          api.get<CorrespondenciaItem[]>('/vigilancia/correspondencia'),
          api.get<ResidenteDirectorio[]>('/directorio'),
        ]);
        if (cancelled) return;
        setItems(corrData);
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

  const selectedTipoLabel = useMemo(
    () => TIPO_OPTIONS.find((t) => t.value === formData.tipo)?.label ?? formData.tipo,
    [formData.tipo],
  );

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    if (!formData.usuarioId) {
      toast.error('Selecciona un residente destino');
      return;
    }
    // Mirrors the web HTML `required` on the remitente input.
    if (!formData.remitente.trim()) {
      toast.error('Completa el remitente');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('/vigilancia/correspondencia', formData);
      toast.success('Correspondencia registrada');
      const fresh = await api.get<CorrespondenciaItem[]>('/vigilancia/correspondencia');
      setItems(fresh);
      setFormData(INITIAL_FORM);
    } catch {
      toast.error('Error de conexión');
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, isSubmitting]);

  const markAsDelivered = useCallback(
    async (id: string) => {
      try {
        await api.put(`/vigilancia/correspondencia/${id}/entregar`);
        toast.success('Entrega confirmada');
        setItems((prev) => prev.filter((p) => p.id !== id));
      } catch {
        toast.error('Error de red');
      }
    },
    [],
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

  return (
    <View style={{ flex: 1 }} className="bg-primary">
      <Screen className="bg-primary">
        <View className="flex flex-col gap-6 px-6 pt-4">
          <ProfileHeader />

          {/* Registration form */}
          <Animated.View entering={FadeInDown.duration(500)}>
            <LiquidGlass className="rounded-3xl" radius={24}>
              <View className="p-6">
                <View className="mb-6 flex-row items-center gap-3">
                  <View className="h-12 w-12 items-center justify-center rounded-2xl border border-text/30 bg-text/20">
                    <Mail size={24} color={tokens.text} />
                  </View>
                  <View>
                    <Text className="text-xl font-bold text-text">Correspondencia</Text>
                    <Text className="text-xs text-text">Cartas, documentos y revistas</Text>
                  </View>
                </View>

                <View className="flex flex-col gap-4">
                  {/* Destinatario */}
                  <View className="flex flex-col gap-1.5">
                    <Text className="pl-1 text-[10px] font-bold uppercase tracking-widest text-text">
                      Destinatario
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setPicker('residente')}
                      className="w-full flex-row items-center justify-between rounded-2xl border border-border bg-surface2 px-4 py-3"
                    >
                      <Text
                        className="flex-1 text-sm text-text"
                        numberOfLines={1}
                        style={{ opacity: selectedResidente ? 1 : 0.6 }}
                      >
                        {selectedResidente
                          ? residenteLabel(selectedResidente)
                          : 'Seleccione apartamento/residente...'}
                      </Text>
                      <ChevronDown size={18} color={tokens.text} />
                    </Pressable>
                  </View>

                  {/* Tipo (flex-1) + Remitente (flex-[2]) */}
                  <View className="flex-row gap-4">
                    <View className="flex-1 flex-col gap-1.5">
                      <Text className="pl-1 text-[10px] font-bold uppercase tracking-widest text-text">
                        Tipo
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setPicker('tipo')}
                        className="w-full flex-row items-center justify-between rounded-2xl border border-border bg-surface2 px-4 py-3"
                      >
                        <Text className="flex-1 text-sm text-text" numberOfLines={1}>
                          {selectedTipoLabel}
                        </Text>
                        <ChevronDown size={18} color={tokens.text} />
                      </Pressable>
                    </View>
                    <View className="flex-col gap-1.5" style={{ flex: 2 }}>
                      <Text className="pl-1 text-[10px] font-bold uppercase tracking-widest text-text">
                        Remitente
                      </Text>
                      <TextInput
                        placeholder="Banco, Notaría..."
                        placeholderTextColor={tokens.textMuted}
                        value={formData.remitente}
                        onChangeText={(t) => setFormData((f) => ({ ...f, remitente: t }))}
                        // Web's inputs live in a <form>, so Enter submits it.
                        returnKeyType="done"
                        onSubmitEditing={() => {
                          void handleSubmit();
                        }}
                        className="w-full rounded-2xl border border-border bg-surface2 px-4 py-3 text-sm text-text"
                      />
                    </View>
                  </View>

                  {/* Descripción */}
                  <View className="flex flex-col gap-1.5">
                    <Text className="pl-1 text-[10px] font-bold uppercase tracking-widest text-text">
                      Descripción
                    </Text>
                    <TextInput
                      placeholder="Sobre membretado, Factura..."
                      placeholderTextColor={tokens.textMuted}
                      value={formData.descripcion}
                      onChangeText={(t) => setFormData((f) => ({ ...f, descripcion: t }))}
                      // Web's inputs live in a <form>, so Enter submits it.
                      returnKeyType="done"
                      onSubmitEditing={() => {
                        void handleSubmit();
                      }}
                      className="w-full rounded-2xl border border-border bg-surface2 px-4 py-3 text-sm text-text"
                    />
                  </View>

                  {/* Submit — web carries the accent glow shadow
                      `shadow-[0_0_20px_rgba(45,212,191,0.28)]`. */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
                    disabled={isSubmitting}
                    onPress={handleSubmit}
                    style={({ pressed }) => ({
                      opacity: isSubmitting ? 0.6 : pressed ? 0.85 : 1,
                      shadowColor: tokens.accent,
                      shadowOpacity: 0.28,
                      shadowRadius: 10,
                      shadowOffset: { width: 0, height: 0 },
                      elevation: 6,
                    })}
                    className="mt-2 w-full flex-row items-center justify-center gap-2 rounded-2xl bg-accent py-4"
                  >
                    {isSubmitting ? (
                      <Text className="font-bold text-on-accent">Registrando...</Text>
                    ) : (
                      <>
                        <Mail size={18} color={tokens.onAccent} />
                        <Text className="font-bold text-on-accent">
                          Clasificar Correspondencia
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            </LiquidGlass>
          </Animated.View>

          {/* Inventario Portería */}
          <Animated.View
            entering={FadeInDown.duration(500).delay(100)}
            className="flex flex-col gap-4"
          >
            <View className="ml-2 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Clock size={16} color={tokens.text} />
                <Text className="text-sm font-bold uppercase tracking-widest text-text">
                  Inventario Portería
                </Text>
              </View>
              <View className="rounded-full bg-surface2 px-2 py-0.5">
                <Text className="text-[10px] font-bold text-text">{items.length} ÍTEMS</Text>
              </View>
            </View>

            {items.length === 0 ? (
              <Text className="py-6 text-center text-sm text-text">
                Portería libre de correspondencia.
              </Text>
            ) : null}

            {items.map((p) => {
              const recibo = esRecibo(p.tipo);
              return (
                <LiquidGlass key={p.id} variant="card" className="rounded-3xl" radius={24}>
                  {/* Decorative halo — web `w-24 h-24 bg-text/10 rounded-full blur-2xl`
                      translated half out of the top-right corner. RN has no CSS
                      blur filter, so the soft circle stands in for it. */}
                  <View
                    pointerEvents="none"
                    className="absolute h-24 w-24 rounded-full bg-text/10"
                    style={{ top: -48, right: -48 }}
                  />

                  <View className="flex flex-col gap-4 p-5">
                    <View className="flex-row items-start justify-between">
                      <View className="flex-1 pr-3">
                        <View className="mb-1 flex-row items-center gap-2">
                          {recibo ? (
                            // Web: `w-10 h-10 rounded-xl object-cover border border-accent/30
                            // shadow-lg`. The border lives on a wrapper so the
                            // accent/30 Tailwind alpha applies verbatim.
                            <View className="h-10 w-10 overflow-hidden rounded-xl border border-accent/30">
                              <Image
                                source={TIPO_LOGO[p.tipo] ?? null}
                                alt={TIPO_LABEL[p.tipo] ?? p.tipo}
                                contentFit="cover"
                                style={{ width: '100%', height: '100%' }}
                              />
                            </View>
                          ) : null}
                          <View
                            className={`rounded-full border px-2.5 py-0.5 ${
                              recibo
                                ? 'border-accent/30 bg-accent/15'
                                : 'border-border bg-surface2'
                            }`}
                          >
                            <Text
                              className={`text-[10px] font-black uppercase tracking-widest ${
                                recibo ? 'text-accent' : 'text-text'
                              }`}
                            >
                              {TIPO_LABEL[p.tipo] || p.tipo}
                            </Text>
                          </View>
                        </View>
                        <Text className="mt-1 text-lg font-bold leading-tight text-text">
                          {p.descripcion || 'Sin descripción'}
                        </Text>
                        <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                          {p.remitente}
                        </Text>
                      </View>
                      <View className="rounded-full border border-border bg-surface2 px-3 py-1">
                        <Text className="text-[10px] font-bold text-text">
                          Hace {minutesAgo(p.fechaLlegada)} min
                        </Text>
                      </View>
                    </View>

                    <View className="flex-row items-center gap-2">
                      <MapPin size={14} color={tokens.text} />
                      <Text className="text-xs font-semibold text-text">
                        {p.residente?.torre} - Apto {p.residente?.apto} ({p.residente?.nombre})
                      </Text>
                    </View>

                    <Pressable
                      accessibilityRole="button"
                      onPress={() => markAsDelivered(p.id)}
                      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                      className="mt-2 w-full flex-row items-center justify-center gap-2 rounded-xl border border-border bg-surface2 py-3"
                    >
                      <CheckCircle2 size={16} color={tokens.text} />
                      <Text className="text-xs font-bold uppercase tracking-widest text-text">
                        Marcar como Entregado
                      </Text>
                    </Pressable>
                  </View>
                </LiquidGlass>
              );
            })}
          </Animated.View>
        </View>
      </Screen>

      {/* Destinatario / Tipo picker — one sheet instance, two modes. */}
      <Sheet
        open={picker !== null}
        onClose={() => setPicker(null)}
        snapPoints={picker === 'tipo' ? ['55%'] : ['60%']}
      >
        <View className="flex-1 px-5 pb-6">
          <View className="flex-row items-center justify-between py-3">
            <Text className="text-base font-bold text-text">
              {picker === 'tipo' ? 'Selecciona el tipo' : 'Selecciona destinatario'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
              onPress={() => setPicker(null)}
              hitSlop={8}
            >
              <X size={20} color={tokens.text} />
            </Pressable>
          </View>

          {picker === 'tipo' ? (
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
                    onPress={() => {
                      setFormData((f) => ({ ...f, tipo: opt.value }));
                      setPicker(null);
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
          ) : residentes.length === 0 ? (
            <Text className="py-6 text-center text-sm text-textMuted">
              No hay residentes en el directorio.
            </Text>
          ) : (
            <BottomSheetScrollView
              contentContainerStyle={{ paddingBottom: 24 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Web's `<option value="">` is selectable, so the destinatario
                  can be cleared back to the empty value. Same copy, same
                  effect (submitting then raises "Selecciona un residente
                  destino"). */}
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setFormData((f) => ({ ...f, usuarioId: '' }));
                  setPicker(null);
                }}
                className="flex-row items-center justify-between border-b border-border py-3.5"
              >
                <Text
                  className="flex-1 pr-2 text-sm text-text"
                  numberOfLines={1}
                  style={{ opacity: 0.6 }}
                >
                  Seleccione apartamento/residente...
                </Text>
                {formData.usuarioId === '' ? (
                  <CheckCircle2 size={18} color={tokens.accent} />
                ) : null}
              </Pressable>
              {residentes.map((r) => {
                const selected = r.id === formData.usuarioId;
                return (
                  <Pressable
                    key={r.id}
                    accessibilityRole="button"
                    onPress={() => {
                      setFormData((f) => ({ ...f, usuarioId: r.id }));
                      setPicker(null);
                    }}
                    className="flex-row items-center justify-between border-b border-border py-3.5"
                  >
                    <Text className="flex-1 pr-2 text-sm text-text" numberOfLines={1}>
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
    </View>
  );
}
