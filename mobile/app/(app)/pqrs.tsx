/**
 * PQRS - CONJUNTOSAPP (mobile port)
 * Peticiones, Quejas, Reclamos y Soporte Técnico.
 * Gestión centralizada de solicitudes para residentes.
 *
 * Ported from web src/app/(app)/pqrs/page.tsx — list + stats, the "Radicar
 * nueva PQRS" create sheet (with photo attachment) and the detail sheet backed
 * by GET /solicitudes/{id}.
 *
 * Colors come from the design tokens only. The single exception is the hero
 * button, whose `#0A0A0A` / `#FFFFFF` / `#000000` stops are literal hexes in
 * the web class list itself (page.tsx:201-206) — each one is commented in place.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, SlideInDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
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

import { GuestGate } from '@/components/GuestGate';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api } from '@/lib/api/client';
import type {
  CatServicio,
  CreateSolicitudRequest,
  SolicitudDto,
  TicketComentarioDto,
  TicketTransicionDto,
  TipoPqr,
  UploadImagenResponse,
} from '@/lib/api/types';
import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { toast } from '@/components/ui/toast';
import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor, type ColorSchemeName } from '@/theme/tokens';

// ---------------------------------------------------------------------------
// Config — icon per request type (TIPO_CONFIG in the web source).
//
// Every web tipo carries `color: "text-text"` (web page.tsx:36-41), so the icon
// tint is the `text` TOKEN, resolved per scheme by the caller. It used to be a
// hardcoded `#FFFFFF`, which is invisible on light mode's #f0fdfa background.
// ---------------------------------------------------------------------------

const TIPO_CONFIG: Record<TipoPqr, { icon: (size: number, color: string) => ReactElement }> = {
  PETICION: { icon: (s, c) => <FileText size={s} color={c} /> },
  QUEJA: { icon: (s, c) => <AlertTriangle size={s} color={c} /> },
  RECLAMO: { icon: (s, c) => <Megaphone size={s} color={c} /> },
  SUGERENCIA: { icon: (s, c) => <Info size={s} color={c} /> },
  MANTENIMIENTO: { icon: (s, c) => <Wrench size={s} color={c} /> },
};

const TIPO_ORDER: TipoPqr[] = ['PETICION', 'QUEJA', 'RECLAMO', 'SUGERENCIA', 'MANTENIMIENTO'];

/**
 * Hero button gradient middle stop — web's `via-accent/20` (page.tsx:201), i.e.
 * the accent token at 20% alpha. The outer stops (`from-[#0A0A0A]`,
 * `to-[#FFFFFF]`) are literal hexes in the web class itself, so they stay
 * literal here too.
 */
const ACCENT_20: Record<ColorSchemeName, string> = {
  dark: 'rgba(45, 212, 191, 0.2)',
  light: 'rgba(15, 118, 110, 0.2)',
};

/**
 * GET /solicitudes/{id} returns a SolicitudDto with `comentarios` and
 * `transiciones` populated (backend api/src/domains/solicitudes/dto.rs:30-31,
 * ver_solicitud in handlers.rs:153-176). The shared mobile `SolicitudDto` does
 * not declare those two fields yet, so the detail shape is widened locally.
 */
interface SolicitudDetalle extends SolicitudDto {
  comentarios?: TicketComentarioDto[];
  transiciones?: TicketTransicionDto[];
}

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

// Mirrors web getStatusLabel: label + chip colors per estado. Background
// classes go on the wrapping View and text color on the Text (RN split).
function getStatusLabel(status: string): { text: string; chipClass: string; textClass: string } {
  switch (status) {
    case 'RESUELTA':
      return { text: 'Resuelto', chipClass: 'bg-green-500/10', textClass: 'text-green-400' };
    case 'CERRADA':
      return { text: 'Cerrado', chipClass: 'bg-text/5', textClass: 'text-text/40' };
    case 'EN_PROGRESO':
      return { text: 'En Proceso', chipClass: 'bg-text/10', textClass: 'text-text' };
    case 'ASIGNADA':
      return { text: 'Asignado', chipClass: 'bg-text/10', textClass: 'text-text' };
    default:
      return { text: 'Pendiente', chipClass: 'bg-text/10', textClass: 'text-text' };
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
  // KNOWN, DELIBERATE web↔mobile divergence: web PQRSPage has no role gate, so
  // a HUESPED_TEMPORAL could file conjunto PQRS there. Mobile keeps the guest
  // containment because the route stays reachable via deep links and
  // pqrs-keyword notification routing even though it has no tab entry (see the
  // GuestGate docblock). Closing this the other way means adding the same guard
  // to web src/app/(app)/pqrs/page.tsx, which is outside this file's scope.
  return (
    <GuestGate>
      <PqrsInner />
    </GuestGate>
  );
}

function PqrsInner() {
  const { user } = useAuth();
  const userId = user?.id;
  const { theme } = useTheme();
  const tokens = tokensFor(theme);

  const [solicitudes, setSolicitudes] = useState<SolicitudDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<FormState>(INITIAL_FORM);

  // Detail modal state (web page.tsx:67-69).
  const [selectedSolicitud, setSelectedSolicitud] = useState<SolicitudDto | null>(null);
  const [detailData, setDetailData] = useState<SolicitudDetalle | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Photo upload state (web page.tsx:72-73).
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string>('');

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
      // Mirrors web page.tsx:118 — `{ ...formData, ...(photoUrl ? { imagenes: [photoUrl] } : {}) }`.
      const body: CreateSolicitudRequest = {
        tipo: formData.tipo,
        categoria: formData.categoria,
        descripcion: formData.descripcion,
        urgente: formData.urgente,
        ...(photoUrl ? { imagenes: [photoUrl] } : {}),
      };
      const newSolicitud = await api.post<SolicitudDto>('/solicitudes', body);
      setSolicitudes((prev) => [newSolicitud, ...prev]);
      setIsFormOpen(false);
      setFormData(INITIAL_FORM);
      setPhotoPreview(null);
      setPhotoUrl('');
      toast.success('Solicitud radicada con éxito', `Radicado #: ${shortId(newSolicitud.id)}`);
    } catch {
      toast.error('Hubo un error al radicar la solicitud');
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, photoUrl]);

  /**
   * Pick a photo and upload it, mirroring web handlePhotoSelect (page.tsx:135-148):
   * local preview immediately, then the uploaded URL into `photoUrl`. Uses the
   * base64 data-url + POST /uploads/imagen flow already used in chat.tsx.
   */
  const handlePhotoSelect = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.error('No se pudo subir la imagen');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.7,
    });
    const asset = res.canceled ? undefined : res.assets?.[0];
    if (!asset) return;
    setPhotoPreview(asset.uri);
    try {
      if (!asset.base64) throw new Error('sin base64');
      const dataUrl = `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`;
      const uploaded = await api.post<UploadImagenResponse>('/uploads/imagen', {
        data: dataUrl,
        carpeta: 'pqrs',
      });
      if (uploaded.url) setPhotoUrl(uploaded.url);
    } catch {
      toast.error('No se pudo subir la imagen');
    }
  }, []);

  /**
   * Web openDetail (page.tsx:150-161): show the list row instantly, then refresh
   * from GET /solicitudes/{id}; on failure fall back to the list row itself.
   */
  const openDetail = useCallback(async (s: SolicitudDto) => {
    setSelectedSolicitud(s);
    setIsLoadingDetail(true);
    try {
      const data = await api.get<SolicitudDetalle>(`/solicitudes/${s.id}`);
      setDetailData(data);
    } catch {
      setDetailData(s);
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedSolicitud(null);
    setDetailData(null);
  }, []);

  const total = solicitudes.length;
  const abiertas = solicitudes.filter(
    (s) => s.estado !== 'RESUELTA' && s.estado !== 'CERRADA'
  ).length;
  const resueltas = solicitudes.filter(
    (s) => s.estado === 'RESUELTA' || s.estado === 'CERRADA'
  ).length;

  // Web stats each carry `color: "text-text"` (page.tsx:174-176).
  const stats: { label: string; value: number; icon: ReactElement }[] = [
    { label: 'Total', value: total, icon: <MessageSquare size={16} color={tokens.text} /> },
    { label: 'Abiertas', value: abiertas, icon: <Clock size={16} color={tokens.text} /> },
    {
      label: 'Resueltas',
      value: resueltas,
      icon: <CheckCircle2 size={16} color={tokens.text} />,
    },
  ];

  return (
    <Screen className="bg-primary">
      <View className="flex-1 gap-6 px-6 pt-4">
        {/*
         * Entrance choreography — web animates ONE `.fade-up-pqrs` class across
         * the header, stats, action button, list header AND every list card with
         * `stagger: 0.1, duration: 0.6, delay: 0.1` (page.tsx:106). So the delay
         * is 100 + index * 100 with a single running index shared by the chrome
         * (0-3) and the cards (4+).
         */}
        <Animated.View entering={FadeInDown.delay(100).duration(600)}>
          <ProfileHeader />
        </Animated.View>

        {/* STATS OVERVIEW */}
        <Animated.View entering={FadeInDown.delay(200).duration(600)} className="flex-row gap-4">
          {stats.map((stat) => (
            /*
             * Web: `liquid-glass-card rounded-[24px] p-4 flex-col items-center
             * gap-1 border border-border` (page.tsx:186). Padding/gap/alignment
             * MUST travel via `style` — `className` lands on LiquidGlass's outer
             * shadow wrapper, which would inset the glass instead of the content.
             */
            <LiquidGlass
              key={stat.label}
              variant="card"
              className="flex-1 rounded-[24px] border border-border"
              style={{ padding: 16, alignItems: 'center', gap: 4 }}
            >
              {/* Web: `p-2 rounded-xl bg-text/5` (page.tsx:187) — a text tint, not glass. */}
              <View className="mb-1 rounded-xl bg-text/5 p-2">{stat.icon}</View>
              <Text className="font-display text-xl font-bold tracking-tight text-text">
                {stat.value}
              </Text>
              <Text className="text-[8px] font-black uppercase tracking-widest text-text">
                {stat.label}
              </Text>
            </LiquidGlass>
          ))}
        </Animated.View>

        {/* ACTION BUTTON — Radicar nueva PQRS */}
        <Animated.View
          entering={FadeInDown.delay(300).duration(600)}
          /*
           * Web: `shadow-2xl shadow-accent/20` (page.tsx:199). The shadow lives
           * on this WRAPPER, not on the Pressable: iOS clips a shadow away when
           * the same view sets `overflow: hidden`, which the Pressable must do
           * to clip the gradient to the 32px radius. The opaque background is
           * the gradient's own first stop, so it is never visible — it only
           * gives Android's `elevation` a surface to cast from.
           */
          style={{
            borderRadius: 32,
            backgroundColor: '#0A0A0A',
            shadowColor: tokens.accent,
            shadowOpacity: 0.2,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 12 },
            elevation: 8,
          }}
        >
          <Pressable
            onPress={() => setIsFormOpen(true)}
            style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}
            className="h-[120px] w-full items-center justify-center overflow-hidden rounded-[32px]"
          >
            {/* Web: `bg-linear-to-br from-[#0A0A0A] via-accent/20 to-[#FFFFFF]` (page.tsx:201). */}
            <LinearGradient
              colors={['#0A0A0A', ACCENT_20[theme], '#FFFFFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View className="items-center gap-2">
              {/* Web: `rounded-full bg-white … text-[#000000]` (page.tsx:203) — literal in web. */}
              <View
                className="h-12 w-12 items-center justify-center rounded-full"
                style={{ backgroundColor: '#FFFFFF' }}
              >
                <Plus size={24} color="#000000" />
              </View>
              {/* Web: `text-white font-display font-bold text-sm` (page.tsx:206). */}
              <Text
                className="font-display text-sm font-bold tracking-tight"
                style={{ color: '#FFFFFF' }}
              >
                Radicar nueva PQRS
              </Text>
            </View>
          </Pressable>
        </Animated.View>

        {/* LIST HEADER */}
        <Animated.View
          entering={FadeInDown.delay(400).duration(600)}
          className="mt-4 flex-row items-end justify-between"
        >
          <Text className="font-display text-lg font-bold tracking-tight text-text">
            Tus Solicitudes
          </Text>
          {/* "Filtrar" is decorative in the web source — kept non-functional. */}
          <View className="flex-row items-center gap-1">
            <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
              Filtrar
            </Text>
            <ArrowRight size={10} color={tokens.text} />
          </View>
        </Animated.View>

        {/* PQRS LIST */}
        <View className="gap-4">
          {isLoading ? (
            <View className="items-center gap-4 py-20">
              <ActivityIndicator size="large" color={tokens.text} />
              <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                Sincronizando radicados...
              </Text>
            </View>
          ) : solicitudes.length === 0 ? (
            <LiquidGlass
              radius={32}
              variant="card"
              className="rounded-[32px] border border-border"
              style={{ padding: 40, alignItems: 'center', gap: 16 }}
            >
              {/* Web: `rounded-full bg-text/5 … text-text` (page.tsx:227). */}
              <View className="mb-2 h-16 w-16 items-center justify-center rounded-full bg-text/5">
                <FileText size={32} color={tokens.text} />
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
                <Animated.View
                  key={s.id}
                  entering={FadeInDown.delay(500 + i * 100).duration(600)}
                >
                  {/* Web card has `onClick={() => openDetail(s)}` (page.tsx:235). */}
                  <Pressable
                    onPress={() => void openDetail(s)}
                    accessibilityRole="button"
                    accessibilityLabel={`Ver detalle de ${s.tipo}`}
                  >
                    <LiquidGlass
                      radius={32}
                      variant="card"
                      className="rounded-[32px] border border-border"
                      style={{ padding: 24, gap: 16 }}
                    >
                      <View className="flex-row items-start justify-between">
                        <View className="flex-row items-center gap-3">
                          {/* Web tipo chip: `bg-text/10 border-text/20` (page.tsx:36-41, 238). */}
                          <View className="rounded-2xl border border-text/20 bg-text/10 p-2.5">
                            {cfg.icon(18, tokens.text)}
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
                        <View
                          className={`rounded-full border border-border px-2.5 py-1 ${getStatusLabel(s.estado).chipClass}`}
                        >
                          <Text
                            className={`text-[8px] font-black uppercase tracking-widest ${getStatusLabel(s.estado).textClass}`}
                          >
                            {getStatusLabel(s.estado).text}
                          </Text>
                        </View>
                      </View>

                      <Text numberOfLines={2} className="text-xs leading-relaxed text-text">
                        {s.descripcion}
                      </Text>

                      <View className="mt-2 flex-row items-center justify-between border-t border-border pt-4">
                        <View className="flex-row items-center gap-1.5">
                          <Calendar size={12} color={tokens.text} />
                          <Text className="text-[10px] font-medium text-text">
                            {formatDate(s.createdAt)}
                          </Text>
                        </View>
                        <View className="flex-row items-center gap-2">
                          <Text className="text-[8px] font-black uppercase tracking-widest text-text">
                            ID: {shortId(s.id)}
                          </Text>
                          {s.urgente ? (
                            /* Web: `bg-text/20 text-text` (page.tsx:262). */
                            <View className="rounded-full bg-text/20 px-2 py-0.5">
                              <Text className="text-[8px] font-black uppercase text-text">
                                Urgente
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </LiquidGlass>
                  </Pressable>
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
        photoPreview={photoPreview}
        onChange={setFormData}
        onPickPhoto={handlePhotoSelect}
        onClose={closeForm}
        onSubmit={handleSubmit}
      />

      <DetailModal
        solicitud={selectedSolicitud}
        detail={detailData}
        isLoadingDetail={isLoadingDetail}
        onClose={closeDetail}
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
  /** Local uri of the just-picked photo (web's `photoPreview`). */
  photoPreview: string | null;
  onChange: (next: FormState) => void;
  onPickPhoto: () => void;
  onClose: () => void;
  onSubmit: () => void;
}

function CreateModal({
  open,
  isSubmitting,
  formData,
  photoPreview,
  onChange,
  onPickPhoto,
  onClose,
  onSubmit,
}: CreateModalProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const tokens = tokensFor(theme);

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
        {/* Backdrop — web is `bg-black/80 backdrop-blur-3xl` (page.tsx:273). */}
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        {/* Only dismisses when not submitting. */}
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
                  <Text className="font-display text-xl font-bold tracking-tight text-text">
                    Nueva PQRS
                  </Text>
                  <Text className="mt-1 text-[10px] font-bold uppercase tracking-widest text-text">
                    Radicación oficial
                  </Text>
                </View>
                {/* Web: `rounded-full bg-text/5 … text-text` (page.tsx:282). */}
                <Pressable
                  onPress={onClose}
                  disabled={isSubmitting}
                  className="h-10 w-10 items-center justify-center rounded-full bg-text/5"
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar"
                >
                  <X size={20} color={tokens.text} />
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
                        /*
                         * Web selected resolves to `bg-text/10 border-text/40`
                         * (TIPO_CONFIG.bg + the interpolated
                         * `border-${color.split('-')[1]}/40`, page.tsx:36-41,294);
                         * unselected is `bg-text/5 border-border`. Neutral text
                         * tints, NOT accent.
                         */
                        className={`flex-row items-center gap-2 rounded-2xl border p-3 ${
                          selected ? 'border-text/40 bg-text/10' : 'border-border bg-text/5'
                        }`}
                      >
                        {cfg.icon(16, tokens.text)}
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
                  /* Web: `placeholder:text-text` (page.tsx:311). */
                  placeholderTextColor={tokens.text}
                  multiline
                  textAlignVertical="top"
                  editable={!isSubmitting}
                  /* Web textarea: `bg-text/5 border-border` (page.tsx:311). */
                  className="min-h-[140px] rounded-3xl border border-border bg-text/5 p-5 text-text"
                />
              </View>

              {/* OPTIONS — Vincular Foto + Urgente toggle (web page.tsx:317-349) */}
              <View className="flex-row items-center justify-between rounded-2xl border border-border bg-text/5 p-4">
                <Pressable
                  onPress={onPickPhoto}
                  disabled={isSubmitting}
                  className="flex-row items-center gap-2 overflow-hidden"
                  accessibilityRole="button"
                  accessibilityLabel={photoPreview ? 'Foto vinculada' : 'Vincular Foto'}
                >
                  {photoPreview ? (
                    <Image
                      alt="Preview"
                      source={{ uri: photoPreview }}
                      style={{ width: 32, height: 32, borderRadius: 16 }}
                      contentFit="cover"
                    />
                  ) : (
                    <View className="h-8 w-8 items-center justify-center rounded-full bg-text/5">
                      <Camera size={16} color={tokens.text} />
                    </View>
                  )}
                  <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                    {photoPreview ? 'Foto vinculada' : 'Vincular Foto'}
                  </Text>
                </Pressable>
                <View className="flex-row items-center gap-2">
                  <Text className="text-[10px] font-bold uppercase text-text">¡Urgente!</Text>
                  {/* Web checkbox is `accent-text` (page.tsx:346) — accent-tinted, not monochrome. */}
                  <Switch
                    value={formData.urgente}
                    onValueChange={(urgente) => onChange({ ...formData, urgente })}
                    disabled={isSubmitting}
                    trackColor={{ false: tokens.border, true: tokens.accent }}
                    thumbColor={formData.urgente ? tokens.onAccent : tokens.text}
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
                  <ActivityIndicator color={tokens.onAccent} />
                ) : (
                  <>
                    <Text className="text-base font-bold text-on-accent">Radicar Solicitud</Text>
                    <SendHorizonal size={18} color={tokens.onAccent} />
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

// ---------------------------------------------------------------------------
// Detail modal — web page.tsx:364-423. Same bottom-sheet shell as CreateModal,
// capped at 85% height, showing the full description, the evidence strip, the
// date / radicado footer and the `Seguimiento` comment thread from
// GET /solicitudes/{id}.
// ---------------------------------------------------------------------------

interface DetailModalProps {
  /** The list row that was tapped (web `selectedSolicitud`). */
  solicitud: SolicitudDto | null;
  /** The refreshed detail from GET /solicitudes/{id} (web `detailData`). */
  detail: SolicitudDetalle | null;
  isLoadingDetail: boolean;
  onClose: () => void;
}

function DetailModal({ solicitud, detail, isLoadingDetail, onClose }: DetailModalProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const tokens = tokensFor(theme);

  if (!solicitud) return null;

  const cfg = TIPO_CONFIG[solicitud.tipo] ?? TIPO_CONFIG.PETICION;
  const status = getStatusLabel(detail?.estado || solicitud.estado);
  const imagenes = detail?.imagenes || solicitud.imagenes || [];
  const comentarios = detail?.comentarios ?? [];

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        {/* Web: `bg-black/80 backdrop-blur-3xl` (page.tsx:367). */}
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <Pressable
          onPress={onClose}
          className="absolute inset-0 bg-black/80"
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
        />

        <Animated.View
          entering={SlideInDown.duration(450)}
          className="overflow-hidden rounded-t-[48px] border border-border bg-primary"
          style={{ maxHeight: '85%', paddingBottom: insets.bottom + 16 }}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 24, gap: 20 }}
          >
            <View className="flex-row items-start justify-between">
              <View className="flex-row items-center gap-3">
                {/* Web tipo chip: `bg-text/10 border-text/20` (page.tsx:372). */}
                <View className="rounded-2xl border border-text/20 bg-text/10 p-2.5">
                  {cfg.icon(18, tokens.text)}
                </View>
                <View>
                  <Text className="text-sm font-bold tracking-tight text-text">
                    {solicitud.tipo}
                  </Text>
                  <Text className="text-[8px] font-black uppercase tracking-widest text-text">
                    {solicitud.categoria}
                  </Text>
                </View>
              </View>
              <View
                className={`rounded-full border border-border px-2.5 py-1 ${status.chipClass}`}
              >
                <Text
                  className={`text-[8px] font-black uppercase tracking-widest ${status.textClass}`}
                >
                  {status.text}
                </Text>
              </View>
            </View>

            {/* Full description — not clamped, unlike the list card. */}
            <Text className="text-sm leading-relaxed text-text">
              {detail?.descripcion || solicitud.descripcion}
            </Text>

            {imagenes.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 12, paddingBottom: 8 }}
              >
                {imagenes.map((url, i) => (
                  <Image
                    key={`${url}-${i}`}
                    alt={`Evidencia ${i + 1}`}
                    source={{ uri: url }}
                    style={{ height: 96, width: 96, borderRadius: 16 }}
                    contentFit="cover"
                  />
                ))}
              </ScrollView>
            ) : null}

            <View className="flex-row items-center justify-between border-t border-border pt-4">
              <View className="flex-row items-center gap-1.5">
                <Calendar size={12} color={tokens.text} />
                <Text className="text-[10px] font-medium text-text">
                  {formatDate(solicitud.createdAt)}
                </Text>
              </View>
              <Text className="text-[8px] font-black uppercase tracking-widest text-text">
                ID: {shortId(solicitud.id)}
              </Text>
            </View>

            {isLoadingDetail ? (
              <View className="items-center justify-center py-4">
                <ActivityIndicator color={tokens.text} />
              </View>
            ) : null}

            {comentarios.length > 0 ? (
              <View className="gap-3 border-t border-border pt-4">
                <Text className="px-2 text-[10px] font-bold uppercase tracking-widest text-text">
                  Seguimiento
                </Text>
                {comentarios.map((c) => (
                  /* Web comment card: `bg-text/5 rounded-2xl p-4` (page.tsx:413). */
                  <View key={c.id} className="rounded-2xl bg-text/5 p-4">
                    <Text className="text-xs leading-relaxed text-text">{c.contenido}</Text>
                    <Text className="mt-2 text-[9px] text-text/60">
                      {new Date(c.createdAt).toLocaleDateString('es-ES')}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
