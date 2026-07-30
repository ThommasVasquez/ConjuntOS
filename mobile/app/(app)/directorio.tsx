/**
 * Directorio — CONJUNTOSAPP (mobile port)
 *
 * Ported 1:1 from web `src/app/(app)/directorio/page.tsx`.
 * Búsqueda de residentes (debounce 300ms sobre `GET /directorio?q=`) + llamada
 * por citofonía a través del CallProvider, con acceso restringido a vigilancia
 * y administración.
 */

import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  Easing,
  FadeInDown,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Building2, Phone, Search, Users, X } from 'lucide-react-native';

import { Screen } from '@/components/ui/Screen';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/useAuth';
import { useCall } from '@/providers/CallProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { api } from '@/lib/api/client';
import { tokensFor } from '@/theme/tokens';

/**
 * Shape returned by `GET /directorio` (backend `DirectorioEntradaDto`, flat
 * `{id, nombre, torre, apto, telefono}` — Habeas-Data-limited fields). Declared
 * locally exactly like the web page does.
 */
interface DirectorioUser {
  id: string;
  nombre: string;
  torre?: string | null;
  apto?: string | null;
  telefono?: string | null;
}

const ALLOWED_ROLES = [
  'VIGILANTE',
  'SUPERVISOR_VIGILANCIA',
  'ADMINISTRADOR',
  'SUPER_ADMIN',
];

/** `torre-apto` / `Apto x` / `Torre x` / `Sin unidad` — same cascade as web. */
function unidadLabel(u: DirectorioUser): string {
  if (u.torre && u.apto) return `${u.torre}-${u.apto}`;
  if (u.apto) return `Apto ${u.apto}`;
  if (u.torre) return `Torre ${u.torre}`;
  return 'Sin unidad';
}

/** Label used by the "Ver información" toast (only torre+apto, else Sin unidad). */
function toastUnidadLabel(u: DirectorioUser): string {
  return u.torre && u.apto ? `${u.torre}-${u.apto}` : 'Sin unidad';
}

/**
 * RN stand-in for web's `<Skeleton className="w-4 h-4 rounded-full" />`: the
 * shared Skeleton is a `animate-pulse rounded-lg bg-text/10` div, i.e. a
 * 1s-alternating 1 → .5 opacity pulse.
 */
function PulseDot() {
  const opacity = useSharedValue(1);

  useEffect(() => {
    // Tailwind `animate-pulse` = 2s cubic-bezier(0.4,0,0.6,1) infinite with
    // keyframes 0%/100% opacity 1, 50% opacity .5 — i.e. a 1s eased half-cycle,
    // reversed. `Easing.inOut(Easing.ease)` is the RN stand-in for that curve.
    opacity.value = withRepeat(
      withTiming(0.5, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    // The loop is infinite: cancel it on unmount (searchLoading flips to false
    // and this component goes away) or it keeps animating an orphaned value.
    return () => {
      cancelAnimation(opacity);
    };
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View className="h-4 w-4 rounded-full bg-text/10" style={animatedStyle} />;
}

export default function Directorio() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const authLoading = useAuth((s) => s.loading);
  const role = user?.rol;
  const { callState, startCall } = useCall();

  // Scheme comes from ThemeProvider (the same source that publishes the CSS
  // vars every `text-text` / `bg-accent/15` class resolves against). Reading
  // NativeWind's `useColorScheme()` instead would desync the icon colors from
  // the token classes on first paint, when NativeWind still reports the device
  // appearance and ThemeProvider has not yet applied the persisted preference.
  const { theme } = useTheme();
  const t = tokensFor(theme);
  const { height } = useWindowDimensions();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DirectorioUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // ── Auth gate ──────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login' as never);
      return;
    }
    if (!role || !ALLOWED_ROLES.includes(role)) {
      toast.error('No tienes permisos para acceder al directorio.');
      router.replace('/(app)/inicio' as never);
      return;
    }
  }, [user, authLoading, role, router]);

  // ── Debounced search ──────────────────────────────────────
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 1) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get<DirectorioUser[]>(
          `/directorio?q=${encodeURIComponent(q)}`,
        );
        setSearchResults(res ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ── Call a resident ───────────────────────────────────────
  const callDirectorioUser = (u: DirectorioUser) => {
    if (callState !== 'IDLE') return;
    startCall(`user-${u.id}`, u.nombre);
  };

  const showEmptyState =
    searchQuery.trim().length >= 1 && !searchLoading && searchResults.length === 0;

  return (
    <Screen className="bg-primary">
      <View className="flex-1 gap-6 px-6 pt-4">
        <Animated.View entering={FadeInDown.duration(500)}>
          <ProfileHeader />
        </Animated.View>

        {/* ── PAGE HEADER ──────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(80).duration(500)}>
          <LiquidGlass variant="card" radius={32} className="w-full rounded-[32px] border border-border">
            <View className="gap-1 p-5">
              <View className="flex-row items-center gap-3">
                <View className="h-10 w-10 items-center justify-center rounded-xl bg-accent/15">
                  <Building2 size={20} color={t.accent} />
                </View>
                <View>
                  <Text className="font-display text-xl font-bold text-text">Directorio</Text>
                  <Text className="text-[11px] text-text/50">
                    Busca residentes y contacta por citofonía
                  </Text>
                </View>
              </View>
            </View>
          </LiquidGlass>
        </Animated.View>

        {/* ── SEARCH BAR ───────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(160).duration(500)}>
          <LiquidGlass variant="card" radius={28} className="rounded-[28px] border border-border">
            <View className="p-4">
              <View className="flex-row items-center gap-2 rounded-2xl border border-border bg-text/5 px-4 py-3">
                <View className="opacity-50">
                  <Search size={18} color={t.text} />
                </View>
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Buscar por nombre, torre o apartamento…"
                  // Web: `placeholder:text-text/40`. RN needs a concrete color,
                  // so the text token gets a 40% (0x66) alpha suffix — derived
                  // from the token, never a literal.
                  placeholderTextColor={`${t.text}66`}
                  // Web's <input> gets no autocapitalize/autocorrect; on RN both
                  // default ON and would mangle names, torres and apto codes.
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  className="flex-1 text-sm text-text"
                />
                {searchLoading ? <PulseDot /> : null}
                {searchQuery.length > 0 && !searchLoading ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Limpiar búsqueda"
                    hitSlop={8}
                    onPress={() => setSearchQuery('')}
                    // `text-text/50` with web's `hover:text-text` as a pressed state.
                    style={({ pressed }) => ({ opacity: pressed ? 1 : 0.5 })}
                  >
                    <X size={16} color={t.text} />
                  </Pressable>
                ) : null}
              </View>

              {/* ── RESULTS ──────────────────────────────────── */}
              {searchResults.length > 0 ? (
                <ScrollView
                  className="mt-3"
                  style={{ maxHeight: height * 0.6 }}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <View className="gap-2">
                    {searchResults.map((u) => (
                      <View
                        key={u.id}
                        className="flex-row items-center justify-between gap-3 rounded-2xl border border-border bg-text/5 p-3"
                      >
                        <View className="min-w-0 flex-1">
                          <Text className="text-sm font-bold text-text" numberOfLines={1}>
                            {u.nombre}
                          </Text>
                          <Text className="text-[11px] text-text/50">
                            {unidadLabel(u)}
                            {' · '}
                            {u.telefono ? u.telefono : 'Sin teléfono'}
                          </Text>
                        </View>

                        {/* Quick-action buttons */}
                        <View className="flex-row items-center gap-1.5">
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Llamar por citofonía"
                            accessibilityState={{ disabled: callState !== 'IDLE' }}
                            onPress={() => callDirectorioUser(u)}
                            disabled={callState !== 'IDLE'}
                            // `disabled:opacity-40` verbatim; the pressed dim is
                            // the RN stand-in for web's `hover:bg-accent/25`.
                            style={({ pressed }) => ({
                              opacity: callState !== 'IDLE' ? 0.4 : pressed ? 0.7 : 1,
                            })}
                            className="h-9 w-9 items-center justify-center rounded-full bg-accent/15"
                          >
                            <Phone size={16} color={t.accent} />
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Ver información"
                            onPress={() =>
                              toast.info(`${u.nombre} — ${toastUnidadLabel(u)}`)
                            }
                            // RN stand-in for web's `hover:bg-secondary/25`.
                            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                            className="h-9 w-9 items-center justify-center rounded-full"
                          >
                            {/* Web styles this with `bg-secondary/15 text-secondary`,
                                but `secondary` is not a declared token in
                                globals.css @theme — those classes never compile, so
                                the real web render is a transparent circle with the
                                inherited body text color. Reproduced verbatim. */}
                            <Users size={16} color={t.text} />
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              ) : null}

              {/* ── EMPTY STATE ──────────────────────────────── */}
              {showEmptyState ? (
                <Text className="mt-4 text-center text-xs text-text/40">
                  No se encontraron residentes con ese criterio.
                </Text>
              ) : null}
            </View>
          </LiquidGlass>
        </Animated.View>

        {/* ── QUICK ACTIONS ──────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(240).duration(500)} className="gap-4">
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/(app)/citofonia' as never)}
            style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}
          >
            <LiquidGlass variant="card" radius={28} className="rounded-[28px] border border-border">
              <View className="flex-row items-center gap-4 p-5">
                <View className="h-10 w-10 items-center justify-center rounded-xl bg-accent/15">
                  <Phone size={20} color={t.accent} />
                </View>
                <View>
                  <Text className="text-sm font-bold text-text">Ir al citófono</Text>
                  <Text className="text-[11px] text-text/50">
                    Marcador completo y control de llamadas
                  </Text>
                </View>
              </View>
            </LiquidGlass>
          </Pressable>
        </Animated.View>
      </View>
    </Screen>
  );
}
