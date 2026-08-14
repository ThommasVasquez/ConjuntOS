/**
 * Centralized API client for the Rust backend.
 * All fetch calls go through here for consistent error handling,
 * auth headers, and base URL management.
 *
 * Requests go straight to NEXT_PUBLIC_API_URL in every environment.
 */

/**
 * Every environment talks to the API host directly — no rewrite proxy.
 * The host comes from NEXT_PUBLIC_API_URL (.env) with no fallback on purpose:
 * a missing var should fail loudly here, not silently proxy to production.
 *
 * Consequence of going cross-origin in dev: the backend's own Set-Cookie is
 * `Domain=conjuntos.app` and is not stored for localhost, so requests carry
 * only the in-memory Bearer token. It does not survive a reload — see the
 * `/api/session` bridge, which keeps the middleware's cookie working.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.conjuntos.app";

/**
 * In-memory Bearer token (same-session fallback for when the httpOnly `ec_session`
 * cookie is blocked). Deliberately NOT persisted to localStorage: a persisted JWT
 * is exfiltratable by any XSS for its full lifetime. The httpOnly cookie is the
 * source of truth across reloads; this in-memory copy is cleared on logout/reload.
 */
let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

// ---------------------------------------------------------------------------
// Global 401 handler — invoked by the API client when any request (except
// login) returns 401. Registered by useAuth to clear state and redirect.
// ---------------------------------------------------------------------------
let onUnauthorized: (() => void) | null = null;
let _loggingOut = false;

export function setOnUnauthorized(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

export function setLoggingOut(v: boolean): void {
  _loggingOut = v;
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
  /** Override default no-store cache policy */
  cache?: RequestCache;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/**
 * Core fetch wrapper. Every call to the Rust backend should go through here.
 *
 * - Prepends `/api/v1` to the path
 * - Sends credentials (ec_session cookie)
 * - Injects an in-memory Bearer token as a same-session fallback
 * - Parses RFC-7807 problem+json errors
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    method = 'GET',
    body,
    headers = {},
    raw = false,
    cache: cachePolicy = 'no-store',
    signal,
  } = options;

  const cleanPath = path.startsWith('/api/v1') ? path : `/api/v1${path}`;
  const url = `${API_BASE}${cleanPath}`;

  const fetchHeaders: Record<string, string> = { ...headers };

  // Auto-set JSON content-type when there is a body
  if (body && !fetchHeaders['Content-Type']) {
    fetchHeaders['Content-Type'] = 'application/json';
  }

  // Bearer fallback (in-memory only) for environments where the httpOnly cookie
  // is blocked. The cookie remains the primary, reload-surviving credential.
  if (authToken && !fetchHeaders['Authorization']) {
    fetchHeaders['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(url, {
    method,
    headers: fetchHeaders,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include', // always send ec_session cookie
    cache: cachePolicy,
    signal,
  });

  if (!response.ok) {
    if (
      response.status === 401 &&
      !_loggingOut &&
      path !== '/auth/login' &&
      path !== '/auth/logout' &&
      path !== '/auth/me'
    ) {
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
