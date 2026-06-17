/** @type {import('tailwindcss').Config} */
module.exports = {
  // NativeWind v4 scans these globs for class names. Cover both the route tree
  // (app/) and shared source (src/).
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  // Manual (class) dark mode. Required so NativeWind's setColorScheme/
  // toggleColorScheme work — see ThemeProvider. The app defaults to dark, so
  // the unprefixed tokens below ARE the dark palette and the `dark:` variant is
  // a no-op alias for them; the `*-light` keys carry the light-scheme values
  // for any `dark:`-vs-default class pairs that need them.
  darkMode: 'class',
  theme: {
    extend: {
      // Design tokens — ported VERBATIM from web src/app/globals.css.
      // Unprefixed = DARK scheme (the app default). `*-light` = light override.
      // Values mirror src/theme/tokens.ts (the runtime source of truth for the
      // translucent/glass colors that can't live in a static class).
      colors: {
        // —— Dark scheme (default / `:root` in globals.css) ——
        primary: '#000000', // Negro puro (fondo)
        'primary-light': '#141414', // Negro elevado neutro (tarjetas)
        accent: '#FFFFFF', // Blanco puro como acento (CTAs/detalles)
        'on-accent': '#000000', // Texto/icono SOBRE el acento
        onAccent: '#000000', // alias (camelCase token name)
        surface: 'rgba(255, 255, 255, 0.045)', // Glass translúcido
        surface2: 'rgba(255, 255, 255, 0.07)', // Glass más claro
        text: '#FFFFFF', // Blanco puro
        textMuted: 'rgba(255, 255, 255, 0.92)', // Casi blanco puro
        'text-muted': 'rgba(255, 255, 255, 0.92)', // alias (kebab token name)
        border: 'rgba(255, 255, 255, 0.14)', // Borde sutil para glass
        success: '#FFFFFF',
        danger: '#FFFFFF',
        warning: '#FFFFFF',

        // —— Light scheme override (`.light` in globals.css) ——
        // Use these to build `dark:`-vs-default class pairs, e.g.
        // `bg-light-primary dark:bg-primary`.
        'light-primary': '#FFFFFF', // Blanco puro (fondo)
        'light-primaryLight': '#FFFFFF', // Blanco para tarjetas
        'light-accent': '#000000', // Negro puro como acento
        'light-onAccent': '#FFFFFF', // Texto/icono SOBRE el acento
        'light-surface': 'rgba(255, 255, 255, 0.72)', // Vidrio blanco translúcido
        'light-surface2': 'rgba(0, 0, 0, 0.04)', // Fondo sutil de input/botón
        'light-text': '#000000', // Negro puro
        'light-textMuted': 'rgba(0, 0, 0, 0.92)', // Casi negro puro
        'light-border': 'rgba(0, 0, 0, 0.1)', // Bordes sutiles en claro
        'light-success': '#000000',
        'light-danger': '#000000',
        'light-warning': '#000000',
      },
    },
  },
  plugins: [],
};
