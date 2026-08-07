import type { ReactNode } from "react";

/** Presentational helpers shared by the legal pages (server components). */

export function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="mt-12 mb-4 text-xl md:text-2xl font-bold font-[family-name:var(--font-serif)]">
        {title}
      </h2>
      <div className="space-y-4 text-[15px] leading-relaxed text-text-muted">{children}</div>
    </section>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5 marker:text-text-muted/50">{children}</ul>;
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-2 p-4 text-sm leading-relaxed text-text-muted">
      {children}
    </div>
  );
}
