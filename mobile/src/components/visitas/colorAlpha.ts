/**
 * Derive a translucent variant of a DESIGN TOKEN color.
 *
 * Web expresses these as `color-mix(in srgb, var(--color-warning) 15%, transparent)`
 * or Tailwind's `/15` opacity modifier. RN has neither, and the project rule is
 * "nunca escribas un hex crudo en un componente" — so instead of pasting an
 * rgba() literal we take the token value and stamp an alpha channel onto it.
 *
 * Accepts both `#rrggbb` / `#rgb` tokens (accent, success, warning, text…) and
 * tokens that are already `rgb()` / `rgba()` (surface, border, accentSoft…). In
 * the latter case `alpha` MULTIPLIES the token's existing alpha, which is what
 * Tailwind's `/40` modifier does to a translucent CSS var — so
 * `withAlpha(border, 0.4)` on `rgba(45,212,191,0.16)` yields `…,0.064)`, not
 * `…,0.4)`. For opaque hex tokens the existing alpha is 1, so multiplying and
 * assigning are the same thing.
 */
export function withAlpha(color: string, alpha: number): string {
  const value = color.trim();

  if (value.startsWith('#')) {
    const full =
      value.length === 4
        ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`
        : value;
    if (full.length === 7) {
      const r = parseInt(full.slice(1, 3), 16);
      const g = parseInt(full.slice(3, 5), 16);
      const b = parseInt(full.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return value;
  }

  const parts = value.match(/[\d.]+/g);
  if (parts && parts.length >= 3) {
    const base = parts.length >= 4 ? Number(parts[3]) : 1;
    const next = Number.isFinite(base) ? base * alpha : alpha;
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${next})`;
  }

  return value;
}
