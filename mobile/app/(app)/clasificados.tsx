/**
 * CLASIFICADOS INTERNOS - CONJUNTOSAPP (mobile port)
 * Servicios, emprendimientos y ventas internas del conjunto.
 *
 * Ported from web src/app/(app)/clasificados/page.tsx.
 * - Category chip IDs must match the backend `CatLocal` enum exactly
 *   (RESTAURANTE | TIENDA | LAVANDERIA | FARMACIA | OTRO) or POST
 *   /clasificados fails serde validation; 'TODOS' is client-side only.
 * - No image upload: the web has no upload endpoint, so the photo box in the
 *   posting form is decorative (same as the web page).
 */

import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import type { TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeInDown,
  SlideInDown,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Camera,
  Filter,
  Heart,
  MessageCircle,
  Plus,
  Search,
  Send,
  ShoppingBag,
  Sparkles,
  Star,
  Utensils,
  Wrench,
  X,
} from 'lucide-react-native';

import { api } from '@/lib/api/client';
import type { CatLocal, ClasificadoDto, CreateClasificadoRequest } from '@/lib/api/types';
import { GuestGate } from '@/components/GuestGate';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { toast } from '@/components/ui/toast';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor } from '@/theme/tokens';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

type CategoryId = CatLocal | 'TODOS';

/**
 * `#rrggbb` + alpha → `rgba()`. Only for style props that cannot take a
 * Tailwind opacity modifier (gradient stops, animated styles): the palette
 * still comes from the tokens, never from a raw hex.
 */
function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// IDs must match the backend `CatLocal` enum / `locales_categoria_check`
// constraint exactly (RESTAURANTE | TIENDA | LAVANDERIA | FARMACIA | OTRO),
// otherwise POST /clasificados fails serde validation and the filter never matches.
const CATEGORIES: {
  id: CategoryId;
  label: string;
  icon: (size: number, color: string) => ReactElement;
}[] = [
  { id: 'TODOS', label: 'Todos', icon: (s, c) => <Sparkles size={s} color={c} /> },
  { id: 'RESTAURANTE', label: 'Comida', icon: (s, c) => <Utensils size={s} color={c} /> },
  { id: 'TIENDA', label: 'Tienda', icon: (s, c) => <ShoppingBag size={s} color={c} /> },
  { id: 'LAVANDERIA', label: 'Lavandería', icon: (s, c) => <Wrench size={s} color={c} /> },
  { id: 'FARMACIA', label: 'Salud', icon: (s, c) => <Heart size={s} color={c} /> },
  { id: 'OTRO', label: 'Otros', icon: (s, c) => <Star size={s} color={c} /> },
];

/** COP-style thousands grouping (no decimals), Hermes-safe. Mirrors web `n.toLocaleString()`. */
function formatCOP(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  return sign + Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Web renders `${item.precio ? Number(item.precio).toLocaleString() : 'Consultar'}`
 * at web:254 (card) and web:442 (detail) — the `$` is literal JSX text OUTSIDE
 * the ternary, so a null precio reads "$Consultar" on web too. Kept verbatim so
 * the copy matches character for character.
 */
function formatPrecio(precio: string | null): string {
  return `$${precio ? formatCOP(Number(precio)) : 'Consultar'}`;
}

/**
 * Normalize the numeric TextInput value for the BigDecimal API field: the
 * backend parses the string via FromStr, which rejects ',' with a 422. On
 * es-CO keyboards the numeric pad exposes ',' as the decimal separator, so
 * map a trailing decimal comma to '.' and strip thousands separators/spaces.
 */
function normalizePrecio(raw: string): string {
  let s = raw.trim().replace(/[\s']/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastComma > lastDot) {
    // Comma is the decimal separator → dots are thousands separators.
    s = s.replace(/\./g, '').replace(/,([^,]*)$/, '.$1');
  }
  return s.replace(/,/g, '');
}

/**
 * Open a WhatsApp chat with the seller via wa.me (Colombia +57, digits only).
 * Mirrors the web handler, including the error toast when there is no number.
 */
function openWhatsApp(item: ClasificadoDto) {
  const numero = (item.whatsapp || '').replace(/\D/g, '');
  if (!numero) {
    toast.error('Este anuncio no tiene un número de WhatsApp de contacto.');
    return;
  }
  const text = `Hola ${item.propietario?.nombre || 'Vendedor'}, vi tu anuncio de "${item.nombre}" en los Clasificados Internos de EnConjunto y me interesa más información.`;
  Linking.openURL(`https://wa.me/57${numero}?text=${encodeURIComponent(text)}`).catch(() => {
    toast.error('No se pudo abrir WhatsApp');
  });
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

/**
 * Web's loading affordance on this page is not a spinner but a pulsing dot:
 * `w-10 h-10 rounded-full bg-text/10 animate-pulse` (web:146). RN reproduces
 * Tailwind's `animate-pulse` (opacity 1 → .5 → 1) with a repeating timing loop.
 */
function PulsingDot({
  size = 40,
  /**
   * Fill class. Defaults to web's `bg-text/10`, which is correct over the
   * scheme-following page background. On a FILLED accent surface (the submit
   * button) `text` at 10% is invisible in both schemes, so that caller passes
   * an `on-accent` tint instead.
   */
  fillClassName = 'bg-text/10',
}: {
  size?: number;
  fillClassName?: string;
}) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.5, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    // The loop is infinite (-1): it MUST be cancelled when the dot unmounts
    // (the list finishes loading / the submit button leaves its loading state),
    // otherwise the animation keeps running against a dead shared value.
    return () => cancelAnimation(pulse);
  }, [pulse]);

  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      className={fillClassName}
      style={[{ width: size, height: size, borderRadius: size / 2 }, animated]}
    />
  );
}

/**
 * Labelled form field — mirrors web's markup exactly (web:324-333): a
 * 9px/black/uppercase/0.2em label in `text-text` above a `bg-surface-2`
 * rounded-2xl input whose border turns accent on focus. The shared `Input`
 * primitive renders labels as `text-sm text-textMuted`, which is a different
 * control, so this page builds its own field.
 */
function Field({
  label,
  multiline,
  ...rest
}: TextInputProps & { label: string; multiline?: boolean }) {
  const { theme } = useTheme();
  const tokens = tokensFor(theme);
  const [focused, setFocused] = useState(false);

  return (
    <View className="gap-1.5 px-1">
      <Text
        className="ml-1 text-[9px] font-black uppercase text-text"
        style={{ letterSpacing: 1.8 }}
      >
        {label}
      </Text>
      <TextInput
        {...rest}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholderTextColor={tokens.textMuted}
        className={`rounded-2xl border bg-surface2 px-5 py-4 text-sm text-text ${
          multiline ? 'min-h-[110px]' : ''
        } ${focused ? 'border-accent' : 'border-border'}`}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function Clasificados() {
  // HUESPED_TEMPORAL must not browse/post clasificados: listings expose
  // residents' WhatsApp numbers to whoever can open the screen.
  return (
    <GuestGate>
      <ClasificadosInner />
    </GuestGate>
  );
}

function ClasificadosInner() {
  const router = useRouter();
  const { theme } = useTheme();
  const tokens = tokensFor(theme);
  const [items, setItems] = useState<ClasificadoDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCat, setSelectedCat] = useState<CategoryId>('TODOS');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [isPostingOpen, setIsPostingOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ClasificadoDto | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const data = await api.get<ClasificadoDto[]>('/clasificados');
      setItems(data);
    } catch (e) {
      console.error('Error fetching classifieds', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Real-time — refetch the list on every `clasificado` WS event.
  useWsSubscription('clasificado', fetchData);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const query = searchQuery.toLowerCase();
  const filteredItems = items.filter((item) => {
    const matchesCat = selectedCat === 'TODOS' || item.categoria === selectedCat;
    const matchesSearch =
      (item.nombre || '').toLowerCase().includes(query) ||
      (item.descripcion || '').toLowerCase().includes(query);
    return matchesCat && matchesSearch;
  });

  return (
    <Screen scroll={false} className="bg-primary">
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32, gap: 32 }}
      >
        {/* HEADER */}
        <Animated.View entering={FadeInDown.duration(500)} className="gap-4">
          <View className="flex-row items-center gap-4">
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Volver"
              hitSlop={8}
              style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.9 : 1 }] })}
              className="h-10 w-10 items-center justify-center rounded-full border border-border bg-surface2"
            >
              <ArrowLeft size={20} color={tokens.text} />
            </Pressable>
            <Text className="flex-1 text-3xl font-black tracking-tight text-text">
              Clasificados{' '}
              <Text
                className="text-accent"
                style={{ textDecorationLine: 'underline', textDecorationColor: tokens.border }}
              >
                Internos
              </Text>
            </Text>
          </View>
          <Text className="text-sm font-medium leading-relaxed text-text">
            Apoya el talento local de tu conjunto. Servicios, emprendimientos y ventas internas.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(60).duration(500)}>
          <ProfileHeader />
        </Animated.View>

        {/* SEARCH & FILTERS */}
        <Animated.View entering={FadeInDown.delay(120).duration(500)} className="gap-4">
          {/* web:108-117 — the leading icon turns accent while the field has focus. */}
          <View className="relative">
            <View
              pointerEvents="none"
              className="absolute bottom-0 left-5 top-0 z-10 justify-center"
            >
              <Search size={18} color={searchFocused ? tokens.accent : tokens.text} />
            </View>
            <TextInput
              placeholder="¿Qué buscas hoy?"
              placeholderTextColor={tokens.text}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              autoCapitalize="none"
              autoCorrect={false}
              className={`h-14 rounded-2xl border bg-surface2 pl-14 pr-6 text-sm text-text ${
                searchFocused ? 'border-accent/40' : 'border-border'
              }`}
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12, paddingRight: 8 }}
          >
            {CATEGORIES.map((cat) => {
              const selected = selectedCat === cat.id;
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => setSelectedCat(cat.id)}
                  // web:126 selected chip carries `shadow-lg shadow-accent/20`.
                  style={
                    selected
                      ? {
                          shadowColor: tokens.accent,
                          shadowOpacity: 0.2,
                          shadowRadius: 12,
                          shadowOffset: { width: 0, height: 4 },
                          elevation: 4,
                        }
                      : undefined
                  }
                  className={`flex-row items-center gap-2 rounded-full border px-5 py-2.5 ${
                    selected ? 'border-accent bg-accent' : 'border-border bg-surface2'
                  }`}
                >
                  {/* Selected chip is a FILLED accent tile, so its ink must be
                      the paired `onAccent` token (dark ink on the dark scheme's
                      light teal, white on the light scheme's teal-700). */}
                  {cat.icon(18, selected ? tokens.onAccent : tokens.text)}
                  <Text
                    className={`text-[10px] font-black uppercase tracking-widest ${
                      selected ? 'text-on-accent' : 'text-text'
                    }`}
                  >
                    {cat.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Animated.View>

        {/* LISTINGS */}
        <View className="gap-5">
          <Animated.View
            entering={FadeInDown.delay(240).duration(500)}
            className="flex-row items-center justify-between"
          >
            <Text className="text-xs font-bold uppercase tracking-widest text-text">
              Resultados ({filteredItems.length})
            </Text>
            <Filter size={14} color={tokens.text} />
          </Animated.View>

          {loading ? (
            <View className="items-center gap-4 py-20">
              <PulsingDot />
              <Text
                className="text-[10px] font-black uppercase text-text"
                style={{ letterSpacing: 2 }}
              >
                Cargando emprendimientos...
              </Text>
            </View>
          ) : filteredItems.length > 0 ? (
            filteredItems.map((item, i) => (
              <Animated.View key={item.id} entering={FadeInDown.delay(i * 60).duration(450)}>
                <ClasificadoCard item={item} onPress={() => setSelectedItem(item)} />
              </Animated.View>
            ))
          ) : (
            <View className="items-center gap-4 rounded-[40px] border border-dashed border-border bg-surface2 py-20">
              <View className="h-16 w-16 items-center justify-center rounded-full bg-surface2">
                <ShoppingBag size={32} color={tokens.text} />
              </View>
              <View className="items-center gap-1">
                <Text className="font-bold text-text">No se encontraron resultados</Text>
                <Text className="text-xs text-text">
                  Intenta con otra categoría o palabra clave.
                </Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* FAB: POST NEW — web:172-178 (`fixed bottom-32`, accent fill) */}
      <View pointerEvents="box-none" style={{ position: 'absolute', right: 24, bottom: 148 }}>
        <Pressable
          onPress={() => setIsPostingOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Nueva Publicación"
          style={({ pressed }) => ({
            width: 64,
            height: 64,
            borderRadius: 32,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: tokens.accent,
            shadowColor: tokens.accent,
            shadowOpacity: 0.4,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 10 },
            elevation: 10,
            transform: [{ scale: pressed ? 0.95 : 1 }],
          })}
        >
          {/* Filled accent circle → ink must be the paired `onAccent` token. */}
          <Plus size={32} color={tokens.onAccent} />
        </Pressable>
      </View>

      {/* MODAL: POSTING FORM */}
      <PostingModal
        open={isPostingOpen}
        onClose={() => setIsPostingOpen(false)}
        onSuccess={() => {
          setIsPostingOpen(false);
          void fetchData();
        }}
      />

      {/* MODAL: DETAIL VIEW */}
      <DetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Listing image — expo-image with an icon placeholder fallback (no remote
// placeholder asset in the mobile bundle; also covers load errors).
// ---------------------------------------------------------------------------

function ListingImage({
  uri,
  alt,
  height,
  iconSize = 40,
}: {
  uri: string | null;
  /** Mirrors web's `alt={item.nombre}` (web:233 / web:421). */
  alt: string;
  height: number;
  iconSize?: number;
}) {
  const { theme } = useTheme();
  const tokens = tokensFor(theme);
  const [failed, setFailed] = useState(false);

  if (!uri || failed) {
    return (
      <View style={{ height }} className="w-full items-center justify-center bg-surface2">
        <ShoppingBag size={iconSize} color={tokens.textMuted} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      alt={alt}
      style={{ height, width: '100%' }}
      contentFit="cover"
      transition={300}
      onError={() => setFailed(true)}
    />
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function ClasificadoCard({ item, onPress }: { item: ClasificadoDto; onPress: () => void }) {
  const { theme } = useTheme();
  const tokens = tokensFor(theme);
  // Local-only favorite toggle (web:211 — no API call behind it).
  const [isLiked, setIsLiked] = useState(false);

  // web:238 `from-primary/80 dark:from-[#101010]/80` — bottom-up scrim that
  // keeps the category/price chips legible over light photos. The dark stop is
  // a raw hex on web too, so it stays literal here.
  const scrimStop = theme === 'dark' ? 'rgba(16, 16, 16, 0.8)' : alpha(tokens.primary, 0.8);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}>
      {/* web:227 uses the `.liquid-glass-card` variant, not plain `.liquid-glass`. */}
      <LiquidGlass
        variant="card"
        radius={32}
        className="overflow-hidden rounded-[32px] border border-border"
      >
        {/* IMAGE */}
        <View className="relative w-full">
          <ListingImage uri={item.imagenUrl} alt={item.nombre} height={192} />

          <LinearGradient
            pointerEvents="none"
            colors={['transparent', 'transparent', scrimStop]}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />

          <View className="absolute left-4 right-4 top-4 flex-row items-start justify-between">
            {/* web:241 hardcodes white ink on the photo scrim. */}
            <View className="rounded-full border border-white/10 bg-black/40 px-3 py-1">
              <Text className="text-[9px] font-black uppercase tracking-widest text-white">
                {item.categoria}
              </Text>
            </View>

            <Pressable
              onPress={() => setIsLiked((v) => !v)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={isLiked ? 'Quitar de favoritos' : 'Guardar en favoritos'}
              className={`h-9 w-9 items-center justify-center rounded-full border ${
                isLiked ? 'border-border bg-text/10' : 'border-white/20 bg-black/30'
              }`}
            >
              {/* web:248 hardcodes `text-white` + `fill="white"` over the photo. */}
              <Heart size={16} color="#FFFFFF" fill={isLiked ? '#FFFFFF' : 'none'} />
            </Pressable>
          </View>

          <View className="absolute bottom-4 left-4 rounded-2xl border border-white/20 bg-black/40 px-3 py-1.5">
            <Text className="text-[18px] font-black leading-none text-white">
              {formatPrecio(item.precio)}
            </Text>
          </View>
        </View>

        {/* BODY */}
        <View className="gap-4 p-5">
          <View className="gap-1">
            <Text className="text-lg font-bold leading-tight text-text">{item.nombre}</Text>
            {item.descripcion ? (
              <Text numberOfLines={2} className="text-[11px] font-medium leading-relaxed text-text">
                {item.descripcion}
              </Text>
            ) : null}
          </View>

          <View className="mt-auto flex-row items-center justify-between border-t border-border pt-4">
            <View className="flex-row items-center gap-2">
              <View className="h-8 w-8 items-center justify-center rounded-full border border-accent/30 bg-accent/10">
                <Text className="text-[10px] font-black text-accent">
                  {(item.propietario?.nombre || 'V')[0]}
                </Text>
              </View>
              <View>
                <Text className="text-[10px] font-bold leading-none text-text">
                  {item.propietario?.nombre || 'Vendedor'}
                </Text>
                {item.propietario?.telefono ? (
                  <Text
                    className="mt-0.5 text-[9px] font-bold uppercase text-text"
                    style={{ letterSpacing: -0.4 }}
                  >
                    Tel: {item.propietario.telefono}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* web:275-280 — solid accent tile with `border-text/20`. The icon
                sits on a FILLED accent surface, so it takes `onAccent`, not
                `text`: `text` on `accent` is near-white-on-teal in dark and
                dark-on-dark-teal in light — unreadable in BOTH schemes. */}
            <Pressable
              onPress={() => openWhatsApp(item)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Contactar por WhatsApp"
              style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.9 : 1 }] })}
              className="h-10 w-10 items-center justify-center rounded-2xl border border-text/20 bg-accent"
            >
              <MessageCircle size={18} color={tokens.onAccent} />
            </Pressable>
          </View>
        </View>
      </LiquidGlass>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Detail modal — slide-up sheet mirroring the web ClasificadoDetail.
// ---------------------------------------------------------------------------

function DetailModal({ item, onClose }: { item: ClasificadoDto | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { theme } = useTheme();
  const tokens = tokensFor(theme);

  // web:416 `h-[85vh]`; web:418 image header is `h-2/5` OF THE SHEET.
  const sheetHeight = height * 0.85;
  const imageHeight = sheetHeight * 0.4;
  // web:416/426 `bg-primary dark:bg-[#000000]` — the dark sheet is pure black on
  // web too (raw hex there), and the image scrim fades into that same color.
  const sheetBg = theme === 'dark' ? '#000000' : tokens.primary;

  return (
    <Modal
      visible={!!item}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <Pressable
          onPress={onClose}
          className="absolute inset-0 bg-black/80"
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
        />

        {item ? (
          <Animated.View
            entering={SlideInDown.duration(450)}
            // web:416 — only the TOP edge is bordered, and the height is fixed.
            style={{
              height: sheetHeight,
              backgroundColor: sheetBg,
              borderTopWidth: 1,
              borderTopColor: tokens.border,
            }}
            className="overflow-hidden rounded-t-[40px]"
          >
            {/* IMAGE HEADER */}
            <View className="relative w-full" style={{ height: imageHeight }}>
              <ListingImage
                uri={item.imagenUrl}
                alt={item.nombre}
                height={imageHeight}
                iconSize={56}
              />

              {/* web:426 — fades the photo into the sheet body. */}
              <LinearGradient
                pointerEvents="none"
                colors={['transparent', 'transparent', sheetBg]}
                locations={[0, 0.5, 1]}
                style={StyleSheet.absoluteFill}
              />

              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
                className="absolute right-6 top-6 h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/40"
              >
                {/* web:429 hardcodes `text-white` over the photo. */}
                <X size={20} color="#FFFFFF" />
              </Pressable>

              <View
                className="absolute left-6 top-6 rounded-full bg-accent px-4 py-2"
                // web:433 `shadow-lg shadow-accent/20`.
                style={{
                  shadowColor: tokens.accent,
                  shadowOpacity: 0.2,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 4,
                }}
              >
                {/* Filled accent pill → paired `onAccent` ink. */}
                <Text className="text-[10px] font-black uppercase tracking-widest text-on-accent">
                  {item.categoria}
                </Text>
              </View>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 32, gap: 24, paddingBottom: insets.bottom + 32 }}
            >
              <View className="flex-row items-start justify-between gap-4">
                <Text className="flex-1 text-3xl font-black leading-tight text-text">
                  {item.nombre}
                </Text>
                <View className="items-end">
                  <Text className="text-[28px] font-black leading-none tracking-tighter text-accent">
                    {formatPrecio(item.precio)}
                  </Text>
                  <Text className="mt-1 text-[10px] font-bold uppercase tracking-widest text-text">
                    Precio sugerido
                  </Text>
                </View>
              </View>

              <View className="flex-row items-center gap-3 border-y border-border py-4">
                <View className="h-12 w-12 items-center justify-center rounded-full border-2 border-accent/20 bg-accent/10">
                  <Text className="font-black text-accent">
                    {(item.propietario?.nombre || 'V')[0]}
                  </Text>
                </View>
                <View>
                  <Text className="font-bold text-text">
                    {item.propietario?.nombre || 'Vendedor'}
                  </Text>
                  {item.propietario?.telefono ? (
                    <Text className="text-xs text-text">Tel: {item.propietario.telefono}</Text>
                  ) : null}
                </View>
              </View>

              <View className="gap-4">
                <Text
                  className="text-xs font-black uppercase text-text"
                  style={{ letterSpacing: 3.6 }}
                >
                  Descripción del vendedor
                </Text>
                <Text className="text-sm font-medium leading-relaxed text-text">
                  {item.descripcion}
                </Text>
              </View>

              <View className="mt-auto gap-4 py-8">
                <Pressable
                  onPress={() => openWhatsApp(item)}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    // web:466 `shadow-xl shadow-black/20` — a literal black on web too.
                    shadowColor: '#000000',
                    shadowOpacity: 0.2,
                    shadowRadius: 16,
                    shadowOffset: { width: 0, height: 8 },
                    elevation: 6,
                    transform: [{ scale: pressed ? 0.95 : 1 }],
                  })}
                  className="w-full flex-row items-center justify-center gap-4 rounded-3xl bg-accent py-5"
                >
                  <MessageCircle size={24} color={tokens.onAccent} />
                  <Text className="text-lg font-black text-on-accent">
                    Contactar por WhatsApp
                  </Text>
                </Pressable>
                <Text className="text-center text-[10px] font-black uppercase tracking-widest text-text">
                  Transacción directa entre residentes
                </Text>
              </View>
            </ScrollView>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Posting form modal — mirrors the web ClasificadoPostingForm (BottomSheet
// "Nueva Publicación"). No image upload: the photo box is decorative because
// the backend exposes no upload endpoint (same as web).
// ---------------------------------------------------------------------------

interface PostingFormState {
  nombre: string;
  descripcion: string;
  precio: string;
  categoria: CatLocal;
  whatsapp: string;
}

const INITIAL_FORM: PostingFormState = {
  nombre: '',
  descripcion: '',
  precio: '',
  categoria: 'RESTAURANTE',
  whatsapp: '',
};

function PostingModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const tokens = tokensFor(theme);
  const [form, setForm] = useState<PostingFormState>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);

  const handleClose = useCallback(() => {
    if (loading) return;
    onClose();
  }, [loading, onClose]);

  // Drag-to-dismiss from the handle — web BottomSheet.tsx:64-73 closes when the
  // sheet is dragged past 100px or flicked with velocity > 500, and snaps back
  // otherwise. Bound to the handle only so it never fights the form ScrollView.
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (open) translateY.value = 0;
  }, [open, translateY]);

  const dragHandle = Gesture.Pan()
    .onUpdate((e) => {
      'worklet';
      translateY.value = e.translationY > 0 ? e.translationY : 0;
    })
    .onEnd((e) => {
      'worklet';
      if (translateY.value > 100 || e.velocityY > 500) {
        translateY.value = 0;
        runOnJS(handleClose)();
      } else {
        translateY.value = withTiming(0, { duration: 300 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const handleSubmit = async () => {
    if (!form.nombre || !form.precio || !form.descripcion) {
      toast.error('Por favor completa los campos obligatorios');
      return;
    }
    setLoading(true);
    try {
      // `categoria` MUST be the backend enum ID (CatLocal) — serde returns a
      // 422 for any other value.
      const body: CreateClasificadoRequest = {
        nombre: form.nombre,
        categoria: form.categoria,
        descripcion: form.descripcion,
        precio: normalizePrecio(form.precio),
        whatsapp: form.whatsapp || undefined,
      };
      await api.post('/clasificados', body);
      toast.success('¡Publicado con éxito!');
      setForm(INITIAL_FORM);
      onSuccess();
    } catch {
      toast.error('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      {/* Gestures inside an RN Modal need their own root view on Android. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1 justify-end">
          {/* web BottomSheet.tsx:104 — `bg-black/40 backdrop-blur-sm` (NOT black/80).
              The blur matters here because the sheet itself is `bg-surface`, i.e.
              translucent, exactly as on web. */}
          <BlurView
            pointerEvents="none"
            intensity={12}
            tint={theme === 'dark' ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
          <Pressable
            onPress={handleClose}
            className="absolute inset-0 bg-black/40"
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
          />

          {open ? (
            <Animated.View
              entering={SlideInDown.duration(450)}
              // web BottomSheet.tsx:112-113 — `bg-surface rounded-t-3xl`, 90dvh cap.
              style={[
                {
                  maxHeight: '90%',
                  backgroundColor: tokens.surface,
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  overflow: 'hidden',
                },
                sheetStyle,
              ]}
            >
              {/* DRAG HANDLE — web BottomSheet.tsx:116-118 */}
              <GestureDetector gesture={dragHandle}>
                <View className="mt-2 h-8 w-full items-center justify-center">
                  <View className="h-1.5 w-12 rounded-full bg-border" />
                </View>
              </GestureDetector>

              {/* TITLE — web BottomSheet.tsx:120-124 (centered, bottom border) */}
              <View className="border-b border-border px-6 pb-2">
                <Text className="text-center font-display text-lg font-semibold text-text">
                  Nueva Publicación
                </Text>
              </View>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: 24, gap: 20, paddingBottom: insets.bottom + 24 }}
              >
                {/* PHOTO BOX — decorative, no upload endpoint (parity with web). */}
                <View className="h-44 w-full items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-border bg-surface2">
                  <View className="h-12 w-12 items-center justify-center rounded-full bg-surface2">
                    <Camera size={24} color={tokens.text} />
                  </View>
                  <Text className="text-[10px] font-black uppercase tracking-widest text-text">
                    Subir foto del producto
                  </Text>
                </View>

                <Field
                  label="Título del anuncio"
                  placeholder="Ej: Empanadas de Pipian"
                  value={form.nombre}
                  onChangeText={(nombre) => setForm((f) => ({ ...f, nombre }))}
                  editable={!loading}
                />

                <Field
                  label="Precio (COP)"
                  placeholder="0"
                  keyboardType="numeric"
                  value={form.precio}
                  onChangeText={(precio) => setForm((f) => ({ ...f, precio }))}
                  editable={!loading}
                />

                {/* CATEGORÍA — enum IDs only, 'TODOS' excluded. Web uses a native
                    <select> here; chips are the native idiom for the same choice. */}
                <View className="gap-1.5 px-1">
                  <Text
                    className="ml-1 text-[9px] font-black uppercase text-text"
                    style={{ letterSpacing: 1.8 }}
                  >
                    Categoría
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {CATEGORIES.filter((c) => c.id !== 'TODOS').map((cat) => {
                      const selected = form.categoria === cat.id;
                      return (
                        <Pressable
                          key={cat.id}
                          onPress={() => setForm((f) => ({ ...f, categoria: cat.id as CatLocal }))}
                          disabled={loading}
                          className={`flex-row items-center gap-2 rounded-full border px-4 py-2.5 ${
                            selected ? 'border-accent bg-accent' : 'border-border bg-surface2'
                          }`}
                        >
                          {/* Selected chip is a filled accent tile → `onAccent` ink. */}
                          {cat.icon(14, selected ? tokens.onAccent : tokens.text)}
                          <Text
                            className={`text-[10px] font-black uppercase tracking-widest ${
                              selected ? 'text-on-accent' : 'text-text'
                            }`}
                          >
                            {cat.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <Field
                  label="WhatsApp de contacto"
                  placeholder="310 123 4567"
                  keyboardType="phone-pad"
                  value={form.whatsapp}
                  onChangeText={(whatsapp) => setForm((f) => ({ ...f, whatsapp }))}
                  editable={!loading}
                />

                <Field
                  label="Descripción"
                  placeholder="Cuéntanos más sobre lo que ofreces..."
                  multiline
                  value={form.descripcion}
                  onChangeText={(descripcion) => setForm((f) => ({ ...f, descripcion }))}
                  editable={!loading}
                />

                {/* SUBMIT — web:383-389 `bg-accent … text-on-accent shadow-accent/20` */}
                <Pressable
                  onPress={handleSubmit}
                  disabled={loading}
                  style={({ pressed }) => ({
                    opacity: loading ? 0.5 : 1,
                    shadowColor: tokens.accent,
                    shadowOpacity: 0.2,
                    shadowRadius: 16,
                    shadowOffset: { width: 0, height: 8 },
                    elevation: 6,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  })}
                  className="h-14 w-full flex-row items-center justify-center gap-3 rounded-2xl bg-accent"
                >
                  {/* web:388 renders the same `bg-text/10 animate-pulse` dot as
                      the list loader, at `w-5 h-5` — not a spinner. Here it sits
                      on the FILLED accent button, so the fill is retinted to the
                      paired `on-accent` ink; `text/10` vanishes on teal. */}
                  {loading ? (
                    <PulsingDot size={20} fillClassName="bg-on-accent/40" />
                  ) : (
                    <>
                      <Send size={18} color={tokens.onAccent} />
                      <Text className="text-sm font-black uppercase tracking-widest text-on-accent">
                        Publicar Ahora
                      </Text>
                    </>
                  )}
                </Pressable>
              </ScrollView>
            </Animated.View>
          ) : null}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
