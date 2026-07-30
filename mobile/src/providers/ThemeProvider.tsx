import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { useColorScheme, vars } from 'nativewind';

import { cssVarsFor, type ColorSchemeName } from '@/theme/tokens';

const STORAGE_KEY = 'conjuntos_theme';

interface ThemeContextValue {
  theme: ColorSchemeName;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * ThemeProvider — backs the design system's light/dark switch.
 *
 * - LIGHT is the default scheme. This matches web, which hardcodes
 *   `<html className="light">` (src/app/layout.tsx:78) and defaults
 *   `useState<Theme>("light")` with a `setTheme("light")` fallback when nothing
 *   is persisted (src/components/providers/ThemeContext.tsx:15,24). Note that
 *   `:root` in globals.css holds the DARK values and `.light` overrides them —
 *   so "dark is :root" does NOT mean dark is the default; web always applies
 *   the `.light` class on first paint.
 * - Persisted manually under AsyncStorage key `conjuntos_theme` (same key as web).
 * - Drives NativeWind's `dark:` variant via `setColorScheme` (this requires
 *   `darkMode: 'class'` in tailwind.config.js — set there).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  // NativeWind owns the runtime color scheme that the `dark:` variant reads.
  const { colorScheme, setColorScheme } = useColorScheme();

  // Local mirror so context updates synchronously; light default until restored.
  const [theme, setTheme] = useState<ColorSchemeName>('light');

  // Restore persisted preference on mount (light default when absent/unset,
  // matching web ThemeContext's else-branch).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        const next: ColorSchemeName = saved === 'dark' ? 'dark' : 'light';
        if (cancelled) return;
        setTheme(next);
        setColorScheme(next);
      } catch {
        // Storage unavailable — keep the light default.
        if (!cancelled) {
          setTheme('light');
          setColorScheme('light');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // setColorScheme identity is stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the local mirror in sync if NativeWind's scheme changes elsewhere.
  useEffect(() => {
    if (colorScheme && colorScheme !== theme) {
      setTheme(colorScheme);
    }
  }, [colorScheme, theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: ColorSchemeName = prev === 'dark' ? 'light' : 'dark';
      setColorScheme(next);
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
        /* best-effort persistence */
      });
      return next;
    });
  }, [setColorScheme]);

  // Publish the palette as CSS custom properties on a wrapper View. Every
  // descendant's token class (`text-text`, `bg-primary`, `bg-danger/20`, …)
  // resolves `rgb(var(--color-x) / <alpha>)` against these, so a single
  // unprefixed class is correct in BOTH schemes — the same behaviour web gets
  // from `:root` vs `.light`. See cssVarsFor() for why a `.dark:root` block in
  // global.css cannot do this.
  const themeVars = useMemo(() => vars(cssVarsFor(theme)), [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <View style={[styles.root, themeVars]}>{children}</View>
    </ThemeContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a <ThemeProvider>');
  }
  return ctx;
}
