/**
 * Chat - CONJUNTOSAPP (mobile port)
 * Hilo de conversación residente ↔ administración y anfitrión ↔ huésped.
 *
 * Ported from web src/app/(app)/chat/page.tsx: the page is only the shell —
 * `ProfileHeader className="px-4 shrink-0 border-b border-border"` plus
 * `<ChatSection huespedId={huespedId} />`. All the chat behaviour lives in the
 * reusable component at src/components/chat/ChatSection.tsx (same `compact` /
 * `huespedId` contract as web), so an embedded chat can reuse it.
 */

import { KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useLocalSearchParams } from 'expo-router';

import { ProfileHeader } from '@/components/shell/ProfileHeader';
import { ChatSection } from '@/components/chat/ChatSection';
import { BACK_CHROME_HEIGHT, BackButton, useBackChrome } from '@/components/shell/BackChrome';

export default function Chat() {
  const insets = useSafeAreaInsets();
  // Room for the layout's floating back button (BackChrome) — this screen
  // hand-rolls its top padding instead of using the <Screen> primitive.
  const { showBack } = useBackChrome();
  const backPad = showBack ? BACK_CHROME_HEIGHT : 0;

  // Optional guest-thread filter: /chat?huespedId=... (host → guest thread).
  const params = useLocalSearchParams<{ huespedId?: string }>();
  const huespedId =
    typeof params.huespedId === 'string' && params.huespedId.length > 0
      ? params.huespedId
      : undefined;

  // Custom full-height container (not <Screen>): the chat needs the input to
  // hug the keyboard, so the tab-bar clearance is dropped while typing —
  // mirrors the web page's dedicated absolute-inset layout.
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-primary"
      style={{ paddingTop: insets.top + backPad }}
    >
      <Animated.View
        entering={FadeInDown.duration(500)}
        className="border-b border-border px-4 pb-2 pt-4"
      >
        <ProfileHeader />
      </Animated.View>

      {/* dockPadding = web page's `pb-40` clearance for the floating tab bar. */}
      <ChatSection huespedId={huespedId} dockPadding={Math.max(insets.bottom, 16) + 96} />

      <BackButton />
    </KeyboardAvoidingView>
  );
}
