'use client';

import { useEffect, useState } from 'react';

/**
 * Whether the browser currently has network connectivity.
 *
 * ponytail: `navigator.onLine` + its events, no polling and no reachability
 * probe. It answers "is there a network interface up", not "is our API
 * reachable" — a captive portal or a dead backend still reads as online.
 * The API layer already surfaces that case (see `authOffline` in useAuth);
 * upgrade to a HEAD-request heartbeat only if that stops being enough.
 *
 * Starts `true` so SSR and first paint don't flash an offline banner.
 */
export function useHasInternet(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync(); // catches "went offline before hydration"
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  return online;
}
