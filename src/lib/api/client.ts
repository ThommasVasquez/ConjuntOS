/**
 * Centralized API client for the Rust backend.
 * All fetch calls go through here for consistent error handling,
 * auth headers, and base URL management.
 *
 * In development the Next.js rewrite proxies /api/v1/* to the Rust server,
 * so API_BASE can stay empty.  In production it should point to the API host.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

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
}

/**
 * Core fetch wrapper. Every call to the Rust backend should go through here.
 *
 * - Prepends `/api/v1` to the path
 * - Sends credentials (ec_session cookie)
 * - Injects a Bearer token from localStorage as fallback
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
  } = options;

  const url = `${API_BASE}/api/v1${path}`;

  const fetchHeaders: Record<string, string> = { ...headers };

  // Auto-set JSON content-type when there is a body
  if (body && !fetchHeaders['Content-Type']) {
    fetchHeaders['Content-Type'] = 'application/json';
  }

  // Bearer fallback for environments where the httpOnly cookie is blocked
  // (e.g. cross-site during migration)
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('ec_token');
    if (token && !fetchHeaders['Authorization']) {
      fetchHeaders['Authorization'] = `Bearer ${token}`;
    }
  }

  const response = await fetch(url, {
    method,
    headers: fetchHeaders,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include', // always send ec_session cookie
    cache: cachePolicy,
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
