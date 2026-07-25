'use client';

import { create } from 'zustand';
import { api, ApiError, setAuthToken, setOnUnauthorized } from '@/lib/api/client';
import type { UserDto, LoginResponse } from '@/lib/api/types';

/**
 * Mirror the session token into an httpOnly `ec_session` cookie on the
 * frontend origin (see src/app/api/session/route.ts). The backend's own
 * cookie carries `Domain=conjuntos.app` and never lands on localhost or
 * pages.dev, so without this the middleware bounces every page to /login.
 */
async function syncSessionCookie(token: string | null): Promise<void> {
  try {
    if (token) {
      await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
    } else {
      await fetch('/api/session', { method: 'DELETE' });
    }
  } catch {
    // Non-fatal: the in-memory Bearer token still authenticates this tab.
  }
}

interface AuthState {
  user: UserDto | null;
  loading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  switchRole: (rol: string) => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: true,
  error: null,

  login: async (email: string, password: string) => {
    set({ loading: true, error: null });
    try {
      let finalEmail = email.trim();
      if (finalEmail && !finalEmail.includes('@')) {
        finalEmail = `${finalEmail}@conjuntos.app`;
      }
      const res = await api.post<LoginResponse>('/auth/login', {
        email: finalEmail,
        password,
      });
      // The Rust backend also sets an httpOnly ec_session cookie, but its
      // Domain=conjuntos.app only works on that origin — mirror the token
      // into a frontend-origin cookie before the caller redirects, so the
      // middleware sees the session. Keep the Bearer token in memory only.
      if (res.token) {
        setAuthToken(res.token);
        await syncSessionCookie(res.token);
      }
      set({ user: res.user, loading: false });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.detail : 'Error de conexion';
      set({ error: message, loading: false });
      throw err;
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore errors on logout — clear local state regardless
    }
    setAuthToken(null);
    await syncSessionCookie(null);
    if (typeof window !== 'undefined') {
      // Clear any token persisted by a previous app version.
      localStorage.removeItem('ec_token');
      // Clear cached profile PII (pic/data, keyed by user id) for every user on
      // this device so logout doesn't leave personal data behind.
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('conjuntos_profile_')) localStorage.removeItem(key);
      }
    }
    set({ user: null, loading: false });
  },

  checkAuth: async () => {
    try {
      const user = await api.get<UserDto>('/auth/me');
      set({ user, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },

  switchRole: async (rol: string) => {
    // Persisted, real role change. Backend re-issues the session cookie and
    // returns a fresh Bearer token reflecting the new role.
    const res = await api.post<LoginResponse>('/auth/switch-role', { rol });
    if (res.token) {
      setAuthToken(res.token);
      await syncSessionCookie(res.token);
    }
    set({ user: res.user });
  },
}));

/**
 * Register the global 401 handler so that any expired/invalid session is
 * cleared automatically and the user is redirected to /login.
 * Call once from AuthProvider (or any top-level component).
 */
export function bootstrapAuth(): void {
  setOnUnauthorized(() => {
    setAuthToken(null);
    syncSessionCookie(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ec_token');
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('conjuntos_profile_')) localStorage.removeItem(key);
      }
    }
    useAuth.setState({ user: null, loading: false });
    // Avoid redirect loop if already on /login
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  });
}
