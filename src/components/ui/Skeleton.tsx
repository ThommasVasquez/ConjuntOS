/**
 * Shared loading placeholders.
 *
 * Skeletons replace spinners for *content* loads: they hold the layout's shape
 * so switching tabs or filters doesn't collapse to a centered dot and reflow.
 * Spinners are still correct for in-flight *actions* (a submit button), so
 * `Loader2` usages inside buttons were deliberately left alone.
 */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-text/10 ${className}`} />;
}

/** Placeholder rows for list views (pagos, gastos, visitas, paquetes…). */
export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3 w-full">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="liquid-glass rounded-3xl p-5 border border-border flex items-center gap-3"
        >
          <Skeleton className="w-10 h-10 shrink-0 rounded-xl" />
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
          <Skeleton className="h-4 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** Placeholder for a grid of stat/KPI cards. */
export function SkeletonKpis({ count = 5 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0 w-full">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="liquid-glass rounded-3xl p-4 border border-border shadow-2xl flex flex-col gap-2"
        >
          <div className="flex items-center gap-2">
            <Skeleton className="w-8 h-8 shrink-0 rounded-xl" />
            <Skeleton className="h-2.5 flex-1" />
          </div>
          <Skeleton className="h-5 w-2/3" />
        </div>
      ))}
    </div>
  );
}
