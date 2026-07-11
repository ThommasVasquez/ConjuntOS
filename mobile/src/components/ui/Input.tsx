import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';

export interface InputProps extends TextInputProps {
  /** Optional field label rendered above the input. */
  label?: string;
  /** Optional leading icon node (e.g. a lucide-react-native icon). */
  icon?: ReactNode;
  /** Optional error message rendered below the input (turns the border red). */
  error?: string;
  className?: string;
}

/**
 * Styled TextInput wrapper with an optional label, leading icon, error text,
 * and a secure-entry visibility toggle (eye icon) when `secureTextEntry`
 * is set. Theming via NativeWind classNames.
 */
export function Input({
  label,
  icon,
  error,
  secureTextEntry,
  className,
  ...rest
}: InputProps) {
  const [hidden, setHidden] = useState(true);
  const isSecure = !!secureTextEntry;

  return (
    <View className={className}>
      {label ? (
        <Text className="mb-2 text-sm font-medium text-textMuted">{label}</Text>
      ) : null}

      <View
        className={`h-14 flex-row items-center rounded-2xl border bg-surface2 px-4 ${
          error ? 'border-danger' : 'border-border'
        }`}
      >
        {icon ? <View className="mr-3">{icon}</View> : null}

        <TextInput
          {...rest}
          secureTextEntry={isSecure && hidden}
          placeholderTextColor="#9ca3af"
          className="flex-1 text-base text-text"
        />

        {isSecure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Mostrar contraseña' : 'Ocultar contraseña'}
            hitSlop={8}
            onPress={() => setHidden((h) => !h)}
            className="ml-3"
          >
            {hidden ? (
              <EyeOff size={20} color="#9ca3af" />
            ) : (
              <Eye size={20} color="#9ca3af" />
            )}
          </Pressable>
        ) : null}
      </View>

      {error ? <Text className="mt-1.5 text-xs text-danger">{error}</Text> : null}
    </View>
  );
}
