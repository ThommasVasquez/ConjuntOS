/**
 * Loading placeholders for the Finanzas (admin) screen — RN port of the web
 * `src/components/ui/Skeleton.tsx` (`Skeleton`, `SkeletonRows`, `SkeletonKpis`).
 *
 * Web uses Tailwind's `animate-pulse` (opacity 1 → .5 → 1); RN reproduces it
 * with a repeating reanimated timing loop. The fill is `bg-text/10`, exactly as
 * on web — no raw hex.
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

import { LiquidGlass } from '@/components/ui/LiquidGlass';

export interface SkeletonProps {
  /** NativeWind sizing/radius classes (e.g. `h-7 w-40 rounded-full`). */
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

/** Placeholder rows for list views (pagos, gastos, morosidad…). */
export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <View className="w-full gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <LiquidGlass key={i} className="rounded-3xl" radius={24}>
          <View className="flex-row items-center gap-3 p-5">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <View className="min-w-0 flex-1 gap-2">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-2.5 w-1/3" />
            </View>
            <Skeleton className="h-4 w-16" />
          </View>
        </LiquidGlass>
      ))}
    </View>
  );
}

/** Placeholder for the 2-column grid of KPI cards. */
export function SkeletonKpis({ count = 5 }: { count?: number }) {
  return (
    <View className="w-full flex-row flex-wrap gap-3">
      {Array.from({ length: count }).map((_, i) => (
        // `grid-cols-2 gap-3` on web → 48%-wide items in a wrapping flex row.
        <View key={i} style={{ width: '48%' }}>
          <LiquidGlass className="rounded-3xl" radius={24}>
            <View className="gap-2 p-4">
              <View className="flex-row items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-xl" />
                <Skeleton className="h-2.5 flex-1" />
              </View>
              <Skeleton className="h-5 w-2/3" />
            </View>
          </LiquidGlass>
        </View>
      ))}
    </View>
  );
}
