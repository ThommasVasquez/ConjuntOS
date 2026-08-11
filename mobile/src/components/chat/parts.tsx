/**
 * Chat primitives — RN ports of the pieces web's ChatSection.tsx composes with
 * plain markup (src/components/chat/ChatSection.tsx).
 *
 * They live here (not inline in ChatSection) because each one owns a reanimated
 * hook, and hooks cannot be called from the `renderMessageContent` helper.
 *
 * Colors come exclusively from the design tokens: the bubble ink is
 * `on-accent` on own (filled `bg-accent`) bubbles and `text` on incoming ones,
 * so web's leftover `text-white` / `bg-white/20` inside the bubble (web lines
 * 303-308) resolves to the token that actually reads in both schemes.
 */

import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Pause, Play } from 'lucide-react-native';

import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor } from '@/theme/tokens';

/** `#rrggbb` + alpha → `rgba(...)`, for the props RN cannot express as a class. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * Tailwind `animate-pulse`: 2s cubic-bezier(.4,0,.6,1) opacity 1 → .5 loop.
 * Stops (and resets) when `active` goes false or the component unmounts.
 */
export function usePulse(active = true) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (!active) {
      cancelAnimation(opacity);
      opacity.value = 1;
      return;
    }
    opacity.value = withRepeat(
      withTiming(0.5, { duration: 1000, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(opacity);
      opacity.value = 1;
    };
  }, [active, opacity]);

  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

/** Web `<Skeleton className="…" />` (src/components/ui/Skeleton.tsx): `animate-pulse rounded-lg bg-text/10`. */
export function Skeleton({ className }: { className?: string }) {
  const style = usePulse();
  return <Animated.View style={style} className={`rounded-lg bg-text/10 ${className ?? ''}`} />;
}

/** Recording indicator dot — web: `w-2.5 h-2.5 rounded-full bg-danger animate-pulse shrink-0`. */
export function RecordingDot() {
  const style = usePulse();
  return <Animated.View style={style} className="h-2.5 w-2.5 rounded-full bg-danger" />;
}

export interface AudioMessageProps {
  /** Own bubbles are filled with `bg-accent`, so their ink is `on-accent`. */
  isOwn: boolean;
  isPlaying: boolean;
  onToggle: () => void;
}

/**
 * Inline voice-note player — web ChatSection.tsx:298-313.
 * `flex items-center gap-2 min-w-[140px]` + 32px round play button + 6px track
 * with a 60% fill that pulses while playing.
 */
export function AudioMessage({ isOwn, isPlaying, onToggle }: AudioMessageProps) {
  const { theme } = useTheme();
  const ink = isOwn ? tokensFor(theme).onAccent : tokensFor(theme).text;
  const fillStyle = usePulse(isPlaying);

  return (
    <View className="min-w-[140px] flex-row items-center gap-2">
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pausar audio' : 'Reproducir audio'}
        className={`h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isOwn ? 'bg-on-accent/20' : 'bg-text/20'
        }`}
      >
        {isPlaying ? (
          <Pause size={14} color={ink} />
        ) : (
          <Play size={14} color={ink} style={{ marginLeft: 2 }} />
        )}
      </Pressable>
      <View
        className={`h-1.5 flex-1 overflow-hidden rounded-full ${
          isOwn ? 'bg-on-accent/20' : 'bg-text/20'
        }`}
      >
        <Animated.View
          style={[fillStyle, { width: '60%' }]}
          className={`h-full rounded-full ${isOwn ? 'bg-on-accent' : 'bg-text'}`}
        />
      </View>
      <Text className={`text-[10px] opacity-60 ${isOwn ? 'text-on-accent' : 'text-text'}`}>🎤</Text>
    </View>
  );
}
