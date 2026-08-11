import { Stack } from 'expo-router';
import { useColorScheme } from 'nativewind';

import { tokensFor } from '@/theme/tokens';

/**
 * Public legal group (`/privacidad`, `/proteccion-datos`) — mobile counterpart
 * of web `src/app/(legal)/layout.tsx`. The visible chrome (header / footer)
 * lives in `LegalShell` so it scrolls with the article exactly like web's
 * document flow; this layout is only the navigator.
 *
 * No auth or role gate: web serves these pages publicly.
 */
export default function LegalLayout() {
  const { colorScheme } = useColorScheme();
  const bg = tokensFor(colorScheme === 'dark' ? 'dark' : 'light').primary;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Web: `min-h-screen bg-primary` on the layout root.
        contentStyle: { backgroundColor: bg },
      }}
    />
  );
}
