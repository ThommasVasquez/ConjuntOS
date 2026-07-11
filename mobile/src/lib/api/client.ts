/**
 * Centralized API client for the Rust backend (native / Expo build).
 *
 * Ported from the web `src/lib/api/client.ts`, but Bearer-FIRST:
 * - There are no cookies on native, so the in-memory + SecureStore Bearer
 *   token is the sole credential (`credentials: 'include'` is dropped).
 * - The token is persisted via `expo-secure-store` under the key `ec_token`
 *   and mirrored in memory for synchronous reads on every request.
 * - The absolute request URL is built from `API_BASE` (there is no Next.js
 *   rewrite proxy on device).
 */

import * as SecureStore from 'expo-secure-store';

import { API_BASE } from '@/lib/config';

/** SecureStore key under which the Bearer JWT is persisted. */
const TOKEN_KEY = 'ec_token';

/**
 * In-memory copy of the Bearer token. Hydrated from SecureStore via
 * {@link loadAuthToken} on boot and kept in sync by {@link saveAuthToken}.
 * Held in memory so {@link apiFetch} can attach it synchronously.
 */
let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

/**
 * Read the persisted token from SecureStore into memory and return it.
 * Call once on app boot (e.g. from `useAuth.bootstrap()`).
 */
export async function loadAuthToken(): Promise<string | null> {
  try {
    const stored = await SecureStore.getItemAsync(TOKEN_KEY);
    authToken = stored;
    return stored;
  } catch {
    // SecureStore can throw if the keychain is unavailable; fail soft.
    authToken = null;
    return null;
  }
}

/**
 * Persist the token to SecureStore and update the in-memory copy.
 * Passing `null` deletes the stored token (logout).
 */
export async function saveAuthToken(token: string | null): Promise<void> {
  authToken = token;
  if (token === null) {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } else {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  }
}

/**
 * Optional handler invoked when an authenticated request returns 401, so the
 * app can clear the session and redirect to login (the web app lacked this —
 * a stale/expired JWT left the user on a broken authed screen). Registered by
 * `useAuth` to avoid a circular import. NOT fired for the login request itself.
 */
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

export class ApiError extends Error {
  status: number;
  detail: string;
  type?: string;

  constructor(status: number, detail: string, type?: string) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.type = type;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Skip automatic JSON parsing (e.g. for blob responses) */
  raw?: boolean;
}

/**
 * Core fetch wrapper. Every call to the Rust backend should go through here.
 *
 * - Prepends `/api/v1` to the path
 * - Builds the absolute URL from {@link API_BASE}
 * - Injects the in-memory Bearer token (`Authorization: Bearer <token>`)
 * - Parses RFC-7807 problem+json errors
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, headers = {}, raw = false } = options;

  const url = `${API_BASE}/api/v1${path}`;

  const fetchHeaders: Record<string, string> = { ...headers };

  // Auto-set JSON content-type when there is a body
  if (body && !fetchHeaders['Content-Type']) {
    fetchHeaders['Content-Type'] = 'application/json';
  }

  // Bearer token (in-memory, backed by SecureStore) is the only credential.
  if (authToken && !fetchHeaders['Authorization']) {
    fetchHeaders['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(url, {
    method,
    headers: fetchHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    // Global auth-expiry handling: a 401 on any request other than the login
    // attempt means the session/token is no longer valid — clear it and let the
    // auth gate route back to /login. (Bad-credentials 401s on /auth/login are
    // surfaced to the form instead.)
    if (response.status === 401 && path !== '/auth/login') {
      onUnauthorized?.();
    }
    const contentType = response.headers.get('content-type') || '';
    if (
      contentType.includes('application/problem+json') ||
      contentType.includes('application/json')
    ) {
      const problem = await response.json();
      throw new ApiError(
        response.status,
        problem.detail || problem.message || response.statusText,
        problem.type,
      );
    }
    throw new ApiError(response.status, response.statusText);
  }

  if (raw) return response as unknown as T;
  if (response.status === 204) return undefined as T;

  return response.json();
}

// ---------------------------------------------------------------------------
// Convenience methods
// ---------------------------------------------------------------------------

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, 'method'>) =>
    apiFetch<T>(path, { ...opts, method: 'GET' }),

  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiFetch<T>(path, { ...opts, method: 'POST', body }),

  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiFetch<T>(path, { ...opts, method: 'PUT', body }),

  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiFetch<T>(path, { ...opts, method: 'PATCH', body }),

  delete: <T>(path: string, opts?: Omit<RequestOptions, 'method'>) =>
    apiFetch<T>(path, { ...opts, method: 'DELETE' }),
};
