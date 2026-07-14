// Skeleton shown on every (app) route transition — renders inside AppShell's
// content slot, so TopBar + BottomNav stay put. ponytail: one generic skeleton
// for all views; give a route its own loading.tsx if it needs a tailored shape.
export default function Loading() {
  return (
    <div className="p-4 space-y-4 animate-pulse" aria-hidden>
      {/* header block */}
      <div className="h-8 w-1/2 rounded-lg bg-text/10" />
      <div className="h-11 w-full rounded-xl bg-text/10" />

      {/* card grid */}
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-text/10" />
        ))}
      </div>

      {/* list rows */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 rounded-2xl bg-text/10" />
        ))}
      </div>
    </div>
  );
}
