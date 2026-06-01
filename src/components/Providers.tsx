"use client";

import { SessionProvider } from "next-auth/react";
import { ViewTransitionProvider } from "./providers/ViewTransitionContext";
import { ThemeProvider } from "./providers/ThemeContext";
import { CallProvider } from "./providers/CallContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <CallProvider>
          <ViewTransitionProvider>
            {children}
          </ViewTransitionProvider>
        </CallProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}

