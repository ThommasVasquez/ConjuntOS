import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface ScreenProps {
  children: ReactNode;
  /** When true, wraps the content in a vertical ScrollView. Defaults to true. */
  scroll?: boolean;
  className?: string;
}

/**
 * Base screen wrapper. Applies the top safe-area inset manually (so the
 * background can bleed under the status bar) and reserves bottom padding for
 * the floating glass tab bar (~128px). When `scroll` is true the content lives
 * inside a vertical ScrollView; otherwise it is a plain flex View.
 */
export function Screen({ children, scroll = true, className }: ScreenProps) {
  const insets = useSafeAreaInsets();
  // Top inset keeps content clear of the status bar / notch. Bottom padding
  // leaves room for the floating tab bar that overlays every authed screen.
  const topInset = insets.top;
  const bottomPad = 128;

  if (scroll) {
    return (
      <ScrollView
        className={className}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: topInset, paddingBottom: bottomPad }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View
      className={className}
      style={{ flex: 1, paddingTop: topInset, paddingBottom: bottomPad }}
    >
      {children}
    </View>
  );
}
