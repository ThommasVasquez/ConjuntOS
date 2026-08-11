/**
 * Formatting helpers for the Parqueadero screens.
 *
 * Hermes ships without full-ICU, so `toLocaleString('es-CO', …)` cannot be
 * used directly. These helpers reproduce, character for character, what the web
 * page's `Intl` calls emit (verified against node's ICU output).
 */

/** Month names as ICU emits them for es-CO with `month: 'short'`. */
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * COP-style thousands grouping (no decimals). Mirrors web
 * `Number(x).toLocaleString('es-CO')`.
 */
export function formatCOP(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  return sign + Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * es-CO date + time, exactly as web renders it with
 * `toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })`
 * (src/app/(app)/parqueadero/page.tsx:316, :414).
 *
 * ICU resolves that skeleton to the locale pattern `d 'de' MMM, hh:mm a`, i.e.
 * the DAY IS NOT ZERO-PADDED, the hour is, the clock is 12-hour and the day
 * period markers carry inner spaces: `30 de jul, 02:35 p. m.` / `5 de jul,
 * 09:05 a. m.` / `5 de jul, 12:05 a. m.` (midnight).
 */
export function formatFechaCorta(dateStr: string | Date): string {
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  const h12 = ((h + 11) % 12) + 1;
  const ampm = h < 12 ? 'a. m.' : 'p. m.';
  return `${d.getDate()} de ${MESES[d.getMonth()]}, ${pad2(h12)}:${pad2(d.getMinutes())} ${ampm}`;
}

/** Time only, same 12-hour es-CO shape (`02:35 p. m.`). */
export function formatHora12(date: Date): string {
  const h = date.getHours();
  const h12 = ((h + 11) % 12) + 1;
  const ampm = h < 12 ? 'a. m.' : 'p. m.';
  return `${pad2(h12)}:${pad2(date.getMinutes())} ${ampm}`;
}

/** Weekday + day, for the day chips of the arrival picker (`sáb 01 ago`). */
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export function formatDiaChip(date: Date): string {
  return `${DIAS[date.getDay()]} ${pad2(date.getDate())} ${MESES[date.getMonth()]}`;
}

/**
 * `#rrggbb` + alpha → `rgba(…)`. Only for props RN cannot express as a class
 * (LinearGradient stops); pass a value that came from `tokensFor(scheme)`,
 * never a raw literal.
 */
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
