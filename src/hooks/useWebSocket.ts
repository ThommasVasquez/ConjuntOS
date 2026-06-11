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
  setConnected: (v: boolean) => void;
  handlers: Map<string, Set<EventHandler>>;
  subscribe: (domain: string, handler: EventHandler) => () => void;
  dispatch: (event: WsEvent) => void;
}

export const useWsStore = create<WsState>((set, get) => ({
  connected: false,
  setConnected: (v) => set({ connected: v }),
  handlers: new Map(),

  subscribe: (domain: string, handler: EventHandler) => {
    const { handlers } = get();
    if (!handlers.has(domain)) {
      handlers.set(domain, new Set());
    }
    handlers.get(domain)!.add(handler);
    // Return unsubscribe function
    return () => {
      handlers.get(domain)?.delete(handler);
    };
  },

  dispatch: (event: WsEvent) => {
    const { handlers } = get();
    // Call handlers for specific domain
    handlers.get(event.domain)?.forEach((h) => h(event));
    // Call wildcard handlers
    handlers.get('*')?.forEach((h) => h(event));
  },
}));

/**
 * Hook to subscribe to WS events for a specific domain.
 *
 * Usage:
 *   useWsSubscription('chat', (event) => {
 *     if (event.action === 'message') refetchMessages();
 *   });
 */
export function useWsSubscription(domain: string, handler: EventHandler) {
  const subscribe = useWsStore((s) => s.subscribe);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const unsub = subscribe(domain, (e) => handlerRef.current(e));
    return unsub;
  }, [domain, subscribe]);
}
