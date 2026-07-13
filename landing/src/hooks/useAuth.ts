'use client';

import { create } from 'zustand';

interface AuthState {
  user: { rol?: string } | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  switchRole: (rol: string) => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: false,
  error: null,
  login: async () => {
    window.location.href = '/login';
  },
  logout: async () => {},
  checkAuth: async () => {
    set({ user: null, loading: false });
  },
  switchRole: async () => {},
}));
