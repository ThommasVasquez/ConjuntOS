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
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, SlideInDown } from 'react-native-reanimated';
import { Image } from 'expo-image';
import {
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
import { Input } from '@/components/ui/Input';
import { toast } from '@/components/ui/toast';
import { ProfileHeader } from '@/components/shell/ProfileHeader';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ICON_COLOR = '#FFFFFF';
/** CTA accent (info/idle blue) — matches the app-wide CTA color. */
const ACCENT = '#009df2';
/** Active/success green — used for the WhatsApp contact actions. */
const SUCCESS = '#57bf00';

type CategoryId = CatLocal | 'TODOS';

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

/** "$12.000" or "Consultar" when precio is null/empty. */
function formatPrecio(precio: string | null): string {
  return precio ? `$${formatCOP(Number(precio))}` : 'Consultar';
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
  const [items, setItems] = useState<ClasificadoDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCat, setSelectedCat] = useState<CategoryId>('TODOS');
  const [searchQuery, setSearchQuery] = useState('');
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
    <Screen className="bg-primary">
      <View className="flex-1 gap-6 px-6 pt-4">
        {/* HEADER */}
        <Animated.View entering={FadeInDown.duration(500)} className="gap-3">
          <Text className="text-3xl font-black tracking-tight text-text">
            Clasificados <Text style={{ color: ACCENT }}>Internos</Text>
          </Text>
          <Text className="text-sm font-medium leading-relaxed text-textMuted">
            Apoya el talento local de tu conjunto. Servicios, emprendimientos y ventas internas.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(60).duration(500)}>
          <ProfileHeader />
        </Animated.View>

        {/* SEARCH & FILTERS */}
        <Animated.View entering={FadeInDown.delay(120).duration(500)} className="gap-4">
          <Input
            icon={<Search size={18} color={ICON_COLOR} />}
            placeholder="¿Qué buscas hoy?"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />

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
                  style={selected ? { backgroundColor: ACCENT, borderColor: ACCENT } : undefined}
                  className={`flex-row items-center gap-2 rounded-full border px-5 py-2.5 ${
                    selected ? '' : 'border-border bg-surface2'
                  }`}
                >
                  {cat.icon(16, ICON_COLOR)}
                  <Text
                    className={`text-[10px] font-black uppercase tracking-widest ${
                      selected ? 'text-white' : 'text-text'
                    }`}
                  >
                    {cat.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Animated.View>

        {/* ACTION — Nueva Publicación */}
        <Animated.View entering={FadeInDown.delay(180).duration(500)}>
          <Pressable
            onPress={() => setIsPostingOpen(true)}
            style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}
            className="h-16 w-full flex-row items-center justify-center gap-3 rounded-[24px] bg-primary-light border border-border"
          >
            <View
              className="h-9 w-9 items-center justify-center rounded-full"
              style={{ backgroundColor: ACCENT }}
            >
              <Plus size={20} color="#FFFFFF" />
            </View>
            <Text className="text-sm font-bold tracking-tight text-text">Nueva Publicación</Text>
          </Pressable>
        </Animated.View>

        {/* LISTINGS */}
        <View className="gap-5">
          <Animated.View
            entering={FadeInDown.delay(240).duration(500)}
            className="flex-row items-center justify-between"
          >
            <Text className="text-xs font-bold uppercase tracking-widest text-textMuted">
              Resultados ({filteredItems.length})
            </Text>
            <Filter size={14} color={ICON_COLOR} />
          </Animated.View>

          {loading ? (
            <View className="items-center gap-4 py-20">
              <ActivityIndicator size="large" color={ACCENT} />
              <Text className="text-[10px] font-black uppercase tracking-widest text-textMuted">
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
            <LiquidGlass radius={40} className="items-center gap-4 rounded-[40px] border border-border p-10">
              <View className="h-16 w-16 items-center justify-center rounded-full bg-surface">
                <ShoppingBag size={32} color={ICON_COLOR} />
              </View>
              <View className="items-center gap-1">
                <Text className="text-sm font-bold text-text">No se encontraron resultados</Text>
                <Text className="text-xs text-textMuted">
                  Intenta con otra categoría o palabra clave.
                </Text>
              </View>
            </LiquidGlass>
          )}
        </View>
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
  height,
  iconSize = 40,
}: {
  uri: string | null;
  height: number;
  iconSize?: number;
}) {
  const [failed, setFailed] = useState(false);

  if (!uri || failed) {
    return (
      <View style={{ height }} className="w-full items-center justify-center bg-surface2">
        <ShoppingBag size={iconSize} color={ICON_COLOR} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
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
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}>
      <LiquidGlass radius={32} className="overflow-hidden rounded-[32px] border border-border">
        {/* IMAGE */}
        <View className="relative w-full">
          <ListingImage uri={item.imagenUrl} height={192} />

          <View className="absolute left-4 top-4 rounded-full border border-border bg-black/40 px-3 py-1">
            <Text className="text-[9px] font-black uppercase tracking-widest text-white">
              {item.categoria}
            </Text>
          </View>

          <View className="absolute bottom-4 left-4 rounded-2xl border border-border bg-black/40 px-3 py-1.5">
            <Text className="text-lg font-black leading-none text-white">
              {formatPrecio(item.precio)}
            </Text>
          </View>
        </View>

        {/* BODY */}
        <View className="gap-4 p-5">
          <View className="gap-1">
            <Text className="text-lg font-bold leading-tight text-text">{item.nombre}</Text>
            {item.descripcion ? (
              <Text numberOfLines={2} className="text-[11px] font-medium leading-relaxed text-textMuted">
                {item.descripcion}
              </Text>
            ) : null}
          </View>

          <View className="flex-row items-center justify-between border-t border-border pt-4">
            <View className="flex-row items-center gap-2">
              <View
                className="h-8 w-8 items-center justify-center rounded-full border"
                style={{ borderColor: `${ACCENT}4D`, backgroundColor: `${ACCENT}1A` }}
              >
                <Text className="text-[10px] font-black" style={{ color: ACCENT }}>
                  {(item.propietario?.nombre || 'V')[0]}
                </Text>
              </View>
              <View>
                <Text className="text-[10px] font-bold leading-none text-text">
                  {item.propietario?.nombre || 'Vendedor'}
                </Text>
                {item.propietario?.telefono ? (
                  <Text className="mt-0.5 text-[9px] font-bold uppercase text-textMuted">
                    Tel: {item.propietario.telefono}
                  </Text>
                ) : null}
              </View>
            </View>

            <Pressable
              onPress={() => openWhatsApp(item)}
              hitSlop={8}
              className="h-10 w-10 items-center justify-center rounded-2xl border"
              style={{ borderColor: `${SUCCESS}4D`, backgroundColor: `${SUCCESS}1A` }}
            >
              <MessageCircle size={18} color={SUCCESS} />
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
            style={{ maxHeight: '85%' }}
            className="overflow-hidden rounded-t-[40px] border border-border bg-primary"
          >
            {/* IMAGE HEADER */}
            <View className="relative w-full">
              <ListingImage uri={item.imagenUrl} height={240} iconSize={56} />

              <Pressable
                onPress={onClose}
                className="absolute right-6 top-6 h-10 w-10 items-center justify-center rounded-full border border-border bg-black/40"
              >
                <X size={20} color="#FFFFFF" />
              </Pressable>

              <View
                className="absolute left-6 top-6 rounded-full px-4 py-2"
                style={{ backgroundColor: ACCENT }}
              >
                <Text className="text-[10px] font-black uppercase tracking-widest text-white">
                  {item.categoria}
                </Text>
              </View>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 32, gap: 24, paddingBottom: insets.bottom + 32 }}
            >
              <View className="flex-row items-start justify-between gap-4">
                <Text className="flex-1 text-3xl font-black leading-tight text-text">
                  {item.nombre}
                </Text>
                <View className="items-end">
                  <Text
                    className="text-[26px] font-black leading-none tracking-tighter"
                    style={{ color: ACCENT }}
                  >
                    {formatPrecio(item.precio)}
                  </Text>
                  <Text className="mt-1 text-[10px] font-bold uppercase tracking-widest text-textMuted">
                    Precio sugerido
                  </Text>
                </View>
              </View>

              <View className="flex-row items-center gap-3 border-y border-border py-4">
                <View
                  className="h-12 w-12 items-center justify-center rounded-full border-2"
                  style={{ borderColor: `${ACCENT}33`, backgroundColor: `${ACCENT}1A` }}
                >
                  <Text className="font-black" style={{ color: ACCENT }}>
                    {(item.propietario?.nombre || 'V')[0]}
                  </Text>
                </View>
                <View>
                  <Text className="font-bold text-text">
                    {item.propietario?.nombre || 'Vendedor'}
                  </Text>
                  {item.propietario?.telefono ? (
                    <Text className="text-xs text-textMuted">Tel: {item.propietario.telefono}</Text>
                  ) : null}
                </View>
              </View>

              <View className="gap-3">
                <Text className="text-xs font-black uppercase tracking-widest text-textMuted">
                  Descripción del vendedor
                </Text>
                <Text className="text-sm font-medium leading-relaxed text-text">
                  {item.descripcion}
                </Text>
              </View>

              <View className="gap-4 pt-2">
                <Pressable
                  onPress={() => openWhatsApp(item)}
                  style={({ pressed }) => ({
                    backgroundColor: SUCCESS,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  })}
                  className="w-full flex-row items-center justify-center gap-4 rounded-3xl py-5"
                >
                  <MessageCircle size={24} color="#FFFFFF" />
                  <Text className="text-lg font-black text-white">Contactar por WhatsApp</Text>
                </Pressable>
                <Text className="text-center text-[10px] font-black uppercase tracking-widest text-textMuted">
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
  const [form, setForm] = useState<PostingFormState>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);

  const handleClose = () => {
    if (loading) return;
    onClose();
  };

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
      <View className="flex-1 justify-end">
        <Pressable
          onPress={handleClose}
          className="absolute inset-0 bg-black/80"
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
        />

        {open ? (
          <Animated.View
            entering={SlideInDown.duration(450)}
            style={{ maxHeight: '90%' }}
            className="overflow-hidden rounded-t-[48px] border border-border bg-primary"
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 32, gap: 20, paddingBottom: insets.bottom + 32 }}
            >
              {/* HEADER */}
              <View className="flex-row items-center justify-between">
                <Text className="text-xl font-bold tracking-tight text-text">
                  Nueva Publicación
                </Text>
                <Pressable
                  onPress={handleClose}
                  disabled={loading}
                  className="h-10 w-10 items-center justify-center rounded-full bg-surface"
                >
                  <X size={20} color={ICON_COLOR} />
                </Pressable>
              </View>

              {/* PHOTO BOX — decorative, no upload endpoint (parity with web). */}
              <View className="h-40 w-full items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-border bg-surface">
                <View className="h-12 w-12 items-center justify-center rounded-full bg-surface2">
                  <Camera size={24} color={ICON_COLOR} />
                </View>
                <Text className="text-[10px] font-black uppercase tracking-widest text-textMuted">
                  Subir foto del producto
                </Text>
              </View>

              <Input
                label="Título del anuncio"
                placeholder="Ej: Empanadas de Pipian"
                value={form.nombre}
                onChangeText={(nombre) => setForm((f) => ({ ...f, nombre }))}
                editable={!loading}
              />

              <Input
                label="Precio (COP)"
                placeholder="0"
                keyboardType="numeric"
                value={form.precio}
                onChangeText={(precio) => setForm((f) => ({ ...f, precio }))}
                editable={!loading}
              />

              {/* CATEGORÍA — enum IDs only, 'TODOS' excluded. */}
              <View className="gap-3">
                <Text className="text-sm font-medium text-textMuted">Categoría</Text>
                <View className="flex-row flex-wrap gap-2">
                  {CATEGORIES.filter((c) => c.id !== 'TODOS').map((cat) => {
                    const selected = form.categoria === cat.id;
                    return (
                      <Pressable
                        key={cat.id}
                        onPress={() => setForm((f) => ({ ...f, categoria: cat.id as CatLocal }))}
                        disabled={loading}
                        style={
                          selected ? { backgroundColor: ACCENT, borderColor: ACCENT } : undefined
                        }
                        className={`flex-row items-center gap-2 rounded-full border px-4 py-2.5 ${
                          selected ? '' : 'border-border bg-surface2'
                        }`}
                      >
                        {cat.icon(14, ICON_COLOR)}
                        <Text
                          className={`text-[10px] font-black uppercase tracking-widest ${
                            selected ? 'text-white' : 'text-text'
                          }`}
                        >
                          {cat.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <Input
                label="WhatsApp de contacto"
                placeholder="310 123 4567"
                keyboardType="phone-pad"
                value={form.whatsapp}
                onChangeText={(whatsapp) => setForm((f) => ({ ...f, whatsapp }))}
                editable={!loading}
              />

              {/* DESCRIPCIÓN — raw multiline TextInput (Input is single-line). */}
              <View className="gap-2">
                <Text className="text-sm font-medium text-textMuted">Descripción</Text>
                <TextInput
                  placeholder="Cuéntanos más sobre lo que ofreces..."
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  multiline
                  textAlignVertical="top"
                  value={form.descripcion}
                  onChangeText={(descripcion) => setForm((f) => ({ ...f, descripcion }))}
                  editable={!loading}
                  className="min-h-[110px] rounded-2xl border border-border bg-surface2 p-4 text-base text-text"
                />
              </View>

              {/* SUBMIT */}
              <Pressable
                onPress={handleSubmit}
                disabled={loading}
                style={({ pressed }) => ({
                  backgroundColor: ACCENT,
                  opacity: loading ? 0.6 : pressed ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                })}
                className="h-14 w-full flex-row items-center justify-center gap-3 rounded-2xl"
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Send size={18} color="#FFFFFF" />
                    <Text className="text-sm font-black uppercase tracking-widest text-white">
                      Publicar Ahora
                    </Text>
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
