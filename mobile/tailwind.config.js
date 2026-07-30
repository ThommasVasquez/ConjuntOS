/** @type {import('tailwindcss').Config} */

/**
 * Solid token → `rgb(var(--x) / <alpha-value>)` so Tailwind opacity modifiers
 * (`bg-text/5`, `bg-danger/20`, …) resolve against the scheme-swapped channels
 * declared in global.css.
 */
const solid = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;
/** Inherently-translucent token → the complete rgba() value, as-is. */
const translucent = (name) => `var(--color-${name})`;

module.exports = {
  // NativeWind v4 scans these globs for class names. Cover both the route tree
  // (app/) and shared source (src/).
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  // Manual (class) dark mode. Required so NativeWind's setColorScheme/
  // toggleColorScheme work (see ThemeProvider) AND so the `.dark:root` variable
  // block in global.css is selected.
  darkMode: 'class',
  theme: {
    extend: {
      // Design tokens — values live in global.css as CSS custom properties that
      // swap between the light (`:root`) and dark (`.dark:root`) schemes, exactly
      // like web's globals.css. Do NOT inline hex values here: that is what made
      // light mode illegible, because a static value cannot follow the scheme.
      //
      // Both kebab and camel spellings are exposed. Web JSX uses the kebab keys
      // (`bg-surface-2`, `text-text-muted`, `bg-accent-soft`) so markup copied
      // from web works verbatim; the camel keys keep the existing mobile call
      // sites (`bg-surface2`, `text-textMuted`) compiling.
      colors: {
        primary: solid('primary'),
        'primary-light': solid('primary-light'),
        primaryLight: solid('primary-light'),
        accent: solid('accent'),
        'on-accent': solid('on-accent'),
        onAccent: solid('on-accent'),
        text: solid('text'),
        'text-muted': solid('text-muted'),
        textMuted: solid('text-muted'),
        success: solid('success'),
        danger: solid('danger'),
        warning: solid('warning'),
        info: solid('info'),

        // Translucent glass tokens — already carry their own alpha.
        'accent-soft': translucent('accent-soft'),
        accentSoft: translucent('accent-soft'),
        surface: translucent('surface'),
        'surface-2': translucent('surface-2'),
        surface2: translucent('surface-2'),
        border: translucent('border'),
      },
      // Font faces loaded in app/_layout.tsx. Mirrors the next/font families
      // web sets on <html> (Inter body, Plus Jakarta Sans display, JetBrains
      // Mono for code/monospace readouts). Tinos and Pinyon Script are loaded
      // for the web landing/legal pages only and are deliberately absent here.
      fontFamily: {
        sans: ['Inter_400Regular'],
        display: ['PlusJakartaSans_700Bold'],
        mono: ['JetBrainsMono_400Regular'],
      },
    },
  },
  plugins: [],
};
