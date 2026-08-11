/**
 * Loading placeholders for the Inmobiliaria screen — RN port of the three
 * placeholder cards web renders while `/inmuebles` loads
 * (src/app/(app)/inmobiliaria/page.tsx:197-209, using the web
 * `src/components/ui/Skeleton.tsx` primitive).
 *
 * Web's Skeleton is `animate-pulse rounded-lg bg-text/10`; RN reproduces the
 * pulse with a repeating reanimated timing loop. Fill stays on the `bg-text/10`
 * token — no raw hex.
 */

import { useEffect } from 'react';
import { View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

export interface SkeletonProps {
  /** NativeWind sizing/radius classes (e.g. `h-4 w-2/3`). */
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/** Single pulsing placeholder block. Mirrors web `<Skeleton className=… />`. */
export function Skeleton({ className, style }: SkeletonProps) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.5, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);

  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      className={`rounded-lg bg-text/10 ${className ?? ''}`}
      style={[style, animated]}
    />
  );
}

/**
 * The three placeholder property cards web shows while loading:
 * `rounded-3xl bg-primary-light border border-border overflow-hidden` with a
 * full-width h-48 image bar and three text bars underneath.
 */
export function PropertyCardSkeletons({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          className="overflow-hidden rounded-3xl border border-border bg-primary-light"
        >
          <Skeleton className="h-48 w-full rounded-none" />
          <View className="gap-2 p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="mt-1 h-5 w-1/2" />
          </View>
        </View>
      ))}
    </>
  );
}
