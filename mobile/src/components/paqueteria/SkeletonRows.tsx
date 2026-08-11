import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { LiquidGlass } from '@/components/ui/LiquidGlass';

/**
 * RN port of the web `Skeleton` / `SkeletonRows` pair
 * (src/components/ui/Skeleton.tsx), used by `paqueteria.tsx` while the initial
 * load is in flight — web renders `<SkeletonRows />` there
 * (src/app/(app)/paqueteria/page.tsx:137), not a spinner.
 *
 * Local to this feature because mobile has no shared Skeleton primitive yet —
 * hoist it to `src/components/ui/Skeleton.tsx` once one exists.
 *
 * Web markup reproduced verbatim:
 *   Skeleton      → `animate-pulse rounded-lg bg-text/10`
 *   SkeletonRows  → `liquid-glass rounded-3xl p-5 border border-border` rows
 *                   holding a 40x40 rounded-xl block, two stacked bars
 *                   (h-3 w-1/2, h-2.5 w-1/3) and a trailing h-4 w-16 block.
 */

/** `animate-pulse` — Tailwind's 2s cubic-bezier(.4,0,.6,1) opacity 1 → .5 loop. */
function usePulse() {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.5, { duration: 1000, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
      -1,
      true,
    );
    return () => {
      // Stop the infinite loop when the skeleton unmounts.
      cancelAnimation(opacity);
      opacity.value = 1;
    };
  }, [opacity]);

  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  const style = usePulse();
  return <Animated.View style={style} className={`rounded-lg bg-text/10 ${className ?? ''}`} />;
}

export interface SkeletonRowsProps {
  /** Web default is 4 placeholder rows. */
  count?: number;
}

export function SkeletonRows({ count = 4 }: SkeletonRowsProps) {
  return (
    <View className="w-full flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <LiquidGlass key={i} className="rounded-3xl" radius={24}>
          <View className="flex-row items-center gap-3 p-5">
            <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
            <View className="min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-2.5 w-1/3" />
            </View>
            <Skeleton className="h-4 w-16 shrink-0" />
          </View>
        </LiquidGlass>
      ))}
    </View>
  );
}
