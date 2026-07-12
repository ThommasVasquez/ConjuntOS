import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor } from '@/theme/tokens';

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

/**
 * CTA accent (info/idle blue) — matches the web CTA and the inline accent
 * used across screens (pagos/visitantes/inicio). The `accent` token is pure
 * white/black per scheme, so the blue CTA lives here as a concrete color.
 */
const ACCENT_CTA = '#009df2';
/** Destructive red — readable with white text in both schemes. */
const DANGER_BG = '#ff453a';

/**
 * Variant backgrounds applied via `style` (not className) so the color is
 * deterministic in both schemes. `undefined` = transparent / class-driven.
 */
const CONTAINER_BG: Record<ButtonVariant, string | undefined> = {
  primary: ACCENT_CTA,
  secondary: undefined,
  ghost: undefined,
  danger: DANGER_BG,
};

const CONTAINER_CLASS: Record<ButtonVariant, string> = {
  primary: '',
  secondary: 'bg-surface2 border border-border',
  ghost: 'bg-transparent',
  danger: '',
};

const LABEL: Record<ButtonVariant, string> = {
  // White is readable on the blue CTA and the red danger bg in both schemes.
  primary: 'text-white',
  secondary: 'text-text',
  ghost: 'text-text',
  danger: 'text-white',
};

/**
 * Primary action button with loading + disabled states, optional leading icon,
 * and four visual variants. Uses NativeWind classNames for theming; the
 * primary/danger fills are concrete colors so text stays readable in both
 * light and dark schemes.
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

  // Spinner must contrast with the variant's actual background:
  // white on the blue/red fills, scheme text color on glass/transparent.
  const spinnerColor =
    variant === 'primary' || variant === 'danger' ? '#ffffff' : tokens.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }: { pressed: boolean }) => ({
        opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        backgroundColor: CONTAINER_BG[variant],
      })}
      className={`h-14 flex-row items-center justify-center rounded-2xl px-5 ${CONTAINER_CLASS[variant]}`}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <View className="flex-row items-center justify-center gap-2">
          {icon ? <View>{icon}</View> : null}
          <Text className={`text-base font-semibold ${LABEL[variant]}`}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}
