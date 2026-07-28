'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useWsStore } from '@/hooks/useWebSocket';
import { api, ApiError } from '@/lib/api/client';

const WS_RECONNECT_BASE = 3000;
const WS_RECONNECT_MAX = 30000;
// No fallback: a missing var must fail loudly, not silently hit production.
const WS_URL_BASE = process.env.NEXT_PUBLIC_API_URL!;

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const user = useAuth((s) => s.user);
  const setConnected = useWsStore((s) => s.setConnected);
  const setCurrentUserId = useWsStore((s) => s.setCurrentUserId);
  const dispatch = useWsStore((s) => s.dispatch);
  const reset = useWsStore((s) => s.reset);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const attemptRef = useRef(0);
  // Distinguishes the first connect (nothing to resync) from a reconnect.
  const hadConnectedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // WS-6: reset store on auth change (clears stale handlers/state)
    reset();

    if (!user) {
      wsRef.current = null;
      return;
    }

    const userId = user.id;
    setCurrentUserId(userId);
    let cancelled = false;
    let attemptId = 0;
    attemptRef.current = 0;

    function scheduleReconnect() {
      if (cancelled) return;
      const delay = Math.min(
        WS_RECONNECT_BASE * 2 ** attemptRef.current,
        WS_RECONNECT_MAX,
      );
      attemptRef.current += 1;
      reconnectTimer.current = setTimeout(connect, delay);
    }

    async function connect() {
      if (cancelled) return;

      const localAttemptId = ++attemptId;

      // WS-5: cancel any in-flight ticket fetch
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      let ticket: string;
      try {
        ticket = (await api.get<{ ticket: string }>('/auth/ws-ticket', { signal: abort.signal })).ticket;
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          setCurrentUserId(null);
          setConnected(false);
          return;
        }
        scheduleReconnect();
        return;
      }
      if (cancelled) return;

      const httpBase = WS_URL_BASE || window.location.origin;
      const wsBase = httpBase.replace(/^http/, 'ws');
      const url = `${wsBase}/api/v1/ws?token=${encodeURIComponent(ticket)}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled || ws !== wsRef.current) return;
        attemptRef.current = 0;
        // Re-assert the user id on every (re)connect: the dispatch filter drops
        // any event whose targetUserId !== currentUserId, so a stale/null id
        // would silently kill targeted events after the first reconnect.
        setCurrentUserId(userId);
        setConnected(true);

        // Anything published while we were disconnected is lost — the hub does
        // not replay. Ask every subscriber to refetch so the UI cannot sit on
        // state that changed during the gap.
        if (hadConnectedRef.current) {
          // Read off the store rather than closing over it: the identity is
          // stable, so this keeps the effect's dependency list unchanged.
          useWsStore.getState().resyncAll();
        }
        hadConnectedRef.current = true;
      };

      ws.onmessage = (e) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(e.data);
        } catch {
          return;
        }
        queueMicrotask(() => dispatch(parsed as Parameters<typeof dispatch>[0]));
      };

      // NOTE: transient close/error must NOT clear currentUserId — the id is
      // an auth identity, not a connection state. It is only cleared on 401
      // (auth rejected) and in the effect cleanup (logout / identity change).
      ws.onclose = () => {
        if (cancelled || ws !== wsRef.current) return;
        setConnected(false);
        scheduleReconnect();
      };

      ws.onerror = () => {
        if (cancelled || ws !== wsRef.current) return;
        // We null onclose and close manually, so onclose won't fire — the error
        // path must schedule its own reconnect, otherwise real-time updates stop
        // permanently after any transient WS error.
        ws.onclose = null;
        ws.close();
        wsRef.current = null;
        setConnected(false);
        scheduleReconnect();
      };
    }

    connect();

    return () => {
      cancelled = true;
      abortRef.current?.abort();
      clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
      setCurrentUserId(null);
    };
  }, [user?.id, user?.conjuntoId, setConnected, setCurrentUserId, dispatch, reset]);

  return <>{children}</>;
}
