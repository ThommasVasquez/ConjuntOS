'use client';

import { useEffect, useRef } from 'react';
import { create } from 'zustand';

export interface WsEvent {
  domain: string;
  action: string;
  payload?: unknown;
  targetUserId?: string;
}

type EventHandler = (event: WsEvent) => void;

interface WsState {
  connected: boolean;
  currentUserId: string | null;
  setConnected: (v: boolean) => void;
  setCurrentUserId: (id: string | null) => void;
  handlers: Map<string, Set<EventHandler>>;
  subscribe: (domain: string, handler: EventHandler) => () => void;
  dispatch: (event: WsEvent) => void;
  /** Tell every subscriber to refetch after the socket was down. */
  resyncAll: () => void;
  reset: () => void;
}

export const useWsStore = create<WsState>((set, get) => ({
  connected: false,
  currentUserId: null,
  setConnected: (v) => set({ connected: v }),
  setCurrentUserId: (id) => set({ currentUserId: id }),
  handlers: new Map(),

  subscribe: (domain: string, handler: EventHandler) => {
    const { handlers } = get();
    if (!handlers.has(domain)) {
      handlers.set(domain, new Set());
    }
    handlers.get(domain)!.add(handler);
    return () => {
      handlers.get(domain)?.delete(handler);
    };
  },

  dispatch: (event: WsEvent) => {
    const { handlers, currentUserId } = get();
    // WS-1: skip events targeted at a different user
    if (event.targetUserId && event.targetUserId !== currentUserId) {
      return;
    }
    // WS-6: snapshot the sets before iterating (safe against mid-dispatch mutation)
    const domainHandlers = Array.from(handlers.get(event.domain) ?? []);
    const wildcardHandlers = Array.from(handlers.get('*') ?? []);
    for (const h of domainHandlers) {
      try { h(event); } catch { /* swallow handler error */ }
    }
    for (const h of wildcardHandlers) {
      try { h(event); } catch { /* swallow handler error */ }
    }
  },

  /**
   * Events that arrive while the socket is down are gone for good — the hub
   * does not replay them. So on every RE-connect we synthesise one `resync`
   * event per subscribed domain, which lands in the same handlers that already
   * refetch on any event.
   *
   * We deduplicate handlers and stagger them slightly (50ms) to avoid CPU lockup
   * (forced reflow violations) and network congestion when the client regains connectivity.
   */
  resyncAll: () => {
    const { handlers } = get();
    const seen = new Set<EventHandler>();
    const tasks: Array<{ domain: string; handler: EventHandler }> = [];

    for (const domain of Array.from(handlers.keys())) {
      const snapshot = Array.from(handlers.get(domain) ?? []);
      for (const h of snapshot) {
        if (!seen.has(h)) {
          seen.add(h);
          tasks.push({ domain, handler: h });
        }
      }
    }

    tasks.forEach(({ domain, handler }, idx) => {
      setTimeout(() => {
        try {
          handler({ domain, action: 'resync' });
        } catch {
          /* swallow handler error */
        }
      }, idx * 40);
    });
  },

  reset: () => set({ connected: false, currentUserId: null }),
}));

export function useWsSubscription(domain: string, handler: EventHandler) {
  const subscribe = useWsStore((s) => s.subscribe);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const unsub = subscribe(domain, (e) => handlerRef.current(e));
    return unsub;
  }, [domain, subscribe]);
}
