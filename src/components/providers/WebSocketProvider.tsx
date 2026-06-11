'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useWsStore } from '@/hooks/useWebSocket';

const WS_RECONNECT_INTERVAL = 3000;
const WS_URL_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const user = useAuth((s) => s.user);
  const setConnected = useWsStore((s) => s.setConnected);
  const dispatch = useWsStore((s) => s.dispatch);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!user) {
      // Not authenticated -- close any existing connection
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
      return;
    }

    function connect() {
      // Get the JWT token for WS auth
      const token = localStorage.getItem('ec_token');
      if (!token) return;

      // Build WS URL
      const httpBase = WS_URL_BASE || window.location.origin;
      const wsBase = httpBase.replace(/^http/, 'ws');
      const url = `${wsBase}/api/v1/ws?token=${encodeURIComponent(token)}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
      };

      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          dispatch(event);
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        setConnected(false);
        reconnectTimer.current = setTimeout(connect, WS_RECONNECT_INTERVAL);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
    };
  }, [user, setConnected, dispatch]);

  return <>{children}</>;
}
