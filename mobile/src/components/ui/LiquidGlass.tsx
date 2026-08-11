import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useColorScheme } from 'nativewind';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { darkGlass, gradients, lightGlass, type GlassTokens } from '@/theme/tokens';

export interface LiquidGlassProps {
  children?: ReactNode;
  /** BlurView intensity (1–100). Defaults to the scheme's 24. */
  intensity?: number;
  /** Override the auto-derived BlurView tint. */
  tint?: 'light' | 'dark' | 'default';
  /** NativeWind classes applied to the outer wrapper (width, radius, etc). */
  className?: string;
  /**
   * Applied to the INNER content View — the one that actually holds
   * `children` — so padding/flexDirection/gap lay out the content as callers
   * expect (previously this landed on the outer shadow wrapper, where flex
   * layout affected nothing and children silently stacked in a column).
   */
  style?: StyleProp<ViewStyle>;
  /**
   * `card` reproduces `.liquid-glass-card` (gradient-ish fill, softer border);
   * default reproduces `.liquid-glass`.
   */
  variant?: 'glass' | 'card';
  /**
   * Corner radius. Required so the blur, fill and border clip together — RN
   * can't inherit a CSS `border-radius` onto an absolutely-filled child.
   * @default 24
   */
  radius?: number;
}

/**
 * LiquidGlass — RN reproduction of the web `.liquid-glass` / `.liquid-glass-card`
 * utilities from globals.css.
 *
 * Composition (CSS `backdrop-filter` has no RN equivalent, so we stack layers):
 *   1. Outer View: rounded clip + iOS drop shadow / Android elevation.
 *   2. expo-blur BlurView: the actual background blur (intensity 24, tinted).
 *   3. Absolute translucent fill View: the `background` rgba()/gradient stop.
 *   4. Absolute 1px translucent border View.
 *   5. Faux top-edge inset highlight (the `inset 0 1px 0 rgba(255,255,255,…)`).
 *   6. Content.
 */
export function LiquidGlass({
  children,
  intensity,
  tint,
  className,
  style,
  variant = 'glass',
  radius = 24,
}: LiquidGlassProps) {
  const { colorScheme } = useColorScheme();
  const g: GlassTokens = colorScheme === 'light' ? lightGlass : darkGlass;

  const isCard = variant === 'card';
  // `.liquid-glass` is blur(24px); `.liquid-glass-card` is blur(20px).
  const blurIntensity = intensity ?? (isCard ? g.cardBlurIntensity : g.blurIntensity);
  const blurTint = tint ?? g.blurTint;

  // `.liquid-glass-card` has a softer border than `.liquid-glass`.
  const borderColor = isCard ? g.cardBorder : g.border;
  // `.liquid-glass-card` 135deg gradient stops, per scheme.
  const cardStops =
    colorScheme === 'light' ? gradients.cardLight : gradients.cardDark;

  return (
    <View
      className={className}
      style={[
        styles.outer,
        {
          borderRadius: radius,
          // iOS drop shadow. `.liquid-glass` is 0 10px 40px -10px; the card
          // variant is the softer 0 8px 32px (globals.css:145 / :168).
          shadowColor: g.shadowColor,
          shadowOpacity: isCard ? g.cardShadowOpacity : g.shadowOpacity,
          shadowRadius: isCard ? g.cardShadowRadius : g.shadowRadius,
          shadowOffset: { width: 0, height: isCard ? 8 : 10 },
          // Android elevation.
          elevation: g.elevation,
        },
      ]}
    >
      {/* Clip layer: keeps blur/fill/border inside the rounded corners. */}
      <View style={[styles.clip, { borderRadius: radius }]}>
        <BlurView
          intensity={blurIntensity}
          tint={blurTint}
          // ponytail: Android intentionally left on the default blurMethod
          // 'none' (a semi-transparent view). It used to pass
          // blurMethod="dimezisBlurView" + blurTarget={blurTargetRef}, where the
          // target was the BlurTargetView wrapping the whole <Stack> in
          // app/_layout.tsx — i.e. an ancestor of every BlurView pointing at it.
          // Dimezis blurs by re-drawing its target's view tree, so each of the
          // 13 glass cards on (app)/inicio.tsx redrew a tree containing all 13,
          // recursing until RenderThread blew its stack (SIGSEGV in
          // RenderNode::prepareTreeImpl). Real Android blur needs a target that
          // does NOT contain its BlurViews — a background-only layer — which
          // would blur the page background rather than the content behind each
          // card. The layers below (fill/gradient + border + edge highlights)
          // already carry the glass look, so that rework isn't worth it. iOS is
          // unaffected: both props are android-only and iOS blurs natively.
          style={StyleSheet.absoluteFill}
        />

        {/* Translucent fill painted over the blur. The card variant is a real
            135deg gradient (matches `.liquid-glass-card`); the base variant is
            a flat rgba fill. */}
        {isCard ? (
          <LinearGradient
            pointerEvents="none"
            colors={cardStops}
            // 135deg in CSS = top-left → bottom-right.
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: g.fill }]}
          />
        )}

        {/* 1px translucent border. */}
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderWidth: StyleSheet.hairlineWidth > 1 ? StyleSheet.hairlineWidth : 1,
              borderColor,
              borderRadius: radius,
            },
          ]}
        />

        {/* Faux top-edge inset highlight (inset 0 1px 0 rgba(153,246,228,…)). */}
        <View
          pointerEvents="none"
          style={[
            styles.topHighlight,
            { backgroundColor: g.topHighlight },
          ]}
        />

        {/* Faux bottom-edge inset shade (inset 0 -1px 0 rgba(0,0,0,0.2)). The
            light scheme has no such inset, so skip the layer entirely. */}
        {g.bottomShade === 'transparent' ? null : (
          <View
            pointerEvents="none"
            style={[styles.bottomShade, { backgroundColor: g.bottomShade }]}
          />
        )}

        {/* Content sits above all decorative layers. */}
        <View style={[styles.content, style]}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    // Background must be transparent so the blur shows the content behind it.
    backgroundColor: 'transparent',
  },
  clip: {
    overflow: 'hidden',
    position: 'relative',
  },
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  bottomShade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  content: {
    position: 'relative',
  },
});
