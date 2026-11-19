"use client";

import { create } from "zustand";

interface NavFeedbackState {
  pendingPath: string | null;
  setPendingPath: (path: string | null) => void;
}

/**
 * Tracks an in-flight navbar transition so BottomNav highlights the target tab
 * on frame 1 (0ms) and AppShell immediately displays a tailored Skeleton while
 * the destination screen loads or hydrates.
 */
export const useNavFeedback = create<NavFeedbackState>((set) => ({
  pendingPath: null,
  setPendingPath: (pendingPath) => set({ pendingPath }),
}));
