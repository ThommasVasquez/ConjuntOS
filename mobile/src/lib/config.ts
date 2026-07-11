/**
 * Runtime configuration for the native app.
 *
 * Expo inlines `EXPO_PUBLIC_*` env vars at build time. We deliberately read
 * `process.env.EXPO_PUBLIC_API_URL` (not a destructured copy) so the bundler
 * can statically replace it.
 */

/** Base URL of the EN-CONJUNTO backend API (no trailing slash, no `/api/v1`). */
export const API_BASE: string =
  process.env.EXPO_PUBLIC_API_URL || 'https://api.conjuntos.app';

/**
 * WebSocket base derived from {@link API_BASE}: `http(s)` is swapped for
 * `ws(s)`. Consumers append the `/api/v1/ws` path themselves.
 */
export const WS_BASE: string = API_BASE.replace(/^http/, 'ws');
