"use client";

import { AuthProvider } from "./providers/AuthProvider";
import { ViewTransitionProvider } from "./providers/ViewTransitionContext";
import { ThemeProvider } from "./providers/ThemeContext";
import { CallProvider } from "./providers/CallContext";
import { WebSocketProvider } from "./providers/WebSocketProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <WebSocketProvider>
        <ThemeProvider>
          <CallProvider>
            <ViewTransitionProvider>
              {children}
            </ViewTransitionProvider>
          </CallProvider>
        </ThemeProvider>
      </WebSocketProvider>
    </AuthProvider>
  );
}

