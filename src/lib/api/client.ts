/**
 * Centralized API client for the Rust backend.
 * All fetch calls go through here for consistent error handling,
 * auth headers, and base URL management.
 *
 * In development the Next.js rewrite proxies /api/v1/* to the Rust server,
 * so API_BASE can stay empty.  In production it should point to the API host.
 */

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production' ? 'https://api.conjuntos.app' : '');

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

  const url = `${API_BASE}/api/v1${path}`;

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
