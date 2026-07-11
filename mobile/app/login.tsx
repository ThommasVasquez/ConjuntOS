import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowRight, Lock, Mail, Shield, Star } from 'lucide-react-native';

import { ApiError } from '@/lib/api/client';
import { useAuth } from '@/hooks/useAuth';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/toast';

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

export default function Login() {
  const router = useRouter();
  const params = useLocalSearchParams<{ callbackUrl?: string }>();
  const callbackUrl = Array.isArray(params.callbackUrl)
    ? params.callbackUrl[0]
    : params.callbackUrl;

  const { login, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

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
  useEffect(() => {
    if (user) {
      router.replace(safeCallback(callbackUrl) as never);
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

  return (
    <View className="flex-1 bg-primary">
      {/* Decorative ambient glows (web .bg-glow-1 / .bg-glow-2). */}
      <View pointerEvents="none" style={styles.glowTop}>
        <LinearGradient
          colors={['rgba(255,255,255,0.18)', 'transparent']}
          style={styles.glowFill}
        />
      </View>
      <View pointerEvents="none" style={styles.glowBottom}>
        <LinearGradient
          colors={['rgba(255,255,255,0.12)', 'transparent']}
          style={styles.glowFill}
        />
      </View>

      <SafeAreaView className="flex-1">
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerClassName="flex-grow items-center justify-center px-6 py-10"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View
              entering={FadeInUp.duration(600)}
              style={{ width: '100%', maxWidth: 420 }}
            >
              <LiquidGlass radius={40} className="w-full px-8 py-10">
                {/* Brand header */}
                <View className="mb-10 items-center">
                  <Animated.View entering={FadeInDown.delay(150).duration(600)}>
                    <View
                      className="mb-6 h-16 w-16 items-center justify-center rounded-3xl bg-accent"
                      style={{ transform: [{ rotate: '6deg' }] }}
                    >
                      <Shield color="#000000" size={32} />
                    </View>
                  </Animated.View>
                  <Animated.Text
                    entering={FadeInDown.delay(250).duration(600)}
                    className="mb-2 text-4xl font-bold tracking-tight text-white"
                    style={styles.textGlow}
                  >
                    ConjuntOS
                  </Animated.Text>
                  <Animated.Text
                    entering={FadeInDown.delay(350).duration(600)}
                    className="text-sm font-medium tracking-wide text-white"
                  >
                    Tu comunidad, sincronizada en la nube.
                  </Animated.Text>
                </View>

                {/* Form */}
                <View style={{ gap: 24 }}>
                  <Animated.View entering={FadeInDown.delay(450).duration(600)}>
                    <Text className="mb-2 ml-1 text-[11px] font-bold uppercase tracking-widest text-white">
                      Email Residencial
                    </Text>
                    <Input
                      value={email}
                      onChangeText={setEmail}
                      placeholder="ej: thommy"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="username"
                      textContentType="username"
                      keyboardType="email-address"
                      returnKeyType="next"
                      icon={<Mail color="#ffffff" size={20} />}
                    />
                  </Animated.View>

                  <Animated.View entering={FadeInDown.delay(550).duration(600)}>
                    <Text className="mb-2 ml-1 text-[11px] font-bold uppercase tracking-widest text-white">
                      Contraseña
                    </Text>
                    <Input
                      value={password}
                      onChangeText={setPassword}
                      placeholder="••••••••"
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="current-password"
                      textContentType="password"
                      returnKeyType="go"
                      onSubmitEditing={handleSubmit}
                      icon={<Lock color="#ffffff" size={20} />}
                    />
                  </Animated.View>

                  <Animated.View
                    entering={FadeInDown.delay(650).duration(600)}
                    className="pt-2"
                  >
                    <Button
                      title="Entrar al Sistema"
                      onPress={handleSubmit}
                      loading={isLoading}
                      disabled={isLoading}
                      variant="primary"
                      icon={
                        !isLoading ? <ArrowRight color="#ffffff" size={20} /> : undefined
                      }
                    />
                  </Animated.View>
                </View>

                {/* Footer copy */}
                <Animated.View
                  entering={FadeInDown.delay(750).duration(600)}
                  className="mt-10 items-center"
                  style={{ gap: 16 }}
                >
                  <View className="flex-row items-center justify-center gap-2">
                    <Star color="#ffffff" size={12} />
                    <Text className="text-[11px] text-white">
                      Acceso exclusivo para residentes autorizados
                    </Text>
                  </View>
                  {/* "¿Olvidaste tu contraseña?" — no backend route; non-functional
                      placeholder (no handler), matching the web screen. */}
                  <Pressable disabled>
                    <Text className="text-[10px] font-bold uppercase tracking-widest text-white opacity-60">
                      ¿Olvidaste tu contraseña?
                    </Text>
                  </Pressable>
                </Animated.View>
              </LiquidGlass>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  textGlow: {
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 30,
  },
  glowTop: {
    position: 'absolute',
    top: '-12%',
    right: '-15%',
    width: 600,
    height: 600,
    borderRadius: 300,
    overflow: 'hidden',
    opacity: 0.6,
  },
  glowBottom: {
    position: 'absolute',
    bottom: '-12%',
    left: '-15%',
    width: 500,
    height: 500,
    borderRadius: 250,
    overflow: 'hidden',
    opacity: 0.5,
  },
  glowFill: {
    flex: 1,
    borderRadius: 300,
  },
});
