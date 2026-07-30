/**
 * Reactions — mobile port of web `src/components/asamblea/Reactions.tsx`.
 *
 * Zoom-style floating emoji over the LiveKit data channel (topic `reaction`).
 * Ephemeral by design: nothing is persisted, they just drift up and disappear.
 * Web animates them with the `asamblea-float` CSS keyframes; here the same
 * curve is driven by Reanimated.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useDataChannel } from '@livekit/react-native';
import { Smile } from 'lucide-react-native';

import { chrome, ink, scrim } from '@/components/asamblea/stageChrome';

export const REACTION_EMOJI = ['👏', '👍', '👎', '😂', '🎉', '❤️'] as const;

interface FloatingReaction {
  key: number;
  emoji: string;
  /** horizontal offset in % so simultaneous reactions do not overlap */
  left: number;
  duration: number;
}

const TOPIC = 'reaction';

export function useReactions() {
  const [floating, setFloating] = useState<FloatingReaction[]>([]);
  const counter = useRef(0);
  // Reapers must be cleared on unmount, or a pending timer fires setState on a
  // component that is gone.
  const reapers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const timers = reapers.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  const push = useCallback((emoji: string) => {
    const key = counter.current++;
    setFloating((prev) => [
      ...prev.slice(-24),
      { key, emoji, left: 8 + Math.random() * 74, duration: 2600 + Math.random() * 1200 },
    ]);
    // Reap after the animation so the array cannot grow without bound.
    const timer = setTimeout(() => {
      reapers.current.delete(timer);
      setFloating((prev) => prev.filter((r) => r.key !== key));
    }, 4200);
    reapers.current.add(timer);
  }, []);

  const { send } = useDataChannel(TOPIC, (msg) => {
    try {
      const emoji = new TextDecoder().decode(msg.payload);
      if (REACTION_EMOJI.includes(emoji as (typeof REACTION_EMOJI)[number])) push(emoji);
    } catch {
      /* ignore malformed payloads */
    }
  });

  const sendReaction = useCallback(
    (emoji: string) => {
      push(emoji);
      try {
        send(new TextEncoder().encode(emoji), { reliable: false }).catch(() => {
          /* the local one still shows; the room simply misses it */
        });
      } catch {
        /* the local one still shows; the room simply misses it */
      }
    },
    [push, send],
  );

  return { floating, sendReaction };
}

/** One emoji drifting up the stage — the `asamblea-float` keyframes. */
function FloatingEmoji({
  reaction,
  travel,
}: {
  reaction: FloatingReaction;
  travel: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, {
      duration: reaction.duration,
      easing: Easing.out(Easing.ease),
    });
    return () => {
      cancelAnimation(progress);
    };
  }, [progress, reaction.duration]);

  const style = useAnimatedStyle(() => ({
    // 0%: translateY(0) scale(0.6) opacity 0
    // 12%: translateY(-12px) scale(1.15) opacity 1
    // 100%: translateY(-55vh) scale(0.85) opacity 0
    opacity: interpolate(progress.value, [0, 0.12, 1], [0, 1, 0]),
    transform: [
      { translateY: interpolate(progress.value, [0, 0.12, 1], [0, -12, -travel]) },
      { scale: interpolate(progress.value, [0, 0.12, 1], [0.6, 1.15, 0.85]) },
    ],
  }));

  return (
    <Animated.View
      style={[style, { position: 'absolute', bottom: 16, left: `${reaction.left}%` }]}
    >
      <Text style={{ fontSize: 30 }}>{reaction.emoji}</Text>
    </Animated.View>
  );
}

export function ReactionOverlay({ floating }: { floating: FloatingReaction[] }) {
  const [height, setHeight] = useState(0);
  // Web travels -55vh; here 55% of the stage height.
  const travel = height > 0 ? height * 0.55 : 300;

  return (
    <View
      pointerEvents="none"
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        overflow: 'hidden',
        zIndex: 30,
      }}
    >
      {floating.map((r) => (
        <FloatingEmoji key={r.key} reaction={r} travel={travel} />
      ))}
    </View>
  );
}

export function ReactionPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <View style={{ position: 'relative' }}>
      {open ? (
        <View
          style={{
            position: 'absolute',
            bottom: 60,
            // Web centres the row on the button (`left-1/2 -translate-x-1/2`).
            // The row is 8+6*44+5*4+8 = 300 wide over a 48px button, so the
            // centring offset is (48 - 300) / 2 — anything shallower pushes the
            // last emoji off the right edge of a phone.
            left: -126,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 8,
            paddingVertical: 8,
            borderRadius: 16,
            backgroundColor: scrim(0.85),
            borderWidth: 1,
            borderColor: ink(0.15),
            zIndex: 40,
            elevation: 12,
          }}
        >
          {REACTION_EMOJI.map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => {
                onPick(emoji);
                setOpen(false);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Reaccionar ${emoji}`}
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 20 }}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel="Enviar reacción"
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          backgroundColor: open ? chrome.accent : ink(0.1),
          borderColor: open ? chrome.accent : ink(0.15),
        }}
      >
        <Smile size={19} color={open ? chrome.onAccent : chrome.text} />
      </Pressable>
    </View>
  );
}
