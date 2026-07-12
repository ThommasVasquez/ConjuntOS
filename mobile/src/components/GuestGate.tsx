import type { ReactNode } from 'react';
import { Redirect } from 'expo-router';

import { useAuth } from '@/hooks/useAuth';

/**
 * Blocks HUESPED_TEMPORAL from resident-only screens (pagos, pqrs,
 * clasificados, parqueadero). The tab layout keeps every route navigable for
 * every role (hidden from the bar via href:null), so deep links and
 * notification routing can land a guest on these screens — this gate is the
 * actual enforcement, mirroring web's guest containment (guests only get
 * /mi-estancia + a reduced tab set).
 *
 * Children are only MOUNTED when the gate passes, so screen effects (data
 * fetches) never fire for a guest.
 */
export function GuestGate({ children }: { children: ReactNode }) {
  const rol = useAuth((s) => s.user?.rol);
  if (rol === 'HUESPED_TEMPORAL') return <Redirect href="/(app)/mi-estancia" />;
  return <>{children}</>;
}
