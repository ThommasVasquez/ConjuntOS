import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

/**
 * Presentational helpers shared by the legal screens — mobile port of web
 * `src/components/legal/Prose.tsx`.
 *
 * The web components rely on inheritance: the `<section>` content wrapper
 * carries `text-[15px] leading-relaxed text-text-muted` and every `<p>` / `<li>`
 * inherits it. RN does not cascade text styles across Views, so each leaf
 * `<Text>` (P / LI) carries those classes itself and `Section` only owns the
 * `space-y-4` (gap-4) rhythm.
 *
 * `Strong` / `Code` / `Anchor` are nested `<Text>` nodes so they stay INLINE
 * inside a paragraph (RN only flows text inside a Text tree) and inherit the
 * parent's muted color, exactly like web's `<strong>` / `<code>` / `<a>` do.
 */

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
    // Web also sets `scroll-mt-24` for its in-page anchors; RN has no anchor
    // scrolling, so only the `id` is kept (View#id === nativeID).
    <View id={id}>
      {/* Web renders an `<h2>`; `accessibilityRole="header"` is the RN
          equivalent so screen readers can still navigate by heading. */}
      <Text
        accessibilityRole="header"
        className="mb-4 mt-12 font-display text-xl font-bold text-text"
      >
        {title}
      </Text>
      <View className="gap-4">{children}</View>
    </View>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <Text className="text-[15px] leading-relaxed text-text-muted">{children}</Text>;
}

export function UL({ children }: { children: ReactNode }) {
  // Web: `list-disc space-y-2 pl-5`.
  return <View className="gap-2 pl-5">{children}</View>;
}

/**
 * One bullet row. Web writes raw `<li>` elements inside `<UL>`; RN needs an
 * explicit marker, so the disc is rendered as a `•` tinted with
 * `text-text-muted/50` (web's `marker:text-text-muted/50`).
 */
export function LI({ children }: { children: ReactNode }) {
  return (
    <View className="flex-row">
      <Text className="mr-2 text-[15px] leading-relaxed text-text-muted/50">•</Text>
      <Text className="flex-1 text-[15px] leading-relaxed text-text-muted">{children}</Text>
    </View>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <View className="rounded-2xl border border-border bg-surface-2 p-4">
      <Text className="text-sm leading-relaxed text-text-muted">{children}</Text>
    </View>
  );
}

/** Inline `<strong>`: bold, inherits the surrounding color. */
export function Strong({ children }: { children: ReactNode }) {
  return <Text className="font-bold">{children}</Text>;
}

/** Inline `<code>`: the browser default is a monospace face. */
export function Code({ children }: { children: ReactNode }) {
  return <Text className="font-mono">{children}</Text>;
}

/** Inline `<Link className="underline hover:text-text">`. */
export function Anchor({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  return (
    <Text accessibilityRole="link" onPress={onPress} className="underline">
      {children}
    </Text>
  );
}
