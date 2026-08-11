/**
 * SUPERADMIN — Registrar Copropiedad (mobile port).
 *
 * Ported 1:1 from web `src/app/(app)/superadmin/page.tsx`:
 *  - GET  /superadmin/conjuntos            (list, SUPER_ADMIN only)
 *  - POST /superadmin/conjuntos            (create)
 *  - PUT  /superadmin/conjuntos/{id}       (edit)
 *  - WS domain `conjunto` → refetch
 *
 * Web→native swaps: FileReader/base64 logo → expo-image-picker (base64: true),
 * `<input type="color">` → fixed swatch grid, `<input type="date">` → DateSheet.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import Animated, {
  cancelAnimation,
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  Building2,
  Calendar,
  Edit3,
  FileText,
  Layers,
  MapPin,
  Plus,
  ShieldCheck,
  Upload,
  User,
} from 'lucide-react-native';

import { DateSheet } from '@/components/superadmin/DateSheet';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { Screen } from '@/components/ui/Screen';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api } from '@/lib/api/client';
import type { ConjuntoDto } from '@/lib/api/types';
import { useTheme } from '@/providers/ThemeProvider';
import { navActiveFor, tokensFor } from '@/theme/tokens';

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

interface FormState {
  nombre: string;
  nit: string;
  subdominio: string;
  direccion: string;
  ciudad: string;
  representanteLegal: string;
  notariaEscritura: string;
  numeroEscritura: string;
  fechaEscritura: string;
  matriculaInmobiliaria: string;
  totalUnidades: string;
  logoUrl: string;
  colorPrimario: string;
}

const INITIAL_FORM: FormState = {
  nombre: '',
  nit: '',
  subdominio: '',
  direccion: '',
  ciudad: '',
  representanteLegal: '',
  notariaEscritura: '',
  numeroEscritura: '',
  fechaEscritura: '',
  matriculaInmobiliaria: '',
  totalUnidades: '1',
  logoUrl: '',
  colorPrimario: '#404040', // Default premium blue
};

/** 5 MB — the web upload guard. */
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

/**
 * Web `font-mono`. RN's `fontFamily: 'monospace'` is an Android-only alias that
 * iOS silently ignores, so we use the JetBrains Mono faces that
 * `app/_layout.tsx` already loads (the same convention as control-visitas.tsx
 * and admin-novedades.tsx).
 */
const MONO = 'JetBrainsMono_400Regular';
/** Closest loaded face for the web's `font-mono font-bold` / `font-black`. */
const MONO_BOLD = 'JetBrainsMono_500Medium';

/**
 * Fixed palette replacing the web `<input type="color">` (a native color
 * spectrum has no RN equivalent without a new dependency). These are DATA
 * values chosen by the SuperAdmin for a tenant's brand, not app styling.
 */
const COLOR_SWATCHES = [
  '#404040',
  '#0f766e',
  '#2dd4bf',
  '#38bdf8',
  '#0369a1',
  '#1d4ed8',
  '#4f46e5',
  '#7c3aed',
  '#a21caf',
  '#be123c',
  '#dc2626',
  '#ea580c',
  '#b45309',
  '#ca8a04',
  '#65a30d',
  '#047857',
  '#0f172a',
  '#ffffff',
];

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

/** `text-[10px] text-text font-bold uppercase tracking-widest pl-1` label. */
function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="pl-1 text-[10px] font-bold uppercase tracking-widest text-text">
      {children}
    </Text>
  );
}

/** `text-[9px] text-text pl-1 mt-0.5` helper paragraph. */
function FieldHelp({ children }: { children: string }) {
  return <Text className="mt-0.5 pl-1 text-[9px] text-text">{children}</Text>;
}

/** Card section header: accent icon + uppercase title over a hairline rule. */
function SectionHeading({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <View className="flex-row items-center gap-2 border-b border-border pb-2">
      {icon}
      <Text className="flex-1 text-sm font-bold uppercase tracking-widest text-text">
        {title}
      </Text>
    </View>
  );
}

/** The `animate-ping` dot of the edit-mode banner. */
function PingDot() {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1000, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(progress);
    };
  }, [progress]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ scale: 1 + progress.value * 1.2 }],
  }));
  return (
    <View className="h-2.5 w-2.5 items-center justify-center">
      <Animated.View className="absolute h-2.5 w-2.5 rounded-full bg-accent" style={style} />
      <View className="h-2.5 w-2.5 rounded-full bg-accent" />
    </View>
  );
}

/**
 * Web loading state: `<SkeletonRows />` (src/components/ui/Skeleton.tsx) — four
 * `liquid-glass rounded-3xl p-5 border border-border` rows, each holding a
 * 40x40 rounded-xl block, two stacked bars (h-3 w-1/2, h-2.5 w-1/3) and a
 * trailing h-4 w-16 bar, all `animate-pulse bg-text/10 rounded-lg`.
 *
 * Local until the shared mobile Skeleton primitive lands (orchestrator task).
 */
function SkeletonRows({ count = 4 }: { count?: number }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.4, { duration: 1000 }), -1, true);
    return () => {
      cancelAnimation(pulse);
    };
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <View className="w-full flex-col gap-3 px-6">
      {Array.from({ length: count }).map((_, i) => (
        <LiquidGlass key={i} radius={24} className="rounded-3xl border border-border">
          <View className="flex-row items-center gap-3 p-5">
            <Animated.View
              className="h-10 w-10 rounded-xl bg-text/10"
              style={pulseStyle}
            />
            <View className="flex-1 flex-col gap-2">
              <Animated.View className="h-3 w-1/2 rounded-lg bg-text/10" style={pulseStyle} />
              <Animated.View className="h-2.5 w-1/3 rounded-lg bg-text/10" style={pulseStyle} />
            </View>
            <Animated.View className="h-4 w-16 rounded-lg bg-text/10" style={pulseStyle} />
          </View>
        </LiquidGlass>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function Superadmin() {
  const user = useAuth((s) => s.user);
  const authLoading = useAuth((s) => s.loading);
  const router = useRouter();
  const role = user?.rol;
  const { theme } = useTheme();
  const t = tokensFor(theme);
  const nav = navActiveFor(theme);

  const [conjuntos, setConjuntos] = useState<ConjuntoDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tab, setTab] = useState<'CREAR' | 'LISTAR'>('CREAR');
  const [editingConjuntoId, setEditingConjuntoId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  const [formData, setFormData] = useState<FormState>(INITIAL_FORM);

  const handleEditClick = (c: ConjuntoDto) => {
    setEditingConjuntoId(c.id);
    setFormData({
      nombre: c.nombre || '',
      nit: c.nit || '',
      subdominio: c.subdominio || '',
      direccion: c.direccion || '',
      ciudad: c.ciudad || '',
      representanteLegal: c.representanteLegal || '',
      notariaEscritura: c.notariaEscritura || '',
      numeroEscritura: c.numeroEscritura || '',
      fechaEscritura: c.fechaEscritura
        ? new Date(c.fechaEscritura).toISOString().split('T')[0]
        : '',
      matriculaInmobiliaria: c.matriculaInmobiliaria || '',
      totalUnidades: c.totalUnidades ? String(c.totalUnidades) : '1',
      logoUrl: c.logoUrl || '',
      colorPrimario: c.colorPrimario || '#404040',
    });
    setTab('CREAR');
  };

  const handleCancelEdit = () => {
    setEditingConjuntoId(null);
    setFormData(INITIAL_FORM);
  };

  const handleLogoUpload = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        toast.error('Permiso de galería denegado');
        return;
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        base64: true,
        quality: 1,
      });
      if (res.canceled || !res.assets?.length) return;

      const asset = res.assets[0];
      // `fileSize` is not populated by every platform/picker path, so fall back
      // to the decoded byte length of the base64 payload — otherwise the web's
      // 5MB guard would silently never fire on mobile.
      const bytes =
        asset.fileSize ?? (asset.base64 ? Math.floor((asset.base64.length * 3) / 4) : 0);
      if (bytes > MAX_LOGO_BYTES) {
        toast.error('El tamaño de la imagen supera el límite de 5MB');
        return;
      }

      setIsUploading(true);
      // NOTE: File upload endpoint pending on Rust backend. Using inline base64
      // for now (same contract as the web FileReader data-URL).
      if (!asset.base64) {
        toast.error('Error al leer la imagen');
        setIsUploading(false);
        return;
      }
      const mimeType = asset.mimeType ?? 'image/jpeg';
      setFormData((prev) => ({
        ...prev,
        logoUrl: `data:${mimeType};base64,${asset.base64}`,
      }));
      toast.success('Logotipo cargado correctamente');
      setIsUploading(false);
    } catch (err: unknown) {
      toast.error(
        'Error al cargar imagen: ' + (err instanceof Error ? err.message : String(err)),
      );
      setIsUploading(false);
    }
  };

  const fetchConjuntos = useCallback(async () => {
    try {
      const data = await api.get<ConjuntoDto[]>('/superadmin/conjuntos');
      setConjuntos(data);
    } catch {
      toast.error('Error al cargar conjuntos registrados');
    } finally {
      setLoading(false);
    }
  }, []);

  // Real-time WebSocket subscription
  useWsSubscription('conjunto', () => {
    void fetchConjuntos();
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login' as never);
      return;
    }

    if (role !== 'SUPER_ADMIN') {
      toast.error('No autorizado. Esta sección es exclusiva de SuperAdministradores.');
      router.replace('/(app)/inicio' as never);
      return;
    }

    void fetchConjuntos();
  }, [user, authLoading, role, router, fetchConjuntos]);

  const handleSubmit = async () => {
    if (isSubmitting) return;

    if (
      !formData.nombre ||
      !formData.nit ||
      !formData.subdominio ||
      !formData.direccion ||
      !formData.ciudad
    ) {
      toast.error('Por favor completa todos los campos obligatorios');
      return;
    }

    setIsSubmitting(true);
    try {
      // Sanitize before sending: the Rust backend expects typed fields, not the
      // raw string-only form state. totalUnidades must be a number (i32), and
      // optional fields left blank must be omitted (so serde sees them as None)
      // instead of being sent as "" — an empty string fails to deserialize into
      // Option<DateTime>/Option<i32> and triggers a 422.
      const payload: Record<string, unknown> = {};
      Object.entries(formData).forEach(([key, value]) => {
        if (value === '' || value === null || value === undefined) return;
        if (key === 'totalUnidades') {
          const n = parseInt(String(value), 10);
          if (!Number.isNaN(n)) payload[key] = n;
        } else {
          payload[key] = value;
        }
      });

      if (editingConjuntoId) {
        await api.put(`/superadmin/conjuntos/${editingConjuntoId}`, payload);
      } else {
        await api.post('/superadmin/conjuntos', payload);
      }
      toast.success(
        editingConjuntoId
          ? 'Copropiedad actualizada con éxito'
          : 'Conjunto de Propiedad Horizontal registrado con éxito',
      );
      // Reset form
      setFormData(INITIAL_FORM);
      setEditingConjuntoId(null);
      void fetchConjuntos();
      setTab('LISTAR');
    } catch {
      toast.error('Error de conexión al servidor');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading || authLoading) {
    return (
      <Screen scroll={false} className="bg-primary">
        <View className="flex-1 items-center justify-center">
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

          {/* HERO */}
          <Animated.View
            entering={FadeInDown.duration(500)}
            className="flex-row items-center justify-between"
          >
            <View className="flex-1 pr-3">
              <Text className="text-[10px] font-black uppercase italic tracking-[3px] text-accent">
                SuperAdmin Dashboard
              </Text>
              <Text className="mt-1 text-3xl font-bold leading-none text-text">
                Registrar Copropiedad
              </Text>
            </View>
            {/* web: bg-accent/20 + border-accent/30 — the navActive token pair
                (0.18 fill / 0.38 border) is the sanctioned teal-wash equivalent. */}
            <View
              className="h-12 w-12 items-center justify-center rounded-2xl border"
              style={{ backgroundColor: nav.fill, borderColor: nav.border }}
            >
              <Building2 size={22} color={t.accent} />
            </View>
          </Animated.View>

          {/* TABS */}
          <View className="flex-row rounded-full border border-border bg-surface2 p-1">
            <Pressable
              accessibilityRole="button"
              onPress={() => setTab('CREAR')}
              className={`flex-1 items-center rounded-full py-3 ${
                tab === 'CREAR' ? 'bg-accentSoft' : ''
              }`}
            >
              <Text
                className={`text-xs font-bold uppercase tracking-widest ${
                  tab === 'CREAR' ? 'text-accent' : 'text-text'
                }`}
              >
                Nuevo Registro
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setTab('LISTAR')}
              className={`flex-1 items-center rounded-full py-3 ${
                tab === 'LISTAR' ? 'border border-border bg-surface' : ''
              }`}
            >
              <Text className="text-xs font-bold uppercase tracking-widest text-text">
                Ver Registrados ({conjuntos.length})
              </Text>
            </Pressable>
          </View>

          {tab === 'CREAR' ? (
            <View className="flex flex-col gap-6">
              {/* EDIT MODE BANNER */}
              {editingConjuntoId ? (
                <View
                  className="flex-row items-center justify-between rounded-2xl border border-border p-4"
                  style={{ backgroundColor: t.accentSoft }}
                >
                  <View className="flex-1 flex-row items-center gap-2 pr-3">
                    <PingDot />
                    <Text className="flex-1 text-xs text-text">
                      Modo edición activo: Editando{' '}
                      <Text className="font-bold text-text">
                        {formData.nombre || 'copropiedad'}
                      </Text>
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={handleCancelEdit}
                    style={({ pressed }) => ({
                      transform: [{ scale: pressed ? 0.95 : 1 }],
                    })}
                    className="rounded-xl border border-border bg-surface px-3 py-1.5"
                  >
                    <Text className="text-[9px] font-black uppercase tracking-wider text-text">
                      Cancelar
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {/* SECCIÓN 1: IDENTIFICACIÓN GENERAL */}
              <LiquidGlass radius={28} className="rounded-[28px] border border-border">
                <View className="flex flex-col gap-4 p-6">
                  <SectionHeading
                    icon={<Building2 size={16} color={t.accent} />}
                    title="1. Datos Generales de la Copropiedad"
                  />

                  <View className="flex flex-col gap-1.5">
                    <FieldLabel>Nombre Comercial *</FieldLabel>
                    <TextInput
                      value={formData.nombre}
                      onChangeText={(v) => setFormData({ ...formData, nombre: v })}
                      placeholder="Ej: Residencial Club del Sol"
                      placeholderTextColor={t.textMuted}
                      className="w-full rounded-xl border border-border bg-surface2 px-4 py-3 text-sm text-text"
                    />
                  </View>

                  <View className="flex flex-col gap-1.5">
                    <FieldLabel>NIT *</FieldLabel>
                    <TextInput
                      value={formData.nit}
                      onChangeText={(v) => setFormData({ ...formData, nit: v })}
                      placeholder="Ej: 900.123.456-1"
                      placeholderTextColor={t.textMuted}
                      // Native-only hazard: RN autocapitalises/autocorrects by
                      // default, which would mangle a NIT. Browsers do neither.
                      autoCapitalize="none"
                      autoCorrect={false}
                      className="w-full rounded-xl border border-border bg-surface2 px-4 py-3 text-sm text-text"
                    />
                  </View>

                  <View className="flex flex-col gap-1.5">
                    <FieldLabel>Dirección de Ubicación *</FieldLabel>
                    <TextInput
                      value={formData.direccion}
                      onChangeText={(v) => setFormData({ ...formData, direccion: v })}
                      placeholder="Ej: Calle 26 # 69-76"
                      placeholderTextColor={t.textMuted}
                      className="w-full rounded-xl border border-border bg-surface2 px-4 py-3 text-sm text-text"
                    />
                  </View>

                  <View className="flex flex-col gap-1.5">
                    <FieldLabel>Municipio / Ciudad *</FieldLabel>
                    <TextInput
                      value={formData.ciudad}
                      onChangeText={(v) => setFormData({ ...formData, ciudad: v })}
                      placeholder="Ej: Medellín"
                      placeholderTextColor={t.textMuted}
                      className="w-full rounded-xl border border-border bg-surface2 px-4 py-3 text-sm text-text"
                    />
                  </View>

                  <View className="flex flex-col gap-1.5">
                    <FieldLabel>Subdominio Único (Tenant ID) *</FieldLabel>
                    <View className="flex-row items-center rounded-xl border border-border bg-surface2 px-4 py-3">
                      <TextInput
                        value={formData.subdominio}
                        onChangeText={(v) => setFormData({ ...formData, subdominio: v })}
                        placeholder="clubdelsol"
                        placeholderTextColor={t.textMuted}
                        autoCapitalize="none"
                        autoCorrect={false}
                        className="flex-1 text-sm text-text"
                      />
                      <Text className="text-xs text-text" style={{ fontFamily: MONO }}>
                        .conjuntos.app
                      </Text>
                    </View>
                    <FieldHelp>
                      Identificador de URL único para acceso directo al portal de residentes.
                    </FieldHelp>
                  </View>
                </View>
              </LiquidGlass>

              {/* SECCIÓN 2: DATOS DE REGULACIÓN LEGAL (LEY 675 DE 2001) */}
              <LiquidGlass radius={28} className="rounded-[28px] border border-border">
                <View className="flex flex-col gap-4 p-6">
                  <SectionHeading
                    icon={<FileText size={16} color={t.accent} />}
                    title="2. Registro de Personería Jurídica y Representación"
                  />

                  <View className="flex flex-col gap-1.5">
                    <FieldLabel>Representante Legal (Administrador)</FieldLabel>
                    <View className="flex-row items-center rounded-xl border border-border bg-surface2 px-4 py-3">
                      <View className="mr-2">
                        <User size={16} color={t.text} />
                      </View>
                      <TextInput
                        value={formData.representanteLegal}
                        onChangeText={(v) =>
                          setFormData({ ...formData, representanteLegal: v })
                        }
                        placeholder="Nombre completo"
                        placeholderTextColor={t.textMuted}
                        className="flex-1 text-sm text-text"
                      />
                    </View>
                  </View>

                  <View className="flex flex-col gap-1.5">
                    <FieldLabel>Notaría del Reglamento H.P.</FieldLabel>
                    <TextInput
                      value={formData.notariaEscritura}
                      onChangeText={(v) => setFormData({ ...formData, notariaEscritura: v })}
                      placeholder="Ej: Notaría Primera de Envigado"
                      placeholderTextColor={t.textMuted}
                      className="w-full rounded-xl border border-border bg-surface2 px-4 py-3 text-sm text-text"
                    />
                  </View>

                  <View className="flex flex-col gap-1.5">
                    <FieldLabel>Número Escritura Pública</FieldLabel>
                    <TextInput
                      value={formData.numeroEscritura}
                      onChangeText={(v) => setFormData({ ...formData, numeroEscritura: v })}
                      placeholder="Ej: Escritura 4289"
                      placeholderTextColor={t.textMuted}
                      className="w-full rounded-xl border border-border bg-surface2 px-4 py-3 text-sm text-text"
                    />
                  </View>

                  <View className="flex flex-col gap-1.5">
                    <FieldLabel>Fecha de la Escritura</FieldLabel>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setDateOpen(true)}
                      className="flex-row items-center rounded-xl border border-border bg-surface2 px-4 py-3"
                    >
                      <View className="mr-2">
                        <Calendar size={16} color={t.text} />
                      </View>
                      <Text
                        className="flex-1 text-sm text-text"
                        style={{ opacity: formData.fechaEscritura ? 1 : 0.6 }}
                      >
                        {formData.fechaEscritura || 'dd/mm/aaaa'}
                      </Text>
                    </Pressable>
                  </View>

                  <View className="flex flex-col gap-1.5">
                    <FieldLabel>Matrícula Principal Oficina Registro</FieldLabel>
                    <TextInput
                      value={formData.matriculaInmobiliaria}
                      onChangeText={(v) =>
                        setFormData({ ...formData, matriculaInmobiliaria: v })
                      }
                      placeholder="Ej: 001-1234567"
                      placeholderTextColor={t.textMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      className="w-full rounded-xl border border-border bg-surface2 px-4 py-3 text-sm text-text"
                    />
                  </View>

                  <View className="flex flex-col gap-1.5">
                    <FieldLabel>Total Unidades Privadas (Aptos / Casas)</FieldLabel>
                    <View className="flex-row items-center rounded-xl border border-border bg-surface2 px-4 py-3">
                      <View className="mr-2">
                        <Layers size={16} color={t.text} />
                      </View>
                      <TextInput
                        value={formData.totalUnidades}
                        onChangeText={(v) =>
                          setFormData({ ...formData, totalUnidades: v.replace(/[^0-9]/g, '') })
                        }
                        keyboardType="number-pad"
                        className="flex-1 text-sm text-text"
                      />
                    </View>
                    <FieldHelp>
                      Define la cantidad de inmuebles que componen la asamblea general de
                      copropietarios.
                    </FieldHelp>
                  </View>
                </View>
              </LiquidGlass>

              {/* SECCIÓN 3: PERSONALIZACIÓN */}
              <LiquidGlass radius={28} className="rounded-[28px] border border-border">
                <View className="flex flex-col gap-4 p-6">
                  <SectionHeading
                    icon={<Plus size={16} color={t.accent} />}
                    title="3. Personalización del Portal ConjuntOS"
                  />

                  <View className="flex flex-col gap-1.5">
                    <FieldLabel>Logotipo de la Copropiedad</FieldLabel>

                    <View className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface2 p-4">
                      {formData.logoUrl ? (
                        <View className="h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-border bg-white p-1">
                          <Image
                            source={{ uri: formData.logoUrl }}
                            alt="Vista previa del logotipo"
                            style={{ width: '100%', height: '100%' }}
                            contentFit="contain"
                          />
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => setFormData({ ...formData, logoUrl: '' })}
                            className="absolute bottom-0 left-0 right-0 items-center justify-center py-1"
                            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
                          >
                            <Text
                              numberOfLines={1}
                              className="text-[10px] font-bold uppercase tracking-wider text-white"
                            >
                              Remover
                            </Text>
                          </Pressable>
                        </View>
                      ) : (
                        <View
                          className="h-16 w-16 items-center justify-center rounded-xl border border-dashed border-border"
                          style={{ backgroundColor: t.surface }}
                        >
                          <Building2 size={24} color={t.text} />
                        </View>
                      )}

                      <View className="w-full flex-col gap-2">
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ disabled: isUploading, busy: isUploading }}
                          disabled={isUploading}
                          onPress={handleLogoUpload}
                          style={({ pressed }) => ({
                            opacity: isUploading ? 0.5 : 1,
                            transform: [{ scale: pressed ? 0.98 : 1 }],
                          })}
                          className="w-full flex-row items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5"
                        >
                          {isUploading ? (
                            <>
                              <ActivityIndicator size="small" color={t.accent} />
                              <Text className="text-xs font-bold uppercase tracking-wider text-text">
                                Subiendo...
                              </Text>
                            </>
                          ) : (
                            <>
                              <Upload size={12} color={t.accent} />
                              <Text className="text-xs font-bold uppercase tracking-wider text-text">
                                {formData.logoUrl ? 'Cambiar Logotipo' : 'Subir Logotipo'}
                              </Text>
                            </>
                          )}
                        </Pressable>
                        <Text className="text-[9px] leading-tight text-text">
                          Formatos permitidos: PNG, JPG, WebP, SVG. Max 5MB.
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View className="flex flex-col gap-1.5">
                    <FieldLabel>Color de Marca Primario</FieldLabel>
                    <View className="flex-col gap-3 rounded-xl border border-border bg-surface2 px-4 py-3">
                      <View className="flex-row items-center gap-4">
                        <View
                          className="h-10 w-10 rounded-full border border-border"
                          style={{ backgroundColor: formData.colorPrimario }}
                        />
                        <Text
                          className="text-xs font-bold text-text"
                          style={{ fontFamily: MONO_BOLD }}
                        >
                          {formData.colorPrimario}
                        </Text>
                      </View>
                      <View className="flex-row flex-wrap gap-2">
                        {COLOR_SWATCHES.map((hex) => {
                          const selected =
                            formData.colorPrimario.toLowerCase() === hex.toLowerCase();
                          return (
                            <Pressable
                              key={hex}
                              accessibilityRole="button"
                              accessibilityLabel={`Color ${hex}`}
                              onPress={() => setFormData({ ...formData, colorPrimario: hex })}
                              className="h-9 w-9 rounded-full"
                              style={{
                                backgroundColor: hex,
                                borderWidth: selected ? 2 : 1,
                                borderColor: selected ? t.accent : t.border,
                              }}
                            />
                          );
                        })}
                      </View>
                    </View>
                  </View>
                </View>
              </LiquidGlass>

              {/* SUBMIT */}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  disabled: isSubmitting || isUploading,
                  busy: isSubmitting,
                }}
                disabled={isSubmitting || isUploading}
                onPress={handleSubmit}
                style={({ pressed }) => ({
                  opacity: isSubmitting || isUploading ? 0.5 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                })}
                className="w-full flex-row items-center justify-center gap-2 rounded-2xl bg-accent py-4"
              >
                {isSubmitting ? (
                  <>
                    <ActivityIndicator size="small" color={t.onAccent} />
                    <Text className="text-xs font-black uppercase tracking-widest text-on-accent">
                      {editingConjuntoId
                        ? 'Guardando Cambios...'
                        : 'Registrando Copropiedad...'}
                    </Text>
                  </>
                ) : (
                  <>
                    <ShieldCheck size={18} color={t.onAccent} />
                    <Text className="text-xs font-black uppercase tracking-widest text-on-accent">
                      {editingConjuntoId
                        ? 'Guardar Cambios de Personería'
                        : 'Validar y Crear Personería Jurídica'}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          ) : (
            /* LISTADO DE CONJUNTOS REGISTRADOS */
            <View className="flex flex-col gap-4">
              {conjuntos.length === 0 ? (
                <Text className="py-12 text-center text-sm text-text">
                  No hay conjuntos registrados en el sistema.
                </Text>
              ) : (
                conjuntos.map((c, idx) => (
                  <Animated.View
                    key={c.id || idx}
                    entering={FadeInDown.delay(idx * 60).duration(450)}
                  >
                    <LiquidGlass
                      variant="card"
                      radius={24}
                      className="overflow-hidden rounded-[24px] border border-border"
                    >
                      <View className="flex flex-col gap-3 p-5">
                        <View className="flex-row items-start justify-between">
                          <View className="flex-1 flex-row items-center gap-3 pr-3">
                            {c.logoUrl ? (
                              <View className="h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-border bg-white p-0.5">
                                <Image
                                  source={{ uri: c.logoUrl }}
                                  alt="Logotipo de la copropiedad"
                                  style={{ width: '100%', height: '100%' }}
                                  contentFit="contain"
                                />
                              </View>
                            ) : null}
                            <View className="flex-1">
                              <Text className="text-lg font-bold leading-tight text-text">
                                {c.nombre}
                              </Text>
                              <Text
                                className="text-[10px] font-black uppercase tracking-widest text-accent"
                                style={{ fontFamily: MONO_BOLD }}
                              >
                                {c.nit}
                              </Text>
                            </View>
                          </View>
                          <View className="shrink flex-col items-end gap-2">
                            <View className="max-w-full rounded-full border border-border bg-surface2 px-3 py-1">
                              <Text
                                numberOfLines={1}
                                className="text-[9px] font-black text-text"
                                style={{ fontFamily: MONO_BOLD }}
                              >
                                {c.subdominio}.conjuntos.app
                              </Text>
                            </View>
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => handleEditClick(c)}
                              style={({ pressed }) => ({
                                transform: [{ scale: pressed ? 0.95 : 1 }],
                                backgroundColor: t.accentSoft,
                              })}
                              className="flex-row items-center gap-1 rounded-xl border border-border px-3 py-1.5"
                            >
                              <Edit3 size={10} color={t.accent} />
                              <Text className="text-[10px] font-black uppercase tracking-wider text-accent">
                                Editar
                              </Text>
                            </Pressable>
                          </View>
                        </View>

                        <View className="mt-1 flex-col gap-1 border-t border-border pt-3">
                          <View className="flex-row items-center gap-2">
                            <MapPin size={12} color={t.text} />
                            <Text className="flex-1 text-xs text-text">
                              {c.direccion}, {c.ciudad}
                            </Text>
                          </View>
                          {c.representanteLegal ? (
                            <View className="flex-row items-center gap-2">
                              <User size={12} color={t.text} />
                              <Text className="flex-1 text-xs text-text">
                                Rep. Legal:{' '}
                                <Text className="font-bold text-text">
                                  {c.representanteLegal}
                                </Text>
                              </Text>
                            </View>
                          ) : null}
                          {c.matriculaInmobiliaria ? (
                            <View className="flex-row items-center gap-2">
                              <FileText size={12} color={t.text} />
                              <Text className="flex-1 text-xs text-text">
                                F. Matrícula:{' '}
                                <Text
                                  className="text-[11px] font-bold text-text"
                                  style={{ fontFamily: MONO_BOLD }}
                                >
                                  {c.matriculaInmobiliaria}
                                </Text>
                              </Text>
                            </View>
                          ) : null}
                          {c.numeroEscritura ? (
                            <View className="flex-row items-center gap-2">
                              <ShieldCheck size={12} color={t.text} />
                              <Text className="flex-1 text-xs text-text">
                                {c.notariaEscritura || 'Deed'}: {c.numeroEscritura} (
                                {c.fechaEscritura
                                  ? new Date(c.fechaEscritura).toLocaleDateString()
                                  : 'N/A'}
                                )
                              </Text>
                            </View>
                          ) : null}
                          <View className="flex-row items-center gap-2">
                            <Layers size={12} color={t.text} />
                            <Text className="flex-1 text-xs text-text">
                              Unidades Totales:{' '}
                              <Text className="font-bold text-text">
                                {c.totalUnidades || 1} celdas/unidades
                              </Text>
                            </Text>
                          </View>
                        </View>
                      </View>
                    </LiquidGlass>
                  </Animated.View>
                ))
              )}
            </View>
          )}
        </View>
      </Screen>

      {/* Fecha de la Escritura picker */}
      <DateSheet
        open={dateOpen}
        value={formData.fechaEscritura}
        title="Fecha de la Escritura"
        onClose={() => setDateOpen(false)}
        onChange={(v) => setFormData((prev) => ({ ...prev, fechaEscritura: v }))}
      />
    </View>
  );
}
