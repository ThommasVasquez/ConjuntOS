'use client';

import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';

/**
 * Checks the session on mount by calling GET /auth/me.
 * If the ec_session cookie (or Bearer token) is valid the user state is
 * populated; otherwise the user stays null and protected routes redirect.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const checkAuth = useAuth((s) => s.checkAuth);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return <>{children}</>;
}
