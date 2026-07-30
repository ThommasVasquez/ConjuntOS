import { useEffect, useRef, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useWsStore } from '@/hooks/useWebSocket';
import { api, ApiError } from '@/lib/api/client';
import { WS_BASE } from '@/lib/config';

const WS_RECONNECT_BASE = 3000;
const WS_RECONNECT_MAX = 30000;

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const user = useAuth((s) => s.user);
  const setConnected = useWsStore((s) => s.setConnected);
  const setCurrentUserId = useWsStore((s) => s.setCurrentUserId);
  const dispatch = useWsStore((s) => s.dispatch);
  const reset = useWsStore((s) => s.reset);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const attemptRef = useRef(0);
  // False until the socket has opened once, so the first connect does not fire
  // a redundant resync on top of each screen's initial fetch.
  const hadConnectedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // WS-6: reset store on auth change (clears stale connected/currentUserId state)
    reset();

    if (!user) {
      // Not authenticated — close any existing connection
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }

    const userId = user.id;
    setCurrentUserId(userId);
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

      // WS-5: cancel any in-flight ticket fetch before starting a new one
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      // Fetch a short-lived WS ticket, authenticated by the in-memory bearer.
      // We never persist a long-lived token for the WS URL.
      let ticket: string;
      try {
        ticket = (
          await api.get<{ ticket: string }>('/auth/ws-ticket', {
            signal: abort.signal,
          })
        ).ticket;
      } catch (e) {
        if (cancelled) return;
        // Auth rejected → stop retrying; the auth layer redirects to /login.
        if (e instanceof ApiError && e.status === 401) {
          setCurrentUserId(null);
          setConnected(false);
          return;
        }
        scheduleReconnect();
        return;
      }
      if (cancelled) return;

      // WS_BASE is already a ws://|wss:// origin (API_BASE with http->ws), so we
      // append the API path + ticket directly. No window.location on native.
      const url = `${WS_BASE}/api/v1/ws?token=${encodeURIComponent(ticket)}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled || ws !== wsRef.current) return;
        attemptRef.current = 0;
        // Re-assert the user id on every (re)connect: the dispatch filter in
        // useWebSocket drops any event whose targetUserId !== currentUserId,
        // so a stale/null id would silently kill targeted events (citofonía,
        // chat, multas) after the first reconnect.
        setCurrentUserId(userId);
        setConnected(true);
        // On a RE-connect (not the first connect) every event published while
        // the socket was down is lost — the hub does not replay. Synthesise a
        // `resync` per subscribed domain so screens refetch. Native tears the
        // socket down on every backgrounding, so this fires often here.
        if (hadConnectedRef.current) {
          useWsStore.getState().resyncAll();
        }
        hadConnectedRef.current = true;
      };

      ws.onmessage = (e) => {
        // Parse + dispatch fuera del propio callback del socket. Dispatch ejecuta
        // los handlers sincronicamente (setState -> re-render en cascada); si eso
        // corre dentro de onmessage, retrasa el siguiente frame del socket.
        // queueMicrotask devuelve el control de inmediato y deja que el trabajo
        // de React ocurra en su propio tick.
        let parsed: unknown;
        try {
          parsed = JSON.parse(e.data);
        } catch {
          // Ignore malformed messages
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reconnect only on identity change, not on every user object refresh
  }, [user?.id, user?.conjuntoId, setConnected, setCurrentUserId, dispatch, reset]);

  return <>{children}</>;
}
