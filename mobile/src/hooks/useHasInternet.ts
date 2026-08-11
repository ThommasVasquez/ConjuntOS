import { useEffect, useState } from 'react';

/**
 * Whether the device currently has network connectivity.
 *
 * RN port of web `src/hooks/useHasInternet.ts`, which uses `navigator.onLine`
 * plus its online/offline events. `expo-network` is the native equivalent:
 * `isConnected` answers the same question (is there a network interface up),
 * so the two implementations stay behaviourally identical.
 *
 * ponytail: no polling and no reachability probe, matching web. It answers "is
 * there a network interface up", not "is our API reachable" — a captive portal
 * or a dead backend still reads as online. The API layer already surfaces that
 * case (see `authOffline` in useAuth); upgrade to a heartbeat only if that
 * stops being enough.
 *
 * Starts `true` so the first paint never flashes an offline banner.
 *
 * expo-network is loaded LAZILY and defensively. This hook is called from
 * `app/(app)/_layout.tsx`, so a hard top-level import takes down the ENTIRE
 * authenticated app ("Cannot find native module 'ExpoNetwork'" → the layout
 * module never finishes evaluating → "Route is missing the required default
 * export") on any dev client built before the dependency was added. A
 * connectivity banner must never be able to do that: if the native module is
 * absent we assume online and the app runs exactly as it did before.
 */
export function useHasInternet(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let Network: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      Network = require('expo-network');
    } catch {
      // Native module missing (stale dev client / Expo Go) — stay optimistic.
      return;
    }
    if (typeof Network?.addNetworkStateListener !== 'function') return;

    // Catches "was already offline before mount", mirroring web's initial
    // sync() call.
    try {
      Network.getNetworkStateAsync?.()
        .then((state: { isConnected?: boolean | null }) => {
          if (!cancelled) setOnline(state?.isConnected ?? true);
        })
        .catch(() => {
          /* keep the optimistic default */
        });
    } catch {
      /* keep the optimistic default */
    }

    let sub: { remove?: () => void } | undefined;
    try {
      sub = Network.addNetworkStateListener(
        ({ isConnected }: { isConnected?: boolean | null }) => {
          if (!cancelled) setOnline(isConnected ?? true);
        },
      );
    } catch {
      /* no listener — the initial probe above is the best we can do */
    }

    return () => {
      cancelled = true;
      sub?.remove?.();
    };
  }, []);

  return online;
}
