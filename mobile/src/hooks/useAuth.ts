import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  api,
  ApiError,
  saveAuthToken,
  loadAuthToken,
  setUnauthorizedHandler,
} from '@/lib/api/client';
import type { UserDto, LoginResponse } from '@/lib/api/types';

interface AuthState {
  user: UserDto | null;
  loading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  switchRole: (rol: string) => Promise<void>;
  bootstrap: () => Promise<void>;
}

// Clear cached profile PII (pic/data, keyed by user id) for every user on this
// device so logout doesn't leave personal data behind.
async function clearCachedProfilePii(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const piiKeys = keys.filter((k) => k.startsWith('conjuntos_profile_'));
    if (piiKeys.length > 0) {
      await AsyncStorage.multiRemove(piiKeys);
    }
  } catch {
    // Best-effort: never block logout on a storage error.
  }
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
      // Bearer-first on native: persist the token to SecureStore (and memory).
      // There is no cookie credential to fall back on here.
      if (res.token) {
        await saveAuthToken(res.token);
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
    // Delete the persisted Bearer token (SecureStore + memory).
    await saveAuthToken(null);
    await clearCachedProfilePii();
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
    // Persisted, real role change. Backend returns a fresh Bearer token
    // reflecting the new role; persist it so it survives a reload.
    const res = await api.post<LoginResponse>('/auth/switch-role', { rol });
    if (res.token) {
      await saveAuthToken(res.token);
    }
    set({ user: res.user });
  },

  bootstrap: async () => {
    // Any authenticated 401 (expired/revoked JWT) clears the session; the
    // (app) auth gate then redirects to /login. Registered once here.
    setUnauthorizedHandler(() => {
      void saveAuthToken(null);
      set({ user: null, loading: false });
    });
    // Restore the persisted Bearer token into memory before validating the
    // session, so checkAuth's GET /auth/me carries Authorization.
    await loadAuthToken();
    await useAuth.getState().checkAuth();
  },
}));
