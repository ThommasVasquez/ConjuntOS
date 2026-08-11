import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useColorScheme } from 'nativewind';
import { Phone } from 'lucide-react-native';

import { tokensFor } from '@/theme/tokens';

/**
 * Animated pieces of the citofonía call overlay, ported from the CSS
 * animations of web `src/app/(app)/citofonia/page.tsx` (which RN cannot
 * express as classes): `animate-ping` / `animate-pulse` rings, the
 * `bg-linear-to-tr from-accent` avatar, the equalizer bars and
 * `animate-bounce` on the answer / hang-up buttons.
 */

const useScheme = () => {
  const { colorScheme } = useColorScheme();
  return colorScheme === 'light' ? ('light' as const) : ('dark' as const);
};

/** `animate-ping duration-1000` — expands and fades out, restarting each cycle. */
function PingRing({ color, inset, baseScale = 1 }: { color: string; inset: number; baseScale?: number }) {
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = 0;
    p.value = withRepeat(
      withTiming(1, { duration: 1000, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
    return () => cancelAnimation(p);
  }, [p]);

  const style = useAnimatedStyle(() => ({
    opacity: 1 - p.value,
    transform: [{ scale: baseScale * (1 + 0.35 * p.value) }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: inset,
          left: inset,
          right: inset,
          bottom: inset,
          borderRadius: 999,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

/** `animate-pulse duration-700` — opacity breathes in place. */
function PulseRing({ color, inset }: { color: string; inset: number }) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.4, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(opacity);
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: inset,
          left: inset,
          right: inset,
          bottom: inset,
          borderRadius: 999,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

/**
 * The 128px halo + 96px avatar disc.
 *
 * `ringing` (RINGING / OUTGOING): accent/10 ping ring at inset 0, accent/20
 * pulse ring at inset 16 and a teal→sky gradient disc that pulses.
 * Otherwise (CONNECTED / FALLBACK): text/10 ping ring at inset -8 scaled 1.25,
 * text/20 pulse ring at inset 8 and a flat `text` disc.
 */
export function CallAvatar({ ringing }: { ringing: boolean }) {
  const scheme = useScheme();
  const t = tokensFor(scheme);
  const discOpacity = useSharedValue(1);

  useEffect(() => {
    if (!ringing) {
      discOpacity.value = 1;
      return;
    }
    discOpacity.value = withRepeat(
      withTiming(0.55, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(discOpacity);
  }, [ringing, discOpacity]);

  const discStyle = useAnimatedStyle(() => ({ opacity: discOpacity.value }));

  return (
    <View className="mb-6 h-32 w-32 items-center justify-center">
      {ringing ? (
        <>
          {/* bg-accent/10 → hex + 1A, bg-accent/20 → hex + 33 */}
          <PingRing color={`${t.accent}1A`} inset={0} />
          <PulseRing color={`${t.accent}33`} inset={16} />
        </>
      ) : (
        <>
          <PingRing color={`${t.text}1A`} inset={-8} baseScale={1.25} />
          <PulseRing color={`${t.text}33`} inset={8} />
        </>
      )}
      <Animated.View
        className="h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-text/10"
        style={[
          ringing ? discStyle : null,
          {
            shadowColor: t.primary,
            shadowOpacity: 0.35,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
            elevation: 8,
          },
        ]}
      >
        {ringing ? (
          <LinearGradient
            // web: `bg-linear-to-tr from-accent to-secondary` (page.tsx:283).
            colors={[t.accent, t.info]}
            start={{ x: 0, y: 1 }}
            end={{ x: 1, y: 0 }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
        ) : (
          <View
            // web: `bg-linear-to-tr from-text to-text` — a flat `text` disc.
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: t.text,
            }}
          />
        )}
        <Phone size={36} color={ringing ? t.onAccent : t.primary} />
      </Animated.View>
    </View>
  );
}

const BAR_HEIGHTS = [40, 90, 60, 100, 50, 80] as const;
// web `animationDuration` per bar (page.tsx:291-296), in ms.
const BAR_DURATIONS = [600, 400, 500, 300, 700, 450] as const;

function EqualizerBar({ height, duration }: { height: number; duration: number }) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.35, { duration, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(opacity);
  }, [opacity, duration]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      className="w-1 rounded-full bg-accent"
      style={[{ height: `${height}%` }, style]}
    />
  );
}

/** Six `animate-pulse` accent bars with the exact per-bar web durations. */
export function Equalizer() {
  return (
    // web: `flex items-center gap-1.5 h-10 justify-center` (page.tsx:290) — the
    // bars are vertically CENTERED, not bottom-aligned.
    <View className="h-10 flex-row items-center justify-center gap-1.5">
      {BAR_HEIGHTS.map((h, i) => (
        <EqualizerBar key={i} height={h} duration={BAR_DURATIONS[i]} />
      ))}
    </View>
  );
}

/**
 * `animate-bounce` wrapper (web sets `animationDuration` per button: 2s on the
 * answer button, 3s on hang-up).
 */
export function Bouncing({
  durationMs,
  children,
}: {
  durationMs: number;
  children: ReactNode;
}) {
  const y = useSharedValue(0);

  useEffect(() => {
    y.value = withRepeat(
      withTiming(-14, { duration: durationMs / 2, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(y);
  }, [y, durationMs]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  return <Animated.View style={style}>{children}</Animated.View>;
}
