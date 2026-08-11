/**
 * RN port of web's `Skeleton` primitive (src/components/ui/Skeleton.tsx:10):
 * `animate-pulse rounded-lg bg-text/10`.
 *
 * Local to this feature because mobile still has no shared Skeleton under
 * src/components/ui — hoist it there once one exists (a near-identical copy
 * already lives in src/components/visitas/Skeleton.tsx).
 */

import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/** Tailwind `animate-pulse`: 2s cubic-bezier(.4,0,.6,1) opacity 1 → .5 loop. */
export function usePulse() {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.5, { duration: 1000, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
      -1,
      true,
    );
    return () => {
      // Stop the infinite repeat when the bubble unmounts.
      opacity.value = 1;
    };
  }, [opacity]);

  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

export interface SkeletonProps {
  /** Extra NativeWind classes (size / radius), like web's `className` prop. */
  className?: string;
}

/** Web: `<div className={\`animate-pulse rounded-lg bg-text/10 ${className}\`} />`. */
export function Skeleton({ className }: SkeletonProps) {
  const style = usePulse();
  return <Animated.View style={style} className={`rounded-lg bg-text/10 ${className ?? ''}`} />;
}
