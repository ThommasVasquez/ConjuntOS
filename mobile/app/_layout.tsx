import '../global.css';

import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import Toast from 'react-native-toast-message';

import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import {
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
} from '@expo-google-fonts/montserrat';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
} from '@expo-google-fonts/jetbrains-mono';

import { useAuth } from '@/hooks/useAuth';
import { useColorScheme } from 'nativewind';
import { useReducedMotion } from 'react-native-reanimated';

import { darkTokens, tokensFor } from '@/theme/tokens';
import { toastConfig } from '@/components/ui/toast';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { WebSocketProvider } from '@/providers/WebSocketProvider';
import { CallProvider } from '@/providers/CallProvider';
import { usePushRegistration } from '@/services/push';

// Keep the native splash visible until fonts + auth bootstrap have resolved.
SplashScreen.preventAutoHideAsync().catch(() => {
  /* no-op: splash may already be hidden under dev fast-refresh */
});

/**
 * AuthGate
 * Runs useAuth.bootstrap() once (loads the persisted token, then GET /auth/me).
 * It does NOT issue route redirects — index.tsx and (app)/_layout.tsx own the
 * navigation decisions. AuthGate only signals when the session is known so the
 * splash can hide without flashing an unauthenticated frame.
 */
function AuthGate({
  children,
  onReady,
}: {
  children: React.ReactNode;
  onReady: () => void;
}) {
  const bootstrap = useAuth((s) => s.bootstrap);
  const loading = useAuth((s) => s.loading);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await bootstrap();
      } finally {
        if (mounted) setBooted(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [bootstrap]);

  useEffect(() => {
    if (booted && !loading) onReady();
  }, [booted, loading, onReady]);

  return <>{children}</>;
}

/**
 * PushBridge
 * Mounts native push registration + the citófono notification listeners. Must
 * live UNDER CallProvider (usePushRegistration calls useCall to bridge a tapped
 * push into the ring/join flow). `ready` is gated on an authenticated user so
 * the Expo token is POSTed to /usuarios/me/push-subscriptions only once we have
 * a session, and re-registered whenever the user (profile) loads. Renders
 * nothing.
 */
function PushBridge() {
  const user = useAuth((s) => s.user);
  usePushRegistration(!!user);
  return null;
}

/**
 * Root error boundary (expo-router convention). Catches render-time crashes in
 * the whole app subtree and shows a branded fallback with a retry, instead of a
 * blank white screen. Self-contained styles so it renders even if a provider is
 * the thing that failed.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View
      style={{
        flex: 1,
        // The boundary renders outside ThemeProvider, so token values are read
        // from the dark set directly rather than through the scheme context.
        backgroundColor: darkTokens.primary,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
      }}
    >
      <Text
        style={{
          color: darkTokens.text,
          fontSize: 20,
          fontWeight: '800',
          marginBottom: 12,
        }}
      >
        Algo salió mal
      </Text>
      <Text
        style={{
          color: darkTokens.textMuted,
          fontSize: 14,
          textAlign: 'center',
          marginBottom: 24,
        }}
      >
        {error?.message || 'Ocurrió un error inesperado en la aplicación.'}
      </Text>
      <Pressable
        onPress={retry}
        style={{
          // Error boundary renders outside the theme provider, so the dark
          // token set is used directly (the boundary screen is always dark).
          backgroundColor: darkTokens.accent,
          paddingHorizontal: 28,
          paddingVertical: 14,
          borderRadius: 24,
        }}
      >
        <Text style={{ color: darkTokens.onAccent, fontWeight: '700' }}>Reintentar</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  // NativeWind's colorScheme is a global observable (not React context), so it
  // is readable here even though ThemeProvider is rendered below.
  const { colorScheme } = useColorScheme();
  const rootBg = tokensFor(colorScheme === 'dark' ? 'dark' : 'light').primary;
  // Web clamps decorative motion under `prefers-reduced-motion`
  // (globals.css:209-222), including the view-transition slide. Honour the OS
  // setting the same way (WCAG 2.3.3).
  const reduceMotion = useReducedMotion();

  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });

  const [authReady, setAuthReady] = useState(false);
  const handleAuthReady = useCallback(() => setAuthReady(true), []);

  const fontsDone = fontsLoaded || !!fontError;
  const appReady = fontsDone && authReady;

  // Hide the splash only once both fonts and the auth session are resolved.
  const onLayoutRootView = useCallback(() => {
    if (appReady) SplashScreen.hideAsync().catch(() => {});
  }, [appReady]);

  useEffect(() => {
    if (appReady) SplashScreen.hideAsync().catch(() => {});
  }, [appReady]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <BottomSheetModalProvider>
            <AuthGate onReady={handleAuthReady}>
              <WebSocketProvider>
                <CallProvider>
                  <PushBridge />
                  {/* `font-sans` = Inter_400Regular, matching web's next/font
                      body family on <html>. Descendants inherit it. */}
                  <View
                    className="font-sans"
                    style={{ flex: 1 }}
                    onLayout={onLayoutRootView}
                  >
                    {/* Until fonts + auth resolve, render nothing over the splash. */}
                    {appReady ? (
                      <Stack
                        screenOptions={{
                          headerShown: false,
                          // Match web `body { background: var(--color-primary) }`
                          // so login/index never flash the wrong color. Read from
                          // the tokens per active scheme — this used to be a
                          // hardcoded '#000000' from the retired B&W palette.
                          contentStyle: { backgroundColor: rootBg },
                          // Web's effective screen transition is the
                          // view-transitions.css fade (300ms out / 400ms in).
                          // A cross-fade is the closest native equivalent.
                          animation: reduceMotion ? 'none' : 'fade',
                          animationDuration: 400,
                        }}
                      >
                        <Stack.Screen name="index" />
                        <Stack.Screen name="login" />
                        <Stack.Screen name="(app)" />
                      </Stack>
                    ) : null}
                  </View>
                </CallProvider>
              </WebSocketProvider>
            </AuthGate>
            {/* Liquid-Glass toast cards (success/error/info/warning). */}
            <Toast config={toastConfig} />
          </BottomSheetModalProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
