import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/**
 * Shared pulse used by the web `animate-pulse` utility: Tailwind's 2s
 * cubic-bezier(.4,0,.6,1) opacity 1 → .5 loop (half period = 1000ms, mirrored).
 */
function usePulse() {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.5, { duration: 1000, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
      -1,
      true,
    );
    return () => cancelAnimation(opacity);
  }, [opacity]);

  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

export interface SkeletonProps {
  /** Extra NativeWind classes (web default is `rounded-lg bg-text/10`). */
  className?: string;
  /** Explicit box metrics — `style` wins over the class radius, so pass
   *  `borderRadius` here for the circular variants. */
  style?: StyleProp<ViewStyle>;
}

/**
 * RN port of the web `Skeleton` primitive (src/components/ui/Skeleton.tsx):
 * `animate-pulse rounded-lg bg-text/10`.
 */
export function Skeleton({ className, style }: SkeletonProps) {
  const pulse = usePulse();
  // Only the token fill needs a class (`bg-text/10` resolves the theme CSS var).
  // Geometry stays in `style` — including the `rounded-lg` default radius — so a
  // caller's `borderRadius` always wins instead of racing a `rounded-*` class.
  return (
    <Animated.View
      className={`bg-text/10 ${className ?? ''}`}
      style={[pulse, { borderRadius: 8 }, style]}
    />
  );
}

/**
 * The hero "Al día" status dot — web pagos/page.tsx:202
 * `<span className="w-1.5 h-1.5 rounded-full bg-text/10 animate-pulse" />`.
 */
export function PulsingDot() {
  const pulse = usePulse();
  return (
    <Animated.View
      className="bg-text/10"
      style={[pulse, { width: 6, height: 6, borderRadius: 3 }]}
    />
  );
}
