import Toast from 'react-native-toast-message';

/**
 * Thin wrapper around react-native-toast-message exposing the same
 * { success, error, info, warning } surface used across the app. The actual
 * <Toast /> host is mounted once in the root layout by the navigation agent.
 *
 * Usage: toast.success('Guardado', 'Tus cambios fueron guardados').
 */
function show(type: 'success' | 'error' | 'info' | 'warning', text1: string, text2?: string) {
  Toast.show({ type, text1, text2 });
}

export const toast = {
  success: (text1: string, text2?: string) => show('success', text1, text2),
  error: (text1: string, text2?: string) => show('error', text1, text2),
  info: (text1: string, text2?: string) => show('info', text1, text2),
  // 'warning' is not a built-in type; it falls back to default rendering
  // unless the <Toast /> host registers a custom 'warning' config.
  warning: (text1: string, text2?: string) => show('warning', text1, text2),
};
