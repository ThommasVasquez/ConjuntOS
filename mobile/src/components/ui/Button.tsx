import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

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

const CONTAINER: Record<ButtonVariant, string> = {
  primary: 'bg-primary',
  secondary: 'bg-surface2 border border-border',
  ghost: 'bg-transparent',
  danger: 'bg-danger',
};

const LABEL: Record<ButtonVariant, string> = {
  primary: 'text-white',
  secondary: 'text-text',
  ghost: 'text-text',
  danger: 'text-white',
};

const SPINNER: Record<ButtonVariant, string> = {
  primary: '#ffffff',
  secondary: '#ffffff',
  ghost: '#ffffff',
  danger: '#ffffff',
};

/**
 * Primary action button with loading + disabled states, optional leading icon,
 * and four visual variants. Uses NativeWind classNames for theming.
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

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => ({ opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1 })}
      className={`h-14 flex-row items-center justify-center rounded-2xl px-5 ${CONTAINER[variant]}`}
    >
      {loading ? (
        <ActivityIndicator color={SPINNER[variant]} />
      ) : (
        <View className="flex-row items-center justify-center gap-2">
          {icon ? <View>{icon}</View> : null}
          <Text className={`text-base font-semibold ${LABEL[variant]}`}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}
