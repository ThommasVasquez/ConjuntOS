/**
 * PANEL DE VIGILANCIA — CONJUNTOSAPP (mobile port)
 *
 * Ported from web `src/app/(app)/vigilancia/page.tsx`. This is the real "Panel"
 * screen for the VIGILANTE role (web's BottomNav points VIGILANTE → /vigilancia):
 * gate stats, the live SOS console and the quick-access grid.
 *
 * Color note: the web page uses raw Tailwind palette classes (emerald / amber /
 * blue / purple / red / cyan). Mobile only ships the design tokens, so each hue
 * is mapped to its nearest semantic token instead of pasting a hex literal —
 * "nunca escribas un hex crudo en un componente":
 *   emerald → success (#34d399 IS emerald-400)
 *   amber   → warning (#fbbf24 IS amber-400)
 *   blue    → info    (#38bdf8, the closest token to blue-400)
 *   red     → danger  (#f87171 IS red-400)
 *   cyan    → accent  (#2dd4bf teal — the token nearest cyan-400)
 *   purple  → info    (no purple token exists; sky-blue is the nearest, so
 *                      Correspondencia and Rondas de Seguridad share `info`.
 *                      Six web hues cannot fit five semantic tokens, and
 *                      colliding purple is cheaper than mis-hueing blue+cyan.)
 */

import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  Activity,
  AlertTriangle,
  Check,
  ChevronDown,
  FlaskConical,
  Mail,
  Package,
  Plus,
  Search,
  Shield,
  Users,
  Eye,
} from 'lucide-react-native';

import SosConsole from '@/components/sos/SosConsole';
import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { Screen } from '@/components/ui/Screen';
import { toast } from '@/components/ui/toast';
import { withAlpha } from '@/components/visitas/colorAlpha';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api/client';
import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor, type ColorTokens } from '@/theme/tokens';

interface VigilanciaStats {
  visitasHoy: number;
  paquetesPendientes: number;
  totalResidentes: number;
}

/** Semantic token used in place of each web Tailwind hue. */
type Tone = Extract<keyof ColorTokens, 'success' | 'warning' | 'info' | 'accent' | 'danger'>;

const statCards: {
  key: keyof VigilanciaStats;
  label: string;
  icon: (color: string) => ReactElement;
  /** web emerald / amber / blue */
  tone: Tone;
}[] = [
  {
    key: 'visitasHoy',
    label: 'Visitas Hoy',
    icon: (color) => <Eye size={22} color={color} />,
    tone: 'success',
  },
  {
    key: 'paquetesPendientes',
    label: 'Paquetes Pendientes',
    icon: (color) => <Package size={22} color={color} />,
    tone: 'warning',
  },
  {
    key: 'totalResidentes',
    label: 'Residentes Activos',
    icon: (color) => <Users size={22} color={color} />,
    tone: 'info',
  },
];

const navCards: {
  title: string;
  subtitle: string;
  icon: (color: string) => ReactElement;
  path: string;
  /** web emerald / amber / purple / blue / red / cyan */
  tone: Tone;
}[] = [
  {
    title: 'Registrar Visita',
    subtitle: 'Ingreso peatonal y vehicular',
    icon: (color) => <Users size={26} color={color} />,
    path: '/control-visitas',
    tone: 'success',
  },
  {
    title: 'Registrar Paquete',
    subtitle: 'Correspondencia y encomiendas',
    icon: (color) => <Package size={26} color={color} />,
    path: '/paqueteria',
    tone: 'warning',
  },
  {
    title: 'Correspondencia',
    subtitle: 'Gestionar envíos y entregas',
    icon: (color) => <Mail size={26} color={color} />,
    path: '/correspondencia',
    tone: 'info',
  },
  {
    title: 'Rondas de Seguridad',
    subtitle: 'CCTV y rondas de vigilancia',
    icon: (color) => <Shield size={26} color={color} />,
    path: '/seguridad',
    tone: 'info',
  },
  {
    title: 'Reportar Novedad',
    subtitle: 'Registrar incidentes o alertas',
    icon: (color) => <AlertTriangle size={26} color={color} />,
    path: '/novedades-seguridad',
    tone: 'danger',
  },
  {
    title: 'Directorio',
    subtitle: 'Buscar residentes y unidades',
    icon: (color) => <Search size={26} color={color} />,
    path: '/directorio',
    tone: 'accent',
  },
];

const ALLOWED_ROLES = [
  'VIGILANTE',
  'SUPERVISOR_VIGILANCIA',
  'ADMINISTRADOR',
  'SUPER_ADMIN',
];

export default function VigilanciaDashboard() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const authLoading = useAuth((s) => s.loading);
  const role = user?.rol;
  const { theme } = useTheme();
  const tokens = tokensFor(theme);

  const [stats, setStats] = useState<VigilanciaStats>({
    visitasHoy: 0,
    paquetesPendientes: 0,
    totalResidentes: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);

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
    async function fetchStats() {
      try {
        const data = await api.get<VigilanciaStats>('/vigilancia/stats');
        if (!cancelled) setStats(data);
      } catch {
        if (!cancelled) toast.error('Error al cargar estadísticas');
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    }
    void fetchStats();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, role, router]);

  return (
    <Screen className="bg-primary">
      <View className="flex flex-col gap-6 px-6 pt-4">
        <ProfileHeader />

        {/* ROLE SWITCHER (solo visible para testers) */}
        <RoleSwitcher />

        {/* HEADER TITLE */}
        <Animated.View
          entering={FadeInDown.duration(500)}
          className="flex-row items-center gap-3"
        >
          <View
            className="h-12 w-12 items-center justify-center rounded-2xl"
            style={{
              borderWidth: 1,
              backgroundColor: withAlpha(tokens.accent, 0.2),
              borderColor: withAlpha(tokens.accent, 0.3),
            }}
          >
            <Shield size={24} color={tokens.accent} />
          </View>
          <View>
            <Text className="text-xl font-bold text-text">Panel de Vigilancia</Text>
            <Text className="text-xs" style={{ color: withAlpha(tokens.text, 0.7) }}>
              Centro de control de seguridad y portería
            </Text>
          </View>
        </Animated.View>

        {/* STATS ROW */}
        <Animated.View
          entering={FadeInDown.delay(80).duration(500)}
          className="flex-row gap-3"
        >
          {statCards.map((card) => {
            const tone = tokens[card.tone];
            return (
              <LiquidGlass
                key={card.key}
                radius={16}
                className="flex-1 rounded-2xl"
                style={{
                  flexDirection: 'column',
                  gap: 8,
                  padding: 16,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: withAlpha(tone, 0.2),
                  backgroundColor: withAlpha(tone, 0.1),
                }}
              >
                <View>{card.icon(tone)}</View>
                <View>
                  {statsLoading ? (
                    <Pulse
                      style={{
                        width: 40,
                        height: 24,
                        borderRadius: 4,
                        backgroundColor: withAlpha(tokens.text, 0.1),
                      }}
                    />
                  ) : (
                    <Text className="font-display text-2xl font-bold text-text">
                      {stats[card.key].toLocaleString('es-CO')}
                    </Text>
                  )}
                  <Text
                    className="mt-0.5 text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: withAlpha(tokens.text, 0.6) }}
                  >
                    {card.label}
                  </Text>
                </View>
              </LiquidGlass>
            );
          })}
        </Animated.View>

        {/* LIVE SOS ALERTS (renders only when the queue is non-empty) */}
        <SosConsole />

        {/* QUICK-ACCESS NAVIGATION GRID */}
        <Animated.View
          entering={FadeInDown.delay(160).duration(500)}
          className="flex flex-col gap-3"
        >
          <Text
            className="px-1 text-xs font-bold uppercase tracking-widest"
            style={{ color: withAlpha(tokens.text, 0.6) }}
          >
            Acciones Rápidas
          </Text>
          <View className="flex-row flex-wrap" style={{ gap: 12 }}>
            {navCards.map((card) => {
              const tone = tokens[card.tone];
              return (
                <Pressable
                  key={card.path}
                  accessibilityRole="button"
                  onPress={() => router.push(card.path as never)}
                  style={({ pressed }) => ({
                    width: '48%',
                    transform: [{ scale: pressed ? 0.95 : 1 }],
                  })}
                >
                  <LiquidGlass variant="card" radius={22} className="rounded-[22px]">
                    {/* `bg-gradient-to-br from-{tone}/20 to-{tone}/5` + border */}
                    <LinearGradient
                      colors={[withAlpha(tone, 0.2), withAlpha(tone, 0.05)]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{
                        padding: 16,
                        borderRadius: 22,
                        borderWidth: 1,
                        borderColor: withAlpha(tone, 0.3),
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: 12,
                      }}
                    >
                      <View
                        className="h-11 w-11 items-center justify-center rounded-xl border border-border"
                        style={{ backgroundColor: withAlpha(tokens.text, 0.05) }}
                      >
                        {card.icon(tone)}
                      </View>
                      <View>
                        <Text className="text-sm font-bold leading-tight text-text">
                          {card.title}
                        </Text>
                        <Text
                          className="mt-0.5 text-[10px] leading-relaxed"
                          style={{ color: withAlpha(tokens.text, 0.5) }}
                        >
                          {card.subtitle}
                        </Text>
                      </View>
                    </LinearGradient>
                  </LiquidGlass>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        {/* FOOTER STATUS BAR */}
        <View
          className="mt-4 flex-row items-center justify-center gap-2 p-3"
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: withAlpha(tokens.border, 0.3),
            backgroundColor: withAlpha(tokens.surface2, 0.3),
          }}
        >
          <Activity size={14} color={tokens.success} />
          <Text
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: withAlpha(tokens.text, 0.5) }}
          >
            Módulo de vigilancia activo
          </Text>
        </View>
      </View>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Pulse — RN stand-in for Tailwind's `animate-pulse` skeleton block.
// ---------------------------------------------------------------------------

function Pulse({ style }: { style: ViewStyle }) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.35, { duration: 900 }), -1, true);
  }, [opacity]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[style, animated]} />;
}

// ---------------------------------------------------------------------------
// RoleSwitcher (testers only) — port of web `src/components/shell/RoleSwitcher.tsx`.
// Each entry performs a full login against a real demo account, so every role
// is a fully real profile. Web reloaded the page afterwards; on native the
// auth store update re-renders the screen and each effect refetches.
// ---------------------------------------------------------------------------

const DEMO_PASSWORD = '123456789';

const ACCOUNTS: { email: string; label: string; icon: string }[] = [
  { email: 'superadmin@demo.conjuntos.app', label: 'Super Admin', icon: '👑' },
  { email: 'admin@demo.conjuntos.app', label: 'Administrador', icon: '🏢' },
  { email: 'concejo@demo.conjuntos.app', label: 'Concejo', icon: '🏛️' },
  { email: 'residente@demo.conjuntos.app', label: 'Propietario', icon: '🏠' },
  { email: 'arrendatario@demo.conjuntos.app', label: 'Arrendatario', icon: '🔑' },
  { email: 'vigilante@demo.conjuntos.app', label: 'Vigilante', icon: '🛡️' },
  { email: 'supervisor@demo.conjuntos.app', label: 'Supervisor Vigilancia', icon: '📋' },
  { email: 'parqueadero@demo.conjuntos.app', label: 'Encargado Parqueadero', icon: '🅿️' },
  { email: 'huesped@demo.conjuntos.app', label: 'Huésped', icon: '👤' },
  { email: 'piscina@demo.conjuntos.app', label: 'Admin. Piscina', icon: '🏊' },
  { email: 'gym@demo.conjuntos.app', label: 'Admin. Gym', icon: '💪' },
  { email: 'mantenimiento@demo.conjuntos.app', label: 'Mantenimiento', icon: '🔧' },
  { email: 'limpieza@demo.conjuntos.app', label: 'Limpieza', icon: '🧹' },
];

function RoleSwitcher() {
  const user = useAuth((s) => s.user);
  const login = useAuth((s) => s.login);
  const router = useRouter();
  const { theme } = useTheme();
  const tokens = tokensFor(theme);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSelect = useCallback(
    async (email: string) => {
      if (email === user?.email) {
        setOpen(false);
        return;
      }
      setBusy(true);
      try {
        await login(email, DEMO_PASSWORD);
        toast.success(
          `Cambiado a ${ACCOUNTS.find((a) => a.email === email)?.label ?? email}`,
        );
        setOpen(false);
      } catch {
        toast.error('No se pudo cambiar de cuenta');
      } finally {
        setBusy(false);
      }
    },
    [login, user?.email],
  );

  // Only testers see this control.
  if (!user) return null;
  if (!user.isTester) return null;

  const currentAccount = ACCOUNTS.find((a) => a.email === user.email);
  const currentLabel = currentAccount?.label ?? user.rol;

  return (
    <View className="w-full">
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: tokens.border,
          backgroundColor: tokens.primaryLight,
          opacity: busy ? 0.6 : pressed ? 0.9 : 1,
        })}
      >
        <View className="flex-row items-center gap-3">
          <View
            className="h-9 w-9 items-center justify-center rounded-xl"
            style={{
              borderWidth: 1,
              backgroundColor: withAlpha(tokens.info, 0.15),
              borderColor: withAlpha(tokens.info, 0.2),
            }}
          >
            <FlaskConical size={18} color={tokens.info} />
          </View>
          <View>
            <Text className="text-[9px] font-black uppercase tracking-widest text-textMuted">
              Modo Tester · Cuenta activa
            </Text>
            <Text className="text-sm font-bold text-text">{currentLabel}</Text>
          </View>
        </View>
        <ChevronDown
          size={18}
          color={tokens.info}
          style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
        />
      </Pressable>

      {open ? (
        // Web: `liquid-glass backdrop-blur-3xl rounded-2xl border border-border`.
        <LiquidGlass radius={16} className="mt-2 rounded-2xl">
          {ACCOUNTS.map((a) => {
            const active = a.email === user.email;
            return (
              <Pressable
                key={a.email}
                accessibilityRole="button"
                disabled={busy}
                onPress={() => {
                  void handleSelect(a.email);
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: tokens.border,
                  opacity: busy ? 0.5 : pressed ? 0.8 : 1,
                })}
              >
                <View className="flex-row items-center gap-2">
                  <Text className="text-base">{a.icon}</Text>
                  <View>
                    <Text
                      className="text-sm text-text"
                      style={{ fontWeight: active ? '700' : '400' }}
                    >
                      {a.label}
                    </Text>
                    <Text className="text-[10px] text-textMuted">{a.email}</Text>
                  </View>
                </View>
                {active ? <Check size={16} color={tokens.text} /> : null}
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              setOpen(false);
              router.replace('/login' as never);
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 16,
              paddingVertical: 12,
              opacity: busy ? 0.5 : pressed ? 0.8 : 1,
            })}
          >
            <Plus size={16} color={tokens.info} />
            <Text className="text-sm font-semibold" style={{ color: tokens.info }}>
              Añadir cuenta
            </Text>
          </Pressable>
        </LiquidGlass>
      ) : null}
    </View>
  );
}
