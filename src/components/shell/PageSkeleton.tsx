"use client";

import React from "react";

interface PageSkeletonProps {
  path?: string | null;
}

/**
 * Tailored shimmer skeletons matching the exact geometry of each navbar screen
 * so every tap gives immediate visual action instead of staring at a frozen view.
 */
export default function PageSkeleton({ path }: PageSkeletonProps) {
  const clean = (path || "").split("?")[0];

  if (clean === "/perfil") {
    return (
      <div className="flex flex-col min-h-screen relative overflow-hidden pb-32 animate-pulse" aria-hidden>
        {/* Hero photo shimmer */}
        <div className="w-full h-[52vh] bg-gradient-to-b from-text/10 via-text/5 to-transparent" />
        {/* Name + role */}
        <div className="px-4 -mt-12 flex flex-col items-center gap-3">
          <div className="h-9 w-56 rounded-2xl bg-text/12" />
          <div className="h-4 w-28 rounded-full bg-text/8" />
          {/* Pills */}
          <div className="flex gap-2.5 mt-3">
            <div className="h-8 w-24 rounded-full bg-text/10" />
            <div className="h-8 w-24 rounded-full bg-text/10" />
          </div>
          <div className="h-8 w-40 rounded-full bg-text/8" />
          {/* 4 stat tiles */}
          <div className="grid grid-cols-4 gap-2.5 w-full mt-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-[22px] bg-primary-light border border-border/50 p-3 flex flex-col items-center justify-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-text/10" />
                <div className="h-4 w-6 rounded bg-text/12" />
                <div className="h-2 w-12 rounded bg-text/8" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (clean === "/citofonia") {
    return (
      <div className="min-h-screen flex flex-col px-4 pt-[calc(env(safe-area-inset-top,0px)+1rem)] pb-32 gap-6 animate-pulse" aria-hidden>
        {/* ProfileHeader skeleton */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-text/10" />
            <div className="space-y-2">
              <div className="h-2.5 w-20 rounded bg-text/10" />
              <div className="h-5 w-36 rounded-lg bg-text/12" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="w-11 h-11 rounded-full bg-text/10" />
            <div className="w-11 h-11 rounded-full bg-text/10" />
          </div>
        </div>

        {/* Control Center header + 3 tabs */}
        <div className="rounded-[32px] p-5 bg-primary-light border border-border/50 space-y-4">
          <div className="flex justify-between items-center">
            <div className="h-6 w-40 rounded-lg bg-text/12" />
            <div className="h-6 w-20 rounded-full bg-text/10" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="h-14 rounded-xl bg-text/12" />
            <div className="h-14 rounded-xl bg-text/8" />
            <div className="h-14 rounded-xl bg-text/8" />
          </div>
        </div>

        {/* Quick call buttons */}
        <div className="grid grid-cols-2 gap-3">
          <div className="h-28 rounded-[28px] bg-primary-light border border-border/50" />
          <div className="h-28 rounded-[28px] bg-primary-light border border-border/50" />
        </div>

        {/* Dialpad / search card */}
        <div className="h-52 rounded-[28px] bg-primary-light border border-border/50" />
      </div>
    );
  }

  if (clean === "/visitantes") {
    return (
      <div className="min-h-screen flex flex-col px-4 pt-[calc(env(safe-area-inset-top,0px)+1rem)] pb-32 gap-6 animate-pulse" aria-hidden>
        {/* ProfileHeader skeleton */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-text/10" />
            <div className="space-y-2">
              <div className="h-2.5 w-20 rounded bg-text/10" />
              <div className="h-5 w-36 rounded-lg bg-text/12" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="w-11 h-11 rounded-full bg-text/10" />
            <div className="w-11 h-11 rounded-full bg-text/10" />
          </div>
        </div>

        {/* 2 Summary cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="h-32 rounded-[28px] bg-primary-light border border-border/50 p-5 flex flex-col justify-between">
            <div className="w-10 h-10 rounded-2xl bg-text/10" />
            <div className="space-y-1.5">
              <div className="h-2.5 w-12 rounded bg-text/8" />
              <div className="h-7 w-10 rounded bg-text/12" />
            </div>
          </div>
          <div className="h-32 rounded-[28px] bg-primary-light border border-border/50 p-5 flex flex-col justify-between">
            <div className="w-10 h-10 rounded-2xl bg-text/10" />
            <div className="space-y-1.5">
              <div className="h-2.5 w-16 rounded bg-text/8" />
              <div className="h-7 w-10 rounded bg-text/12" />
            </div>
          </div>
        </div>

        {/* New visit CTA card */}
        <div className="h-44 rounded-[32px] bg-primary-light border border-border/50" />

        {/* List rows */}
        <div className="space-y-3">
          <div className="h-20 rounded-[24px] bg-primary-light border border-border/50" />
          <div className="h-20 rounded-[24px] bg-primary-light border border-border/50" />
        </div>
      </div>
    );
  }

  // Default & /inicio skeleton
  return (
    <div className="min-h-screen flex flex-col px-4 pt-[calc(env(safe-area-inset-top,0px)+1rem)] pb-32 gap-6 animate-pulse" aria-hidden>
      {/* ProfileHeader skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-text/10" />
          <div className="space-y-2">
            <div className="h-2.5 w-20 rounded bg-text/10" />
            <div className="h-5 w-36 rounded-lg bg-text/12" />
            <div className="h-2.5 w-24 rounded bg-text/8" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="w-11 h-11 rounded-full bg-text/10" />
          <div className="w-11 h-11 rounded-full bg-text/10" />
        </div>
      </div>

      {/* Search bar */}
      <div className="flex gap-3">
        <div className="h-14 flex-1 rounded-[24px] bg-primary-light border border-border/50" />
        <div className="w-14 h-14 rounded-[22px] bg-primary-light border border-border/50" />
      </div>

      {/* Quick navigation strip */}
      <div className="space-y-3">
        <div className="h-3.5 w-36 rounded bg-text/10" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="min-w-[116px] h-32 rounded-[24px] bg-primary-light border border-border/50 p-4 flex flex-col items-center justify-center gap-2.5">
              <div className="w-12 h-12 rounded-full bg-text/10" />
              <div className="h-3 w-16 rounded bg-text/12" />
              <div className="h-2 w-12 rounded bg-text/8" />
            </div>
          ))}
        </div>
      </div>

      {/* Feed card */}
      <div className="space-y-3">
        <div className="h-5 w-28 rounded bg-text/12" />
        <div className="h-56 rounded-[32px] bg-primary-light border border-border/50" />
      </div>
    </div>
  );
}
