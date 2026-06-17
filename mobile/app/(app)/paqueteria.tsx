import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  CheckCircle2,
  ChevronDown,
  Clock,
  MapPin,
  Package,
  ScanLine,
  X,
} from 'lucide-react-native';

import { BottomSheetScrollView } from '@gorhom/bottom-sheet';

import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { Sheet } from '@/components/ui/Sheet';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api } from '@/lib/api/client';

/**
 * Runtime shape returned by `GET /vigilancia/paquetes` (only EN_PORTERIA
 * packages). Matches the backend `PaqueteVigilanciaDto`: a flat
 * `residente {nombre, torre, apto}` joined onto the package fields (verified
 * against the live serializer — no `usuario`/`unidad` nesting, `apto` not
 * `numero`).
 */
interface PaqueteItem {
  id: string;
  descripcion: string;
  remitente: string;
  fechaLlegada: string;
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

export default function Paqueteria() {
  const user = useAuth((s) => s.user);
  const authLoading = useAuth((s) => s.loading);
  const router = useRouter();
  const role = user?.rol;

  const [paquetes, setPaquetes] = useState<PaqueteItem[]>([]);
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

  // Real-time WebSocket subscription — keeps multiple guards in sync.
  useWsSubscription('paquete', () => {
    void refetchPaquetes();
  });

  // Auth + role gate, then initial data load (paquetes + directorio in parallel).
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
        const [paqData, dirData] = await Promise.all([
          api.get<PaqueteItem[]>('/vigilancia/paquetes'),
          api.get<ResidenteDirectorio[]>('/directorio'),
        ]);
        if (cancelled) return;
        setPaquetes(paqData);
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
      // Optimistic removal.
      setPaquetes((prev) => prev.filter((p) => p.id !== id));
      try {
        await api.put(`/vigilancia/paquetes/${id}/entregar`);
        toast.success('Entrega confirmada');
      } catch {
        toast.error('Error de red');
        // Bug fix (web kept the optimistic removal on error): re-fetch so the
        // package reappears if the server never marked it delivered.
        void refetchPaquetes();
      }
    },
    [refetchPaquetes],
  );

  if (loading) {
    return (
      <Screen scroll={false} className="bg-primary">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#FFFFFF" />
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
                <View
                  className="h-12 w-12 items-center justify-center rounded-2xl border"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.2)',
                    borderColor: 'rgba(255,255,255,0.3)',
                  }}
                >
                  <ScanLine size={24} color="#FFFFFF" />
                </View>
                <View>
                  <Text className="text-xl font-bold text-text">Recepción de Envíos</Text>
                  <Text className="text-xs text-text">Mensajería y domicilios</Text>
                </View>
              </View>

              <View className="flex flex-col gap-4">
                {/* Destinatario selector (custom sheet list, no native picker) */}
                <View className="flex flex-col gap-1.5">
                  <Text className="pl-1 text-[10px] font-bold uppercase tracking-widest text-text">
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
                    <ChevronDown size={18} color="#FFFFFF" />
                  </Pressable>
                </View>

                {/* Empresa / Remitente */}
                <View className="flex flex-col gap-1.5">
                  <Text className="pl-1 text-[10px] font-bold uppercase tracking-widest text-text">
                    Empresa / Remitente
                  </Text>
                  <TextInput
                    placeholder="Amazon, Rappi..."
                    placeholderTextColor="rgba(255,255,255,0.45)"
                    value={formData.remitente}
                    onChangeText={(t) => setFormData((f) => ({ ...f, remitente: t }))}
                    className="w-full rounded-2xl border border-border bg-surface2 px-4 py-3 text-sm text-text"
                  />
                </View>

                {/* Descripción Rápida */}
                <View className="flex flex-col gap-1.5">
                  <Text className="pl-1 text-[10px] font-bold uppercase tracking-widest text-text">
                    Descripción Rápida
                  </Text>
                  <TextInput
                    placeholder="Caja mediana, Documento..."
                    placeholderTextColor="rgba(255,255,255,0.45)"
                    value={formData.descripcion}
                    onChangeText={(t) => setFormData((f) => ({ ...f, descripcion: t }))}
                    className="w-full rounded-2xl border border-border bg-surface2 px-4 py-3 text-sm text-text"
                  />
                </View>

                {/* Submit */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
                  disabled={isSubmitting}
                  onPress={handleSubmit}
                  style={({ pressed }) => ({ opacity: isSubmitting ? 0.6 : pressed ? 0.85 : 1 })}
                  className="mt-2 w-full flex-row items-center justify-center gap-2 rounded-2xl bg-accent py-4"
                >
                  {isSubmitting ? (
                    <Text className="font-bold text-on-accent">Registrando...</Text>
                  ) : (
                    <>
                      <Package size={18} color="#000000" />
                      <Text className="font-bold text-on-accent">Clasificar Envío</Text>
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
              <Clock size={16} color="#FFFFFF" />
              <Text className="text-sm font-bold uppercase tracking-widest text-text">
                Inventario Portería
              </Text>
            </View>
            <View className="rounded-full bg-surface2 px-2 py-0.5">
              <Text className="text-[10px] font-bold text-text">{paquetes.length} ÍTEMS</Text>
            </View>
          </View>

          {paquetes.length === 0 ? (
            <Text className="py-6 text-center text-sm text-text">
              Portería libre de paquetes.
            </Text>
          ) : null}

          {paquetes.map((p) => (
            <LiquidGlass key={p.id} variant="card" className="rounded-3xl" radius={24}>
              <View className="flex flex-col gap-4 p-5">
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 pr-3">
                    <Text className="text-lg font-bold leading-tight text-text">
                      {p.descripcion}
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
                  <MapPin size={14} color="#FFFFFF" />
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
                  <CheckCircle2 size={16} color="#FFFFFF" />
                  <Text className="text-xs font-bold uppercase tracking-widest text-text">
                    Marcar como Entregado
                  </Text>
                </Pressable>
              </View>
            </LiquidGlass>
          ))}
          </Animated.View>
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
              <X size={20} color="#FFFFFF" />
            </Pressable>
          </View>

          {residentes.length === 0 ? (
            <Text className="py-6 text-center text-sm text-text" style={{ opacity: 0.6 }}>
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
                    className="flex-row items-center justify-between border-b py-3.5"
                    style={{ borderBottomColor: 'rgba(255,255,255,0.08)' }}
                  >
                    <Text className="flex-1 pr-2 text-sm text-text" numberOfLines={1}>
                      {residenteLabel(r)}
                    </Text>
                    {selected ? <CheckCircle2 size={18} color="#FFFFFF" /> : null}
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
