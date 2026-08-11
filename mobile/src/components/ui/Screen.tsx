import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BACK_CHROME_HEIGHT,
  BackButton,
  useBackChrome,
} from '@/components/shell/BackChrome';

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
  const { showBack } = useBackChrome();
  // Top inset keeps content clear of the status bar / notch, plus room for the
  // floating back button on routes that are not one of the role's tabs (see
  // BackChrome) so it never lands on the first content row.
  const topInset = insets.top + (showBack ? BACK_CHROME_HEIGHT : 0);
  // Mirrors web `.safe-pb` = calc(env(safe-area-inset-bottom) + 120px). A flat
  // 128 let the floating tab pill (which reaches ~94px from the edge) overlap
  // the last row on devices with a home indicator.
  const bottomPad = insets.bottom + 120;

  // The back button must live INSIDE the screen (see BackChrome) — as a sibling
  // of <Tabs> it is painted over by the navigator. It also must not be a child
  // of the ScrollView, or it would scroll away with the content.
  return (
    <View style={{ flex: 1 }}>
      {scroll ? (
        <ScrollView
          className={className}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: topInset, paddingBottom: bottomPad }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View
          className={className}
          style={{ flex: 1, paddingTop: topInset, paddingBottom: bottomPad }}
        >
          {children}
        </View>
      )}
      <BackButton />
    </View>
  );
}
