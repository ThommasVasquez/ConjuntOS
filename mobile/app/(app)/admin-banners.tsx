/**
 * ADMIN BANNERS — CONJUNTOSAPP (mobile port)
 * Banners Publicitarios: gestión de los espacios publicitarios del feed.
 *
 * Ported 1:1 from web `src/app/(app)/admin-banners/page.tsx`:
 *  - Roles ADMINISTRADOR / SUPER_ADMIN / CONCEJO (los demás ven
 *    "Acceso restringido"; el web NO redirige, solo cambia el render).
 *  - GET /admin/ad-spaces (errores silenciados, como el web).
 *  - POST /admin/ad-spaces, PUT /admin/ad-spaces/{id} (editar y activar/
 *    desactivar), DELETE /admin/ad-spaces/{id}.
 *  - Métricas por banner: impresiones, clics y CTR calculado.
 *  - Estado "Activo" solo si inicioEn <= ahora <= finEn && activo.
 *
 * Web→native swaps:
 *  - `<select>` de posición → PickerModal (mismo patrón que admin-novedades).
 *  - `<input type="datetime-local">` → DateTimeModal (sin dependencias nuevas).
 *  - `confirm("¿Eliminar este banner?")` → Alert.alert nativo.
 *  - `<Skeleton className="w-8 h-8 rounded-full" />` → Pulse local (bg-text/10).
 *  - Añadido móvil: subir la imagen del banner desde la galería
 *    (expo-image-picker base64 → POST /uploads/imagen) porque teclear una URL
 *    en el teléfono es impracticable. El campo "URL de imagen" del web se
 *    mantiene intacto.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
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
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import {
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react-native';

import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { DateTimeModal } from '@/components/banners/DateTimeModal';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/useAuth';
import { api, ApiError } from '@/lib/api/client';
import { safeHttpUrl } from '@/lib/safe-url';
import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor } from '@/theme/tokens';
import type {
  AdSpaceDto,
  CreateAdSpaceRequest,
  UpdateAdSpaceRequest,
} from '@/lib/api/types';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Las tres opciones del `<select>` de posición del web, en el mismo orden. */
const POSICION_OPTIONS: { value: string; label: string }[] = [
  { value: 'FEED_TOP', label: 'Arriba del feed' },
  { value: 'FEED_MID', label: 'Mitad del feed' },
  { value: 'FEED_BOTTOM', label: 'Abajo del feed' },
];

function posicionLabel(value: string): string {
  return POSICION_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/**
 * Multiply a token's alpha — reproduces web's `/30` opacity modifier in the one
 * place NativeWind cannot reach: a border color that has to come from `style`
 * (`border-border/30` never resolves, because `--color-border` is an rgba()
 * without an `<alpha-value>` slot). Accepts both `rgba(...)` and `#rrggbb`.
 */
function fadeToken(color: string, factor: number): string {
  const m = /rgba?\(([^)]+)\)/.exec(color);
  if (m) {
    const parts = m[1].split(',').map((p) => p.trim());
    if (parts.length < 3) return color;
    const alpha = parts.length > 3 ? Number(parts[3]) : 1;
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha * factor})`;
  }
  const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(color);
  if (!hex) return color;
  const h = hex[1].length === 3
    ? hex[1]
        .split('')
        .map((c) => c + c)
        .join('')
    : hex[1];
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${factor})`;
}

function emptyForm(): CreateAdSpaceRequest {
  return {
    nombre: '',
    posicion: 'FEED_MID',
    imagenUrl: '',
    linkUrl: '',
    empresa: '',
    inicioEn: new Date().toISOString(),
    finEn: new Date(Date.now() + 30 * 86400000).toISOString(),
  };
}

/** Etiqueta del campo datetime: el `<input type="datetime-local">` del web
 *  muestra fecha + hora locales. */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Placeholder de carga — web `<Skeleton className="w-8 h-8 rounded-full" />`
// (`animate-pulse rounded-lg bg-text/10`).
// ---------------------------------------------------------------------------

function Pulse({ size, radius }: { size: number; radius: number }) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.4, { duration: 800 }), -1, true);
    return () => cancelAnimation(opacity);
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      className="bg-text/10"
      style={[style, { width: size, height: size, borderRadius: radius }]}
    />
  );
}

// ---------------------------------------------------------------------------
// Picker de posición (reemplaza al `<select>`). Modal RN plano porque se abre
// desde dentro de otro Modal RN (el formulario).
// ---------------------------------------------------------------------------

interface PickerModalProps {
  open: boolean;
  title: string;
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

function PickerModal({ open, title, options, selected, onSelect, onClose }: PickerModalProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const t = tokensFor(theme);

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <Pressable
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          onPress={onClose}
          className="absolute inset-0 bg-black/80"
        />
        {open ? (
          <Animated.View
            entering={SlideInDown.duration(320)}
            className="max-h-[70%] overflow-hidden rounded-t-[32px] border border-border bg-primaryLight"
            style={{ paddingBottom: insets.bottom + 16 }}
          >
            <View className="flex-row items-center justify-between px-5 py-4">
              <Text className="text-base font-bold text-text">{title}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
                onPress={onClose}
                hitSlop={8}
                className="h-10 w-10 items-center justify-center rounded-full bg-surface2"
              >
                <X size={18} color={t.text} />
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
              showsVerticalScrollIndicator={false}
            >
              {options.map((o) => (
                <Pressable
                  key={o.value}
                  accessibilityRole="button"
                  onPress={() => {
                    onSelect(o.value);
                    onClose();
                  }}
                  className="flex-row items-center justify-between border-b border-border py-3.5"
                >
                  <Text className="flex-1 pr-2 text-sm text-text" numberOfLines={1}>
                    {o.label}
                  </Text>
                  {o.value === selected ? <CheckCircle2 size={18} color={t.accent} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function AdminBanners() {
  const user = useAuth((s) => s.user);
  const { theme } = useTheme();
  const t = tokensFor(theme);

  const [ads, setAds] = useState<AdSpaceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateAdSpaceRequest>(emptyForm);

  const [posicionPickerOpen, setPosicionPickerOpen] = useState(false);
  const [inicioPickerOpen, setInicioPickerOpen] = useState(false);
  const [finPickerOpen, setFinPickerOpen] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const isAdmin = user?.rol === 'ADMINISTRADOR' || user?.rol === 'SUPER_ADMIN';
  const isConcejo = user?.rol === 'CONCEJO';

  const fetchAds = useCallback(async () => {
    try {
      const data = await api.get<AdSpaceDto[]>('/admin/ad-spaces');
      setAds(data);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && (isAdmin || isConcejo)) void fetchAds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const resetForm = useCallback(() => {
    setForm(emptyForm());
  }, []);

  const handleSubmit = useCallback(async () => {
    // Espejo del `required` del `<input>` de nombre (RN no valida formularios).
    if (!form.nombre.trim()) {
      toast.error('Completa el nombre del banner');
      return;
    }
    try {
      if (editingId) {
        const changes: UpdateAdSpaceRequest = {};
        if (form.nombre) changes.nombre = form.nombre;
        if (form.posicion) changes.posicion = form.posicion;
        if (form.imagenUrl !== undefined) changes.imagenUrl = form.imagenUrl || '';
        if (form.linkUrl !== undefined) changes.linkUrl = form.linkUrl || '';
        if (form.empresa !== undefined) changes.empresa = form.empresa || '';
        if (form.inicioEn) changes.inicioEn = form.inicioEn;
        if (form.finEn) changes.finEn = form.finEn;
        await api.put(`/admin/ad-spaces/${editingId}`, changes);
        toast.success('Banner actualizado');
      } else {
        await api.post('/admin/ad-spaces', form);
        toast.success('Banner creado');
      }
      setShowForm(false);
      setEditingId(null);
      resetForm();
      void fetchAds();
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : 'Error') || 'Error al guardar');
    }
  }, [editingId, fetchAds, form, resetForm]);

  const deleteAd = useCallback(
    async (id: string) => {
      try {
        await api.delete(`/admin/ad-spaces/${id}`);
        toast.success('Banner eliminado');
        void fetchAds();
      } catch {
        toast.error('Error al eliminar');
      }
    },
    [fetchAds],
  );

  // Web `confirm("¿Eliminar este banner?")` → diálogo nativo con las dos
  // mismas opciones que ofrece un confirm del navegador.
  const handleDelete = useCallback(
    (id: string) => {
      Alert.alert('¿Eliminar este banner?', undefined, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Aceptar', style: 'destructive', onPress: () => void deleteAd(id) },
      ]);
    },
    [deleteAd],
  );

  const handleToggleActive = useCallback(
    async (ad: AdSpaceDto) => {
      try {
        await api.put(`/admin/ad-spaces/${ad.id}`, { activo: !ad.activo });
        toast.success(ad.activo ? 'Banner desactivado' : 'Banner activado');
        void fetchAds();
      } catch {
        toast.error('Error al cambiar estado');
      }
    },
    [fetchAds],
  );

  const startEdit = useCallback((ad: AdSpaceDto) => {
    setEditingId(ad.id);
    setForm({
      nombre: ad.nombre,
      posicion: ad.posicion,
      imagenUrl: ad.imagenUrl || '',
      linkUrl: ad.linkUrl || '',
      empresa: ad.empresa || '',
      inicioEn: ad.inicioEn,
      finEn: ad.finEn,
    });
    setShowForm(true);
  }, []);

  // Añadido móvil: galería → base64 → POST /uploads/imagen → imagenUrl.
  const handleImageUpload = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.error('Permiso de galería denegado');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 1,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];

    if (asset.fileSize !== undefined && asset.fileSize > 5 * 1024 * 1024) {
      toast.error('El tamaño de la imagen supera el límite de 5MB');
      return;
    }

    setIsUploadingImage(true);
    try {
      const raw = asset.base64 ?? (await new File(asset.uri).base64());
      const mimeType = asset.mimeType || 'image/jpeg';
      const dataUrl = `data:${mimeType};base64,${raw}`;
      const res = await api.post<{ url: string }>('/uploads/imagen', {
        data: dataUrl,
        carpeta: 'banners',
      });
      setForm((prev) => ({ ...prev, imagenUrl: res.url }));
      toast.success('Imagen cargada correctamente');
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? err.detail
          : err instanceof Error
            ? err.message
            : 'Error al cargar imagen';
      toast.error('Error al cargar imagen: ' + msg);
    } finally {
      setIsUploadingImage(false);
    }
  }, []);

  // Acceso restringido — el web solo cambia el render, no redirige.
  if (user && !isAdmin && !isConcejo) {
    return (
      <Screen scroll={false} className="bg-primary">
        <View className="flex-1 items-center justify-center">
          <Text className="text-sm text-text">Acceso restringido</Text>
        </View>
      </Screen>
    );
  }

  const previewUrl = safeHttpUrl(form.imagenUrl);

  return (
    <View style={{ flex: 1 }} className="bg-primary">
      <Screen className="bg-primary">
        <View className="flex flex-col px-4 pt-4">
          <ProfileHeader />
        </View>

        <View className="flex flex-col gap-6 px-4 py-6">
          {/* Header */}
          <Animated.View
            entering={FadeInDown.duration(500)}
            className="flex-row items-center justify-between"
          >
            <View className="flex-1 pr-3">
              <Text className="font-display text-2xl font-bold text-text">
                Banners Publicitarios
              </Text>
              <Text className="mt-1 text-sm text-text/60">
                Gestiona espacios publicitarios para el feed
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Nuevo Banner"
              onPress={() => {
                resetForm();
                setEditingId(null);
                setShowForm(true);
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
              className="rounded-full bg-accent p-3"
            >
              <Plus size={20} color={t.onAccent} />
            </Pressable>
          </Animated.View>

          {/* Ads List */}
          {loading ? (
            <View className="items-center justify-center py-20">
              <Pulse size={32} radius={16} />
            </View>
          ) : ads.length === 0 ? (
            <View className="items-center py-20">
              <View className="mb-3" style={{ opacity: 0.4 }}>
                <BarChart3 size={32} color={t.text} />
              </View>
              <Text className="text-sm text-text/60">No hay banners publicitarios</Text>
              <Text className="mt-1 text-xs text-text/40">Crea el primero con el botón +</Text>
            </View>
          ) : (
            <View className="flex flex-col gap-3">
              {ads.map((ad, i) => {
                const ctr =
                  ad.impresiones > 0 ? ((ad.clics / ad.impresiones) * 100).toFixed(1) : '0';
                const active =
                  new Date(ad.inicioEn) <= new Date() &&
                  new Date(ad.finEn) >= new Date() &&
                  ad.activo;
                return (
                  <Animated.View
                    key={ad.id}
                    entering={FadeInDown.delay(i * 60).duration(450)}
                    // web: `border-accent/30` cuando está activo, y
                    // `border-border/30 opacity-60` cuando no. `border-border/30`
                    // se resuelve con fadeToken (el token ya es rgba).
                    // Sin `overflow-hidden`: recortaría la sombra que
                    // `.liquid-glass-card` dibuja fuera de sus bordes (el
                    // LiquidGlass ya recorta su propio contenido al radio 24).
                    className="rounded-[24px] border"
                    style={{
                      opacity: active ? 1 : 0.6,
                      borderColor: active
                        ? fadeToken(t.accent, 0.3)
                        : fadeToken(t.border, 0.3),
                    }}
                  >
                    <LiquidGlass variant="card" radius={24} style={{ padding: 16 }}>
                      <View className="flex-row items-start justify-between gap-3">
                        <View className="min-w-0 flex-1">
                          <View className="flex-row items-center gap-2">
                            <Text
                              numberOfLines={1}
                              className="shrink text-sm font-bold text-text"
                            >
                              {ad.nombre}
                            </Text>
                            <View
                              className={`rounded-full px-2 py-0.5 ${
                                active ? 'bg-success/20' : 'bg-text/10'
                              }`}
                            >
                              <Text
                                className={`text-[9px] font-bold uppercase ${
                                  active ? 'text-success' : 'text-text/50'
                                }`}
                              >
                                {active ? 'Activo' : 'Inactivo'}
                              </Text>
                            </View>
                          </View>

                          {ad.empresa ? (
                            <Text className="mt-0.5 text-[10px] text-text/60">{ad.empresa}</Text>
                          ) : null}

                          <View className="mt-2 flex-row flex-wrap items-center gap-3">
                            <Text className="text-[10px] text-text/60">Pos: {ad.posicion}</Text>
                            <Text className="text-[10px] text-text/60">
                              👁 {ad.impresiones.toLocaleString()}
                            </Text>
                            <Text className="text-[10px] text-text/60">
                              👆 {ad.clics.toLocaleString()}
                            </Text>
                            <Text className="text-[10px] font-bold text-accent">CTR {ctr}%</Text>
                          </View>

                          <Text className="mt-1 text-[9px] text-text/40">
                            {new Date(ad.inicioEn).toLocaleDateString('es-CO')} →{' '}
                            {new Date(ad.finEn).toLocaleDateString('es-CO')}
                          </Text>
                        </View>

                        <View className="flex-row gap-1">
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={ad.activo ? 'Desactivar' : 'Activar'}
                            onPress={() => void handleToggleActive(ad)}
                            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                            className="rounded-full p-2"
                          >
                            <View style={{ opacity: 0.6 }}>
                              {ad.activo ? (
                                <EyeOff size={14} color={t.text} />
                              ) : (
                                <Eye size={14} color={t.text} />
                              )}
                            </View>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Editar"
                            onPress={() => startEdit(ad)}
                            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                            className="rounded-full p-2"
                          >
                            <View style={{ opacity: 0.6 }}>
                              <ExternalLink size={14} color={t.text} />
                            </View>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Eliminar"
                            onPress={() => handleDelete(ad.id)}
                            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                            className="rounded-full p-2"
                          >
                            <Trash2 size={14} color={t.danger} />
                          </Pressable>
                        </View>
                      </View>
                    </LiquidGlass>
                  </Animated.View>
                );
              })}
            </View>
          )}
        </View>
      </Screen>

      {/* Form Modal */}
      <Modal
        visible={showForm}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          setShowForm(false);
          setEditingId(null);
        }}
      >
        {/* Keyboard avoidance: el diálogo está centrado verticalmente, así que
            sin esto los campos Link / Inicio / Fin y la fila Cancelar/Crear
            quedan bajo el teclado (mismo patrón que admin-documentos.tsx). */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1 items-center justify-center p-4"
        >
          {/* Backdrop inerte: el `<div className="fixed inset-0 bg-black/60">`
              del web no tiene onClick, así que el formulario solo se cierra con
              "Cancelar" (o el botón atrás de Android). */}
          <View
            pointerEvents="none"
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            className="absolute inset-0 bg-black/60"
          />
          <View
            className="w-full overflow-hidden rounded-[28px] border border-border bg-primary"
            style={{ maxWidth: 448, maxHeight: '90%' }}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 24, gap: 16 }}
            >
              <Text className="text-lg font-bold text-text">
                {editingId ? 'Editar Banner' : 'Nuevo Banner'}
              </Text>

              {/* Nombre */}
              <View className="gap-1">
                <Text className="text-[10px] font-bold uppercase tracking-widest text-text/60">
                  Nombre
                </Text>
                <TextInput
                  value={form.nombre}
                  onChangeText={(nombre) => setForm((f) => ({ ...f, nombre }))}
                  placeholder="Ej: Promo Gimnasio"
                  placeholderTextColor={t.textMuted}
                  className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-text"
                />
              </View>

              {/* Empresa */}
              <View className="gap-1">
                <Text className="text-[10px] font-bold uppercase tracking-widest text-text/60">
                  Empresa
                </Text>
                <TextInput
                  value={form.empresa}
                  onChangeText={(empresa) => setForm((f) => ({ ...f, empresa }))}
                  placeholder="Nombre del anunciante"
                  placeholderTextColor={t.textMuted}
                  className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-text"
                />
              </View>

              {/* Posición */}
              <View className="gap-1">
                <Text className="text-[10px] font-bold uppercase tracking-widest text-text/60">
                  Posición
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setPosicionPickerOpen(true)}
                  className="flex-row items-center justify-between rounded-xl border border-border bg-surface-2 px-4 py-2.5"
                >
                  <Text className="flex-1 text-sm text-text" numberOfLines={1}>
                    {posicionLabel(form.posicion)}
                  </Text>
                  <ChevronDown size={16} color={t.text} />
                </Pressable>
              </View>

              {/* URL de imagen */}
              <View className="gap-1">
                <Text className="text-[10px] font-bold uppercase tracking-widest text-text/60">
                  URL de imagen
                </Text>
                <TextInput
                  value={form.imagenUrl}
                  onChangeText={(imagenUrl) => setForm((f) => ({ ...f, imagenUrl }))}
                  placeholder="https://..."
                  placeholderTextColor={t.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-text"
                />
                {/* Añadido móvil: subir desde galería en lugar de teclear la URL. */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isUploadingImage, busy: isUploadingImage }}
                  disabled={isUploadingImage}
                  onPress={() => void handleImageUpload()}
                  style={({ pressed }) => ({
                    opacity: isUploadingImage ? 0.6 : pressed ? 0.85 : 1,
                  })}
                  className="mt-1 flex-row items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-2.5"
                >
                  <Upload size={14} color={t.accent} />
                  <Text className="text-[10px] font-bold uppercase tracking-widest text-text">
                    {isUploadingImage ? 'Subiendo imagen...' : 'Subir desde galería'}
                  </Text>
                </Pressable>
                {previewUrl ? (
                  <Image
                    alt="Vista previa del banner"
                    source={{ uri: previewUrl }}
                    style={{ width: '100%', height: 96, borderRadius: 12, marginTop: 4 }}
                    contentFit="cover"
                    transition={200}
                  />
                ) : null}
              </View>

              {/* Link (al hacer clic) */}
              <View className="gap-1">
                <Text className="text-[10px] font-bold uppercase tracking-widest text-text/60">
                  Link (al hacer clic)
                </Text>
                <TextInput
                  value={form.linkUrl}
                  onChangeText={(linkUrl) => setForm((f) => ({ ...f, linkUrl }))}
                  placeholder="https://..."
                  placeholderTextColor={t.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-text"
                />
              </View>

              {/* Inicio / Fin */}
              <View className="flex-row gap-3">
                <View className="flex-1 gap-1">
                  <Text className="text-[10px] font-bold uppercase tracking-widest text-text/60">
                    Inicio
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setInicioPickerOpen(true)}
                    className="rounded-xl border border-border bg-surface-2 px-3 py-2.5"
                  >
                    <Text className="text-xs text-text" numberOfLines={1}>
                      {formatDateTime(form.inicioEn)}
                    </Text>
                  </Pressable>
                </View>
                <View className="flex-1 gap-1">
                  <Text className="text-[10px] font-bold uppercase tracking-widest text-text/60">
                    Fin
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setFinPickerOpen(true)}
                    className="rounded-xl border border-border bg-surface-2 px-3 py-2.5"
                  >
                    <Text className="text-xs text-text" numberOfLines={1}>
                      {formatDateTime(form.finEn)}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Acciones */}
              <View className="mt-2 flex-row gap-3">
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setShowForm(false);
                    setEditingId(null);
                  }}
                  style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                  className="flex-1 items-center justify-center rounded-2xl border border-border bg-surface-2 py-2.5"
                >
                  <Text className="text-sm font-bold text-text">Cancelar</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void handleSubmit()}
                  style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                  className="flex-1 items-center justify-center rounded-2xl bg-accent py-2.5"
                >
                  <Text className="text-sm font-bold text-on-accent">
                    {editingId ? 'Guardar' : 'Crear'}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>

        {/* Pickers anidados (Modal RN dentro de Modal RN). */}
        <PickerModal
          open={posicionPickerOpen}
          title="Posición"
          options={POSICION_OPTIONS}
          selected={form.posicion}
          onSelect={(posicion) => setForm((f) => ({ ...f, posicion }))}
          onClose={() => setPosicionPickerOpen(false)}
        />
        <DateTimeModal
          open={inicioPickerOpen}
          title="Inicio"
          value={form.inicioEn}
          onChange={(inicioEn) => setForm((f) => ({ ...f, inicioEn }))}
          onClose={() => setInicioPickerOpen(false)}
        />
        <DateTimeModal
          open={finPickerOpen}
          title="Fin"
          value={form.finEn}
          onChange={(finEn) => setForm((f) => ({ ...f, finEn }))}
          onClose={() => setFinPickerOpen(false)}
        />
      </Modal>
    </View>
  );
}
