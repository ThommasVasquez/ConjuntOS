"use client";

import { ThemeProvider } from "./providers/ThemeContext";
import { ViewTransitionProvider } from "./providers/ViewTransitionContext";

export function LandingProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ViewTransitionProvider>
        {children}
      </ViewTransitionProvider>
    </ThemeProvider>
  );
}
