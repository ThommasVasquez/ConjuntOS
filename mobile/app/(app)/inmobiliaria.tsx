/**
 * Inmobiliaria Interna - CONJUNTOSAPP (mobile port)
 * Marketplace interno de inmuebles: venta y arriendo de apartamentos,
 * parqueaderos (Moto/Carro/Bici) y habitaciones (tipoUnidad LOCAL).
 *
 * Ported from web src/app/(app)/inmobiliaria/page.tsx:
 *  - GET /inmuebles?tipoNegocio=&tipoUnidad= + búsqueda cliente.
 *  - Detalle con carrusel de imágenes, precio es-CO/en-US y CTA WhatsApp
 *    (wa.me vía Linking; deshabilitado si no hay teléfono).
 *  - Publicar/editar (solo PROPIETARIO): POST /inmuebles, PUT /inmuebles/{id};
 *    imágenes via POST /uploads/imagen {carpeta:'inmobiliaria'}, video via
 *    /uploads/archivo. LOCAL fuerza ALQUILER.
 *  - Normalización de precios colombianos (cleanNumber) portada verbatim.
 *  - WS 'inmueble' → refetch.
 *  - Sin gate de rol: como en web, cualquier rol puede navegar el listado y sólo
 *    el CTA "Publicar Oferta" / "Editar" queda restringido a PROPIETARIO.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
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
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, SlideInDown } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import {
  Bath,
  Bed,
  Building2,
  CheckCircle2,
  Film,
  Heart,
  MapPin,
  Maximize2,
  Plus,
  Search,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

import { PropertyCardSkeletons } from '@/components/inmobiliaria/Skeletons';
import { WhatsAppIcon } from '@/components/inmobiliaria/WhatsAppIcon';
import ProfileHeader from '@/components/shell/ProfileHeader';
import { Screen } from '@/components/ui/Screen';
import { toast } from '@/components/ui/toast';
import { withAlpha } from '@/components/visitas/colorAlpha';
import { useAuth } from '@/hooks/useAuth';
import { useWsSubscription } from '@/hooks/useWebSocket';
import { api } from '@/lib/api/client';
import type { InmuebleDto, TipoNegocio, TipoUnidad } from '@/lib/api/types';
import { useTheme } from '@/providers/ThemeProvider';
import { darkTokens, onSemantic, tokensFor } from '@/theme/tokens';

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

// `InmuebleDto` now carries moneda / telefonoContacto / whatsappContacto (they
// were added to the shared types to match the backend and the web DTO), so this
// no longer patches missing fields — it only NARROWS `moneda` from the shared
// `string` to the two currencies the UI actually formats. The backend sends
// `moneda` as a required `Moneda` enum (inmuebles/dto.rs:27), never null.
type Moneda = 'COP' | 'USD';

interface Inmueble extends InmuebleDto {
  moneda?: Moneda;
  telefonoContacto: string | null;
  whatsappContacto: string | null;
}

// TODO(types-consolidate): CreateInmuebleRequest lacks moneda and the contact
// phone fields; use a local payload shape mirroring the web submit body.
interface InmueblePayload {
  titulo: string;
  descripcion: string;
  precio: string;
  moneda: Moneda;
  tipoNegocio: TipoNegocio;
  tipoUnidad: TipoUnidad;
  habitaciones: number;
  banos: number;
  area: string | null;
  telefonoContacto: string;
  whatsappContacto: string;
  imagenes: string[];
  caracteristicas: string[];
}

type FilterNegocio = 'TODOS' | TipoNegocio;
type FilterUnidad = 'TODOS' | 'APARTAMENTO' | 'PARQUEADERO' | 'LOCAL';

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------

/** WhatsApp brand green — web hardcodes it too (page.tsx:572 `bg-[#25D366]`). */
const WHATSAPP_GREEN = '#25D366';
// Upload cap. Web's helper copy promises "Max 16 MB", but the backend caps every
// request body at 12 MiB (MAX_BODY_BYTES, backend lib.rs) and base64 inflates
// payloads by 4/3, so anything over ~8 MB raw would 413 server-side. The client
// cap stays at 8 MB; the rejection toast deliberately states no number so the
// product only ever shows ONE figure (web's) — see hoistNeeded: web's 16 MB
// promise should come down to 8 MB.
const MAX_FILE_BYTES = 8 * 1024 * 1024;

const VEHICULO_KEYS = ['Moto', 'Carro', 'Bici'] as const;
const BANO_KEYS = ['Baño propio', 'Baño compartido', 'Sin baño'] as const;
const CAMA_KEYS = ['Cama sencilla', 'Cama doble'] as const;

/** Currency label, es-CO for COP / en-US for USD (Hermes-safe fallback). */
function formatPrecio(precio: string, moneda: Moneda | null | undefined): string {
  const value = Number(precio || 0);
  const currency: Moneda = moneda === 'USD' ? 'USD' : 'COP';
  try {
    return new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'es-CO', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    // Hermes builds without full Intl: manual grouping (`$ 1.234.567` COP).
    const rounded = Math.round(value);
    const sep = currency === 'USD' ? ',' : '.';
    const grouped = Math.abs(rounded)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, sep);
    return `${rounded < 0 ? '-' : ''}$${currency === 'USD' ? '' : ' '}${grouped}`;
  }
}

/**
 * Colombian price normalization — ported VERBATIM from the web page.
 * Apostrophe means millions notation (dots = thousands, comma = decimal).
 */
function cleanNumber(raw: string): string {
  if (!raw) return raw;
  const hasApostrophe = raw.includes("'");
  let s = raw.replace(/'/g, '');
  const commaPos = s.lastIndexOf(',');
  const dotPos = s.lastIndexOf('.');

  if (hasApostrophe) {
    s = s.replace(/\./g, '');
    if (commaPos >= 0) {
      s = s.substring(0, s.lastIndexOf(',')) + '.' + s.substring(s.lastIndexOf(',') + 1);
    }
    return s;
  }

  if (commaPos >= 0 && dotPos >= 0) {
    if (commaPos > dotPos) {
      s = s.replace(/\./g, '');
      s =
        s.substring(0, s.lastIndexOf(',')).replace(/,/g, '') +
        '.' +
        s.substring(s.lastIndexOf(',') + 1);
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (commaPos >= 0) {
    const after = s.length - commaPos - 1;
    if (after <= 2 && after > 0 && commaPos > 0) {
      s = s.substring(0, commaPos) + '.' + s.substring(commaPos + 1);
    } else {
      s = s.replace(/,/g, '');
    }
  }
  return s;
}

/** Room ("Habitación", tipoUnidad LOCAL) attributes encoded in caracteristicas. */
interface RoomAttrs {
  bano: string | null;
  amoblada: boolean;
  tv: string | null;
  cama: string | null;
  lavado: boolean;
  aguaCaliente: boolean;
}

function parseRoomAttrs(caracteristicas: string[] | null | undefined): RoomAttrs {
  const cs = caracteristicas ?? [];
  return {
    bano: cs.find((c) => (BANO_KEYS as readonly string[]).includes(c)) ?? null,
    amoblada: cs.includes('Amoblada'),
    tv: cs.find((c) => c.startsWith('TV ')) ?? null,
    cama: cs.find((c) => (CAMA_KEYS as readonly string[]).includes(c)) ?? null,
    lavado: cs.includes('Lavado ropa cama'),
    aguaCaliente: cs.includes('Agua caliente'),
  };
}

/** PARQUEADERO vehicle type (Moto/Carro/Bici) encoded in caracteristicas. */
function parseVehiculo(caracteristicas: string[] | null | undefined): string | null {
  return (caracteristicas ?? []).find((c) => (VEHICULO_KEYS as readonly string[]).includes(c)) ?? null;
}

function vehiculoEmojiLabel(tipo: string | null): string | null {
  if (tipo === 'Moto') return '🏍️ Moto';
  if (tipo === 'Carro') return '🚗 Carro';
  if (tipo === 'Bici') return '🚲 Bici';
  return null;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function Inmobiliaria() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const t = tokensFor(theme);
  // Web does NOT gate this route by role (/inmobiliaria is absent from GATED in
  // src/lib/permissions.ts): every role can browse the listing and only the
  // "Publicar Oferta" CTA / "Editar" affordances are PROPIETARIO-only
  // (src/app/(app)/inmobiliaria/page.tsx:129).
  const isPropietario = user?.rol === 'PROPIETARIO';
  const currentUserId = user?.id;

  const [inmuebles, setInmuebles] = useState<Inmueble[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState<FilterNegocio>('TODOS');
  const [filterUnidad, setFilterUnidad] = useState<FilterUnidad>('TODOS');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInmueble, setSelectedInmueble] = useState<Inmueble | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [editingItem, setEditingItem] = useState<Inmueble | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchInmuebles = useCallback(async (): Promise<Inmueble[]> => {
    const params: string[] = [];
    if (filterType !== 'TODOS') params.push(`tipoNegocio=${filterType}`);
    if (filterUnidad !== 'TODOS') params.push(`tipoUnidad=${filterUnidad}`);
    const qp = params.length > 0 ? `?${params.join('&')}` : '';
    return api.get<Inmueble[]>(`/inmuebles${qp}`);
  }, [filterType, filterUnidad]);

  // Real-time: refetch the list on every `inmueble` WS event.
  const wsRefetch = useCallback(() => {
    fetchInmuebles()
      .then(setInmuebles)
      .catch(() => {});
  }, [fetchInmuebles]);
  useWsSubscription('inmueble', wsRefetch);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await fetchInmuebles();
        if (active) setInmuebles(data);
      } catch (error) {
        console.error('Error loading inmuebles:', error);
        if (active) setInmuebles([]);
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [fetchInmuebles, refreshKey]);

  const filteredInmuebles = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return inmuebles.filter(
      (inv) =>
        (inv.titulo || '').toLowerCase().includes(q) ||
        (inv.descripcion || '').toLowerCase().includes(q),
    );
  }, [inmuebles, searchQuery]);

  return (
    <Screen className="bg-primary">
      <View className="flex-1 gap-6 px-4 pt-4">
        <View className="px-2">
          <Animated.View entering={FadeInDown.duration(500)}>
            <ProfileHeader />
          </Animated.View>
        </View>

        {/* HEADER + CTA */}
        <Animated.View entering={FadeInDown.delay(80).duration(500)} className="gap-2 px-2">
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-row items-center gap-3">
              <Building2 size={18} color={t.accent} />
              <Text className="text-xs font-semibold uppercase tracking-widest text-text">
                Inmobiliaria Interna
              </Text>
            </View>
            {isPropietario ? (
              <Pressable
                onPress={() => setIsPosting(true)}
                style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.95 : 1 }] })}
                className="flex-row items-center gap-2 rounded-xl bg-accent px-4 py-2"
              >
                <Plus size={16} color={t.onAccent} />
                <Text className="text-sm font-bold text-on-accent">Publicar Oferta</Text>
              </Pressable>
            ) : null}
          </View>
          <Text className="mb-6 text-4xl font-bold tracking-tight text-text">
            Encuentra tu proximo hogar aqui mismo.
          </Text>

          {/* SEARCH */}
          <View className="relative justify-center">
            <View className="absolute left-4 z-10">
              <Search size={18} color={withAlpha(t.text, 0.5)} />
            </View>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Buscar inmuebles..."
              placeholderTextColor={withAlpha(t.text, 0.4)}
              className="h-12 rounded-xl border border-border bg-surface2 pl-11 pr-4 text-sm text-text"
            />
          </View>

          {/* FILTER: tipoNegocio */}
          <View className="mt-2 flex-row gap-2 self-start rounded-xl border border-border bg-surface2 p-1">
            {(['TODOS', 'VENTA', 'ALQUILER'] as const).map((type) => (
              <Pressable
                key={type}
                onPress={() => setFilterType(type)}
                className={`rounded-lg px-6 py-2 ${filterType === type ? 'bg-info' : ''}`}
              >
                <Text
                  className={`text-sm font-semibold ${
                    filterType === type ? 'text-on-accent' : 'text-text/60'
                  }`}
                >
                  {type === 'TODOS' ? 'Todos' : type === 'VENTA' ? 'En Venta' : 'En Arriendo'}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* FILTER: tipoUnidad */}
          <View className="mt-1 flex-row flex-wrap gap-2">
            {(
              [
                { key: 'TODOS', label: 'Todo' },
                { key: 'APARTAMENTO', label: 'Apartamentos' },
                { key: 'PARQUEADERO', label: 'Parqueaderos' },
                { key: 'LOCAL', label: 'Habitaciones' },
              ] as const
            ).map(({ key, label }) => (
              <Pressable
                key={key}
                onPress={() => setFilterUnidad(key)}
                className={`rounded-full border px-4 py-2 ${
                  filterUnidad === key ? 'bg-info/15 border-info/30' : 'border-border bg-primary-light'
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    filterUnidad === key ? 'text-info' : 'text-text'
                  }`}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        {/* LIST */}
        <View className="gap-5 px-2">
          {isLoading ? (
            <PropertyCardSkeletons />
          ) : filteredInmuebles.length > 0 ? (
            filteredInmuebles.map((inv, i) => (
              <Animated.View key={inv.id} entering={FadeInDown.delay(i * 70).duration(450)}>
                <PropertyCard
                  item={inv}
                  onPress={() => setSelectedInmueble(inv)}
                  currentUserId={currentUserId}
                  onEdit={(item) => {
                    setEditingItem(item);
                    setIsPosting(true);
                  }}
                />
              </Animated.View>
            ))
          ) : (
            <View className="items-center rounded-3xl border border-border bg-primary-light py-16">
              <View
                className="mb-4 h-16 w-16 items-center justify-center rounded-2xl"
                style={{ backgroundColor: withAlpha(t.info, 0.1) }}
              >
                <Search size={28} color={t.info} />
              </View>
              <Text className="mb-1 text-base font-bold text-text">
                No se encontraron resultados
              </Text>
              <Text className="px-6 text-center text-xs text-text/55">
                Intenta con otros filtros o palabras clave.
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* DETAIL */}
      {selectedInmueble ? (
        <PropertyDetail
          item={selectedInmueble}
          onClose={() => setSelectedInmueble(null)}
          currentUserId={currentUserId}
          onEdit={(item) => {
            setSelectedInmueble(null);
            setEditingItem(item);
            setIsPosting(true);
          }}
        />
      ) : null}

      {/* PUBLISH / EDIT */}
      <PostingModal
        open={isPosting}
        editItem={editingItem}
        onClose={() => {
          setIsPosting(false);
          setEditingItem(null);
        }}
        onSuccess={() => {
          setIsPosting(false);
          setEditingItem(null);
          setRefreshKey((k) => k + 1);
        }}
      />
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Property card
// ---------------------------------------------------------------------------

interface PropertyCardProps {
  item: Inmueble;
  onPress: () => void;
  currentUserId?: string;
  onEdit: (item: Inmueble) => void;
}

function PropertyCard({ item, onPress, currentUserId, onEdit }: PropertyCardProps) {
  const { theme } = useTheme();
  const t = tokensFor(theme);
  const [isLiked, setIsLiked] = useState(false);
  const imagenes = item.imagenes ?? [];
  const mainImage = imagenes[0];
  const isOwner = !!currentUserId && item.usuarioId === currentUserId;
  const isParking = item.tipoUnidad === 'PARQUEADERO';
  const isRoom = item.tipoUnidad === 'LOCAL';
  const vehiculoLabel = isParking ? vehiculoEmojiLabel(parseVehiculo(item.caracteristicas)) : null;
  const room = parseRoomAttrs(item.caracteristicas);
  const formattedPrecio = formatPrecio(item.precio, item.moneda);

  // Web chips embed lucide icons at `size={11} className="text-text/40"`.
  const chips: { icon?: LucideIcon; label: string }[] = isParking
    ? [{ label: vehiculoLabel ?? 'Parqueadero' }, { label: 'Parqueadero Cubierto' }]
    : isRoom
      ? [
          { icon: Maximize2, label: `${item.area || '—'}m²` },
          { icon: Bath, label: room.bano ?? 'Baño' },
          { label: room.amoblada ? '🛋️ Amoblada' : '📦 No amoblada' },
          ...(room.amoblada && room.tv ? [{ label: `📺 ${room.tv}` }] : []),
          ...(room.amoblada && room.cama ? [{ label: room.cama }] : []),
          ...(room.amoblada && room.lavado ? [{ label: '🧺 Lavado incluido' }] : []),
          ...(room.aguaCaliente ? [{ label: '🔥 Agua caliente' }] : []),
        ]
      : [
          { icon: Bed, label: `${item.habitaciones} hab.` },
          { icon: Bath, label: `${item.banos} banos` },
          { icon: Maximize2, label: `${item.area || '—'}m²` },
        ];

  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}>
      <View className="overflow-hidden rounded-[28px] border border-border bg-primary-light">
        {/* IMAGE + PRICE OVERLAY */}
        <View className="h-44 w-full bg-surface2">
          {mainImage ? (
            <Image
              source={{ uri: mainImage }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={300}
            />
          ) : (
            <View className="h-full w-full items-center justify-center">
              <Building2 size={40} color={withAlpha(t.textMuted, 0.6)} />
            </View>
          )}
          {/* Web: `absolute inset-0 bg-linear-to-t from-black/80 via-transparent
              to-black/20` (page.tsx:289) — keeps the white badge + price legible
              over light photos. The black stops are web-hardcoded. */}
          <LinearGradient
            colors={['rgba(0,0,0,0.2)', 'transparent', 'rgba(0,0,0,0.8)']}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View className="absolute left-3 right-3 top-3 flex-row items-start justify-between">
            <View
              className="rounded-full px-2.5 py-1"
              // Web picks explicit hues so Venta/Arriendo read apart (page.tsx:274).
              style={{ backgroundColor: item.tipoNegocio === 'VENTA' ? t.success : t.info }}
            >
              {/* FILLED semantic surface: the dark scheme's success/info are LIGHT
                  tints (#34d399 / #38bdf8) so white ink was ~1.9:1 there. Pair the
                  fill with `onSemantic` (dark ink on dark scheme, white on light). */}
              <Text
                className="text-[10px] font-black uppercase tracking-wider"
                style={{ color: onSemantic(theme) }}
              >
                {item.tipoNegocio === 'VENTA' ? 'En Venta' : 'Arriendo'}
              </Text>
            </View>
            <Pressable
              onPress={() => setIsLiked((prev) => !prev)}
              className={`h-8 w-8 items-center justify-center rounded-full border ${
                isLiked ? 'border-border bg-text/10' : 'border-white/20 bg-black/30'
              }`}
            >
              {/* Web: `text-white` + fill white when liked (page.tsx:301). */}
              <Heart size={14} color="#ffffff" fill={isLiked ? '#ffffff' : 'transparent'} />
            </Pressable>
          </View>
          <View className="absolute bottom-3 left-3">
            <Text className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-white">
              {item.tipoNegocio === 'VENTA' ? 'Precio' : '/ mes'}
            </Text>
            <Text
              className="text-lg font-black text-white"
              style={{ textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } }}
            >
              {formattedPrecio}
            </Text>
          </View>
        </View>

        {/* BODY */}
        <View className="gap-3 p-4">
          <Text numberOfLines={2} className="text-sm font-bold leading-snug text-text">
            {item.titulo}
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {chips.map((chip, i) => {
              const ChipIcon = chip.icon;
              return (
                <View
                  key={`${chip.label}-${i}`}
                  className="flex-row items-center gap-1.5 rounded-full bg-surface2 px-2.5 py-1"
                >
                  {ChipIcon ? <ChipIcon size={11} color={withAlpha(t.text, 0.4)} /> : null}
                  <Text className="text-[10px] font-semibold text-text/70">{chip.label}</Text>
                </View>
              );
            })}
          </View>

          <View className="mt-1 flex-row items-center justify-between gap-2 border-t border-border pt-3">
            <View className="flex-1 flex-row items-center gap-2">
              <View className="h-7 w-7 items-center justify-center rounded-full border border-border bg-accent/10">
                <Text className="text-[9px] font-black text-accent">P</Text>
              </View>
              <View className="flex-1">
                <Text numberOfLines={1} className="text-[10px] font-bold text-text">
                  Propietario
                </Text>
                <Text className="text-[9px] text-text">Verificado</Text>
              </View>
            </View>
            <View className="rounded-lg border border-accent/20 bg-accent/10 px-2 py-1">
              <Text className="text-[9px] font-bold uppercase text-accent">
                {item.tipoNegocio}
              </Text>
            </View>
            {isOwner ? (
              <Pressable
                onPress={() => onEdit(item)}
                className="rounded-lg border border-border bg-surface2 px-2 py-1"
              >
                <Text className="text-[9px] font-bold text-text">Editar</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Property detail — full-screen modal with image carousel + WhatsApp CTA.
// ---------------------------------------------------------------------------

interface PropertyDetailProps {
  item: Inmueble;
  onClose: () => void;
  currentUserId?: string;
  onEdit: (item: Inmueble) => void;
}

function PropertyDetail({ item, onClose, currentUserId, onEdit }: PropertyDetailProps) {
  const { theme } = useTheme();
  const t = tokensFor(theme);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [carouselIndex, setCarouselIndex] = useState(0);

  const isOwner = !!currentUserId && item.usuarioId === currentUserId;
  const isParking = item.tipoUnidad === 'PARQUEADERO';
  const isRoom = item.tipoUnidad === 'LOCAL';
  const tipoVehiculo = isParking ? parseVehiculo(item.caracteristicas) : null;
  const vehiculoLabel = vehiculoEmojiLabel(tipoVehiculo) ?? 'Parqueadero';
  const room = parseRoomAttrs(item.caracteristicas);
  const imagenes = item.imagenes ?? [];
  const formattedPrecio = formatPrecio(item.precio, item.moneda);
  const heroHeight = Math.round(height * 0.45);

  const telefonoWhatsapp = item.whatsappContacto || item.telefonoContacto;
  const whatsappUrl = telefonoWhatsapp
    ? `https://wa.me/${telefonoWhatsapp.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
        `Hola, vi tu publicación "${item.titulo}" en *ConjuntOS®* 🏘️ y me interesa. ¿Me puedes dar más información por favor?`,
      )}`
    : null;

  const onCarouselScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    setCarouselIndex(idx);
  };

  const specTile = (content: ReactNode) => (
    <View className="flex-1 items-center gap-2 rounded-3xl border border-border bg-surface2 p-4">
      {content}
    </View>
  );

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      {/* Web overrides the panel surface to pure #000000 in dark mode
          (page.tsx:434 `bg-primary dark:bg-[#000000]`) — that hex is web's. */}
      <View className="flex-1" style={{ backgroundColor: theme === 'dark' ? '#000000' : t.primary }}>
        {/* FLOATING CONTROLS */}
        <View
          className="absolute left-6 z-50"
          style={{ top: insets.top + 12 }}
        >
          <Pressable
            onPress={onClose}
            className="h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/50"
          >
            {/* Web hardcodes `text-white` on this control (page.tsx:436). */}
            <X size={20} color="#ffffff" />
          </Pressable>
        </View>
        {isOwner ? (
          <View className="absolute right-6 z-50" style={{ top: insets.top + 12 }}>
            <Pressable
              onPress={() => onEdit(item)}
              className="rounded-full bg-accent px-4 py-2.5"
            >
              <Text className="text-xs font-bold text-on-accent">Editar</Text>
            </Pressable>
          </View>
        ) : null}

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* IMAGE CAROUSEL */}
          <View style={{ height: heroHeight, width }}>
            {imagenes.length > 0 ? (
              <>
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={onCarouselScroll}
                >
                  {imagenes.map((uri, i) => (
                    <Image
                      key={`${uri}-${i}`}
                      source={{ uri }}
                      style={{ width, height: heroHeight }}
                      contentFit="cover"
                      transition={300}
                    />
                  ))}
                </ScrollView>
                {imagenes.length > 1 ? (
                  <View className="absolute bottom-24 w-full flex-row justify-center gap-1.5">
                    {imagenes.map((_, i) => (
                      <View
                        key={i}
                        className="h-1.5 rounded-full"
                        style={{
                          width: i === carouselIndex ? 18 : 6,
                          backgroundColor:
                            i === carouselIndex ? '#FFFFFF' : 'rgba(255,255,255,0.4)',
                        }}
                      />
                    ))}
                  </View>
                ) : null}
              </>
            ) : (
              /* The hero well is DARK IN BOTH SCHEMES: the badge + title that sit
                 on top of it are white (they have to be, they normally overlay a
                 photo), so a theme-following `bg-surface2` here rendered
                 white-on-white in light mode. Pin the fill and its ink to the dark
                 palette instead of `tokensFor(theme)`. */
              <View
                className="h-full w-full items-center justify-center"
                style={{ backgroundColor: darkTokens.primaryLight }}
              >
                <Building2 size={56} color={withAlpha(darkTokens.textMuted, 0.6)} />
              </View>
            )}
            <View className="absolute bottom-6 left-6 right-6">
              <View className="mb-2 self-start rounded-full px-3 py-1" style={{ backgroundColor: t.accent }}>
                {/* Filled ACCENT surface → `onAccent`, not white: the dark scheme's
                    accent (#2dd4bf) gave white ink ~1.7:1. */}
                <Text className="text-[10px] font-black uppercase text-on-accent">
                  {item.tipoNegocio}
                </Text>
              </View>
              <Text
                numberOfLines={2}
                className="text-3xl font-bold tracking-tight text-white"
                style={{ textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 } }}
              >
                {item.titulo}
              </Text>
            </View>
          </View>

          <View className="gap-8 p-6">
            {/* PRICE */}
            <View className="flex-row items-center justify-between gap-2 border-b border-border pb-6">
              <View className="min-w-0 flex-1">
                <Text className="mb-1 text-xs font-bold uppercase tracking-widest text-text">
                  Precio solicitado
                </Text>
                <Text numberOfLines={1} className="text-3xl font-black" style={{ color: t.accent }}>
                  {formattedPrecio}
                  {item.tipoNegocio === 'ALQUILER' ? (
                    <Text className="text-sm font-medium text-text"> / mes</Text>
                  ) : null}
                </Text>
              </View>
              <View className="items-end">
                <View className="flex-row items-center gap-1.5">
                  <ShieldCheck size={14} color={t.success} />
                  <Text className="text-xs font-bold" style={{ color: t.success }}>
                    Publicacion Verificada
                  </Text>
                </View>
                <Text className="text-[10px] text-text">Puesto de control verificada</Text>
              </View>
            </View>

            {/* SPECS */}
            {isParking ? (
              <View className="flex-row gap-4">
                {specTile(
                  <>
                    <Text className="text-3xl">
                      {tipoVehiculo === 'Moto' ? '🏍️' : tipoVehiculo === 'Carro' ? '🚗' : '🚲'}
                    </Text>
                    <View className="items-center">
                      <Text className="text-lg font-bold text-text">{vehiculoLabel}</Text>
                      <Text className="text-[10px] font-bold uppercase text-text">Vehículo</Text>
                    </View>
                  </>,
                )}
              </View>
            ) : isRoom ? (
              <View className="gap-3">
                <View className="flex-row gap-3">
                  {specTile(
                    <>
                      <Maximize2 size={22} color={t.accent} />
                      <View className="items-center">
                        <Text className="text-lg font-bold text-text">{item.area || '—'}</Text>
                        <Text className="text-[10px] font-bold uppercase text-text">m²</Text>
                      </View>
                    </>,
                  )}
                  {specTile(
                    <>
                      <Bath size={22} color={t.accent} />
                      <View className="items-center">
                        <Text className="text-center text-sm font-bold text-text">
                          {room.bano || '—'}
                        </Text>
                        <Text className="text-[10px] font-bold uppercase text-text">Baño</Text>
                      </View>
                    </>,
                  )}
                </View>
                <View className="flex-row gap-3">
                  {specTile(
                    <>
                      <Text className="text-2xl">{room.amoblada ? '🛋️' : '📦'}</Text>
                      <Text className="text-sm font-bold text-text">
                        {room.amoblada ? 'Amoblada' : 'No amoblada'}
                      </Text>
                    </>,
                  )}
                  {room.amoblada && room.cama
                    ? specTile(
                        <>
                          <Text className="text-2xl">{room.cama === 'Cama doble' ? '🛏️🛏️' : '🛏️'}</Text>
                          <Text className="text-sm font-bold text-text">{room.cama}</Text>
                        </>,
                      )
                    : null}
                </View>
                {(room.amoblada && room.tv) || room.lavado || room.aguaCaliente ? (
                  <View className="flex-row flex-wrap gap-3">
                    {room.amoblada && room.tv
                      ? specTile(
                          <>
                            <Text className="text-2xl">📺</Text>
                            <Text className="text-sm font-bold text-text">{room.tv}</Text>
                          </>,
                        )
                      : null}
                    {room.lavado
                      ? specTile(
                          <>
                            <Text className="text-2xl">🧺</Text>
                            <Text className="text-sm font-bold text-text">Lavado incluido</Text>
                          </>,
                        )
                      : null}
                    {room.aguaCaliente
                      ? specTile(
                          <>
                            <Text className="text-2xl">🔥</Text>
                            <Text className="text-sm font-bold text-text">Agua caliente</Text>
                          </>,
                        )
                      : null}
                  </View>
                ) : null}
              </View>
            ) : (
              <View className="flex-row gap-4">
                {specTile(
                  <>
                    <Bed size={22} color={t.accent} />
                    <View className="items-center">
                      <Text className="text-lg font-bold text-text">{item.habitaciones}</Text>
                      <Text className="text-[10px] font-bold uppercase text-text">Hab.</Text>
                    </View>
                  </>,
                )}
                {specTile(
                  <>
                    <Bath size={22} color={t.accent} />
                    <View className="items-center">
                      <Text className="text-lg font-bold text-text">{item.banos}</Text>
                      <Text className="text-[10px] font-bold uppercase text-text">Banos</Text>
                    </View>
                  </>,
                )}
                {specTile(
                  <>
                    <Maximize2 size={22} color={t.accent} />
                    <View className="items-center">
                      <Text className="text-lg font-bold text-text">{item.area || '—'}</Text>
                      <Text className="text-[10px] font-black uppercase text-text">m2</Text>
                    </View>
                  </>,
                )}
              </View>
            )}

            {/* LOCATION + DESCRIPTION */}
            <View className="gap-4">
              <View className="flex-row items-center gap-2">
                <MapPin size={18} color={t.accent} />
                <Text className="text-sm font-bold text-text">Conjunto Residencial Interno</Text>
              </View>
              <View className="rounded-3xl border border-dashed border-border bg-surface2 p-5">
                <Text className="mb-3 text-xs font-bold uppercase text-text">Descripcion</Text>
                <Text className="text-sm leading-relaxed text-text">{item.descripcion}</Text>
              </View>
            </View>
          </View>
        </ScrollView>

        {/* WHATSAPP CTA */}
        <View
          className="border-t border-border bg-primary p-6"
          style={{ paddingBottom: insets.bottom + 24 }}
        >
          {whatsappUrl ? (
            <Pressable
              onPress={() => {
                Linking.openURL(whatsappUrl).catch(() =>
                  toast.error('No se pudo abrir WhatsApp'),
                );
              }}
              style={({ pressed }) => ({
                backgroundColor: WHATSAPP_GREEN,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              })}
              className="h-16 w-full flex-row items-center justify-center gap-3 rounded-2xl"
            >
              {/* Web renders the inline WhatsApp <svg> before the label
                  (page.tsx:574-576); the glyph inherits the CTA's white ink. */}
              <WhatsAppIcon size={24} color="#ffffff" />
              <Text className="text-lg font-black text-white">Contactar por WhatsApp</Text>
            </Pressable>
          ) : (
            <View className="h-16 w-full items-center justify-center rounded-2xl bg-surface2">
              <Text className="text-lg font-bold text-text opacity-40">
                Teléfono no disponible
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Publish / edit form — slide-up modal (PROPIETARIO only entry points).
// ---------------------------------------------------------------------------

interface MediaItem {
  /** data: URI for new picks, https URL for existing images (edit mode). */
  uri: string;
  nombre: string;
  isVideo: boolean;
  /** True when the item is an already-uploaded URL (edit mode). */
  isExisting: boolean;
}

interface FormState {
  titulo: string;
  descripcion: string;
  precio: string;
  moneda: Moneda;
  tipoNegocio: TipoNegocio;
  tipoUnidad: TipoUnidad;
  habitaciones: number;
  banos: number;
  area: string;
  telefonoContacto: string;
  whatsappContacto: string;
  tipoVehiculo: string;
  tieneBano: 'propio' | 'compartido' | 'no';
  amoblada: boolean;
  tvPulgadas: string;
  tipoCama: 'sencilla' | 'doble';
  lavadoRopa: boolean;
  aguaCaliente: boolean;
}

function buildInitialForm(editItem: Inmueble | null): FormState {
  const cs = editItem?.caracteristicas ?? [];
  const bano = cs.find((c) => (BANO_KEYS as readonly string[]).includes(c));
  return {
    titulo: editItem?.titulo ?? '',
    descripcion: editItem?.descripcion ?? '',
    precio: editItem?.precio ?? '',
    moneda: editItem?.moneda === 'USD' ? 'USD' : 'COP',
    tipoNegocio: editItem?.tipoNegocio ?? 'ALQUILER',
    tipoUnidad: editItem?.tipoUnidad ?? 'APARTAMENTO',
    habitaciones: editItem?.habitaciones ?? 2,
    banos: editItem?.banos ?? 1,
    area: editItem?.area ?? '',
    telefonoContacto: editItem?.telefonoContacto ?? '',
    whatsappContacto: editItem?.whatsappContacto ?? '',
    tipoVehiculo: parseVehiculo(cs) ?? 'Carro',
    tieneBano:
      bano === 'Baño compartido' ? 'compartido' : bano === 'Sin baño' ? 'no' : 'propio',
    amoblada: cs.includes('Amoblada'),
    tvPulgadas: (cs.find((c) => c.startsWith('TV ')) ?? '')
      .replace('TV ', '')
      .replace('"', ''),
    tipoCama: cs.includes('Cama sencilla') ? 'sencilla' : 'doble',
    lavadoRopa: cs.includes('Lavado ropa cama'),
    aguaCaliente: cs.includes('Agua caliente'),
  };
}

interface PostingModalProps {
  open: boolean;
  editItem: Inmueble | null;
  onClose: () => void;
  onSuccess: () => void;
}

function PostingModal({ open, editItem, onClose, onSuccess }: PostingModalProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const t = tokensFor(theme);
  const isEditing = !!editItem;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<FormState>(() => buildInitialForm(editItem));
  const [media, setMedia] = useState<MediaItem[]>([]);

  // Re-seed the form each time the sheet opens (create vs edit).
  useEffect(() => {
    if (open) {
      setFormData(buildInitialForm(editItem));
      setMedia(
        (editItem?.imagenes ?? []).map((url, i) => ({
          uri: url,
          nombre: `imagen-${i + 1}`,
          isVideo: false,
          isExisting: true,
        })),
      );
    }
  }, [open, editItem]);

  const set = (patch: Partial<FormState>) => setFormData((prev) => ({ ...prev, ...patch }));

  // -- media pickers ---------------------------------------------------------
  const addImages = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.error('Permiso de galería denegado');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      base64: true,
      quality: 0.7,
    });
    if (res.canceled || !res.assets) return;
    for (const asset of res.assets) {
      if (!asset.base64) continue;
      if (asset.fileSize && asset.fileSize > MAX_FILE_BYTES) {
        toast.error('Archivo demasiado grande', 'Max 8 MB por archivo.');
        continue;
      }
      const mimeType = asset.mimeType ?? 'image/jpeg';
      setMedia((prev) => [
        ...prev,
        {
          uri: `data:${mimeType};base64,${asset.base64}`,
          nombre: asset.fileName ?? `imagen-${prev.length + 1}.jpg`,
          isVideo: false,
          isExisting: false,
        },
      ]);
    }
  }, []);

  const addVideo = useCallback(async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: 'video/*',
      multiple: false,
      copyToCacheDirectory: true,
      base64: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    if (asset.size && asset.size > MAX_FILE_BYTES) {
      toast.error('Archivo demasiado grande', 'Max 8 MB por archivo.');
      return;
    }
    // expo-document-picker's `base64` option/field is web-only; on iOS/Android
    // it is always undefined, so read the picked file via expo-file-system
    // (same pattern as chat.tsx pickDocument).
    let raw: string;
    try {
      raw = asset.base64 ?? (await new File(asset.uri).base64());
    } catch {
      toast.error('No se pudo procesar el video');
      return;
    }
    const mimeType = asset.mimeType ?? 'video/mp4';
    const b64 = raw.startsWith('data:') ? raw : `data:${mimeType};base64,${raw}`;
    setMedia((prev) => [
      ...prev,
      { uri: b64, nombre: asset.name, isVideo: true, isExisting: false },
    ]);
  }, []);

  const removeMedia = (index: number) =>
    setMedia((prev) => prev.filter((_, i) => i !== index));

  // -- submit ----------------------------------------------------------------
  const handleSubmit = useCallback(async () => {
    if (!formData.titulo.trim() || !formData.precio.trim() || !formData.descripcion.trim()) {
      toast.warning('Completa titulo, precio y descripcion');
      return;
    }
    setIsSubmitting(true);
    try {
      // Upload new media first (existing URLs pass through untouched).
      const allUrls: string[] = [];
      for (const m of media) {
        if (m.isExisting) {
          allUrls.push(m.uri);
        } else if (m.isVideo) {
          // Wire field is camelCase (UploadArchivoResponse has rename_all = "camelCase").
          const res = await api.post<{ url: string; contentType: string }>('/uploads/archivo', {
            data: m.uri,
            nombre: m.nombre,
          });
          allUrls.push(res.url);
        } else {
          const res = await api.post<{ url: string }>('/uploads/imagen', {
            data: m.uri,
            carpeta: 'inmobiliaria',
          });
          allUrls.push(res.url);
        }
      }

      // Rebuild caracteristicas exactly like the web form.
      const baseCaracteristicas = editItem?.caracteristicas ?? [];
      const vehiculoTag = formData.tipoUnidad === 'PARQUEADERO' ? [formData.tipoVehiculo] : [];
      const roomTags: string[] = [];
      if (formData.tipoUnidad === 'LOCAL') {
        roomTags.push(
          formData.tieneBano === 'propio'
            ? 'Baño propio'
            : formData.tieneBano === 'compartido'
              ? 'Baño compartido'
              : 'Sin baño',
        );
        if (formData.amoblada) {
          roomTags.push('Amoblada');
          if (formData.tvPulgadas) roomTags.push(`TV ${formData.tvPulgadas}"`);
          roomTags.push(formData.tipoCama === 'sencilla' ? 'Cama sencilla' : 'Cama doble');
          if (formData.lavadoRopa) roomTags.push('Lavado ropa cama');
          if (formData.aguaCaliente) roomTags.push('Agua caliente');
        }
      }
      const vehiculoRoomKeys = [
        'Moto',
        'Carro',
        'Bici',
        'Baño propio',
        'Baño compartido',
        'Sin baño',
        'Amoblada',
        'Cama sencilla',
        'Cama doble',
        'Lavado ropa cama',
        'Agua caliente',
      ];
      const caracteristicas = Array.from(
        new Set([
          ...baseCaracteristicas.filter(
            (c) => !vehiculoRoomKeys.includes(c) && !c.startsWith('TV '),
          ),
          ...vehiculoTag,
          ...roomTags,
        ]),
      );

      const payload: InmueblePayload = {
        titulo: formData.titulo,
        descripcion: formData.descripcion,
        precio: cleanNumber(formData.precio),
        moneda: formData.moneda,
        // LOCAL (Habitación) only supports ALQUILER.
        tipoNegocio: formData.tipoUnidad === 'LOCAL' ? 'ALQUILER' : formData.tipoNegocio,
        tipoUnidad: formData.tipoUnidad,
        habitaciones: formData.habitaciones,
        banos: formData.banos,
        area: cleanNumber(formData.area) || null,
        telefonoContacto: formData.telefonoContacto,
        whatsappContacto: formData.whatsappContacto,
        imagenes: allUrls,
        caracteristicas,
      };
      if (isEditing && editItem) {
        await api.put(`/inmuebles/${editItem.id}`, payload);
      } else {
        await api.post('/inmuebles', payload);
      }
      onSuccess();
    } catch (err) {
      console.error(err);
      toast.error('Error al publicar el inmueble');
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, media, editItem, isEditing, onSuccess]);

  const closeGuarded = () => {
    if (!isSubmitting) onClose();
  };

  const pill = (selected: boolean, disabled = false) =>
    `rounded-2xl border py-3 ${
      selected ? 'border-accent bg-accent' : 'border-border bg-surface2'
    } ${disabled ? 'opacity-40' : ''}`;

  const pillText = (selected: boolean) =>
    `text-center text-xs font-bold ${selected ? 'text-on-accent' : 'text-text'}`;

  const label = (text: string) => (
    <Text className="pl-1 text-[10px] font-bold uppercase tracking-widest text-text">{text}</Text>
  );

  const isApto = formData.tipoUnidad !== 'PARQUEADERO' && formData.tipoUnidad !== 'LOCAL';

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={closeGuarded}
    >
      <View className="flex-1 justify-end">
        <Pressable
          onPress={closeGuarded}
          className="absolute inset-0 bg-black/80"
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
        />

        {open ? (
          <Animated.View
            entering={SlideInDown.duration(450)}
            className="overflow-hidden rounded-t-[48px] border border-border bg-primary"
            style={{ paddingBottom: insets.bottom + 16, maxHeight: '92%' }}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 28, gap: 20 }}
            >
              {/* HEADER */}
              <View className="flex-row items-center justify-between">
                <Text className="text-xl font-bold tracking-tight text-text">
                  {isEditing ? 'Editar Inmueble' : 'Publicar Inmueble'}
                </Text>
                <Pressable
                  onPress={closeGuarded}
                  disabled={isSubmitting}
                  className="h-10 w-10 items-center justify-center rounded-full bg-surface"
                >
                  <X size={20} color={t.text} />
                </Pressable>
              </View>

              {/* TIPO NEGOCIO */}
              <View className="flex-row gap-3">
                {(['ALQUILER', 'VENTA'] as const).map((type) => {
                  const isDisabled = type === 'VENTA' && formData.tipoUnidad === 'LOCAL';
                  return (
                    <Pressable
                      key={type}
                      disabled={isDisabled}
                      onPress={() => set({ tipoNegocio: type })}
                      className={`flex-1 ${pill(formData.tipoNegocio === type, isDisabled)}`}
                    >
                      <Text className={pillText(formData.tipoNegocio === type)}>
                        {type === 'ALQUILER' ? 'Arrendar' : 'Vender'}
                      </Text>
                      {isDisabled ? (
                        <Text className="text-center text-[8px] text-text opacity-40">
                          (solo arriendo)
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>

              {/* TIPO UNIDAD */}
              <View className="gap-1.5">
                {label('Tipo de Unidad')}
                <View className="flex-row gap-2">
                  {(
                    [
                      { key: 'APARTAMENTO', label: 'Apartamento' },
                      { key: 'PARQUEADERO', label: 'Parqueadero' },
                      { key: 'LOCAL', label: 'Habitación' },
                    ] as const
                  ).map(({ key, label: unidadLabel }) => (
                    <Pressable
                      key={key}
                      onPress={() =>
                        set({
                          tipoUnidad: key,
                          // Habitación (LOCAL) forces ALQUILER, like the web.
                          ...(key === 'LOCAL' ? { tipoNegocio: 'ALQUILER' as TipoNegocio } : {}),
                        })
                      }
                      className={`flex-1 ${pill(formData.tipoUnidad === key)}`}
                    >
                      <Text className={pillText(formData.tipoUnidad === key)}>{unidadLabel}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* TITULO */}
              <View className="gap-1.5">
                {label('Titulo del Anuncio')}
                <TextInput
                  value={formData.titulo}
                  onChangeText={(titulo) => set({ titulo })}
                  placeholder="Ej: Apartamento remodelado Torre 2"
                  placeholderTextColor={withAlpha(t.text, 0.4)}
                  editable={!isSubmitting}
                  className="h-14 rounded-2xl border border-border bg-surface2 px-4 text-text"
                />
              </View>

              {/* PRECIO + MONEDA */}
              <View className="gap-1.5">
                {label('Precio')}
                <View className="flex-row gap-1">
                  <TextInput
                    value={formData.precio}
                    onChangeText={(v) => set({ precio: v.replace(/[^0-9.,']/g, '') })}
                    placeholder="0.00"
                    placeholderTextColor={withAlpha(t.text, 0.4)}
                    keyboardType="numbers-and-punctuation"
                    editable={!isSubmitting}
                    className="h-14 flex-1 rounded-2xl border border-border bg-surface2 px-4 text-text"
                  />
                  <View className="h-14 flex-row overflow-hidden rounded-2xl border border-border bg-surface2">
                    {(['COP', 'USD'] as const).map((c) => (
                      <Pressable
                        key={c}
                        onPress={() => set({ moneda: c })}
                        className={`h-14 justify-center px-3 ${
                          formData.moneda === c ? 'bg-accent' : ''
                        }`}
                      >
                        <Text
                          className={`text-xs font-bold ${
                            formData.moneda === c ? 'text-on-accent' : 'text-text'
                          }`}
                        >
                          {c}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>

              {/* AREA o TIPO VEHICULO */}
              {formData.tipoUnidad !== 'PARQUEADERO' ? (
                <View className="gap-1.5">
                  {label('Area (m²)')}
                  <TextInput
                    value={formData.area}
                    onChangeText={(v) => set({ area: v.replace(/[^0-9.,]/g, '') })}
                    placeholder="0.00"
                    placeholderTextColor={withAlpha(t.text, 0.4)}
                    keyboardType="numbers-and-punctuation"
                    editable={!isSubmitting}
                    className="h-14 rounded-2xl border border-border bg-surface2 px-4 text-text"
                  />
                </View>
              ) : (
                <View className="gap-1.5">
                  {label('Tipo de Vehículo')}
                  <View className="flex-row gap-2">
                    {(['Moto', 'Carro', 'Bici'] as const).map((tipo) => (
                      <Pressable
                        key={tipo}
                        onPress={() => set({ tipoVehiculo: tipo })}
                        className={`flex-1 ${pill(formData.tipoVehiculo === tipo)}`}
                      >
                        <Text className={pillText(formData.tipoVehiculo === tipo)}>
                          {tipo === 'Moto' ? '🏍️ Moto' : tipo === 'Carro' ? '🚗 Carro' : '🚲 Bici'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {/* ROOM (LOCAL) ATTRS */}
              {formData.tipoUnidad === 'LOCAL' ? (
                <>
                  <View className="gap-1.5">
                    {label('Baño')}
                    <View className="flex-row gap-2">
                      {(['propio', 'compartido', 'no'] as const).map((tipo) => (
                        <Pressable
                          key={tipo}
                          onPress={() => set({ tieneBano: tipo })}
                          className={`flex-1 ${pill(formData.tieneBano === tipo)}`}
                        >
                          <Text className={pillText(formData.tieneBano === tipo)}>
                            {tipo === 'propio'
                              ? '🚿 Propio'
                              : tipo === 'compartido'
                                ? '👥 Compartido'
                                : '❌ No tiene'}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  <View className="gap-1.5">
                    {label('¿Amoblada?')}
                    <View className="flex-row gap-2">
                      <Pressable
                        onPress={() => set({ amoblada: true })}
                        className={`flex-1 ${pill(formData.amoblada)}`}
                      >
                        <Text className={pillText(formData.amoblada)}>🛋️ Sí, amoblada</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => set({ amoblada: false })}
                        className={`flex-1 ${pill(!formData.amoblada)}`}
                      >
                        <Text className={pillText(!formData.amoblada)}>📦 No amoblada</Text>
                      </Pressable>
                    </View>
                  </View>

                  {formData.amoblada ? (
                    <>
                      <View className="gap-1.5">
                        {label('TV (pulgadas)')}
                        <TextInput
                          value={formData.tvPulgadas}
                          onChangeText={(v) => set({ tvPulgadas: v.replace(/[^0-9]/g, '') })}
                          placeholder='Ej: 42"'
                          placeholderTextColor={withAlpha(t.text, 0.4)}
                          keyboardType="number-pad"
                          editable={!isSubmitting}
                          className="h-14 rounded-2xl border border-border bg-surface2 px-4 text-text"
                        />
                      </View>
                      <View className="gap-1.5">
                        {label('Tipo de Cama')}
                        <View className="flex-row gap-2">
                          {(['sencilla', 'doble'] as const).map((tipo) => (
                            <Pressable
                              key={tipo}
                              onPress={() => set({ tipoCama: tipo })}
                              className={`flex-1 ${pill(formData.tipoCama === tipo)}`}
                            >
                              <Text className={pillText(formData.tipoCama === tipo)}>
                                {tipo === 'sencilla' ? '🛏️ Sencilla' : '🛏️🛏️ Doble'}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                      <View className="gap-1.5">
                        {label('Lavado de ropa de cama')}
                        <View className="flex-row gap-2">
                          <Pressable
                            onPress={() => set({ lavadoRopa: true })}
                            className={`flex-1 ${pill(formData.lavadoRopa)}`}
                          >
                            <Text className={pillText(formData.lavadoRopa)}>✅ Incluido</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => set({ lavadoRopa: false })}
                            className={`flex-1 ${pill(!formData.lavadoRopa)}`}
                          >
                            <Text className={pillText(!formData.lavadoRopa)}>❌ No incluido</Text>
                          </Pressable>
                        </View>
                      </View>
                      <View className="gap-1.5">
                        {label('Agua caliente en baño')}
                        <View className="flex-row gap-2">
                          <Pressable
                            onPress={() => set({ aguaCaliente: true })}
                            className={`flex-1 ${pill(formData.aguaCaliente)}`}
                          >
                            <Text className={pillText(formData.aguaCaliente)}>🔥 Sí</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => set({ aguaCaliente: false })}
                            className={`flex-1 ${pill(!formData.aguaCaliente)}`}
                          >
                            <Text className={pillText(!formData.aguaCaliente)}>🚿 No</Text>
                          </Pressable>
                        </View>
                      </View>
                    </>
                  ) : null}
                </>
              ) : null}

              {/* CONTACTO */}
              <View className="gap-1.5">
                {label('Teléfono de contacto')}
                <TextInput
                  value={formData.telefonoContacto}
                  onChangeText={(telefonoContacto) => set({ telefonoContacto })}
                  placeholder="+57 315 705 2810"
                  placeholderTextColor={withAlpha(t.text, 0.4)}
                  keyboardType="phone-pad"
                  editable={!isSubmitting}
                  className="h-14 rounded-2xl border border-border bg-surface2 px-4 text-text"
                />
              </View>
              <View className="gap-1.5">
                {label('WhatsApp')}
                <TextInput
                  value={formData.whatsappContacto}
                  onChangeText={(whatsappContacto) => set({ whatsappContacto })}
                  placeholder="+57 315 705 2810"
                  placeholderTextColor={withAlpha(t.text, 0.4)}
                  keyboardType="phone-pad"
                  editable={!isSubmitting}
                  className="h-14 rounded-2xl border border-border bg-surface2 px-4 text-text"
                />
              </View>

              {/* ALCOBAS / BANOS (solo apartamento) */}
              {isApto ? (
                <View className="flex-row gap-4">
                  <View className="flex-1 gap-1.5">
                    {label('Alcobas')}
                    <View className="h-14 flex-row items-center overflow-hidden rounded-2xl border border-border bg-surface2">
                      <Pressable
                        onPress={() =>
                          set({ habitaciones: Math.max(0, formData.habitaciones - 1) })
                        }
                        className="h-14 flex-1 items-center justify-center"
                      >
                        <Text className="text-lg font-bold text-text">−</Text>
                      </Pressable>
                      <Text className="flex-1 text-center font-bold" style={{ color: t.accent }}>
                        {formData.habitaciones}
                      </Text>
                      <Pressable
                        onPress={() => set({ habitaciones: formData.habitaciones + 1 })}
                        className="h-14 flex-1 items-center justify-center"
                      >
                        <Text className="text-lg font-bold text-text">+</Text>
                      </Pressable>
                    </View>
                  </View>
                  <View className="flex-1 gap-1.5">
                    {label('Banos')}
                    <View className="h-14 flex-row items-center overflow-hidden rounded-2xl border border-border bg-surface2">
                      <Pressable
                        onPress={() => set({ banos: Math.max(0, formData.banos - 1) })}
                        className="h-14 flex-1 items-center justify-center"
                      >
                        <Text className="text-lg font-bold text-text">−</Text>
                      </Pressable>
                      <Text className="flex-1 text-center font-bold" style={{ color: t.accent }}>
                        {formData.banos}
                      </Text>
                      <Pressable
                        onPress={() => set({ banos: formData.banos + 1 })}
                        className="h-14 flex-1 items-center justify-center"
                      >
                        <Text className="text-lg font-bold text-text">+</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ) : null}

              {/* DESCRIPCION */}
              <View className="gap-1.5">
                {label('Descripcion')}
                <TextInput
                  value={formData.descripcion}
                  onChangeText={(descripcion) => set({ descripcion })}
                  placeholder="Detalles del inmueble: acabados, ubicacion, servicios cercanos..."
                  placeholderTextColor={withAlpha(t.text, 0.4)}
                  multiline
                  textAlignVertical="top"
                  editable={!isSubmitting}
                  className="min-h-[100px] rounded-2xl border border-border bg-surface2 p-4 text-text"
                />
              </View>

              {/* FOTOS / VIDEOS */}
              <View className="gap-2">
                {label('Fotos / Videos')}
                <View className="flex-row flex-wrap gap-2">
                  {media.map((m, i) => (
                    <View
                      key={`${m.nombre}-${i}`}
                      className="h-20 w-20 overflow-hidden rounded-xl border border-border bg-surface2"
                    >
                      {m.isVideo ? (
                        <View className="h-full w-full items-center justify-center">
                          <Film size={22} color={t.text} />
                        </View>
                      ) : (
                        <Image
                          source={{ uri: m.uri }}
                          style={{ width: '100%', height: '100%' }}
                          contentFit="cover"
                        />
                      )}
                      <Pressable
                        onPress={() => removeMedia(i)}
                        className="absolute right-0.5 top-0.5 h-5 w-5 items-center justify-center rounded-full"
                        style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
                      >
                        <X size={10} color="#FFFFFF" />
                      </Pressable>
                    </View>
                  ))}
                  <Pressable
                    onPress={addImages}
                    className="h-20 w-20 items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border bg-surface"
                  >
                    <Upload size={18} color={t.text} />
                    <Text className="text-[8px] font-semibold text-text">Subir</Text>
                  </Pressable>
                  <Pressable
                    onPress={addVideo}
                    className="h-20 w-20 items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border bg-surface"
                  >
                    <Film size={18} color={t.text} />
                    <Text className="text-[8px] font-semibold text-text">Video</Text>
                  </Pressable>
                </View>
                <Text className="pl-1 text-[9px] text-text opacity-40">
                  Fotos o videos del inmueble. Max 8 MB por archivo.
                </Text>
              </View>

              {/* SUBMIT */}
              <Pressable
                onPress={handleSubmit}
                disabled={isSubmitting}
                style={({ pressed }) => ({
                  opacity: isSubmitting ? 0.6 : pressed ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                })}
                className="h-16 w-full flex-row items-center justify-center gap-3 rounded-2xl bg-accent"
              >
                {/* Filled ACCENT surface: black ink vanished on light mode's dark
                    teal accent (#0f766e). Match the label's `text-on-accent`. */}
                {isSubmitting ? (
                  <ActivityIndicator color={t.onAccent} />
                ) : (
                  <>
                    <CheckCircle2 size={20} color={t.onAccent} />
                    <Text className="text-base font-bold text-on-accent">
                      {isEditing ? 'Guardar Cambios' : 'Publicar Anuncio Ahora'}
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
