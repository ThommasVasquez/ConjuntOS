"use client";

import { SessionProvider } from "next-auth/react";
import { ViewTransitionProvider } from "./providers/ViewTransitionContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ViewTransitionProvider>
        {children}
      </ViewTransitionProvider>
    </SessionProvider>
  );
}
