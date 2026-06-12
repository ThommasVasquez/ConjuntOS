'use client';

import { create } from 'zustand';
import { api, ApiError, setAuthToken } from '@/lib/api/client';
import type { UserDto, LoginResponse } from '@/lib/api/types';

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
      const res = await api.post<LoginResponse>('/auth/login', {
        email,
        password,
      });
      // The Rust backend also sets an httpOnly ec_session cookie (the primary,
      // reload-surviving credential). Keep the Bearer token in memory only.
      if (res.token) {
        setAuthToken(res.token);
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
    // Clear any token persisted by a previous app version.
    if (typeof window !== 'undefined') localStorage.removeItem('ec_token');
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
    }
    set({ user: res.user });
  },
}));
