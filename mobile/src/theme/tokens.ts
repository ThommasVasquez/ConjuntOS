/**
 * Design tokens — ported VERBATIM from web `src/app/globals.css`.
 *
 * ConjuntOS — Trust Teal + Professional Blue sobre Liquid Glass.
 * Dark is the default scheme (`:root`); `.light` overrides are desaturated
 * tones, NOT an inversion (color-dark-mode, HIG/MD).
 *
 * REGLA (copiada de globals.css): nunca escribas un hex crudo en un
 * componente. Usa los tokens (`text-accent`, `bg-success`, `border-danger`…).
 * En web había 600+ hex sueltos y success/danger/warning valían todos #ffffff,
 * así que no significaban nada.
 *
 * These objects are the runtime source of truth for colors that cannot be
 * expressed as a static Tailwind class (e.g. the translucent fills/borders of
 * the Liquid Glass primitives, which need exact rgba() values per scheme).
 * The Tailwind config mirrors the *solid* tokens via the `dark:` variant.
 */

export interface ColorTokens {
  /** Fondo principal de la app. */
  primary: string;
  /** Tarjetas / superficies elevadas. */
  primaryLight: string;
  /** Teal — acción principal, foco, activo. */
  accent: string;
  /** Relleno suave del acento (chips, badges, estados activos). */
  accentSoft: string;
  /** Tinta SOBRE el acento. */
  onAccent: string;
  /** Glass translúcido base. */
  surface: string;
  /** Inputs, botón secundario. */
  surface2: string;
  /** Texto principal. */
  text: string;
  /** Texto secundario REAL (gris teal, no el color principal). */
  textMuted: string;
  /** Borde sutil para glass. */
  border: string;
  /** Confirmado / presente. */
  success: string;
  /** Destructivo / rechazado. */
  danger: string;
  /** Pendiente / por vencer. */
  warning: string;
  /** Informativo / enlaces. */
  info: string;
}

/** Dark scheme — the default (`:root` in globals.css). */
export const darkTokens: ColorTokens = {
  primary: '#050d0c', // Fondo: negro con tinte teal profundo
  primaryLight: '#0b1614', // Tarjetas / superficies elevadas
  accent: '#2dd4bf', // Teal — acción principal, foco, activo (10.55:1)
  accentSoft: 'rgba(45, 212, 191, 0.14)', // Relleno suave del acento
  onAccent: '#04211d', // Tinta sobre el acento (9.09:1)
  surface: 'rgba(45, 212, 191, 0.05)', // Glass
  surface2: 'rgba(45, 212, 191, 0.09)', // Inputs, botón secundario
  text: '#f0fdfa', // Texto principal (18.83:1)
  textMuted: '#93b5b0', // Texto secundario REAL (8.86:1)
  success: '#34d399', // Confirmado / presente (10.22:1)
  danger: '#f87171', // Destructivo / rechazado (7.10:1)
  warning: '#fbbf24', // Pendiente / por vencer (11.76:1)
  info: '#38bdf8', // Informativo / enlaces (9.17:1)
  border: 'rgba(45, 212, 191, 0.16)',
};

/** Light scheme — the `.light` override (tonos desaturados, no invertidos). */
export const lightTokens: ColorTokens = {
  primary: '#f0fdfa',
  primaryLight: '#ffffff',
  accent: '#0f766e', // Teal 700 (5.25:1)
  accentSoft: 'rgba(15, 118, 110, 0.1)',
  onAccent: '#ffffff', // (5.47:1)
  surface: 'rgba(255, 255, 255, 0.72)',
  surface2: 'rgba(15, 118, 110, 0.06)',
  text: '#0f2e2a', // (13.94:1)
  textMuted: '#4a6b66', // (5.61:1)
  success: '#047857', // (5.26:1)
  danger: '#dc2626', // (4.63:1)
  warning: '#b45309', // (4.81:1)
  info: '#0369a1', // (5.69:1)
  border: 'rgba(15, 118, 110, 0.18)',
};

export type ColorSchemeName = 'light' | 'dark';

/** Resolve the token set for a given scheme. */
export function tokensFor(scheme: ColorSchemeName): ColorTokens {
  return scheme === 'light' ? lightTokens : darkTokens;
}

/** `#rrggbb` → `"r g b"`, the space-separated channel form Tailwind needs so
 *  `rgb(var(--color-x) / <alpha-value>)` supports opacity modifiers. */
function hexToChannels(hex: string): string {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const n = parseInt(full, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** Tokens that are solid hex colors — emitted as RGB channels. */
const SOLID_VARS = {
  '--color-primary': 'primary',
  '--color-primary-light': 'primaryLight',
  '--color-accent': 'accent',
  '--color-on-accent': 'onAccent',
  '--color-text': 'text',
  '--color-text-muted': 'textMuted',
  '--color-success': 'success',
  '--color-danger': 'danger',
  '--color-warning': 'warning',
  '--color-info': 'info',
} as const satisfies Record<string, keyof ColorTokens>;

/** Tokens that are already translucent rgba() — passed through verbatim. */
const TRANSLUCENT_VARS = {
  '--color-accent-soft': 'accentSoft',
  '--color-surface': 'surface',
  '--color-surface-2': 'surface2',
  '--color-border': 'border',
} as const satisfies Record<string, keyof ColorTokens>;

/**
 * The CSS custom properties for a scheme, for NativeWind's `vars()` helper.
 *
 * This is how the palette becomes scheme-reactive. Static Tailwind colors
 * cannot follow a runtime theme toggle, and a `.dark:root` block in global.css
 * does NOT work either — react-native-css-interop compiles it into a rule that
 * only matches a component literally classed `dark`, which `setColorScheme()`
 * never applies. Instead `ThemeProvider` sets these variables once on a
 * wrapper View via `vars()`, and every descendant's `text-text` / `bg-primary`
 * / `bg-danger/20` class resolves against them — the same single-class-works-in-
 * both-schemes behavior web gets from `:root` vs `.light`.
 */
export function cssVarsFor(scheme: ColorSchemeName): Record<string, string> {
  const t = tokensFor(scheme);
  const out: Record<string, string> = {};
  for (const [cssVar, key] of Object.entries(SOLID_VARS)) {
    out[cssVar] = hexToChannels(t[key as keyof ColorTokens]);
  }
  for (const [cssVar, key] of Object.entries(TRANSLUCENT_VARS)) {
    out[cssVar] = t[key as keyof ColorTokens];
  }
  return out;
}

/**
 * Ink that stays readable on top of a filled semantic background
 * (`bg-success` / `bg-danger` / `bg-warning`). The dark scheme's semantic
 * colors are LIGHT tints, so they need dark ink; the light scheme's are dark,
 * so they need white. Mirrors how web pairs `bg-danger` with a dark/light text
 * class per scheme.
 */
export function onSemantic(scheme: ColorSchemeName): string {
  return scheme === 'light' ? '#ffffff' : darkTokens.primary;
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
  /** Gradient-card variant top stop (`.liquid-glass-card`, 135deg). */
  cardFillTop: string;
  /** Card gradient bottom stop. */
  cardFillBottom: string;
  /** 1px translucent border color for `.liquid-glass`. */
  border: string;
  /** 1px translucent border color for `.liquid-glass-card` (slightly softer). */
  cardBorder: string;
  /** Faux top-edge inset highlight (inset 0 1px 0 …). */
  topHighlight: string;
  /** Faux bottom-edge inset shade (inset 0 -1px 0 rgba(0,0,0,0.2)). */
  bottomShade: string;
  /** `.liquid-glass-card` outer shadow opacity (softer than plain glass). */
  cardShadowOpacity: number;
  /** `.liquid-glass-card` outer shadow radius. */
  cardShadowRadius: number;
  /** `.liquid-glass-card` BlurView intensity (globals.css uses blur(20px)). */
  cardBlurIntensity: number;
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
  // .liquid-glass background: rgba(45,212,191,0.04) — el cristal lleva tinte
  // teal, no blanco neutro.
  fill: 'rgba(45, 212, 191, 0.04)',
  // .liquid-glass-card gradient stops (teal → sky)
  cardFillTop: 'rgba(45, 212, 191, 0.08)',
  cardFillBottom: 'rgba(56, 189, 248, 0.03)',
  // .liquid-glass border: 1px solid rgba(45,212,191,0.16)
  border: 'rgba(45, 212, 191, 0.16)',
  // .liquid-glass-card border: 1px solid rgba(45,212,191,0.14)
  cardBorder: 'rgba(45, 212, 191, 0.14)',
  // inset 0 1px 0 rgba(153,246,228,0.18)
  topHighlight: 'rgba(153, 246, 228, 0.18)',
  // inset 0 -1px 0 rgba(0,0,0,0.2)  (globals.css:129)
  bottomShade: 'rgba(0, 0, 0, 0.20)',
  // .liquid-glass-card box-shadow 0 8px 32px 0 rgba(0,0,0,0.35) (globals.css:145)
  cardShadowOpacity: 0.35,
  cardShadowRadius: 16,
  // .liquid-glass-card backdrop-filter blur(20px) (globals.css:142)
  cardBlurIntensity: 20,
  // box-shadow 0 10px 40px -10px rgba(0,0,0,0.55)
  shadowColor: '#000000',
  shadowOpacity: 0.55,
  shadowRadius: 20,
  elevation: 8,
  blurTint: 'dark',
  blurIntensity: 24,
};

export const lightGlass: GlassTokens = {
  // .light .liquid-glass background: rgba(255,255,255,0.68)
  fill: 'rgba(255, 255, 255, 0.68)',
  // .light .liquid-glass-card gradient stops
  cardFillTop: 'rgba(255, 255, 255, 0.96)',
  cardFillBottom: 'rgba(240, 253, 250, 0.88)',
  // .light .liquid-glass border: 1px solid rgba(15,118,110,0.14)
  border: 'rgba(15, 118, 110, 0.14)',
  // .light .liquid-glass-card border: 1px solid rgba(15,118,110,0.12)
  cardBorder: 'rgba(15, 118, 110, 0.12)',
  // inset 0 1px 0 rgba(255,255,255,0.85)
  topHighlight: 'rgba(255, 255, 255, 0.85)',
  // The light `.liquid-glass` rule has NO bottom inset shade (globals.css:153-159).
  bottomShade: 'transparent',
  // .light .liquid-glass-card box-shadow 0 8px 32px 0 rgba(15,118,110,0.07)
  cardShadowOpacity: 0.07,
  cardShadowRadius: 16,
  cardBlurIntensity: 20,
  // box-shadow 0 10px 40px -10px rgba(15,118,110,0.1)
  shadowColor: '#0f766e',
  shadowOpacity: 0.1,
  shadowRadius: 20,
  elevation: 4,
  blurTint: 'light',
  blurIntensity: 24,
};

export function glassFor(scheme: ColorSchemeName): GlassTokens {
  return scheme === 'light' ? lightGlass : darkGlass;
}

/**
 * BottomNav active pill — ported from `.nav-active-glass` in globals.css.
 * "sigue al acento teal": translucent teal fill + teal border + teal glow,
 * NOT a solid accent fill.
 */
export interface NavActiveTokens {
  /** Active pill background. */
  fill: string;
  /** Active pill border. */
  border: string;
  /** Outer teal glow (box-shadow 0 4px 24px …). */
  glow: string;
  /** Inactive pill background. */
  idleFill: string;
  /** Inactive pill border. */
  idleBorder: string;
}

export const darkNavActive: NavActiveTokens = {
  // background: rgba(45,212,191,0.18)
  fill: 'rgba(45, 212, 191, 0.18)',
  // border: 1px solid rgba(45,212,191,0.38)
  border: 'rgba(45, 212, 191, 0.38)',
  // box-shadow: 0 4px 24px rgba(45,212,191,0.28)
  glow: 'rgba(45, 212, 191, 0.28)',
  // BottomNav.tsx:98 idle pill — `bg-text/5` = text #f0fdfa at 5%.
  idleFill: 'rgba(240, 253, 250, 0.05)',
  // BottomNav.tsx:98 idle pill — `border-border/30` = border (teal .16) at 30%.
  idleBorder: 'rgba(45, 212, 191, 0.048)',
};

export const lightNavActive: NavActiveTokens = {
  // .light background: rgba(15,118,110,0.12)
  fill: 'rgba(15, 118, 110, 0.12)',
  // .light border: 1px solid rgba(15,118,110,0.28)
  border: 'rgba(15, 118, 110, 0.28)',
  // .light box-shadow: 0 4px 20px rgba(15,118,110,0.18)
  glow: 'rgba(15, 118, 110, 0.18)',
  // `bg-text/5` = light text #0f2e2a at 5%.
  idleFill: 'rgba(15, 46, 42, 0.05)',
  // `border-border/30` = light border (teal 700 .18) at 30%.
  idleBorder: 'rgba(15, 118, 110, 0.054)',
};

export function navActiveFor(scheme: ColorSchemeName): NavActiveTokens {
  return scheme === 'light' ? lightNavActive : darkNavActive;
}

/**
 * Toast surface — ported from `.liquid-glass-toast` in globals.css (the sonner
 * override). Web uses `backdrop-filter: blur(250px)`; RN caps out at the
 * BlurView intensity, so the fill carries most of the contrast.
 */
export interface ToastTokens {
  background: string;
  border: string;
  text: string;
  successBorder: string;
  errorBorder: string;
  radius: number;
}

export const darkToast: ToastTokens = {
  background: 'rgba(5, 13, 12, 0.72)', // Contraste máximo para lectura
  border: 'rgba(255, 255, 255, 0.15)',
  text: '#ffffff',
  successBorder: 'rgba(52, 211, 153, 0.55)',
  errorBorder: 'rgba(248, 113, 113, 0.55)',
  radius: 32,
};

export const lightToast: ToastTokens = {
  background: 'rgba(255, 255, 255, 0.85)',
  border: 'rgba(0, 0, 0, 0.12)',
  text: '#0f2e2a',
  successBorder: 'rgba(0, 0, 0, 0.25)',
  errorBorder: 'rgba(200, 0, 0, 0.3)',
  radius: 32,
};

export function toastFor(scheme: ColorSchemeName): ToastTokens {
  return scheme === 'light' ? lightToast : darkToast;
}

/**
 * Decorative gradients from globals.css that RN reproduces with
 * `expo-linear-gradient`.
 *
 * - `storyRing`: `.liquid-story-ring` — linear-gradient(45deg, …) animated.
 * - `statusHalo`: `.liquid-status-halo::before` — conic-gradient; RN has no
 *   conic gradient, so callers approximate with a rotating linear sweep.
 */
export const gradients = {
  storyRing: ['#2dd4bf', '#38bdf8', '#2dd4bf'] as const,
  statusHalo: ['transparent', '#38bdf8', '#2dd4bf', 'transparent'] as const,
  /** `.liquid-glass-card` 135deg fill, dark scheme. */
  cardDark: ['rgba(45, 212, 191, 0.08)', 'rgba(56, 189, 248, 0.03)'] as const,
  /** `.liquid-glass-card` 135deg fill, light scheme. */
  cardLight: ['rgba(255, 255, 255, 0.96)', 'rgba(240, 253, 250, 0.88)'] as const,
};

/** `.text-glow` / `.accent-glow` text shadow, per scheme. */
export const textGlow = {
  dark: { color: 'rgba(45, 212, 191, 0.4)', radius: 12 },
  light: { color: 'rgba(0, 0, 0, 0.15)', radius: 8 },
} as const;
