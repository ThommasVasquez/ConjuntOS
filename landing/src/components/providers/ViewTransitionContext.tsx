"use client";

import { createContext, useContext, useTransition } from "react";
import { useRouter } from "next/navigation";

interface ViewTransitionContextType {
  navigate: (url: string) => void;
  isPending: boolean;
}

const ViewTransitionContext = createContext<ViewTransitionContextType | undefined>(undefined);

export function ViewTransitionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const navigate = (url: string) => {
    // Check if browser supports View Transitions API
    if (!document.startViewTransition) {
      router.push(url);
      return;
    }

    document.startViewTransition(() => {
      startTransition(() => {
        router.push(url);
      });
    });
  };

  return (
    <ViewTransitionContext.Provider value={{ navigate, isPending }}>
      {children}
    </ViewTransitionContext.Provider>
  );
}

export function useViewTransition() {
  const context = useContext(ViewTransitionContext);
  if (!context) {
    throw new Error("useViewTransition must be used within a ViewTransitionProvider");
  }
  return context;
}
