import { Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import type { ToastConfig } from 'react-native-toast-message';

import { darkTokens, darkToast } from '@/theme/tokens';

type ToastType = 'success' | 'error' | 'info' | 'warning';

/**
 * Per-type border tint + outer glow, from web's `[data-type=…]
 * .liquid-glass-toast` rules (globals.css:254-262): a full 1px border tint plus
 * a wide colored glow. Web has NO left accent border — the previous 4px
 * `borderLeft` was invented on mobile, along with its four off-palette colors.
 *
 * `info` and `warning` have no web counterpart (sonner only emits
 * success/error), so they follow the same formula with their own tokens.
 */
const TYPE_STYLE: Record<ToastType, { border: string; glow: string }> = {
  success: { border: darkToast.successBorder, glow: darkTokens.success },
  error: { border: darkToast.errorBorder, glow: darkTokens.danger },
  info: { border: 'rgba(56, 189, 248, 0.55)', glow: darkTokens.info },
  warning: { border: 'rgba(251, 191, 36, 0.55)', glow: darkTokens.warning },
};

/**
 * Minimal slice of ToastConfigParams that the card actually renders.
 * A wider param type (the library's ToastConfigParams) remains assignable
 * to renderers typed with this subset.
 */
interface GlassToastProps {
  text1?: string;
  text2?: string;
  type: ToastType;
}

/**
 * Liquid-Glass toast card: dark glass background, white text, accent left
 * border by type. Deliberately dark in BOTH schemes (glass overlay look).
 */
function GlassToast({ text1, text2, type }: GlassToastProps) {
  const s = TYPE_STYLE[type];
  return (
    <View
      style={{
        width: '92%',
        minWidth: 320,
        gap: 12,
        // globals.css:230 — border-radius: 32px
        borderRadius: darkToast.radius,
        borderWidth: 1,
        // globals.css:255/260 — per-type border tint
        borderColor: s.border,
        // globals.css:226 — background: rgba(5,13,12,0.72), "contraste máximo
        // para lectura". RN has no backdrop-filter, so the fill carries it.
        backgroundColor: darkToast.background,
        // globals.css:233 — padding: 22px 26px
        paddingHorizontal: 26,
        paddingVertical: 22,
        // globals.css:256/261 — box-shadow 0 0 80px <tint>, over the base
        // 0 25px 50px -12px rgba(0,0,0,0.5). RN allows one shadow, so the
        // per-type glow wins (it is the distinguishing cue).
        shadowColor: s.glow,
        shadowOpacity: 0.22,
        shadowRadius: 40,
        shadowOffset: { width: 0, height: 0 },
        elevation: 8,
      }}
    >
      {text1 ? (
        <Text
          style={{
            color: darkToast.text,
            fontSize: 14,
            // globals.css:232/240 — font-weight 600, letter-spacing -0.01em
            fontWeight: '600',
            letterSpacing: -0.14,
          }}
          numberOfLines={2}
        >
          {text1}
        </Text>
      ) : null}
      {text2 ? (
        <Text
          style={{
            color: darkTokens.textMuted,
            fontSize: 13,
            marginTop: text1 ? 2 : 0,
          }}
          numberOfLines={3}
        >
          {text2}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Toast host config — pass to the single <Toast config={toastConfig} /> in
 * app/_layout.tsx. Registers Liquid-Glass cards for the three built-in types
 * plus a custom 'warning' type.
 */
export const toastConfig: ToastConfig = {
  success: (params: { text1?: string; text2?: string }) => (
    <GlassToast text1={params.text1} text2={params.text2} type="success" />
  ),
  error: (params: { text1?: string; text2?: string }) => (
    <GlassToast text1={params.text1} text2={params.text2} type="error" />
  ),
  info: (params: { text1?: string; text2?: string }) => (
    <GlassToast text1={params.text1} text2={params.text2} type="info" />
  ),
  warning: (params: { text1?: string; text2?: string }) => (
    <GlassToast text1={params.text1} text2={params.text2} type="warning" />
  ),
};

/**
 * Thin wrapper around react-native-toast-message exposing the same
 * { success, error, info, warning } surface used across the app. The actual
 * <Toast config={toastConfig} /> host is mounted once in the root layout.
 *
 * Usage: toast.success('Guardado', 'Tus cambios fueron guardados').
 */
function show(type: ToastType, text1: string, text2?: string) {
  Toast.show({ type, text1, text2 });
}

export const toast = {
  success: (text1: string, text2?: string) => show('success', text1, text2),
  error: (text1: string, text2?: string) => show('error', text1, text2),
  info: (text1: string, text2?: string) => show('info', text1, text2),
  warning: (text1: string, text2?: string) => show('warning', text1, text2),
};
