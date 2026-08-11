import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Shared chrome for the public legal screens (`/privacidad`,
 * `/proteccion-datos`) — mobile port of web `src/app/(legal)/layout.tsx`.
 *
 * Web renders a non-sticky header, the article, and a footer in normal document
 * flow, so the whole page scrolls as one. The `Screen` primitive is deliberately
 * NOT used here: it reserves ~120px of bottom padding for the floating tab bar,
 * and these routes live outside the `(app)` tab group.
 *
 * Web centers everything in `max-w-3xl`; on a phone that clamp never binds, so
 * only the `px-6` gutter survives.
 */
export function LegalShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const goHome = () => router.replace('/');

  return (
    <View className="flex-1 bg-primary">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER — border-b border-border, h-16, px-6 */}
        <View className="border-b border-border">
          <View className="h-16 flex-row items-center justify-between px-6">
            <Pressable accessibilityRole="link" onPress={goHome} hitSlop={8}>
              <Text className="font-bold tracking-tight text-text">ConjuntOS® 🏘️</Text>
            </Pressable>
            <Pressable accessibilityRole="link" onPress={goHome} hitSlop={8}>
              <Text className="text-sm text-text-muted">← Volver al inicio</Text>
            </Pressable>
          </View>
        </View>

        {/* MAIN — px-6 py-12 */}
        <View className="px-6 py-12">{children}</View>

        {/* FOOTER — border-t border-border, px-6 py-8, text-xs text-text-muted.
            Web is `flex-col gap-2 sm:flex-row`; a phone is always the column.
            Both footer links are web `<Link href>` = a PUSH, so the page you
            came from stays in history and Back returns to it. `router.replace`
            was destroying that entry (privacidad → footer "Protección de Datos"
            could no longer go Back to privacidad, unlike web). The in-body
            cross-links in both legal screens already use `push`. */}
        <View className="border-t border-border">
          <View className="gap-2 px-6 py-8">
            <Text className="text-xs text-text-muted">
              © 2026 ENERGYSOFTmedia — ConjuntOS® 🏘️
            </Text>
            <View className="flex-row gap-4">
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push('/(legal)/privacidad')}
                hitSlop={8}
              >
                <Text className="text-xs text-text-muted">Política de Privacidad</Text>
              </Pressable>
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push('/(legal)/proteccion-datos')}
                hitSlop={8}
              >
                <Text className="text-xs text-text-muted">Protección de Datos</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
