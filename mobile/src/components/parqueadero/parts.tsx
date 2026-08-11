/**
 * Small decorative / animated primitives shared by the Parqueadero screen.
 * Each one reproduces a web class combo that RN has no direct equivalent for.
 * Colors come from the design tokens only (`bg-warning`, `bg-accent/10`, …).
 */

import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { withAlpha } from '@/components/parqueadero/format';

/**
 * Web's two-layer `animate-ping` indicator:
 *   <span className="relative flex h-2.5 w-2.5">
 *     <span className="absolute … animate-ping rounded-full bg-warning opacity-75" />
 *     <span className="relative … rounded-full bg-warning" />
 *   </span>
 * (src/app/(app)/parqueadero/page.tsx:240-243 warning, :298-301 danger)
 */
export function PingDot({ tone }: { tone: 'warning' | 'danger' }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1000, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [progress]);

  // Tailwind's `ping`: scale 1 → 2 while opacity 0.75 → 0.
  const halo = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + progress.value }],
    opacity: 0.75 * (1 - progress.value),
  }));

  if (tone === 'warning') {
    return (
      <View className="h-2.5 w-2.5 items-center justify-center">
        <Animated.View
          pointerEvents="none"
          className="absolute h-2.5 w-2.5 rounded-full bg-warning"
          style={halo}
        />
        <View className="h-2.5 w-2.5 rounded-full bg-warning" />
      </View>
    );
  }

  return (
    <View className="h-2.5 w-2.5 items-center justify-center">
      <Animated.View
        pointerEvents="none"
        className="absolute h-2.5 w-2.5 rounded-full bg-danger"
        style={halo}
      />
      <View className="h-2.5 w-2.5 rounded-full bg-danger" />
    </View>
  );
}

/**
 * Web's `bg-text/5 animate-pulse` loading placeholder (opacity 1 → .5 → 1).
 * Same technique as `src/components/finanzas/Skeletons.tsx`.
 */
export function PulseBlock({
  className,
  style,
}: {
  className?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.5, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [pulse]);

  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View className={`bg-text/5 ${className ?? ''}`} style={[style, animated]} />
  );
}

/**
 * Decorative glow blob on the vehicle cards — web's
 * `absolute -right-4 -top-4 w-32 h-32 bg-accent/10 rounded-full blur-2xl`
 * (page.tsx:454). RN has no `blur-2xl`, so three concentric rings of falling
 * alpha fake the falloff. Must be the FIRST child of the card so it sits behind
 * the content; the card's clip layer crops the overflow.
 */
export function AccentBlob() {
  return (
    <View pointerEvents="none" className="absolute -right-4 -top-4 h-32 w-32">
      <View className="absolute h-32 w-32 rounded-full bg-accent/5" />
      <View className="absolute left-3 top-3 h-[104px] w-[104px] rounded-full bg-accent/5" />
      <View className="absolute left-6 top-6 h-20 w-20 rounded-full bg-accent/10" />
    </View>
  );
}

/**
 * Web's `absolute right-0 top-0 w-full h-full bg-linear-to-br from-accent/5
 * to-transparent pointer-events-none` wash over the Reglamento card
 * (page.tsx:525). LinearGradient needs literal color stops, so the accent hex
 * arrives from `tokensFor(scheme)`.
 */
export function AccentWash({ accent }: { accent: string }) {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={[withAlpha(accent, 0.05), 'transparent']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
  );
}
