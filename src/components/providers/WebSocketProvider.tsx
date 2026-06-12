'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useWsStore } from '@/hooks/useWebSocket';
import { api, ApiError } from '@/lib/api/client';

const WS_RECONNECT_BASE = 3000;
const WS_RECONNECT_MAX = 30000;
const WS_URL_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production' ? 'https://api.conjuntos.app' : '');

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const user = useAuth((s) => s.user);
  const setConnected = useWsStore((s) => s.setConnected);
  const dispatch = useWsStore((s) => s.dispatch);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const attemptRef = useRef(0);

  useEffect(() => {
    if (!user) {
      // Not authenticated — close any existing connection
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
      return;
    }

    let cancelled = false;
    attemptRef.current = 0;

    function scheduleReconnect() {
      if (cancelled) return;
      // Exponential backoff capped at WS_RECONNECT_MAX (replaces the old fixed 3s
      // tight loop). Keeps retrying transient outages without hammering the server.
      const delay = Math.min(
        WS_RECONNECT_BASE * 2 ** attemptRef.current,
        WS_RECONNECT_MAX,
      );
      attemptRef.current += 1;
      reconnectTimer.current = setTimeout(connect, delay);
    }

    async function connect() {
      if (cancelled) return;

      // Fetch a short-lived WS ticket, authenticated by the httpOnly cookie /
      // in-memory bearer. We never persist a long-lived token for the WS URL.
      let ticket: string;
      try {
        ticket = (await api.get<{ ticket: string }>('/auth/ws-ticket')).ticket;
      } catch (e) {
        // Auth rejected → stop retrying; the auth layer redirects to /login.
        if (e instanceof ApiError && e.status === 401) {
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
        attemptRef.current = 0;
        setConnected(true);
      };

      ws.onmessage = (e) => {
        try {
          dispatch(JSON.parse(e.data));
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        setConnected(false);
        scheduleReconnect();
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
    };
  }, [user, setConnected, dispatch]);

  return <>{children}</>;
}
