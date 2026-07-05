"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const savedTheme = localStorage.getItem("conjuntos_theme") as Theme | null;
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
      updateDocumentTheme(savedTheme);
    } else {
      setTheme("light");
      updateDocumentTheme("light");
    }
  }, []);

  const updateDocumentTheme = (t: Theme) => {
    const root = window.document.documentElement;
    if (t === "light") {
      root.classList.add("light");
      root.classList.remove("dark");
      root.setAttribute("data-theme", "light");
    } else {
      root.classList.add("dark");
      root.classList.remove("light");
      root.setAttribute("data-theme", "dark");
    }
  };

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    
    const applyTheme = () => {
      setTheme(nextTheme);
      localStorage.setItem("conjuntos_theme", nextTheme);
      updateDocumentTheme(nextTheme);
    };

    // Smooth cinematic view transition during theme swap if supported.
    if (document.startViewTransition) {
      const vt = document.startViewTransition(applyTheme);
      // Overlapping toggles/navigations abort the transition and reject these
      // promises; swallow so they don't surface as unhandled errors. The DOM
      // swap in applyTheme still runs, so the theme change is unaffected.
      vt.ready?.catch(() => {});
      vt.finished?.catch(() => {});
    } else {
      applyTheme();
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
