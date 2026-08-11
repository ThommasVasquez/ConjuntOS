import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { useTheme } from '@/providers/ThemeProvider';
import { onSemantic, tokensFor } from '@/theme/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
  /** Optional leading icon node (e.g. a lucide-react-native icon). */
  icon?: ReactNode;
}

const CONTAINER_CLASS: Record<ButtonVariant, string> = {
  primary: '',
  secondary: 'bg-surface2 border border-border',
  ghost: 'bg-transparent',
  danger: '',
};

/**
 * Primary action button with loading + disabled states, optional leading icon,
 * and four visual variants. Themed entirely off the design tokens — `primary`
 * fills with the teal `accent` and inks with `onAccent` (the token pair is
 * contrast-verified per scheme in globals.css); `danger` fills with the
 * `danger` token and inks with `onSemantic`, since the dark scheme's danger is
 * a light tint that needs dark ink while the light scheme's needs white.
 */
export function Button({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  icon,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const { theme } = useTheme();
  const tokens = tokensFor(theme);
  const semanticInk = onSemantic(theme);

  const containerBg: Record<ButtonVariant, string | undefined> = {
    primary: tokens.accent,
    secondary: undefined,
    ghost: undefined,
    danger: tokens.danger,
  };

  const labelColor: Record<ButtonVariant, string> = {
    primary: tokens.onAccent,
    secondary: tokens.text,
    ghost: tokens.text,
    danger: semanticInk,
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }: { pressed: boolean }) => ({
        opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        backgroundColor: containerBg[variant],
      })}
      className={`h-14 flex-row items-center justify-center rounded-2xl px-5 ${CONTAINER_CLASS[variant]}`}
    >
      {loading ? (
        <ActivityIndicator color={labelColor[variant]} />
      ) : (
        <View className="flex-row items-center justify-center gap-2">
          {icon ? <View>{icon}</View> : null}
          <Text
            className="text-base font-semibold"
            style={{ color: labelColor[variant] }}
          >
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
