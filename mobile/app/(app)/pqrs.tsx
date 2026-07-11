/**
 * PQRS - CONJUNTOSAPP (mobile port)
 * Peticiones, Quejas, Reclamos y Soporte Técnico.
 * Gestión centralizada de solicitudes para residentes.
 *
 * Ported from web src/app/(app)/pqrs/page.tsx. Fixes the documented bug:
 * the date / radicado id read `createdAt` (not the web's stale `creadoEn`).
 */

import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, SlideInDown } from 'react-native-reanimated';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Camera,
  CheckCircle2,
  Clock,
  FileText,
  Info,
  Megaphone,
  MessageSquare,
  Plus,
  SendHorizonal,
  Wrench,
  X,
} from 'lucide-react-native';

import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api } from '@/lib/api/client';
import type {
  CatServicio,
  CreateSolicitudRequest,
  SolicitudDto,
  TipoPqr,
} from '@/lib/api/types';
import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { toast } from '@/components/ui/toast';

// ---------------------------------------------------------------------------
// Config — icon per request type (TIPO_CONFIG in the web source).
// ---------------------------------------------------------------------------

const ICON_COLOR = '#FFFFFF';

const TIPO_CONFIG: Record<TipoPqr, { icon: (size: number) => ReactElement; label: string }> = {
  PETICION: { icon: (s) => <FileText size={s} color={ICON_COLOR} />, label: 'PETICION' },
  QUEJA: { icon: (s) => <AlertTriangle size={s} color={ICON_COLOR} />, label: 'QUEJA' },
  RECLAMO: { icon: (s) => <Megaphone size={s} color={ICON_COLOR} />, label: 'RECLAMO' },
  SUGERENCIA: { icon: (s) => <Info size={s} color={ICON_COLOR} />, label: 'SUGERENCIA' },
  MANTENIMIENTO: { icon: (s) => <Wrench size={s} color={ICON_COLOR} />, label: 'MANTENIMIENTO' },
};

const TIPO_ORDER: TipoPqr[] = ['PETICION', 'QUEJA', 'RECLAMO', 'SUGERENCIA', 'MANTENIMIENTO'];

interface FormState {
  tipo: TipoPqr;
  categoria: CatServicio;
  descripcion: string;
  urgente: boolean;
}

const INITIAL_FORM: FormState = {
  tipo: 'PETICION',
  categoria: 'OTRO',
  descripcion: '',
  urgente: false,
};

function getStatusLabel(status: string): string {
  switch (status) {
    case 'COMPLETADA':
      return 'Resuelto';
    case 'EN_PROGRESO':
      return 'En Proceso';
    case 'ASIGNADA':
      return 'Asignado';
    default:
      return 'Pendiente';
  }
}

function shortId(id: string): string {
  return id.slice(-6).toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function Pqrs() {
  const { user } = useAuth();
  const userId = user?.id;

  const [solicitudes, setSolicitudes] = useState<SolicitudDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<FormState>(INITIAL_FORM);

  const refetchSolicitudes = useCallback(async () => {
    try {
      const data = await api.get<SolicitudDto[]>('/solicitudes');
      setSolicitudes(data);
    } catch (error) {
      console.error('Error loading solicitudes:', error);
    }
  }, []);

  // Realtime — refetch the whole list on every `solicitud` WS event.
  useWsSubscription('solicitud', refetchSolicitudes);

  // Initial fetch, guarded by an authenticated user (mirrors `if (user)`).
  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const data = await api.get<SolicitudDto[]>('/solicitudes');
        if (active) setSolicitudes(data);
      } catch (error) {
        console.error('Error loading solicitudes:', error);
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, userId]);

  const closeForm = useCallback(() => {
    if (isSubmitting) return;
    setIsFormOpen(false);
  }, [isSubmitting]);

  const handleSubmit = useCallback(async () => {
    if (!formData.descripcion.trim()) {
      toast.warning('Debes describir el motivo');
      return;
    }
    setIsSubmitting(true);
    try {
      const body: CreateSolicitudRequest = {
        tipo: formData.tipo,
        categoria: formData.categoria,
        descripcion: formData.descripcion,
        urgente: formData.urgente,
      };
      const newSolicitud = await api.post<SolicitudDto>('/solicitudes', body);
      setSolicitudes((prev) => [newSolicitud, ...prev]);
      setIsFormOpen(false);
      setFormData(INITIAL_FORM);
      toast.success('Solicitud radicada con éxito', `Radicado #: ${shortId(newSolicitud.id)}`);
    } catch {
      toast.error('Hubo un error al radicar la solicitud');
    } finally {
      setIsSubmitting(false);
    }
  }, [formData]);

  const total = solicitudes.length;
  const abiertas = solicitudes.filter((s) => s.estado !== 'COMPLETADA').length;
  const resueltas = solicitudes.filter((s) => s.estado === 'COMPLETADA').length;

  const stats: { label: string; value: number; icon: ReactElement }[] = [
    { label: 'Total', value: total, icon: <MessageSquare size={16} color={ICON_COLOR} /> },
    { label: 'Abiertas', value: abiertas, icon: <Clock size={16} color={ICON_COLOR} /> },
    { label: 'Resueltas', value: resueltas, icon: <CheckCircle2 size={16} color={ICON_COLOR} /> },
  ];

  return (
    <Screen className="bg-primary">
      <View className="flex-1 gap-6 px-6 pt-4">
        <Animated.View entering={FadeInDown.duration(500)}>
          <ProfileHeader />
        </Animated.View>

        {/* STATS OVERVIEW */}
        <Animated.View entering={FadeInDown.delay(80).duration(500)} className="flex-row gap-4">
          {stats.map((stat) => (
            <LiquidGlass
              key={stat.label}
              className="flex-1 items-center gap-1 rounded-[24px] border border-border p-4"
            >
              <View className="mb-1 rounded-xl bg-surface p-2">{stat.icon}</View>
              <Text className="text-xl font-bold tracking-tight text-text">{stat.value}</Text>
              <Text className="text-[8px] font-black uppercase tracking-widest text-text">
                {stat.label}
              </Text>
            </LiquidGlass>
          ))}
        </Animated.View>

        {/* ACTION BUTTON — Radicar nueva PQRS */}
        <Animated.View entering={FadeInDown.delay(160).duration(500)}>
          <Pressable
            onPress={() => setIsFormOpen(true)}
            style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}
            className="h-[120px] w-full items-center justify-center overflow-hidden rounded-[32px] bg-primary-light"
          >
            <View className="items-center gap-2">
              <View className="h-12 w-12 items-center justify-center rounded-full bg-accent">
                <Plus size={24} color="#000000" />
              </View>
              <Text className="text-sm font-bold tracking-tight text-text">
                Radicar nueva PQRS
              </Text>
            </View>
          </Pressable>
        </Animated.View>

        {/* LIST HEADER */}
        <Animated.View
          entering={FadeInDown.delay(240).duration(500)}
          className="mt-4 flex-row items-end justify-between"
        >
          <Text className="text-lg font-bold tracking-tight text-text">Tus Solicitudes</Text>
          {/* "Filtrar" is decorative in the web source — kept non-functional. */}
          <View className="flex-row items-center gap-1">
            <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
              Filtrar
            </Text>
            <ArrowRight size={10} color={ICON_COLOR} />
          </View>
        </Animated.View>

        {/* PQRS LIST */}
        <View className="gap-4">
          {isLoading ? (
            <View className="items-center gap-4 py-20">
              <ActivityIndicator size="large" color="#FFFFFF" />
              <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                Sincronizando radicados...
              </Text>
            </View>
          ) : solicitudes.length === 0 ? (
            <LiquidGlass radius={32} className="items-center gap-4 rounded-[32px] border border-border p-10">
              <View className="mb-2 h-16 w-16 items-center justify-center rounded-full bg-surface">
                <FileText size={32} color={ICON_COLOR} />
              </View>
              <Text className="text-sm font-bold text-text">Aún no tienes solicitudes</Text>
              <Text className="px-6 text-center text-xs text-text">
                Cuando radiques una PQRS aparecerá listada en esta sección para su seguimiento.
              </Text>
            </LiquidGlass>
          ) : (
            solicitudes.map((s, i) => {
              const cfg = TIPO_CONFIG[s.tipo] ?? TIPO_CONFIG.PETICION;
              return (
                <Animated.View key={s.id} entering={FadeInDown.delay(i * 60).duration(450)}>
                  {/* Card is intentionally non-pressable: the web cards have no onClick. */}
                  <LiquidGlass radius={32} className="gap-4 rounded-[32px] border border-border p-6">
                    <View className="flex-row items-start justify-between">
                      <View className="flex-row items-center gap-3">
                        <View className="rounded-2xl border border-border bg-surface p-2.5">
                          {cfg.icon(18)}
                        </View>
                        <View>
                          <Text className="text-sm font-bold tracking-tight text-text">
                            {s.tipo}
                          </Text>
                          <Text className="text-[8px] font-black uppercase tracking-widest text-text">
                            {s.categoria}
                          </Text>
                        </View>
                      </View>
                      <View className="rounded-full border border-border bg-surface px-2.5 py-1">
                        <Text className="text-[8px] font-black uppercase tracking-widest text-text">
                          {getStatusLabel(s.estado)}
                        </Text>
                      </View>
                    </View>

                    <Text numberOfLines={2} className="text-xs leading-relaxed text-text">
                      {s.descripcion}
                    </Text>

                    <View className="mt-2 flex-row items-center justify-between border-t border-border pt-4">
                      <View className="flex-row items-center gap-1.5">
                        <Calendar size={12} color={ICON_COLOR} />
                        <Text className="text-[10px] font-medium text-text">
                          {formatDate(s.createdAt)}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-2">
                        <Text className="text-[8px] font-black uppercase tracking-widest text-text">
                          ID: {shortId(s.id)}
                        </Text>
                        {s.urgente ? (
                          <View className="rounded-full bg-surface2 px-2 py-0.5">
                            <Text className="text-[8px] font-black uppercase text-text">
                              Urgente
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </LiquidGlass>
                </Animated.View>
              );
            })
          )}
        </View>
      </View>

      <CreateModal
        open={isFormOpen}
        isSubmitting={isSubmitting}
        formData={formData}
        onChange={setFormData}
        onClose={closeForm}
        onSubmit={handleSubmit}
      />
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Create modal — slide-up bottom sheet (items-end + rounded-t-[48px] on web).
// Backdrop / X dismiss are guarded by `!isSubmitting`, like the web modal.
// ---------------------------------------------------------------------------

interface CreateModalProps {
  open: boolean;
  isSubmitting: boolean;
  formData: FormState;
  onChange: (next: FormState) => void;
  onClose: () => void;
  onSubmit: () => void;
}

function CreateModal({
  open,
  isSubmitting,
  formData,
  onChange,
  onClose,
  onSubmit,
}: CreateModalProps) {
  const insets = useSafeAreaInsets();

  const selectTipo = (tipo: TipoPqr) => {
    onChange({
      ...formData,
      tipo,
      // Side-effect from the web: MANTENIMIENTO defaults its category to
      // ELECTRICIDAD, everything else resets to OTRO.
      categoria: tipo === 'MANTENIMIENTO' ? 'ELECTRICIDAD' : 'OTRO',
    });
  };

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        {/* Backdrop — only dismisses when not submitting. */}
        <Pressable
          onPress={onClose}
          className="absolute inset-0 bg-black/80"
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
        />

        {open ? (
          <Animated.View
            entering={SlideInDown.duration(450)}
            className="overflow-hidden rounded-t-[48px] border border-border bg-primary"
            style={{ paddingBottom: insets.bottom + 16 }}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 32, gap: 24 }}
            >
              {/* HEADER */}
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-xl font-bold tracking-tight text-text">Nueva PQRS</Text>
                  <Text className="mt-1 text-[10px] font-bold uppercase tracking-widest text-text">
                    Radicación oficial
                  </Text>
                </View>
                <Pressable
                  onPress={onClose}
                  disabled={isSubmitting}
                  className="h-10 w-10 items-center justify-center rounded-full bg-surface"
                >
                  <X size={20} color={ICON_COLOR} />
                </Pressable>
              </View>

              {/* TIPO PICKER */}
              <View className="gap-3">
                <Text className="px-2 text-[10px] font-bold uppercase tracking-widest text-text">
                  Tipo de Solicitud
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {TIPO_ORDER.map((key) => {
                    const cfg = TIPO_CONFIG[key];
                    const selected = formData.tipo === key;
                    return (
                      <Pressable
                        key={key}
                        onPress={() => selectTipo(key)}
                        style={{ width: '48%' }}
                        className={`flex-row items-center gap-2 rounded-2xl border p-3 ${
                          selected ? 'border-accent bg-surface2' : 'border-border bg-surface'
                        }`}
                      >
                        {cfg.icon(16)}
                        <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                          {key.slice(0, 8)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* DESCRIPTION */}
              <View className="gap-3">
                <Text className="px-2 text-[10px] font-bold uppercase tracking-widest text-text">
                  Descripción del caso
                </Text>
                <TextInput
                  value={formData.descripcion}
                  onChangeText={(descripcion) => onChange({ ...formData, descripcion })}
                  placeholder="Escribe aquí los detalles de tu solicitud..."
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  multiline
                  textAlignVertical="top"
                  editable={!isSubmitting}
                  className="min-h-[140px] rounded-3xl border border-border bg-surface p-5 text-text"
                />
              </View>

              {/* OPTIONS — Vincular Foto (UI only) + Urgente toggle */}
              <View className="flex-row items-center justify-between rounded-2xl border border-border bg-surface p-4">
                <View className="flex-row items-center gap-2">
                  <View className="h-8 w-8 items-center justify-center rounded-full bg-surface">
                    <Camera size={16} color={ICON_COLOR} />
                  </View>
                  <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                    Vincular Foto
                  </Text>
                </View>
                <View className="flex-row items-center gap-2">
                  <Text className="text-[10px] font-bold uppercase text-text">¡Urgente!</Text>
                  <Switch
                    value={formData.urgente}
                    onValueChange={(urgente) => onChange({ ...formData, urgente })}
                    disabled={isSubmitting}
                    trackColor={{ false: 'rgba(255,255,255,0.14)', true: '#FFFFFF' }}
                    thumbColor={formData.urgente ? '#000000' : '#FFFFFF'}
                  />
                </View>
              </View>

              {/* SUBMIT */}
              <Pressable
                onPress={onSubmit}
                disabled={isSubmitting}
                style={({ pressed }) => ({
                  opacity: isSubmitting ? 0.6 : pressed ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                })}
                className="h-16 w-full flex-row items-center justify-center gap-3 rounded-[24px] bg-accent"
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#000000" />
                ) : (
                  <>
                    <Text className="text-base font-bold text-on-accent">Radicar Solicitud</Text>
                    <SendHorizonal size={18} color="#000000" />
                  </>
                )}
              </Pressable>
            </ScrollView>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}
