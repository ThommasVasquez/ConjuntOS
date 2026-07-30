import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';

import logoVertical from '../assets/images/logo-vertical.png';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react-native';

import { ApiError } from '@/lib/api/client';
import { useAuth } from '@/hooks/useAuth';
import { BrandedFooter } from '@/components/shell/BrandedFooter';
import { toast } from '@/components/ui/toast';
import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor } from '@/theme/tokens';

/**
 * The login screen sits OUTSIDE the `(app)` group and, like web
 * (src/app/login/page.tsx), it uses its own BLUE brand accent rather than the
 * app's teal token — the CTA gradient, the field icons and the links are all
 * Tailwind blues there, hardcoded in the web markup. These constants mirror the
 * exact Tailwind values web uses, which is why they are literals here: they are
 * not theme tokens on either platform.
 */
const BLUE_400 = '#60a5fa'; // bg-glow-1
const BLUE_500 = '#3b82f6'; // icons, links, focus ring
const BLUE_600 = '#2563eb'; // CTA gradient start
const BLUE_800 = '#1e40af'; // CTA gradient end
const EMERALD_300 = '#6ee7b7'; // bg-glow-2

/** Logo intrinsic aspect ratio (2305 × 1619). */
const LOGO_ASPECT = 2305 / 1619;

/**
 * Validate a post-login redirect target: only same-origin relative paths.
 * Rejects protocol-relative ("//evil.com"), absolute URLs ("http://…") and
 * backslash tricks. Ported verbatim from the web screen to harden deep-link
 * redirects on native.
 */
function safeCallback(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/(app)/inicio';
  if (raw.includes('://') || raw.includes('\\')) return '/(app)/inicio';
  return raw;
}

/**
 * Soft ambient glow — web's `.bg-glow-1` / `.bg-glow-2` are large circles with
 * `blur-[120px]`. RN has no blur filter for a plain View, so this uses an SVG
 * radial gradient, which reproduces the falloff more faithfully than the
 * previous linear-gradient approximation (and in the right hue: the old one was
 * white, not blue/emerald).
 */
function Glow({ color, size }: { color: string; size: number }) {
  const id = `glow-${color.replace('#', '')}`;
  return (
    <Svg width={size} height={size} pointerEvents="none">
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          {/* The /20 opacity suffix web uses → 0.2 alpha at the core, fading
              to nothing at the rim. */}
          <Stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <Stop offset="55%" stopColor={color} stopOpacity={0.09} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={size} height={size} fill={`url(#${id})`} />
    </Svg>
  );
}

export default function Login() {
  const router = useRouter();
  const params = useLocalSearchParams<{ callbackUrl?: string }>();
  const callbackUrl = Array.isArray(params.callbackUrl)
    ? params.callbackUrl[0]
    : params.callbackUrl;

  const { login, user } = useAuth();
  const { theme } = useTheme();
  const tokens = tokensFor(theme);
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();

  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [focused, setFocused] = useState<'email' | 'password' | null>(null);

  // Drifting glows (web: gsap.to('.bg-glow-1', {x:'30%', y:'10%', 15s, yoyo})
  // and ('.bg-glow-2', {x:'-20%', y:'-15%', 12s, yoyo, delay:1}).
  const drift1 = useSharedValue(0);
  const drift2 = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    drift1.value = withRepeat(
      withTiming(1, { duration: 15000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    drift2.value = withRepeat(
      withTiming(1, { duration: 12000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(drift1);
      cancelAnimation(drift2);
    };
  }, [reduceMotion, drift1, drift2]);

  const glow1Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: drift1.value * 600 * 0.3 },
      { translateY: drift1.value * 600 * 0.1 },
    ],
  }));
  const glow2Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: drift2.value * -500 * 0.2 },
      { translateY: drift2.value * -500 * 0.15 },
    ],
  }));

  // Track the post-login navigation timer so we can cancel it if the screen
  // unmounts within the 1s window (e.g. the redirect-if-logged-in effect fires
  // once useAuth sets user, or the user backs out) — avoids navigating a
  // torn-down screen.
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    },
    [],
  );

  // Already logged in → redirect to the dashboard (or a validated callbackUrl).
  // Effect-based (on `user`) like web, so it sees the fresh post-login role:
  // HUESPED_TEMPORAL always goes to /mi-estancia.
  useEffect(() => {
    if (user) {
      const dest =
        user.rol === 'HUESPED_TEMPORAL'
          ? '/(app)/mi-estancia'
          : safeCallback(callbackUrl);
      router.replace(dest as never);
    }
  }, [user, router, callbackUrl]);

  const handleSubmit = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      await login(email, password);
      toast.success('¡Bienvenido! Sesión iniciada con éxito.');
      const dest = safeCallback(callbackUrl);
      // Keep the 1000ms delay so the success toast is visible before we
      // navigate. (Web also called router.refresh(); RN has no equivalent.)
      // The timer id is captured so the unmount cleanup can cancel it.
      redirectTimer.current = setTimeout(() => {
        router.replace(dest as never);
      }, 1000);
    } catch (error: unknown) {
      // The backend returns a generic "authentication required" for a failed
      // login; surface a clear, user-facing message instead of that jargon.
      const message =
        error instanceof ApiError
          ? error.status === 401
            ? 'Correo o contraseña incorrectos.'
            : error.detail
          : error instanceof Error
            ? error.message
            : 'Error al conectar con la comunidad.';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  /** Shared field chrome: `bg-surface-2 border rounded-2xl py-4 pl-12`. */
  const fieldStyle = (key: 'email' | 'password') => ({
    backgroundColor: tokens.surface2,
    borderWidth: 1,
    // Web: focus:border-blue-500/50.
    borderColor: focused === key ? 'rgba(59,130,246,0.5)' : tokens.border,
    borderRadius: 18,
  });

  return (
    <View className="flex-1 bg-primary">
      {/* Ambient glows — web .bg-glow-1 (blue, top-right) / .bg-glow-2
          (emerald, bottom-left). */}
      <Animated.View
        pointerEvents="none"
        style={[styles.glowTop, glow1Style]}
      >
        <Glow color={BLUE_400} size={600} />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.glowBottom, glow2Style]}
      >
        <Glow color={EMERALD_300} size={500} />
      </Animated.View>

      {/* Giant faded watermark — web renders "CONJUNTOS" at text-[15vw] in
          text-text/[0.03], clipped to 120px, top-left. */}
      <View pointerEvents="none" style={styles.watermark}>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: 'PlusJakartaSans_700Bold',
            fontSize: width * 0.15,
            lineHeight: width * 0.15,
            letterSpacing: -width * 0.006,
            color: tokens.text,
            opacity: 0.03,
          }}
        >
          CONJUNTOS
        </Text>
      </View>

      <SafeAreaView className="flex-1">
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            // Full-bleed on purpose. Web centres a `max-w-md` card because it
            // renders in a desktop viewport; on a phone that same card leaves
            // dead margins and overflows the screen (the secure-connection
            // block and the footer were being clipped). Here the screen IS the
            // card: content fills the width, centres vertically when it fits,
            // and scrolls when the keyboard opens.
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: 'center',
              paddingHorizontal: 24,
              paddingTop: 12,
              paddingBottom: 16,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View
              // Web: gsap elastic.out entrance (y 60→0, scale .95→1).
              entering={reduceMotion ? undefined : FadeInDown.duration(700).springify()}
              style={{ width: '100%' }}
            >
              <View className="w-full">
                {/* ---------------- Brand header ---------------- */}
                <View className="mb-9 items-center">
                  <Image
                    source={logoVertical}
                    // Dark scheme: web swaps to logo-verticalW.svg (the white
                    // variant). Only the dark-ink PNG ships here, so it is
                    // tinted to the text token instead — a monochrome mark
                    // rather than the green-O/blue-S wordmark.
                    tintColor={theme === 'dark' ? tokens.text : undefined}
                    contentFit="contain"
                    style={{
                      // Scales with the viewport instead of a fixed 210px, so
                      // the mark anchors the full-width layout.
                      width: Math.min(width * 0.6, 260),
                      aspectRatio: LOGO_ASPECT,
                    }}
                    alt="ConjuntOS"
                  />
                  <Text className="mt-4 text-center text-sm text-textMuted">
                    Tu comunidad, sincronizada en la nube.
                  </Text>
                  <Text
                    className="mt-7 text-center text-text"
                    style={{
                      fontFamily: 'PlusJakartaSans_700Bold',
                      fontSize: 32,
                      lineHeight: 38,
                      letterSpacing: -0.8,
                    }}
                  >
                    Bienvenido de nuevo
                  </Text>
                  <Text className="mt-2 text-center text-sm text-textMuted">
                    Accede al portal de tu comunidad
                  </Text>
                </View>

                {/* ---------------- Form ---------------- */}
                <View style={{ gap: 20 }}>
                  {/* Correo electrónico */}
                  <View style={{ gap: 8 }}>
                    <Text className="ml-1 text-sm font-semibold text-text">
                      Correo electrónico
                    </Text>
                    <View style={[styles.field, fieldStyle('email')]}>
                      <Mail color={BLUE_500} size={20} style={styles.fieldIcon} />
                      <TextInput
                        value={email}
                        onChangeText={setEmail}
                        onFocus={() => setFocused('email')}
                        onBlur={() => setFocused(null)}
                        placeholder="tu@correo.com"
                        placeholderTextColor={tokens.textMuted}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="username"
                        textContentType="username"
                        keyboardType="email-address"
                        returnKeyType="next"
                        className="text-sm text-text"
                        style={styles.fieldInput}
                      />
                    </View>
                  </View>

                  {/* Contraseña */}
                  <View style={{ gap: 8 }}>
                    <Text className="ml-1 text-sm font-semibold text-text">
                      Contraseña
                    </Text>
                    <View style={[styles.field, fieldStyle('password')]}>
                      <Lock color={BLUE_500} size={20} style={styles.fieldIcon} />
                      <TextInput
                        value={password}
                        onChangeText={setPassword}
                        onFocus={() => setFocused('password')}
                        onBlur={() => setFocused(null)}
                        placeholder="••••••••"
                        placeholderTextColor={tokens.textMuted}
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="current-password"
                        textContentType="password"
                        returnKeyType="go"
                        onSubmitEditing={handleSubmit}
                        className="text-sm text-text"
                        style={[styles.fieldInput, { paddingRight: 8 }]}
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={
                          showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
                        }
                        hitSlop={8}
                        onPress={() => setShowPassword((v) => !v)}
                        style={styles.showToggle}
                      >
                        {showPassword ? (
                          <EyeOff color={BLUE_500} size={18} />
                        ) : (
                          <Eye color={BLUE_500} size={18} />
                        )}
                        <Text
                          style={{
                            color: BLUE_500,
                            fontSize: 13,
                            fontWeight: '500',
                          }}
                        >
                          {showPassword ? 'Ocultar' : 'Mostrar'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* ¿Olvidaste tu contraseña? — web renders a button with no
                      handler (no reset route exists yet); kept inert. */}
                  <Pressable
                    disabled
                    accessibilityRole="button"
                    style={{ alignSelf: 'flex-end' }}
                  >
                    <Text
                      style={{ color: BLUE_500, fontSize: 13, fontWeight: '500' }}
                    >
                      ¿Olvidaste tu contraseña?
                    </Text>
                  </Pressable>

                  {/* CTA — web: bg-linear-to-r from-blue-600 to-blue-800 */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: isLoading, busy: isLoading }}
                    onPress={handleSubmit}
                    disabled={isLoading}
                    style={({ pressed }) => [
                      styles.ctaWrap,
                      {
                        transform: [{ scale: pressed ? 0.98 : 1 }],
                        opacity: isLoading ? 0.7 : 1,
                      },
                    ]}
                  >
                    <LinearGradient
                      colors={[BLUE_600, BLUE_800]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.cta}
                    >
                      {isLoading ? (
                        <View style={styles.ctaSpinner} />
                      ) : (
                        <>
                          <Text style={styles.ctaLabel}>Entrar al Sistema</Text>
                          <ArrowRight color="#ffffff" size={20} />
                        </>
                      )}
                    </LinearGradient>
                  </Pressable>
                </View>

                {/* ---------------- Divider ---------------- */}
                <View className="mt-8 flex-row items-center" style={{ gap: 16 }}>
                  <View
                    style={{ flex: 1, height: 1, backgroundColor: tokens.border }}
                  />
                  <Text className="text-xs text-textMuted">o</Text>
                  <View
                    style={{ flex: 1, height: 1, backgroundColor: tokens.border }}
                  />
                </View>

                {/* ---------------- Secure-connection card ---------------- */}
                <View
                  className="mt-6 flex-row items-center"
                  style={{
                    gap: 16,
                    backgroundColor: tokens.surface2,
                    borderWidth: 1,
                    borderColor: tokens.border,
                    borderRadius: 16,
                    padding: 16,
                  }}
                >
                  <ShieldCheck color={BLUE_500} size={28} />
                  <View style={{ flex: 1 }}>
                    <Text className="text-sm font-bold text-text">
                      Conexión segura
                    </Text>
                    <Text className="text-xs text-textMuted">
                      Solo residentes autorizados pueden acceder.
                    </Text>
                  </View>
                </View>

                {/* Branding, same as web's intra-card footer. */}
                <BrandedFooter isInternal />
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  glowTop: {
    position: 'absolute',
    top: -120,
    right: -80,
  },
  glowBottom: {
    position: 'absolute',
    bottom: -120,
    left: -80,
  },
  watermark: {
    position: 'absolute',
    top: 40,
    left: 24,
    height: 120,
    overflow: 'hidden',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    // Web: py-4 pl-12 → 16px vertical, icon inset 16 + 20 icon + 12 gap.
    paddingLeft: 18,
    paddingRight: 12,
    minHeight: 60,
  },
  fieldIcon: {
    marginRight: 12,
  },
  fieldInput: {
    flex: 1,
    paddingVertical: 16,
  },
  showToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 8,
  },
  ctaWrap: {
    borderRadius: 16,
    // Web: shadow-lg shadow-blue-600/30
    shadowColor: BLUE_600,
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 60,
    borderRadius: 18,
  },
  ctaLabel: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  ctaSpinner: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
});
