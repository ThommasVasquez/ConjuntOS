# Call tones (placeholders)

These four `.mp3` files are **placeholders** (a tiny silent MPEG frame) so the
bundler resolves the `require()` calls and `CallProvider` never crashes on a
missing asset. Playback of a silent clip is a no-op, not an error.

TODO: replace each with a real tone before shipping:

- `ringback.mp3`  — outgoing call: slow 425 Hz "tuut … tuut" (looped). ~3 s loop.
- `ringtone.mp3`  — incoming call: "ring-ring" 600 Hz double pulse (looped). ~3 s loop.
- `beep.mp3`      — short 800 Hz connect confirmation (~0.2 s, one shot).
- `disconnect.mp3`— 3 descending 425 Hz blips, hang-up tone (~1.2 s, one shot).

Keep the exact filenames; `CallProvider.tsx` references them via static
`require('@/../assets/sounds/<name>.mp3')`.
