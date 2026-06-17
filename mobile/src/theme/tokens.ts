/**
 * Design tokens — ported VERBATIM from web `src/app/globals.css`.
 *
 * Paleta Blanco y Negro PURO (sin tinte, alto contraste, Liquid Glass).
 * Dark is the default scheme; `.light` overrides invert the palette.
 *
 * These objects are the runtime source of truth for colors that cannot be
 * expressed as a static Tailwind class (e.g. the translucent fills/borders of
 * the Liquid Glass primitives, which need exact rgba() values per scheme).
 * The Tailwind config mirrors the *solid* tokens via the `dark:` variant.
 */

export interface ColorTokens {
  /** Fondo principal de la app. */
  primary: string;
  /** Negro/blanco elevado neutro (tarjetas sólidas). */
  primaryLight: string;
  /** Acento para CTAs / detalles. */
  accent: string;
  /** Texto/icono SOBRE el acento. */
  onAccent: string;
  /** Glass translúcido base. */
  surface: string;
  /** Glass translúcido más claro / fondo de input. */
  surface2: string;
  /** Texto principal. */
  text: string;
  /** Texto secundario (casi del color principal, sin gris). */
  textMuted: string;
  /** Borde sutil para glass. */
  border: string;
  success: string;
  danger: string;
  warning: string;
}

/** Dark scheme — the default (`:root` in globals.css). */
export const darkTokens: ColorTokens = {
  primary: '#000000', // Negro puro (fondo)
  primaryLight: '#141414', // Negro elevado neutro (tarjetas)
  accent: '#FFFFFF', // Blanco puro como acento (CTAs/detalles)
  onAccent: '#000000', // Texto/icono SOBRE el acento (negro sobre blanco)
  surface: 'rgba(255, 255, 255, 0.045)', // Glass: blanco puro translúcido
  surface2: 'rgba(255, 255, 255, 0.07)', // Glass más claro
  text: '#FFFFFF', // Blanco puro
  textMuted: 'rgba(255, 255, 255, 0.92)', // Casi blanco puro (sin gris)
  success: '#FFFFFF',
  danger: '#FFFFFF',
  warning: '#FFFFFF',
  border: 'rgba(255, 255, 255, 0.14)', // Borde sutil para glass
};

/** Light scheme — the `.light` override (blanco y negro puro invertido). */
export const lightTokens: ColorTokens = {
  primary: '#FFFFFF', // Blanco puro (fondo)
  primaryLight: '#FFFFFF', // Blanco para tarjetas
  accent: '#000000', // Negro puro como acento (CTAs/detalles)
  onAccent: '#FFFFFF', // Texto/icono SOBRE el acento (blanco sobre negro)
  surface: 'rgba(255, 255, 255, 0.72)', // Vidrio blanco translúcido
  surface2: 'rgba(0, 0, 0, 0.04)', // Fondo sutil de input/botón
  text: '#000000', // Negro puro
  textMuted: 'rgba(0, 0, 0, 0.92)', // Casi negro puro (sin gris)
  success: '#000000',
  danger: '#000000',
  warning: '#000000',
  border: 'rgba(0, 0, 0, 0.1)', // Bordes sutiles en claro
};

export type ColorSchemeName = 'light' | 'dark';

/** Resolve the token set for a given scheme. */
export function tokensFor(scheme: ColorSchemeName): ColorTokens {
  return scheme === 'light' ? lightTokens : darkTokens;
}

/**
 * Liquid Glass per-scheme fills/borders/shadows — ported from the
 * `.liquid-glass` / `.liquid-glass-card` rules in globals.css. RN cannot
 * express CSS `backdrop-filter` (that is the BlurView's job) nor multi-layer
 * `box-shadow`, so we expose the discrete pieces the primitive composes.
 */
export interface GlassTokens {
  /** Solid translucent fill painted over the blur (`.liquid-glass` background). */
  fill: string;
  /** Slightly richer fill for the gradient-card variant (top stop). */
  cardFillTop: string;
  /** Card gradient bottom stop. */
  cardFillBottom: string;
  /** 1px translucent border color. */
  border: string;
  /** Faux top-edge inset highlight (inset 0 1px 0 …). */
  topHighlight: string;
  /** Outer drop shadow color (iOS shadowColor). */
  shadowColor: string;
  /** iOS shadow opacity. */
  shadowOpacity: number;
  /** iOS shadow radius. */
  shadowRadius: number;
  /** Android elevation. */
  elevation: number;
  /** Default BlurView tint for this scheme. */
  blurTint: 'light' | 'dark';
  /** Default BlurView intensity. */
  blurIntensity: number;
}

export const darkGlass: GlassTokens = {
  // .liquid-glass background: rgba(255,255,255,0.03)
  fill: 'rgba(255, 255, 255, 0.03)',
  // .liquid-glass-card gradient stops
  cardFillTop: 'rgba(255, 255, 255, 0.06)',
  cardFillBottom: 'rgba(255, 255, 255, 0.02)',
  // border: 1px solid rgba(255,255,255,0.12)
  border: 'rgba(255, 255, 255, 0.12)',
  // inset 0 1px 0 rgba(255,255,255,0.2)
  topHighlight: 'rgba(255, 255, 255, 0.2)',
  // box-shadow 0 10px 40px -10px rgba(0,0,0,0.5)
  shadowColor: '#000000',
  shadowOpacity: 0.5,
  shadowRadius: 20,
  elevation: 8,
  blurTint: 'dark',
  blurIntensity: 24,
};

export const lightGlass: GlassTokens = {
  // .light .liquid-glass background: rgba(255,255,255,0.6)
  fill: 'rgba(255, 255, 255, 0.6)',
  // .light .liquid-glass-card gradient stops
  cardFillTop: 'rgba(255, 255, 255, 0.95)',
  cardFillBottom: 'rgba(245, 245, 245, 0.85)',
  // .light border: 1px solid rgba(0,0,0,0.08)
  border: 'rgba(0, 0, 0, 0.08)',
  // inset 0 1px 0 rgba(255,255,255,0.8)
  topHighlight: 'rgba(255, 255, 255, 0.8)',
  // box-shadow 0 10px 40px -10px rgba(0,0,0,0.06)
  shadowColor: '#000000',
  shadowOpacity: 0.06,
  shadowRadius: 20,
  elevation: 4,
  blurTint: 'light',
  blurIntensity: 24,
};

export function glassFor(scheme: ColorSchemeName): GlassTokens {
  return scheme === 'light' ? lightGlass : darkGlass;
}
