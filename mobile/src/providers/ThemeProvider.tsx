import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'nativewind';

import type { ColorSchemeName } from '@/theme/tokens';

const STORAGE_KEY = 'conjuntos_theme';

interface ThemeContextValue {
  theme: ColorSchemeName;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * ThemeProvider — backs the design system's light/dark switch.
 *
 * - Dark is the default scheme (matches `:root` in web globals.css).
 * - Persisted manually under AsyncStorage key `conjuntos_theme`.
 * - Drives NativeWind's `dark:` variant via `setColorScheme` (this requires
 *   `darkMode: 'class'` in tailwind.config.js — set there).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  // NativeWind owns the runtime color scheme that the `dark:` variant reads.
  const { colorScheme, setColorScheme } = useColorScheme();

  // Local mirror so context updates synchronously; dark default until restored.
  const [theme, setTheme] = useState<ColorSchemeName>('dark');

  // Restore persisted preference on mount (dark default when absent/unset).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        const next: ColorSchemeName = saved === 'light' ? 'light' : 'dark';
        if (cancelled) return;
        setTheme(next);
        setColorScheme(next);
      } catch {
        // Storage unavailable — keep the dark default.
        if (!cancelled) {
          setTheme('dark');
          setColorScheme('dark');
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

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a <ThemeProvider>');
  }
  return ctx;
}
