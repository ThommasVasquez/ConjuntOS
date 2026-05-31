"use client";

import { SessionProvider } from "next-auth/react";
import { ViewTransitionProvider } from "./providers/ViewTransitionContext";
import { ThemeProvider } from "./providers/ThemeContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <ViewTransitionProvider>
          {children}
        </ViewTransitionProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
