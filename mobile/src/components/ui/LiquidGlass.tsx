import { BlurView } from 'expo-blur';
import { useColorScheme } from 'nativewind';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { darkGlass, lightGlass, type GlassTokens } from '@/theme/tokens';

export interface LiquidGlassProps {
  children?: ReactNode;
  /** BlurView intensity (1–100). Defaults to the scheme's 24. */
  intensity?: number;
  /** Override the auto-derived BlurView tint. */
  tint?: 'light' | 'dark' | 'default';
  /** NativeWind classes applied to the outer wrapper (layout, radius, etc). */
  className?: string;
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

  const blurIntensity = intensity ?? g.blurIntensity; // 24
  const blurTint = tint ?? g.blurTint;

  // `.liquid-glass-card` uses a 135deg gradient; RN core has no gradient, so we
  // approximate with the top stop as a flat fill (closest single-color match).
  const fill = variant === 'card' ? g.cardFillTop : g.fill;

  return (
    <View
      className={className}
      style={[
        styles.outer,
        {
          borderRadius: radius,
          // iOS drop shadow (0 10px 40px -10px rgba(0,0,0,opacity)).
          shadowColor: g.shadowColor,
          shadowOpacity: g.shadowOpacity,
          shadowRadius: g.shadowRadius,
          shadowOffset: { width: 0, height: 10 },
          // Android elevation.
          elevation: g.elevation,
        },
        style,
      ]}
    >
      {/* Clip layer: keeps blur/fill/border inside the rounded corners. */}
      <View style={[styles.clip, { borderRadius: radius }]}>
        <BlurView
          intensity={blurIntensity}
          tint={blurTint}
          // Android needs an explicit blur method to actually blur (default 'none').
          experimentalBlurMethod={
            Platform.OS === 'android' ? 'dimezisBlurView' : undefined
          }
          style={StyleSheet.absoluteFill}
        />

        {/* Translucent fill painted over the blur. */}
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: fill }]}
        />

        {/* 1px translucent border. */}
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderWidth: StyleSheet.hairlineWidth > 1 ? StyleSheet.hairlineWidth : 1,
              borderColor: g.border,
              borderRadius: radius,
            },
          ]}
        />

        {/* Faux top-edge inset highlight (inset 0 1px 0 rgba(255,255,255,…)). */}
        <View
          pointerEvents="none"
          style={[
            styles.topHighlight,
            { backgroundColor: g.topHighlight },
          ]}
        />

        {/* Content sits above all decorative layers. */}
        <View style={styles.content}>{children}</View>
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
  content: {
    position: 'relative',
  },
});
