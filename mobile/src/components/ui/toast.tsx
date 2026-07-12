import { Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import type { ToastConfig } from 'react-native-toast-message';

type ToastType = 'success' | 'error' | 'info' | 'warning';

/**
 * Accent left-border color per toast type. Liquid Glass palette:
 * success = active green, info = CTA blue, error = destructive red,
 * warning = amber.
 */
const TYPE_ACCENT: Record<ToastType, string> = {
  success: '#57bf00',
  error: '#ff453a',
  info: '#009df2',
  warning: '#ffb800',
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
  return (
    <View
      style={{
        width: '92%',
        borderRadius: 16,
        borderLeftWidth: 4,
        borderLeftColor: TYPE_ACCENT[type],
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.14)',
        backgroundColor: 'rgba(20, 20, 20, 0.96)',
        paddingHorizontal: 16,
        paddingVertical: 12,
        shadowColor: '#000',
        shadowOpacity: 0.35,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
      }}
    >
      {text1 ? (
        <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }} numberOfLines={2}>
          {text1}
        </Text>
      ) : null}
      {text2 ? (
        <Text
          style={{
            color: 'rgba(255, 255, 255, 0.92)',
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
