import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  CheckCircle2,
  ChevronDown,
  Clock,
  History,
  MapPin,
  Package,
  ScanLine,
  X,
} from 'lucide-react-native';

import { BottomSheetScrollView } from '@gorhom/bottom-sheet';

import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { toast } from '@/components/ui/toast';
import { SkeletonRows } from '@/components/paqueteria/SkeletonRows';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api } from '@/lib/api/client';
import { useTheme } from '@/providers/ThemeProvider';
import { glassFor, tokensFor } from '@/theme/tokens';

/**
 * Runtime shape returned by `GET /vigilancia/paquetes` (only EN_PORTERIA
 * packages) and `GET /vigilancia/paquetes/entregados` (delivered history).
 * Matches the backend `PaqueteVigilanciaDto`: a flat
 * `residente {nombre, torre, apto}` joined onto the package fields (verified
 * against the live serializer — no `usuario`/`unidad` nesting, `apto` not
 * `numero`).
 */
interface PaqueteItem {
  id: string;
  descripcion: string;
  remitente: string;
  fechaLlegada: string;
  entregadoEn?: string | null;
  residente?: {
    nombre: string | null;
    torre: string | null;
    apto: string | null;
  } | null;
}

/**
 * Runtime shape returned by `GET /directorio` for this screen. Matches the
 * backend `DirectorioEntradaDto`: a flat `{id, nombre, torre, apto, telefono}`
 * (verified against the live serializer — no `unidad` nesting, `apto` not
 * `numero`).
 */
interface ResidenteDirectorio {
  id: string;
  nombre: string;
  torre: string | null;
  apto: string | null;
}

/** Web `type Tab = "pendientes" | "historial"` (page.tsx:35). */
type Tab = 'pendientes' | 'historial';

// Web's `allowed` guard list, verbatim (page.tsx:75). A guest's own packages
// come from GET /paquetes/mios (see perfil.tsx), not from the porter's list.
const ALLOWED_ROLES = [
  'VIGILANTE',
  'SUPERVISOR_VIGILANCIA',
  'ADMINISTRADOR',
  'SUPER_ADMIN',
];

/** "Torre - Apto Numero (Nombre)" label used by the destinatario list. */
function residenteLabel(r: ResidenteDirectorio): string {
  return `${r.torre} - Apto ${r.apto} (${r.nombre})`;
}

/** Minutes elapsed since arrival, computed once on render (matches web). */
function minutesAgo(fechaLlegada: string): number {
  return Math.floor((new Date().getTime() - new Date(fechaLlegada).getTime()) / 60000);
}

/** Web `new Date(p.entregadoEn).toLocaleDateString('es-ES', {…})` (page.tsx:273). */
function entregadoLabel(entregadoEn: string): string {
  return new Date(entregadoEn).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Paqueteria() {
  const user = useAuth((s) => s.user);
  const authLoading = useAuth((s) => s.loading);
  const router = useRouter();
  const role = user?.rol;
  const { theme } = useTheme();
  const tokens = tokensFor(theme);
  const glass = glassFor(theme);
  // Web `shadow-sm` on every opaque `bg-primary-light` container
  // (page.tsx:143,225,228,255,258). Same recipe as citofonia.tsx.
  const cardShadow = {
    shadowColor: glass.shadowColor,
    shadowOpacity: theme === 'light' ? 0.06 : 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  } as const;

  const [activeTab, setActiveTab] = useState<Tab>('pendientes');
  const [paquetes, setPaquetes] = useState<PaqueteItem[]>([]);
  const [entregados, setEntregados] = useState<PaqueteItem[]>([]);
  const [residentes, setResidentes] = useState<ResidenteDirectorio[]>([]);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({
    usuarioId: '',
    remitente: '',
    descripcion: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const refetchPaquetes = useCallback(async () => {
    try {
      const data = await api.get<PaqueteItem[]>('/vigilancia/paquetes');
      setPaquetes(data);
    } catch {
      /* non-critical: keep the current list on a transient error */
    }
  }, []);

  const refetchEntregados = useCallback(async () => {
    try {
      const data = await api.get<PaqueteItem[]>('/vigilancia/paquetes/entregados');
      setEntregados(data);
    } catch {
      /* non-critical: keep the current history on a transient error */
    }
  }, []);

  // Real-time WebSocket subscription — keeps multiple guards in sync.
  useWsSubscription('paquete', () => {
    void refetchPaquetes();
    void refetchEntregados();
  });

  // Auth + role gate, then initial data load (paquetes + directorio + entregados).
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
        const [paqData, dirData, entData] = await Promise.all([
          api.get<PaqueteItem[]>('/vigilancia/paquetes'),
          api.get<ResidenteDirectorio[]>('/directorio'),
          // Web tolerates a missing history endpoint with `.catch(() => [])`.
          api.get<PaqueteItem[]>('/vigilancia/paquetes/entregados').catch(() => []),
        ]);
        if (cancelled) return;
        setPaquetes(paqData);
        setResidentes(dirData);
        setEntregados(entData);
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
      toast.error('Selecciona un residente destino');
      return;
    }
    // Mirror the web HTML `required` on remitente/descripción via manual checks.
    if (!formData.remitente.trim() || !formData.descripcion.trim()) {
      toast.error('Completa el remitente y la descripción');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('/vigilancia/paquetes', formData);
      toast.success('Paquete registrado y Residente notificado');
      // Re-fetch to get the full joined object safely instead of a manual push.
      const fresh = await api.get<PaqueteItem[]>('/vigilancia/paquetes');
      setPaquetes(fresh);
      setFormData({ usuarioId: '', remitente: '', descripcion: '' });
    } catch {
      toast.error('Error de conexión');
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, isSubmitting]);

  const markAsDelivered = useCallback(
    async (id: string) => {
      // Same ordering as web (page.tsx:126-135): await the PUT, then toast,
      // then drop the row and refresh the delivered history.
      try {
        await api.put(`/vigilancia/paquetes/${id}/entregar`);
        toast.success('Entrega confirmada');
        setPaquetes((prev) => prev.filter((p) => p.id !== id));
        void refetchEntregados();
      } catch {
        toast.error('Error de red');
      }
    },
    [refetchEntregados],
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

          {/* Registration form — web `bg-primary-light rounded-3xl p-6 border border-border shadow-sm` */}
          <Animated.View entering={FadeInDown.duration(500)}>
            <View
              style={cardShadow}
              className="rounded-3xl border border-border bg-primary-light p-6"
            >
              <View className="mb-6 flex-row items-center gap-3">
                {/* Web: warning token at 10% fill + warning icon, no border (page.tsx:145-150) */}
                <View className="h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-warning/10">
                  <ScanLine size={22} color={tokens.warning} />
                </View>
                <View className="min-w-0">
                  <Text className="text-lg font-bold leading-tight text-text">
                    Recepción de Envíos
                  </Text>
                  <Text className="mt-0.5 text-[11px] text-text/55">Mensajería y domicilios</Text>
                </View>
              </View>

              <View className="flex flex-col gap-4">
                {/* Destinatario selector (custom sheet list, no native picker) */}
                <View className="flex flex-col gap-1.5">
                  <Text className="pl-1 text-[10px] font-bold uppercase tracking-wider text-text/55">
                    Destinatario
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setPickerOpen(true)}
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

                {/* Empresa / Remitente */}
                <View className="flex flex-col gap-1.5">
                  <Text className="pl-1 text-[10px] font-bold uppercase tracking-wider text-text/55">
                    Empresa / Remitente
                  </Text>
                  <TextInput
                    placeholder="Amazon, Rappi..."
                    placeholderTextColor={tokens.textMuted}
                    value={formData.remitente}
                    onChangeText={(t) => setFormData((f) => ({ ...f, remitente: t }))}
                    className="w-full rounded-2xl border border-border bg-surface2 px-4 py-3 text-sm text-text"
                  />
                </View>

                {/* Descripción Rápida */}
                <View className="flex flex-col gap-1.5">
                  <Text className="pl-1 text-[10px] font-bold uppercase tracking-wider text-text/55">
                    Descripción Rápida
                  </Text>
                  <TextInput
                    placeholder="Caja mediana, Documento..."
                    placeholderTextColor={tokens.textMuted}
                    value={formData.descripcion}
                    onChangeText={(t) => setFormData((f) => ({ ...f, descripcion: t }))}
                    className="w-full rounded-2xl border border-border bg-surface2 px-4 py-3 text-sm text-text"
                  />
                </View>

                {/* Submit — web `bg-text/10` fill + teal glow
                    `shadow-[0_0_20px_rgba(45,212,191,0.28)]` (page.tsx:195).
                    The glow color is an arbitrary Tailwind value on web, i.e. the
                    SAME rgba(45,212,191,.28) in both schemes, so it stays a
                    literal here instead of following the accent token.
                    Web's `text-black` ink becomes the `text` token so the label
                    stays legible over the translucent fill in BOTH schemes. */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
                  disabled={isSubmitting}
                  onPress={handleSubmit}
                  style={({ pressed }) => ({
                    opacity: isSubmitting ? 0.6 : pressed ? 0.85 : 1,
                    // web page.tsx:195 — rgba(45,212,191,0.28), scheme-independent.
                    shadowColor: '#2dd4bf',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.28,
                    shadowRadius: 20,
                    elevation: 8,
                  })}
                  className="mt-2 w-full flex-row items-center justify-center gap-2 rounded-2xl bg-text/10 py-4"
                >
                  {isSubmitting ? (
                    <Text className="font-bold text-text">Registrando...</Text>
                  ) : (
                    <>
                      <Package size={18} color={tokens.text} />
                      <Text className="font-bold text-text">Clasificar Envío</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </Animated.View>

          {/* TAB SWITCHER — web page.tsx:201-215 */}
          <View className="flex-row gap-2 rounded-2xl border border-border bg-surface2 p-1.5">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: activeTab === 'pendientes' }}
              onPress={() => setActiveTab('pendientes')}
              style={
                activeTab === 'pendientes'
                  ? {
                      shadowColor: glass.shadowColor,
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.18,
                      shadowRadius: 4,
                      elevation: 3,
                    }
                  : undefined
              }
              className={
                activeTab === 'pendientes'
                  ? 'flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary py-2.5'
                  : 'flex-1 flex-row items-center justify-center gap-2 rounded-xl py-2.5'
              }
            >
              <Package
                size={14}
                color={tokens.text}
                opacity={activeTab === 'pendientes' ? 1 : 0.6}
              />
              <Text
                className={
                  activeTab === 'pendientes'
                    ? 'text-[10px] font-bold uppercase tracking-widest text-text'
                    : 'text-[10px] font-bold uppercase tracking-widest text-text/60'
                }
              >
                Pendientes ({paquetes.length})
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: activeTab === 'historial' }}
              onPress={() => setActiveTab('historial')}
              style={
                activeTab === 'historial'
                  ? {
                      shadowColor: glass.shadowColor,
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.18,
                      shadowRadius: 4,
                      elevation: 3,
                    }
                  : undefined
              }
              className={
                activeTab === 'historial'
                  ? 'flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary py-2.5'
                  : 'flex-1 flex-row items-center justify-center gap-2 rounded-xl py-2.5'
              }
            >
              <History
                size={14}
                color={tokens.text}
                opacity={activeTab === 'historial' ? 1 : 0.6}
              />
              <Text
                className={
                  activeTab === 'historial'
                    ? 'text-[10px] font-bold uppercase tracking-widest text-text'
                    : 'text-[10px] font-bold uppercase tracking-widest text-text/60'
                }
              >
                Historial ({entregados.length})
              </Text>
            </Pressable>
          </View>

          {/* CONTENT */}
          {activeTab === 'pendientes' ? (
            <Animated.View
              entering={FadeInDown.duration(500).delay(100)}
              className="flex flex-col gap-4"
            >
              <View className="ml-2 flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <Clock size={16} color={tokens.warning} />
                  <Text className="text-sm font-bold uppercase tracking-widest text-text">
                    Inventario Portería
                  </Text>
                </View>
                <View className="rounded-full bg-surface2 px-2 py-0.5">
                  <Text className="text-[10px] font-bold text-text">{paquetes.length} ÍTEMS</Text>
                </View>
              </View>

              {paquetes.length === 0 ? (
                <View
                  style={cardShadow}
                  className="items-center rounded-3xl border border-border bg-primary-light p-8"
                >
                  <Text className="text-sm font-medium text-text">Portería libre de paquetes</Text>
                  <Text className="mt-1 text-xs text-text/55">
                    Los envíos recibidos aparecerán aquí.
                  </Text>
                </View>
              ) : null}

              {paquetes.map((p) => (
                <View
                  key={p.id}
                  style={cardShadow}
                  className="relative rounded-3xl border border-border bg-primary-light p-5"
                >
                  {/* Decorative corner glow — web `absolute top-0 right-0 w-24 h-24
                      bg-text/10 rounded-full blur-2xl` translated out by half its
                      size (page.tsx:229). The clip lives on this inner layer, not on
                      the card: RN's `overflow: hidden` also clips the card's own
                      iOS shadow. RN cannot gaussian-blur a plain View, so the blob
                      has a hard edge instead of a `blur-2xl` falloff. */}
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: 0,
                      right: 0,
                      bottom: 0,
                      left: 0,
                      borderRadius: 24,
                      overflow: 'hidden',
                    }}
                  >
                    <View
                      className="absolute h-24 w-24 rounded-full bg-text/10"
                      style={{ top: -48, right: -48 }}
                    />
                  </View>
                  <View className="flex flex-col gap-4">
                    <View className="flex-row items-start justify-between">
                      <View className="flex-1 pr-3">
                        <Text className="text-lg font-bold leading-tight text-text">
                          {p.descripcion}
                        </Text>
                        <Text className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-text/55">
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
                      <MapPin size={14} color={tokens.text} opacity={0.7} />
                      <Text className="text-xs font-semibold text-text/70">
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
                </View>
              ))}
            </Animated.View>
          ) : (
            <Animated.View
              entering={FadeInDown.duration(500).delay(100)}
              className="flex flex-col gap-4"
            >
              <View className="ml-2 flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <History size={16} color={tokens.success} />
                  <Text className="text-sm font-bold uppercase tracking-widest text-text">
                    Entregados
                  </Text>
                </View>
                <View className="rounded-full bg-surface2 px-2 py-0.5">
                  <Text className="text-[10px] font-bold text-text">{entregados.length} ÍTEMS</Text>
                </View>
              </View>

              {entregados.length === 0 ? (
                <View
                  style={cardShadow}
                  className="items-center rounded-3xl border border-border bg-primary-light p-8"
                >
                  <Text className="text-sm font-medium text-text">Sin historial de entregas</Text>
                  <Text className="mt-1 text-xs text-text/55">
                    Los paquetes entregados quedarán registrados aquí.
                  </Text>
                </View>
              ) : null}

              {entregados.map((p) => (
                <View
                  key={p.id}
                  className="relative flex flex-col gap-3 rounded-3xl border border-border bg-primary-light p-5"
                  style={[cardShadow, { opacity: 0.7 }]}
                >
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 pr-3">
                      <Text className="text-lg font-bold leading-tight text-text">
                        {p.descripcion}
                      </Text>
                      <Text className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-text/55">
                        {p.remitente}
                      </Text>
                    </View>
                    {/* Web uses the raw Tailwind `green-500` here (page.tsx:264); the
                        mobile design system routes "confirmado" through the
                        `success` token so it stays legible in both schemes. */}
                    <View className="flex-row items-center gap-1 rounded-full border border-success/20 bg-success/10 px-3 py-1">
                      <CheckCircle2 size={12} color={tokens.success} />
                      <Text className="text-[10px] font-bold text-success">Entregado</Text>
                    </View>
                  </View>

                  <View className="flex-row items-center gap-2">
                    <MapPin size={14} color={tokens.text} opacity={0.7} />
                    <Text className="text-xs font-semibold text-text/70">
                      {p.residente?.torre} - Apto {p.residente?.apto} ({p.residente?.nombre})
                    </Text>
                  </View>

                  {p.entregadoEn ? (
                    <Text className="text-[9px] uppercase tracking-widest text-text/50">
                      Entregado {entregadoLabel(p.entregadoEn)}
                    </Text>
                  ) : null}
                </View>
              ))}
            </Animated.View>
          )}
        </View>
      </Screen>

      {/* Destinatario picker sheet */}
      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} snapPoints={['60%']}>
        <View className="flex-1 px-5 pb-6">
          <View className="flex-row items-center justify-between py-3">
            <Text className="text-base font-bold text-text">Selecciona destinatario</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
              onPress={() => setPickerOpen(false)}
              hitSlop={8}
            >
              <X size={20} color={tokens.text} />
            </Pressable>
          </View>

          {residentes.length === 0 ? (
            <Text className="py-6 text-center text-sm text-text/55">
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
                      setPickerOpen(false);
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
