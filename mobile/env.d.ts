// Typed access to Expo public env vars (inlined at build time, must be prefixed
// with EXPO_PUBLIC_). See https://docs.expo.dev/guides/environment-variables/
declare namespace NodeJS {
  interface ProcessEnv {
    /** Base URL of the EN-CONJUNTO backend API. */
    EXPO_PUBLIC_API_URL: string;
    /** Feature flag for payments. "true" | "false" (string-encoded). */
    EXPO_PUBLIC_PAYMENTS_ENABLED: 'true' | 'false';
    /** Web-only: VAPID public key for web push. Unused on native. */
    EXPO_PUBLIC_VAPID_PUBLIC_KEY?: string;
  }
}
