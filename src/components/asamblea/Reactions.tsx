'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDataChannel, useLocalParticipant } from '@livekit/components-react';
import { Smile } from 'lucide-react';

export const REACTION_EMOJI = ['👏', '👍', '👎', '😂', '🎉', '❤️'] as const;

interface FloatingReaction {
  key: number;
  emoji: string;
  /** horizontal offset in % so simultaneous reactions do not overlap */
  left: number;
  duration: number;
}

const TOPIC = 'reaction';

/**
 * Zoom-style floating reactions over the LiveKit data channel. Ephemeral by
 * design: nothing is persisted, they just drift up and disappear.
 */
export function useReactions() {
  const [floating, setFloating] = useState<FloatingReaction[]>([]);
  const counter = useRef(0);

  const push = useCallback((emoji: string) => {
    const key = counter.current++;
    setFloating((prev) => [
      ...prev.slice(-24),
      { key, emoji, left: 8 + Math.random() * 74, duration: 2600 + Math.random() * 1200 },
    ]);
    // Reap after the animation so the array cannot grow without bound.
    setTimeout(() => setFloating((prev) => prev.filter((r) => r.key !== key)), 4200);
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
        send(new TextEncoder().encode(emoji), { reliable: false });
      } catch {
        /* the local one still shows; the room simply misses it */
      }
    },
    [push, send],
  );

  return { floating, sendReaction };
}

export function ReactionOverlay({ floating }: { floating: FloatingReaction[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-30">
      {floating.map((r) => (
        <span
          key={r.key}
          className="absolute bottom-4 text-3xl will-change-transform"
          style={{
            left: `${r.left}%`,
            animation: `asamblea-float ${r.duration}ms ease-out forwards`,
          }}
        >
          {r.emoji}
        </span>
      ))}
      <style jsx global>{`
        @keyframes asamblea-float {
          0% { transform: translateY(0) scale(0.6); opacity: 0; }
          12% { transform: translateY(-12px) scale(1.15); opacity: 1; }
          100% { transform: translateY(-55vh) scale(0.85); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

export function ReactionPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { localParticipant } = useLocalParticipant();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Reactions ride the data channel, which every participant may use — even
  // watch-only ones, who have no publish grant for media.
  void localParticipant;

  return (
    <div className="relative" ref={ref}>
      {open && (
        <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-2 rounded-2xl bg-black/85 backdrop-blur-xl border border-white/15 shadow-2xl">
          {REACTION_EMOJI.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onPick(emoji);
                setOpen(false);
              }}
              className="w-9 h-9 rounded-xl grid place-items-center text-xl hover:bg-white/15 hover:scale-125 transition-all"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Enviar reacción"
        title="Reacciones"
        className={`w-12 h-12 sm:w-13 sm:h-13 rounded-full grid place-items-center border transition-all active:scale-90 ${
          open
            ? 'bg-white border-white text-black'
            : 'bg-white/10 border-white/15 text-white hover:bg-white/20'
        }`}
      >
        <Smile size={19} />
      </button>
    </div>
  );
}
