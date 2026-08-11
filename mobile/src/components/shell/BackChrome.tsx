import { createContext, useContext, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColorScheme } from 'nativewind';
import { ChevronLeft } from 'lucide-react-native';

import { tokensFor } from '@/theme/tokens';

/**
 * Publishes whether the current route shows the floating back button.
 *
 * WHY A CONTEXT: the `(app)` group is a Tabs navigator with `headerShown:false`,
 * so a screen reached from the inicio grid (documentos, directorio,
 * correspondencia, the admin console, …) had NO way back — no header, and no
 * swipe-back gesture, because inside a tab navigator there is no stack to pop.
 * Only 3 of 41 screens rendered their own back affordance; the other 38 were
 * dead ends.
 *
 * `app/(app)/_layout.tsx` decides WHETHER the button shows (it owns the role's
 * tab set); the button itself is rendered by `Screen` — i.e. inside the screen's
 * own view tree. It cannot be an overlay rendered as a sibling of `<Tabs>`: the
 * navigator's native screen container paints over it, so it was invisible on
 * every route. `Screen` also reserves BACK_CHROME_HEIGHT at the top so the
 * button never lands on the first content row (usually ProfileHeader's avatar).
 */
export const BACK_CHROME_HEIGHT = 44;

interface BackChromeValue {
  /** True when the floating back button is visible on this route. */
  showBack: boolean;
  /** Fallback destination when there is no history to pop (deep link). */
  homeRoute: string;
}

const BackChromeContext = createContext<BackChromeValue>({
  showBack: false,
  homeRoute: 'inicio',
});

export function BackChromeProvider({
  showBack,
  homeRoute,
  children,
}: {
  showBack: boolean;
  homeRoute: string;
  children: ReactNode;
}) {
  return (
    <BackChromeContext.Provider value={{ showBack, homeRoute }}>
      {children}
    </BackChromeContext.Provider>
  );
}

/** Safe outside the provider (returns showBack:false), e.g. on /login. */
export function useBackChrome(): BackChromeValue {
  return useContext(BackChromeContext);
}

/**
 * The back affordance itself: a floating pill in the top-left corner, absolutely
 * positioned inside the screen it belongs to. Render it as a child of the
 * screen's root view (`Screen` does this for you); screens that hand-roll their
 * layout render it directly. Returns null on routes that don't want it, so
 * callers need no condition.
 */
export function BackButton() {
  const { showBack, homeRoute } = useBackChrome();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const tokens = tokensFor(colorScheme === 'light' ? 'light' : 'dark');

  if (!showBack) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Volver"
      hitSlop={10}
      onPress={() => {
        // `canGoBack` is false when the screen was deep-linked or reached via a
        // tab switch; fall back to the role's first tab rather than no-op.
        if (router.canGoBack()) router.back();
        else router.replace(`/(app)/${homeRoute}` as never);
      }}
      // PLAIN OBJECT, never `style={({pressed}) => …}`: NativeWind's Pressable
      // interop silently DROPS a function style, which is exactly why this
      // button was invisible on every screen (no size, no position, no fill).
      style={{
        position: 'absolute',
        top: insets.top + 6,
        left: 16,
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tokens.surface2,
        borderWidth: 1,
        borderColor: tokens.border,
        zIndex: 90,
      }}
    >
      <ChevronLeft size={22} color={tokens.text} strokeWidth={2.5} />
    </Pressable>
  );
}
