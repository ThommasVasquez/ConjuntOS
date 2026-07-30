/**
 * Chrome for the video stage.
 *
 * The assembly stage is a call screen: web commits it to the DARK palette even
 * though `<html>` carries the `.light` class (src/app/asamblea/page.tsx:497
 * `bg-[#050d0c] text-white`, ParticipantTile.tsx:86 `bg-[#0b1614]`,
 * ControlBar.tsx:198 `bg-black/60 border-white/10`). Video, screen shares and
 * the pills that float over them need a dark backing in both schemes, so the
 * stage components resolve their colors from the DARK token set instead of the
 * active scheme — no raw hexes, and the same values web hardcodes.
 *
 * Everything OUTSIDE the stage (header, agenda strip, side panel, chat,
 * quórum) uses the scheme-reactive token classes like the rest of the app.
 */

import { withAlpha } from '@/components/visitas/colorAlpha';
import { darkTokens } from '@/theme/tokens';

/** Dark token set — the stage palette (web hardcodes exactly these values). */
export const chrome = darkTokens;

/** `text-white/<a>` / `bg-white/<a>` / `border-white/<a>` over video. */
export function ink(alpha: number): string {
  return withAlpha(darkTokens.text, alpha);
}

/** `bg-black/<a>` scrims (pills, control bar, floating cards). */
export function scrim(alpha: number): string {
  return withAlpha(darkTokens.primary, alpha);
}

/** Semantic tints over video, e.g. `bg-[#f87171]/15`. */
export function tint(color: string, alpha: number): string {
  return withAlpha(color, alpha);
}
