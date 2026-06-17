import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable } from 'react-native';
import { LiquidGlass } from '@/components/ui/LiquidGlass';

export interface GlassCardProps {
  children: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}

/**
 * A rounded, padded liquid-glass surface. Built on top of LiquidGlass. When
 * `onPress` is provided the whole card becomes pressable (with a subtle
 * opacity feedback); otherwise it renders as a static surface.
 */
export function GlassCard({ children, className, style, onPress }: GlassCardProps) {
  const card = (
    <LiquidGlass className={`rounded-3xl p-4 ${className ?? ''}`} style={style}>
      {children}
    </LiquidGlass>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
        {card}
      </Pressable>
    );
  }

  return card;
}
